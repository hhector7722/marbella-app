'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Clock3, Loader2, MonitorSmartphone } from 'lucide-react';
import { UsageDeviceIcon } from '@/components/usage/UsageDeviceIcon';
import type { UsageDeviceType } from '@/lib/usage/device';
import type { UsageSessionEvent } from '@/lib/usage/queries';

type Session = {
  key: string;
  profileId: string;
  name: string;
  deviceType: UsageDeviceType | null;
  usageSessionId: string | null;
  estimated: boolean;
  started: number;
  last: number;
  events: UsageSessionEvent[];
};

type Detail = { events: UsageSessionEvent[]; truncated: boolean };
const IDLE_MS = 30 * 60 * 1000;
const TIME = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
const DATE = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
});
const dateLabel = (timestamp: number) => DATE.format(new Date(timestamp));

function groupSessions(events: UsageSessionEvent[]): Session[] {
  const groups: Session[] = [];
  const bySession = new Map<string, Session>();
  const lastLegacy = new Map<string, Session>();
  // La consulta llega de más nuevo a más antiguo; recorrer de forma cronológica.
  for (const event of [...events].reverse()) {
    const timestamp = Date.parse(event.createdAt);
    if (!Number.isFinite(timestamp)) continue;
    const device = event.deviceType ?? null;
    const deviceKey = device ?? 'desconocido';
    const key = event.usageSessionId
      ? `${event.profileId}:session:${event.usageSessionId}`
      : null;
    let group = key ? bySession.get(key) : undefined;
    if (!key) {
      const legacyKey = `${event.profileId}:${deviceKey}`;
      const preceding = lastLegacy.get(legacyKey);
      if (preceding && timestamp - preceding.last <= IDLE_MS && timestamp >= preceding.last) {
        group = preceding;
      } else {
        group = {
          key: `legacy:${legacyKey}:${event.id}`,
          profileId: event.profileId, name: event.displayName, deviceType: device,
          usageSessionId: null, estimated: true,
          started: timestamp, last: timestamp, events: [],
        };
        groups.push(group);
        lastLegacy.set(legacyKey, group);
      }
    }
    if (!group) {
      group = {
        key: key!, profileId: event.profileId, name: event.displayName,
        deviceType: device, usageSessionId: event.usageSessionId, estimated: false,
        started: timestamp, last: timestamp, events: [],
      };
      groups.push(group);
      bySession.set(key!, group);
    }
    group.started = Math.min(group.started, timestamp);
    group.last = Math.max(group.last, timestamp);
    group.events.push(event);
  }
  return groups.sort((a, b) => b.last - a.last);
}

