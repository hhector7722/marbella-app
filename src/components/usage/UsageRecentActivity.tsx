'use client';

import { useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { firstNameOnly } from '@/lib/usage/display-name';
import { UsageDeviceIcon } from '@/components/usage/UsageDeviceIcon';
import { serializeProfileIdsForUrl, USAGE_RECENT_PAGE_SIZE } from '@/lib/usage/filters';
import type { UsageDashboardFilters, UsageRecentEvent } from '@/lib/usage/queries';

type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; createdAt: string };
type ChatTranscript = { messages: ChatMessage[]; truncated: boolean };

type UsageRecentActivityProps = {
  initialEvents: UsageRecentEvent[];
  initialHasMore: boolean;
  filters: UsageDashboardFilters;
};

function buildRecentQuery(filters: UsageDashboardFilters, offset: number): string {
  const params = new URLSearchParams();
  if (filters.day) params.set('dia', filters.day);
  const usuarios = serializeProfileIdsForUrl(filters.profileIds);
  if (usuarios !== null) params.set('usuarios', usuarios);
  params.set('offset', String(offset));
  params.set('limit', String(USAGE_RECENT_PAGE_SIZE));
  return params.toString();
}

export function UsageRecentActivity({
  initialEvents,
  initialHasMore,
  filters,
}: UsageRecentActivityProps) {
  const [events, setEvents] = useState(initialEvents);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [expandedChatId, setExpandedChatId] = useState<string | null>(null);
  const [chatLoadingId, setChatLoadingId] = useState<string | null>(null);
  const [chatResults, setChatResults] = useState<Record<string, ChatTranscript>>({});
  const [chatErrors, setChatErrors] = useState<Record<string, string>>({});

  async function toggleConversation(eventId: string) {
    if (expandedChatId === eventId) {
      setExpandedChatId(null);
      return;
    }
    setExpandedChatId(eventId);
    if (chatResults[eventId] || chatLoadingId === eventId) return;
    setChatLoadingId(eventId);
    setChatErrors((prev) => ({ ...prev, [eventId]: '' }));
    try {
      const response = await fetch(`/api/usage/chat/${encodeURIComponent(eventId)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudo consultar la conversación');
      const result = (await response.json()) as ChatTranscript;
      setChatResults((prev) => ({ ...prev, [eventId]: result }));
    } catch {
      setChatErrors((prev) => ({ ...prev, [eventId]: 'No se pudo cargar esta conversación.' }));
    } finally {
      setChatLoadingId((current) => current === eventId ? null : current);
    }
  }

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const query = buildRecentQuery(filters, events.length);
      const response = await fetch(`/api/usage/recent?${query}`);
      if (!response.ok) throw new Error('No se pudo cargar más actividad');
      const data = (await response.json()) as {
        events: UsageRecentEvent[];
        hasMore: boolean;
      };
      setEvents((prev) => [...prev, ...data.events]);
      setHasMore(data.hasMore);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#36606F]">
        Actividad reciente
      </h2>

      {events.length === 0 ? (
        <p className="text-xs text-zinc-500">Sin eventos recientes.</p>
      ) : (
        <div>
          {events.map((event, index) => {
            const prev = index > 0 ? events[index - 1] : null;
            const showUserHeader = !prev || prev.profileId !== event.profileId || prev.deviceType !== event.deviceType;

            return (
              <div key={event.id}>
                {showUserHeader ? (
                  <div
                    className={cn(
                      'flex min-h-10 items-center border-b border-zinc-100 bg-zinc-50/80 px-2',
                      index > 0 && 'mt-1 border-t'
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-xs font-bold uppercase tracking-wide text-[#36606F]">
                        {firstNameOnly(event.displayName)}
                      </p>
                      <UsageDeviceIcon deviceType={event.deviceType} />
                    </div>
                  </div>
                ) : null}
                {event.isChatOpen ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void toggleConversation(event.id)}
                      aria-expanded={expandedChatId === event.id}
                      aria-controls={`chat-conversation-${event.id}`}
                      className="flex min-h-10 w-full items-center gap-2 border-b border-zinc-50 py-1.5 pl-3 pr-1 text-left text-xs hover:bg-zinc-50"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium text-zinc-800">{event.title}</span>
                      <span className="w-28 shrink-0 text-right tabular-nums text-zinc-500">{event.timeLabel}</span>
                      <ChevronDown size={15} className={cn('shrink-0 text-zinc-500 transition-transform', expandedChatId === event.id && 'rotate-180')} aria-hidden />
                    </button>
                    {expandedChatId === event.id ? (
                      <div id={`chat-conversation-${event.id}`} className="max-h-[440px] space-y-2 overflow-y-auto border-b border-zinc-100 bg-zinc-50/70 px-3 py-3">
                        {chatLoadingId === event.id ? (
                          <p className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 size={14} className="animate-spin" /> Cargando conversación…</p>
                        ) : chatErrors[event.id] ? (
                          <p className="text-xs text-rose-600">{chatErrors[event.id]}</p>
                        ) : chatResults[event.id]?.messages.length ? (
                          <>
                            {chatResults[event.id].messages.map((message) => (
                              <div key={message.id} className={cn('max-w-[94%] rounded-lg border px-3 py-2 text-xs', message.role === 'user'
                                ? 'ml-auto border-[#36606F]/20 bg-white' : 'mr-auto border-zinc-200 bg-zinc-100')}>
                                <p className="mb-1 text-[10px] font-bold text-[#36606F]">{message.role === 'user' ? 'Usuario' : 'Asistente'}</p>
                                <p className="whitespace-pre-wrap break-words text-zinc-800">{message.text}</p>
                              </div>
                            ))}
                            {chatResults[event.id].truncated ? (
                              <p className="text-xs text-amber-700">Conversación larga: se muestran los primeros 200 mensajes.</p>
                            ) : null}
                          </>
                        ) : (
                          <p className="text-xs text-zinc-500">Abrió el chat, pero no hay mensajes registrados en esta sesión.</p>
                        )}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="flex min-h-10 items-center gap-2 border-b border-zinc-50 py-1.5 pl-3 pr-1 text-xs">
                    <p className="min-w-0 flex-1 truncate font-medium text-zinc-800">{event.title}</p>
                    <p className="w-28 shrink-0 text-right tabular-nums text-zinc-500">{event.timeLabel}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasMore ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loading}
          className={cn(
            'mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 text-xs font-semibold text-[#36606F]',
            'hover:border-[#36606F]/40 hover:bg-zinc-50 disabled:opacity-60'
          )}
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Cargando…
            </>
          ) : (
            'Ver más'
          )}
        </button>
      ) : null}
    </section>
  );
}
