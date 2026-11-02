#!/usr/bin/env python3
"""Monitor de un único cliente Wi-Fi Huawei. Solo envía cambios confirmados."""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import urlsplit
from ipaddress import ip_address

LOG = logging.getLogger("marbella.wifi")


def normalized_mac(value: str) -> str:
    clean = re.sub(r"[:-]", "", value.strip()).upper()
    if not re.fullmatch(r"[0-9A-F]{12}", clean):
        raise ValueError("MAC no válida (se esperan 12 dígitos hexadecimales)")
    return clean


def config(probe: bool = False) -> dict:
    fields = ["HUAWEI_ROUTER_URL", "HUAWEI_USERNAME", "HUAWEI_PASSWORD"]
    if not probe:
        fields += ["WIFI_TARGET_MAC", "MARBELLA_WIFI_EVENTS_URL", "WIFI_PRESENCE_WEBHOOK_SECRET"]
    missing = [field for field in fields if not os.environ.get(field)]
    if missing:
        raise ValueError("Variables pendientes: " + ", ".join(missing))
    router_url = os.environ["HUAWEI_ROUTER_URL"]
    parsed_router = urlsplit(router_url)
    # Nunca mandar credenciales de administración a direcciones remotas.
    try:
        router_is_private = ip_address(parsed_router.hostname or "").is_private
    except ValueError:
        router_is_private = False
    if parsed_router.scheme not in ("http", "https") or not router_is_private:
        raise ValueError("La URL del Huawei debe tener una IP privada de la LAN")
    endpoint = os.environ.get("MARBELLA_WIFI_EVENTS_URL", "")
    secret = os.environ.get("WIFI_PRESENCE_WEBHOOK_SECRET", "")
    if not probe and urlsplit(endpoint).scheme != "https":
        raise ValueError("El webhook público debe ser HTTPS")
    if not probe and len(secret) < 32:
        raise ValueError("La clave del webhook debe tener al menos 32 caracteres")
    return {
        "router": router_url,
        "username": os.environ["HUAWEI_USERNAME"],
        "password": os.environ["HUAWEI_PASSWORD"],
        "target": normalized_mac(os.environ["WIFI_TARGET_MAC"]) if not probe else "",
        "endpoint": endpoint,
        "secret": secret,
        "poll": max(5, int(os.environ.get("WIFI_POLL_SECONDS", "10"))),
        "debounce": max(20, int(os.environ.get("WIFI_DISCONNECT_SECONDS", "30"))),
        "state_path": Path(os.environ.get(
            "WIFI_MONITOR_STATE_FILE",
            str(Path.home() / ".marbella-wifi-monitor" / "state.json"),
        )),
    }


def connected_macs(response: object) -> set[str]:
    if not isinstance(response, dict):
        raise ValueError("El router devolvió una respuesta no reconocida")
    hosts_wrapper = response.get("Hosts")
    if not isinstance(hosts_wrapper, dict) or "Host" not in hosts_wrapper:
        raise ValueError("Respuesta del router sin Hosts/Host; no se cambia el estado")
    hosts = hosts_wrapper["Host"]
    if hosts in (None, ""):
        return set()
    if isinstance(hosts, dict):
        hosts = [hosts]
    if not isinstance(hosts, list):
        raise ValueError("Formato inesperado de lista Wi-Fi")
    macs = set()
    for host in hosts:
        if not isinstance(host, dict) or not isinstance(host.get("MacAddress"), str):
            raise ValueError("Cliente sin MacAddress: firmware no validado")
        macs.add(normalized_mac(host["MacAddress"]))
    return macs


def load_state(path: Path) -> dict:
    if not path.exists():
        return {"online": None, "candidate": None, "candidate_since": None, "pending": []}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("pending"), list):
        raise ValueError("Archivo de estado incorrecto: revisar manualmente")
    return data


def save_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    with temp.open("w", encoding="utf-8") as output:
        json.dump(state, output, ensure_ascii=False, indent=2)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temp, path)


