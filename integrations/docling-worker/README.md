# Worker Docling K3

Este servicio solo sirve evidencia documental. No contiene credenciales de Supabase ni puede acceder a la Data API.

## Producción real validada

El canary de producción del 15/09/2026 se validó en un LXC dedicado de Proxmox:

- Proxmox VE 9.1.5, CT 105 `docling-worker`
- Debian 12, Python 3.11
- LXC no privilegiado, sin nesting y sin Docker
- 2 vCPU, 4 GiB RAM, 1 GiB swap, 30 GiB disco
- Docling Serve solo en `127.0.0.1:5001`
- worker y Docling Serve gestionados por systemd
- modelos locales bajo `/var/lib/marbella-docling/models`
- repo en `/opt/marbella-app`
- venv en `/opt/marbella-docling/venv`

El conjunto de versiones que superó el canary está fijado en `constraints-lxc.txt`. No actualizar Docling por resolución libre de `pip`: `docling-serve==1.21.0` resolvió inicialmente versiones incompatibles que fallaban en runtime.

Instalación base recomendada:

```bash
python3 -m venv /opt/marbella-docling/venv
/opt/marbella-docling/venv/bin/python -m pip install --upgrade pip
/opt/marbella-docling/venv/bin/python -m pip install \
  -c /opt/marbella-app/integrations/docling-worker/constraints-lxc.txt \
  'docling-serve==1.21.0' 'docling==2.96.1' rapidocr onnxruntime \
  --extra-index-url https://download.pytorch.org/whl/cpu
/opt/marbella-docling/venv/bin/python -m pip check
```

Los modelos deben descargarse previamente a `/var/lib/marbella-docling/models`; al definir `DOCLING_SERVE_ARTIFACTS_PATH` Docling presupone que los artefactos ya existen.

## Variables del mini-PC

En producción LXC los secretos viven fuera del repo, con permisos `0600`:

- `/etc/marbella-docling/docling-serve.env`
- `/etc/marbella-docling/worker.env`

`DOCLING_WORKER_TOKEN` autentica el worker ante la Edge Function y `DOCLING_API_KEY` protege Docling Serve en localhost. Nunca versionar sus valores.

El modo Docker de `compose.yaml` se conserva como alternativa de desarrollo. En el CT 105 de producción no se usa Docker.

## Arranque Docker opcional

```bash
docker compose --env-file .env up -d --build
```

La API Docling queda ligada a `127.0.0.1:5001`; no se publica en la red. El worker obtiene un trabajo, recibe una URL de Storage firmada de vida corta, procesa el documento y solo devuelve evidencia, tablas crudas y métricas a la Edge Function.

## Verificación

```bash
python3 worker_test.py
curl -fsS http://127.0.0.1:5001/readyz >/dev/null && echo 'Docling ready'
systemctl is-active docling-serve.service
systemctl is-active docling-worker.service
```

El canary real confirmó `created -> leased -> completed`, hash del original igual al de la extracción y cero efectos en líneas económicas, stock, historial de precios, confirmaciones, allocations y mappings.

Los documentos originales y la evidencia no se borran. Un fallo queda en `document_processing_jobs` y su secuencia de eventos; no se fabrica una extracción de error. Así el reintento reanuda el mismo trabajo sin sobrescribir evidencia previa.
