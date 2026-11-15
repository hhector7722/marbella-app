'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Layers3, List, Loader2, RefreshCw } from 'lucide-react';
import { UsageDeviceIcon } from '@/components/usage/UsageDeviceIcon';
import { serializeProfileIdsForUrl } from '@/lib/usage/filters';
import type { UsageDashboardFilters, UsageSessionEvent, UsageTimelineCounts, UsageTimelinePage } from '@/lib/usage/queries';

type Device = 'all' | 'smartphone' | 'desktop' | 'tablet' | 'unknown';
type View = 'timeline' | 'sessions';
type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string };
type Chat = { messages: ChatMessage[]; truncated: boolean };
type SessionGroup = {
  key: string;
  profileId: string;
  name: string;
  device: Device;
  sessionId: string | null;
  browserId: string | null;
  browserSessionId: string | null;
  browserOpening: boolean;
  last: string;
  events: UsageSessionEvent[];
  historical: boolean;
};
const deviceOptions: { id: Device; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'smartphone', label: 'Móvil' },
  { id: 'desktop', label: 'Ordenador' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'unknown', label: 'Sin identificar' },
];
const deviceNames: Record<Device, string> = {
  all: 'Todos', smartphone: 'Móvil', desktop: 'Ordenador',
  tablet: 'Tablet', unknown: 'Sin identificar',
};
const deviceStyles: Record<Device, string> = {
  all: 'bg-[#36606F]/10 text-[#36606F]',
  smartphone: 'bg-emerald-50 text-emerald-800',
  desktop: 'bg-blue-50 text-blue-800',
  tablet: 'bg-violet-50 text-violet-800',
  unknown: 'bg-amber-50 text-amber-900',
};
const dateFormat = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', day: 'numeric', month: 'long', year: 'numeric',
});
const shortDate = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', day: '2-digit', month: 'short',
});
const hourFormat = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
const dateKeyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
});
const deviceOf = (event: UsageSessionEvent): Device => event.deviceType ?? 'unknown';
const dayOf = (iso: string) => dateKeyFormat.format(new Date(iso));
const displayDate = (iso: string) => dateFormat.format(new Date(iso));
const displayHour = (iso: string) => hourFormat.format(new Date(iso));
const compactNumber = (value: number) => new Intl.NumberFormat('es-ES').format(value);

function sessionGroups(events: UsageSessionEvent[]): SessionGroup[] {
  const groups = new Map<string, SessionGroup>();
  for (const event of events) {
    const device = deviceOf(event);
    const browserOpening = !event.usageSessionId && !!event.usageBrowserSessionId;
    const historical = !event.usageSessionId && !event.usageBrowserSessionId;
    // Los registros del proxy identifican el NAVEGADOR, pero no la pestaña.
    // Nunca atribuir una apertura del proxy a una pestaña concreta.
    const key = browserOpening
      ? `browser:${event.profileId}:${device}:${event.usageBrowserSessionId}`
      : historical
        ? `historical:${event.profileId}:${device}:${dayOf(event.createdAt)}`
        : `identified:${event.profileId}:${device}:${event.usageSessionId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key, profileId: event.profileId, name: event.displayName, device,
        sessionId: historical ? null : event.usageSessionId,
        browserId: event.usageBrowserId,
        browserSessionId: event.usageBrowserSessionId,
        browserOpening,
        last: event.createdAt, events: [], historical,
      };
      groups.set(key, group);
    }
    if (!group.browserSessionId && event.usageBrowserSessionId) {
      group.browserSessionId = event.usageBrowserSessionId;
    }
    if (event.createdAt > group.last) group.last = event.createdAt;
    group.events.push(event);
  }
  return [...groups.values()].sort((a, b) => b.last.localeCompare(a.last));
}

function DeviceChip({ device }: { device: Device }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${deviceStyles[device]}`}>
      {device === 'unknown' ? null : <UsageDeviceIcon deviceType={device === 'all' ? null : device} />}
      {deviceNames[device]}
    </span>
  );
}