export function UsageSessionExplorer({ events, limited }: { events: UsageSessionEvent[]; limited: boolean }) {
  const sessions = useMemo(() => groupSessions(events), [events]);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const active = sessions.find((session) => session.key === selected) ?? sessions[0] ?? null;
  const activeKey = active?.key;
  const activeProfile = active?.profileId;
  const activeSessionId = active?.usageSessionId;

  useEffect(() => {
    if (!activeKey || !activeProfile || !activeSessionId || details[activeKey]) return;
    const controller = new AbortController();
    setLoadingKey(activeKey);
    setErrorKey(null);
    void fetch(
      `/api/usage/session?usuario=${encodeURIComponent(activeProfile)}&sesion=${encodeURIComponent(activeSessionId)}`,
      { cache: 'no-store', signal: controller.signal },
    ).then(async (response) => {
      if (!response.ok) throw new Error('Consulta no disponible');
      return response.json() as Promise<Detail>;
    }).then((detail) => {
      if (!controller.signal.aborted) setDetails((previous) => ({ ...previous, [activeKey]: detail }));
    }).catch(() => {
      if (!controller.signal.aborted) setErrorKey(activeKey);
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingKey((current) => current === activeKey ? null : current);
    });
    return () => controller.abort();
  }, [activeKey, activeProfile, activeSessionId, details]);

  const detail = activeKey ? details[activeKey] : null;
  const movements = detail?.events ?? active?.events ?? [];

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <MonitorSmartphone size={17} className="text-[#36606F]" aria-hidden />
          <h2 className="text-sm font-bold text-zinc-800">Recorrido por sesiones</h2>
        </div>
        <span className="text-[11px] tabular-nums text-zinc-500">
          {sessions.length} {sessions.length === 1 ? 'grupo' : 'grupos'}
        </span>
      </div>
      {sessions.length === 0 ? (
        <p className="border-t border-zinc-100 px-4 py-6 text-sm text-zinc-500">No hay movimientos en los filtros seleccionados.</p>
      ) : (
        <div className="grid border-t border-zinc-100 md:grid-cols-[minmax(12rem,34%)_minmax(0,1fr)]">
          <nav aria-label="Elegir sesión" className="flex gap-2 overflow-x-auto border-b border-zinc-100 bg-zinc-50 p-2 md:max-h-[490px] md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
            {sessions.map((session) => (
              <button key={session.key} type="button"
                aria-current={activeKey === session.key ? 'true' : undefined}
                onClick={() => { setSelected(session.key); setExpanded(null); }}
                className={`min-w-[178px] shrink-0 rounded-lg border px-3 py-2.5 text-left transition-colors md:min-w-0 ${activeKey === session.key ? 'border-[#36606F]/50 bg-[#36606F]/10' : 'border-zinc-200 bg-white hover:border-[#36606F]/30'}`}>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-800">{session.name}</span>
                  <UsageDeviceIcon deviceType={session.deviceType} />
                </span>
                <span className="mt-1 block text-[11px] text-zinc-600">
                  {session.estimated ? 'Histórico sin identificación' : 'Sesión identificada'}
                </span>
                <span className="mt-1 block text-[11px] tabular-nums text-zinc-500">
                  {dateLabel(session.started)} – {TIME.format(new Date(session.last))}
                </span>
                <span className="mt-1 block text-[11px] font-medium text-[#36606F]">
                  {session.events.length} movimientos{session.estimated ? ' (estimados)' : ''}
                </span>
              </button>
            ))}
          </nav>
          <div className="min-w-0">
            {active ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-800">{active.name}</p>
                    <p className="text-[11px] text-zinc-500">
                      {active.estimated ? 'Recorrido aproximado · no se puede distinguir cada pestaña antigua' : 'Recorrido de una pestaña o navegador'}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-zinc-500">
                    <Clock3 size={13} aria-hidden /> {movements.length} eventos
                  </span>
                </div>
                <div className="max-h-[490px] overflow-y-auto p-3">
                  {loadingKey === activeKey ? (
                    <p className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
                      <Loader2 size={14} className="animate-spin" aria-hidden /> Recuperando recorrido completo…
                    </p>
                  ) : null}
                  {errorKey === activeKey ? (
                    <p className="mb-2 text-xs text-amber-700">No se pudo ampliar la sesión. Se muestran los eventos recientes disponibles.</p>
                  ) : null}
                  {movements.map((event, index) => {
                    const opened = expanded === event.id;
                    const previous = index > 0 ? movements[index - 1] : null;
                    const next = index + 1 < movements.length ? movements[index + 1] : null;
                    return (
                      <div key={event.id} className="relative border-l border-zinc-200 pl-4 pb-1 last:border-l-transparent">
                        <span className="absolute -left-[4px] top-4 size-[7px] rounded-full bg-[#36606F]" />
                        <button type="button" aria-expanded={opened}
                          onClick={() => setExpanded(opened ? null : event.id)}
                          className={`flex min-h-11 w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-zinc-50 ${opened ? 'bg-zinc-50' : ''}`}>
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-xs font-semibold leading-5 text-zinc-800">{event.title}</span>
                            <span className="text-[11px] text-zinc-500">{TIME.format(new Date(event.createdAt))}</span>
                          </span>
                          {opened ? <ChevronDown size={15} className="mt-1 shrink-0 text-zinc-400" aria-hidden /> :
                            <ChevronRight size={15} className="mt-1 shrink-0 text-zinc-400" aria-hidden />}
                        </button>
                        {opened ? (
                          <div className="mb-2 space-y-1 rounded-lg bg-zinc-50 px-3 py-2 text-[11px] leading-5 text-zinc-600">
                            <p><b>Tipo:</b> {event.action ?? event.eventType}</p>
                            <p className="break-all"><b>Pantalla:</b> {event.path ?? 'Sin ruta'}</p>
                            {event.referrerPath ? <p className="break-all"><b>Venía de:</b> {event.referrerPath}</p> : null}
                            {event.durationMs != null ? <p><b>Tiempo registrado:</b> {Math.round(event.durationMs / 1000)} s</p> : null}
                            {previous ? <p><b>Anterior:</b> {previous.title}</p> : null}
                            {next ? <p><b>Siguiente:</b> {next.title}</p> : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {detail?.truncated ? <p className="text-xs text-amber-700">Sesión muy larga: se muestran los primeros 1.500 eventos.</p> : null}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
      <div className="border-t border-zinc-100 px-4 py-2 text-[11px] leading-5 text-zinc-500">
        {limited ? 'Vista general limitada a los 500 eventos más recientes; filtra por fecha y usuario para acotar. ' : ''}
        Solo aparecen acciones instrumentadas. Las sesiones anteriores a esta mejora no pueden separarse con certeza.
      </div>
    </section>
  );
}