def observe(state: dict, online: bool, epoch: float, debounce: int) -> bool:
    """Actualiza el estado. True si se encoló un cambio real."""
    previous = state["online"]
    if previous is None:
        state["online"] = online
        state["candidate"] = None
        state["candidate_since"] = None
        LOG.info("Estado inicial: %s (sin alerta)", "conectado" if online else "ausente")
        return False
    if online == previous:
        state["candidate"] = None
        state["candidate_since"] = None
        return False
    # Conexión: confirmar en dos muestras; desconexión: 30 s.
    if state["candidate"] is not online:
        state["candidate"] = online
        state["candidate_since"] = epoch
        return False
    since = state.get("candidate_since")
    if since is None:
        state["candidate_since"] = epoch
        return False
    threshold = 0 if online else debounce
    if epoch - since < threshold:
        return False
    state["online"] = online
    state["candidate"] = None
    state["candidate_since"] = None
    state["pending"].append({
        "event_id": str(uuid.uuid4()),
        "state": "connected" if online else "disconnected",
        "occurred_at": datetime.fromtimestamp(epoch, timezone.utc).isoformat(),
    })
    LOG.info("Cambio confirmado: %s", "conectado" if online else "desconectado")
    return True


def dispatch_pending(settings: dict, state: dict) -> None:
    while state["pending"]:
        event = state["pending"][0]
        request = Request(
            settings["endpoint"],
            data=json.dumps(event).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": "Bearer " + settings["secret"],
                "Content-Type": "application/json",
                "User-Agent": "Marbella-Huawei-WiFi/1.0",
            },
        )
        try:
            with urlopen(request, timeout=12) as response:
                if response.status != 200:
                    raise RuntimeError("Webhook respondió HTTP " + str(response.status))
                result = json.load(response)
            if not result.get("success"):
                raise RuntimeError("Webhook no confirmó el evento")
        except (HTTPError, URLError, OSError, ValueError, RuntimeError) as error:
            LOG.warning("Evento pendiente; se reintentará: %s", error)
            break
        state["pending"].pop(0)
        save_state(settings["state_path"], state)
        LOG.info("Evento confirmado por Marbella (%s)", event["state"])


def run(settings: dict, probe: bool = False) -> None:
    from huawei_lte_api.Client import Client
    from huawei_lte_api.Connection import Connection

    state = load_state(settings["state_path"]) if not probe else None
    if state is not None:
        dispatch_pending(settings, state)
    while True:
        try:
            with Connection(settings["router"],
                            username=settings["username"],
                            password=settings["password"]) as connection:
                client = Client(connection)
                while True:
                    started = time.monotonic()
                    response = client.wlan.host_list()
                    macs = connected_macs(response)
                    if probe:
                        print("MAC conectadas al Huawei (datos locales):")
                        for mac in sorted(macs):
                            print(":".join(mac[i:i+2] for i in range(0, 12, 2)))
                        return
                    observe(state, settings["target"] in macs,
                            time.time(), settings["debounce"])
                    save_state(settings["state_path"], state)
                    dispatch_pending(settings, state)
                    time.sleep(max(0, settings["poll"] - (time.monotonic() - started)))
        except KeyboardInterrupt:
            LOG.info("Monitor detenido")
            return
        except Exception as error:
            # Nunca transformar un fallo del router en una desconexión.
            LOG.warning("Huawei no disponible o API no compatible: %s", error)
            state["candidate"] = None
            state["candidate_since"] = None
            save_state(settings["state_path"], state)
            dispatch_pending(settings, state)
            if probe:
                raise
            time.sleep(settings["poll"])


if __name__ == "__main__":
    argument_parser = argparse.ArgumentParser()
    argument_parser.add_argument("--probe", action="store_true",
                                 help="Muestra las MAC asociadas sin enviar alertas")
    args = argument_parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        run(config(probe=args.probe), probe=args.probe)
    except ValueError as exc:
        LOG.error("%s", exc)
        raise SystemExit(2) from exc