export function UsageSessionExplorer({ filters }: { filters: UsageDashboardFilters }) {
  const [device, setDevice] = useState<Device>('all');
  const [view, setView] = useState<View>('timeline');
  const [events, setEvents] = useState<UsageSessionEvent[]>([]);
  const [counts, setCounts] = useState<UsageTimelineCounts | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sessionDetails, setSessionDetails] = useState<Record<string, { events: UsageSessionEvent[]; truncated: boolean }>>({});
  const [sessionLoading, setSessionLoading] = useState<string | null>(null);
  const [chatDetails, setChatDetails] = useState<Record<string, Chat>>({});
  const [chatLoading, setChatLoading] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const moreRunning = useRef(false);
  const queryUsers = serializeProfileIdsForUrl(filters.profileIds);
  const day = filters.day;

  const makeParams = useCallback((nextCursor?: string) => {
    const params = new URLSearchParams({ dispositivo: device });
    if (day) params.set('dia', day);
    if (queryUsers !== null) params.set('usuarios', queryUsers);
    if (nextCursor) params.set('cursor', nextCursor);
    return params;
  }, [day, queryUsers, device]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setEvents([]);
    setCursor(null);
    setCounts(null);
    setSelectedSession(null);
    setSessionDetails({});
    moreRunning.current = false;
    void fetch(`/api/usage/timeline?${makeParams()}`, {
      cache: 'no-store', signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('No se pudo consultar actividad');
      return response.json() as Promise<UsageTimelinePage>;
    }).then((data) => {
      if (controller.signal.aborted) return;
      setEvents(data.events);
      setCounts(data.counts);
      setCursor(data.nextCursor);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [makeParams, refreshToken]);

  const loadMore = useCallback(async () => {
    if (!cursor || moreRunning.current || loading) return;
    moreRunning.current = true;
    setMoreLoading(true);
    try {
      const response = await fetch(`/api/usage/timeline?${makeParams(cursor)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Error de paginación');
      const page = (await response.json()) as UsageTimelinePage;
      setEvents((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...page.events.filter((item) => !seen.has(item.id))];
      });
      setCursor(page.nextCursor);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setMoreLoading(false);
      moreRunning.current = false;
    }
  }, [cursor, loading, makeParams]);

  useEffect(() => {
    if (view !== 'timeline' || !cursor || loading || moreLoading || error || !sentinel.current) return;
    const target = sentinel.current;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMore();
    }, { rootMargin: '300px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [cursor, loadMore, view, loading, moreLoading, error]);

  const groups = useMemo(() => sessionGroups(events), [events]);
  const activeSession = groups.find((group) => group.key === selectedSession) ?? groups[0] ?? null;
  const activeKey = activeSession?.key;
  const activeProfile = activeSession?.profileId;
  const activeSessionId = activeSession?.sessionId;

  useEffect(() => {
    if (view !== 'sessions' || !activeKey || !activeProfile || !activeSessionId || sessionDetails[activeKey]) return;
    const controller = new AbortController();
    setSessionLoading(activeKey);
    void fetch(
      `/api/usage/session?usuario=${encodeURIComponent(activeProfile)}&sesion=${encodeURIComponent(activeSessionId)}`,
      { cache: 'no-store', signal: controller.signal },
    ).then(async (response) => {
      if (!response.ok) throw new Error('No disponible');
      return response.json() as Promise<{ events: UsageSessionEvent[]; truncated: boolean }>;
    }).then((data) => {
      if (!controller.signal.aborted) setSessionDetails((prev) => ({ ...prev, [activeKey]: data }));
    }).catch(() => {
      // El recorrido parcial sigue disponible si la consulta de detalle falla.
    }).finally(() => {
      if (!controller.signal.aborted) setSessionLoading((value) => value === activeKey ? null : value);
    });
    return () => controller.abort();
  }, [view, activeKey, activeProfile, activeSessionId, sessionDetails]);

  const openEvent = async (event: UsageSessionEvent) => {
    if (expanded === event.id) { setExpanded(null); return; }
    setExpanded(event.id);
    setChatError(null);
    if (event.action !== 'chat_open' || chatDetails[event.id]) return;
    setChatLoading(event.id);
    try {
      const response = await fetch(`/api/usage/chat/${encodeURIComponent(event.id)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Error al obtener conversación');
      const result = await response.json() as Chat;
      setChatDetails((previous) => ({ ...previous, [event.id]: result }));
    } catch {
      setChatError(event.id);
    } finally {
      setChatLoading((value) => value === event.id ? null : value);
    }
  };

  const activityRow = (event: UsageSessionEvent, showUser: boolean) => {
    const isOpen = expanded === event.id;
    const chat = chatDetails[event.id];
    return (
      <div key={event.id} className="border-b border-zinc-100 last:border-b-0">
        <button type="button" aria-expanded={isOpen}
          onClick={() => void openEvent(event)}
          className={`flex min-h-14 w-full items-start gap-2 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-zinc-50 ${isOpen ? 'bg-zinc-50' : ''}`}>
          <span className="w-[66px] shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-zinc-500">
            {displayHour(event.createdAt)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block break-words text-[13px] font-medium leading-5 text-zinc-800">{event.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              {showUser ? <span className="text-[11px] font-semibold text-zinc-600">{event.displayName}</span> : null}
              <DeviceChip device={deviceOf(event)} />
            </span>
          </span>
          {isOpen ? <ChevronDown className="mt-1 shrink-0 text-[#36606F]" size={16} /> :
            <ChevronRight className="mt-1 shrink-0 text-zinc-400" size={16} />}
        </button>
        {isOpen ? (
          <div className="mx-2 mb-2 space-y-1 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-[12px] text-zinc-600">
            <p><b>Tipo:</b> {event.action ?? event.eventType}</p>
            <p className="break-all"><b>Pantalla:</b> {event.path ?? 'Sin ruta registrada'}</p>
            {event.referrerPath ? <p className="break-all"><b>Viene de:</b> {event.referrerPath}</p> : null}
            {event.durationMs !== null ? <p><b>Duración registrada:</b> {Math.round(event.durationMs / 1000)} segundos</p> : null}
            {event.usageBrowserId ? <p><b>Navegador:</b> {event.usageBrowserId.slice(0, 8)}</p> : null}
            {event.usageBrowserSessionId ? <p><b>Sesión del navegador:</b> {event.usageBrowserSessionId.slice(0, 8)}</p> : null}
            {event.usageSessionId ? <p><b>Pestaña:</b> {event.usageSessionId.slice(0, 8)}</p> : null}
            {event.action === 'chat_open' ? (
              <div className="mt-2 space-y-2 border-t border-zinc-200 pt-2">
                {chatLoading === event.id ? <p className="flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Cargando conversación…</p> : null}
                {chatError === event.id ? <p className="text-rose-600">No se pudo cargar la conversación.</p> : null}
                {chat && !chat.messages.length ? <p>No hay mensajes registrados.</p> : null}
                {chat?.messages.map((message) => (
                  <div key={message.id} className={`rounded-lg px-3 py-2 ${message.role === 'user' ? 'bg-white' : 'bg-zinc-200/50'}`}>
                    <p className="text-[10px] font-semibold text-[#36606F]">{message.role === 'user' ? 'Usuario' : 'Asistente'}</p>
                    <p className="whitespace-pre-wrap break-words">{message.text}</p>
                  </div>
                ))}
                {chat?.truncated ? <p>Conversación larga: solo los primeros 200 mensajes.</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const totals = counts ?? { total: 0, smartphone: 0, desktop: 0, tablet: 0, unknown: 0 };
  const usersCount = new Set(events.map((event) => event.profileId)).size;
  const sessionEvents = activeSession
    ? (sessionDetails[activeSession.key]?.events ?? [...activeSession.events].reverse())
    : [];

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <header className="space-y-3 px-4 pb-4 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-zinc-900">Actividad en la aplicación</h2>
            <p className="mt-1 text-xs text-zinc-500">Movimientos separados por usuario, hora y dispositivo</p>
          </div>
          <button type="button" onClick={() => setRefreshToken((value) => value + 1)}
            aria-label="Actualizar actividad" title="Actualizar actividad"
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-[#36606F] hover:bg-zinc-50">
            <RefreshCw size={17} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {deviceOptions.map((option) => {
            const count = option.id === 'all' ? totals.total : totals[option.id];
            return (
              <button key={option.id} type="button" aria-pressed={device === option.id}
                onClick={() => { setDevice(option.id); setExpanded(null); }}
                className={`min-h-[66px] rounded-xl border px-3 py-2 text-left transition-colors ${device === option.id
                  ? 'border-[#36606F] bg-[#36606F]/10'
                  : 'border-zinc-200 bg-zinc-50 hover:border-[#36606F]/40'}`}>
                <span className="block text-[11px] font-semibold text-zinc-600">{option.label}</span>
                <span className="mt-1 block text-lg font-bold tabular-nums text-zinc-800">
                  {loading && !counts ? '…' : compactNumber(count)}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-zinc-100 pt-3">
          <div className="inline-flex rounded-lg bg-zinc-100 p-1">
            <button type="button" aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold ${view === 'timeline' ? 'bg-white text-[#36606F] shadow-sm' : 'text-zinc-500'}`}>
              <List size={15} /> Movimientos
            </button>
            <button type="button" aria-pressed={view === 'sessions'} onClick={() => setView('sessions')}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold ${view === 'sessions' ? 'bg-white text-[#36606F] shadow-sm' : 'text-zinc-500'}`}>
              <Layers3 size={15} /> Sesiones
            </button>
          </div>
          <span className="text-[11px] tabular-nums text-zinc-500">
            {compactNumber(events.length)} de {compactNumber(device === 'all' ? totals.total : totals[device])}
          </span>
        </div>
      </header>

      {loading ? (
        <p className="flex items-center justify-center gap-2 border-t border-zinc-100 px-4 py-10 text-sm text-zinc-500">
          <Loader2 size={17} className="animate-spin" /> Cargando movimientos…
        </p>
      ) : error && !events.length ? (
        <div className="border-t border-zinc-100 px-4 py-8 text-center">
          <p className="text-sm text-rose-700">No se pudo cargar la actividad.</p>
          <button type="button" onClick={() => setRefreshToken((value) => value + 1)}
            className="mt-3 rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold">Reintentar</button>
        </div>
      ) : !events.length ? (
        <p className="border-t border-zinc-100 px-4 py-8 text-center text-sm text-zinc-500">No hay movimientos para este filtro.</p>
      ) : view === 'timeline' ? (
        <div className="border-t border-zinc-100 px-2 pb-1 sm:px-4">
          {events.map((event, index) => {
            const date = dayOf(event.createdAt);
            const previous = index ? dayOf(events[index - 1].createdAt) : null;
            return (
              <div key={event.id}>
                {date !== previous ? (
                  <div className="sticky top-0 z-[1] border-b border-zinc-100 bg-white/95 px-2 py-3 text-xs font-bold capitalize text-[#36606F] backdrop-blur-sm">
                    {displayDate(event.createdAt)}
                  </div>
                ) : null}
                {activityRow(event, usersCount > 1)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid border-t border-zinc-100 md:grid-cols-[minmax(200px,36%)_minmax(0,1fr)]">
          <div className="flex gap-2 overflow-x-auto border-b border-zinc-100 bg-zinc-50 p-2 md:max-h-[540px] md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
            {groups.map((group) => (
              <button key={group.key} type="button"
                aria-current={activeSession?.key === group.key ? 'true' : undefined}
                onClick={() => { setSelectedSession(group.key); setExpanded(null); }}
                className={`min-w-[182px] shrink-0 space-y-1 rounded-lg border px-3 py-2 text-left md:min-w-0 ${activeSession?.key === group.key
                  ? 'border-[#36606F] bg-white' : 'border-zinc-200 bg-white/70'}`}>
                <span className="block truncate text-xs font-semibold text-zinc-800">{group.name}</span>
                <DeviceChip device={group.device} />
                <span className="block text-[11px] text-zinc-500">{shortDate.format(new Date(group.last))} · {displayHour(group.last)}</span>
                <span className="block text-[11px] text-zinc-500">
                  {group.browserOpening ? 'Apertura del navegador' : group.historical ? 'Eventos sin sesión identificada' : 'Sesión de pestaña'}
                </span>
              </button>
            ))}
          </div>
          <div className="min-w-0">
            {activeSession ? (
              <>
                <div className="border-b border-zinc-100 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-sm text-zinc-800">{activeSession.name}</b>
                    <DeviceChip device={activeSession.device} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {activeSession.browserOpening
                      ? 'Inicio de navegador registrado por el proxy. Vinculado por navegador, pero no asignable a una pestaña concreta.'
                      : activeSession.historical
                        ? 'Eventos agrupados por día y dispositivo; no se puede identificar una pestaña concreta.'
                        : 'Movimientos de esta pestaña, ordenados cronológicamente.'}
                    {activeSession.browserSessionId && !activeSession.historical ? (
                      <span className="mt-1 block">Contexto de navegador: {activeSession.browserSessionId.slice(0, 8)}</span>
                    ) : null}
                  </p>
                </div>
                {sessionLoading === activeSession.key ? (
                  <p className="flex items-center gap-2 p-3 text-xs text-zinc-500"><Loader2 className="animate-spin" size={14} /> Recuperando sesión completa…</p>
                ) : null}
                <div className="max-h-[560px] overflow-y-auto p-2 sm:p-3">
                  {sessionEvents.map((event) => activityRow(event, false))}
                </div>
                {sessionDetails[activeSession.key]?.truncated ? (
                  <p className="p-3 text-xs text-amber-700">Esta sesión supera 1.500 eventos; consulta la cronología para recorrerlos todos.</p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      )}

      {events.length && (cursor || moreLoading || error) ? (
        <div ref={sentinel} className="border-t border-zinc-100 px-3 py-3 text-center">
          {error ? <p className="mb-2 text-xs text-rose-700">No se pudo cargar la siguiente página.</p> : null}
          {cursor ? (
            <button type="button" onClick={() => void loadMore()} disabled={moreLoading}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-4 text-xs font-semibold text-[#36606F] hover:bg-zinc-50 disabled:opacity-50">
              {moreLoading ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}
              {moreLoading ? 'Cargando…' : 'Cargar más movimientos'}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3 text-[11px] leading-5 text-zinc-500">
        Cada registro aparece por separado, aunque varios dispositivos actúen en el mismo minuto.
        Los eventos sin información de dispositivo permanecen como «Sin identificar». El tipo se
        deduce de las señales del navegador; no es una prueba del dispositivo físico.
      </div>
    </section>
  );
}
