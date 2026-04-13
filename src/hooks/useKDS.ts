"use client";

import { useEffect, useState, useCallback, useRef, startTransition } from 'react';
import { createClient } from '@/utils/supabase/client';
import { KDSOrder, KDSOrderLine, KDSItemStatus } from '@/components/kds/types';
import { getStartOfLocalToday, parseTPVDate, parseDBDate } from '@/utils/date-utils';

type KDSTicketKitchenState = 'activa' | 'completada';
type KDSTicketStateRow = {
    id_ticket: string;
    kitchen_state: KDSTicketKitchenState;
    manual_completed_at: string | null;
    updated_at: string;
};

export function useKDS() {
    const [orders, setOrders] = useState<KDSOrder[]>([]);
    const ordersRef = useRef<KDSOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOffline, setIsOffline] = useState(false);
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
    const supabase = createClient();

    useEffect(() => {
        ordersRef.current = orders;
    }, [orders]);

    const setStatusWithTimeout = useCallback((status: 'success' | 'error') => {
        setSyncStatus(status);
        if (status === 'success') {
            const timeout = setTimeout(() => {
                setSyncStatus(prev => prev === 'success' ? 'idle' : prev);
            }, 2000);
            return () => clearTimeout(timeout);
        }
    }, []);

    /**
     * Estado manual por TICKET (fuente de verdad en BD: public.kds_ticket_state).
     * Reglas:
     * - Finalizar/Recuperar lo decide cocina (manual) por `id_ticket`.
     * - Reabrir automático SOLO si, tras `manual_completed_at`, entran líneas nuevas (pendiente/cancelado).
     */
    const ticketStateByTicket = useRef<Map<string, KDSTicketStateRow>>(new Map());
    const inFlightLineIds = useRef<Set<string>>(new Set());
    const realtimeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const pendingUpdates = useRef<Array<() => void>>([]);
    /** Tras al menos un fetch HTTP correcto a Supabase, no marcar DESCONECTADO por errores puntuales de refetch. */
    const kdsFetchSucceededOnce = useRef(false);

    const scheduleUpdate = useCallback((fn: () => void) => {
        pendingUpdates.current.push(fn);
        clearTimeout(realtimeTimer.current);
        realtimeTimer.current = setTimeout(() => {
            const updates = pendingUpdates.current.splice(0);
            startTransition(() => {
                updates.forEach(update => update());
            });
        }, 80);
    }, []);

    /**
     * Líneas: el servidor es fuente de verdad (líneas borradas/anuladas en BD desaparecen del KDS).
     * Se conserva línea local solo si hay update en vuelo (inFlightLineIds).
     */
    const mergeLineasFromServer = useCallback((local: KDSOrder | undefined, serverOrder: KDSOrder): KDSOrderLine[] => {
        const serverLines = serverOrder.lineas ?? [];
        const serverIds = new Set(serverLines.map((l) => l.id));
        const out: KDSOrderLine[] = serverLines.map((sl) => {
            const localLine = local?.lineas?.find((l) => l.id === sl.id);
            if (localLine && inFlightLineIds.current.has(sl.id)) return localLine;
            return sl;
        });
        (local?.lineas ?? []).forEach((l) => {
            if (!serverIds.has(l.id) && inFlightLineIds.current.has(l.id)) out.push(l);
        });
        return out;
    }, []);

    const ticketKeyForOrder = useCallback((o: { id: string; id_ticket?: string | null }) => {
        const t = (o.id_ticket ?? '').trim();
        return t ? t : `order:${o.id}`;
    }, []);

    const applyTicketStateToOrders = useCallback((ordersIn: KDSOrder[]) => {
        // Agrupar líneas por ticket para poder detectar “artículos nuevos” tras manual_completed_at
        const linesByTicket = new Map<string, KDSOrderLine[]>();
        for (const o of ordersIn) {
            const tk = ticketKeyForOrder(o);
            const arr = linesByTicket.get(tk) ?? [];
            arr.push(...(o.lineas ?? []));
            linesByTicket.set(tk, arr);
        }

        return ordersIn.map((o) => {
            const tk = ticketKeyForOrder(o);
            const st = ticketStateByTicket.current.get(tk);
            if (!st) return o;

            if (st.kitchen_state === 'activa') {
                return { ...o, estado: 'activa' as const, completed_at: null };
            }

            // kitchen_state === 'completada'
            const mc = st.manual_completed_at;
            if (!mc) {
                return { ...o, estado: 'completada' as const, completed_at: o.completed_at ?? null };
            }
            const mcMs = parseDBDate(mc).getTime();
            const hasNewAfterManual =
                (linesByTicket.get(tk) ?? []).some((l) => {
                    const createdMs = parseDBDate(l.created_at).getTime();
                    return createdMs > mcMs && (l.estado === 'pendiente' || l.estado === 'cancelado');
                });

            if (hasNewAfterManual) {
                // Reapertura automática (solo por artículos nuevos)
                return { ...o, estado: 'activa' as const, completed_at: null };
            }

            return { ...o, estado: 'completada' as const, completed_at: mc };
        });
    }, [ticketKeyForOrder]);

    const mergeOrders = useCallback(
        (serverData: KDSOrder[]) => {
            setOrders((prev) => {
                const prevMap = new Map(prev.map((o) => [o.id, o]));

                const startOfToday = getStartOfLocalToday();
                const isFromToday = (o: KDSOrder) => {
                    // Regla operativa (ver PROJECT_STATUS): día en curso por medianoche local.
                    // - Activas: si cabecera creada hoy o existe alguna línea creada hoy.
                    // - Completadas: si completed_at es de hoy.
                    try {
                        if (o.estado === 'completada') {
                            const ca = o.completed_at ? parseDBDate(o.completed_at).getTime() : 0;
                            return ca >= startOfToday.getTime();
                        }
                        const header = parseDBDate(o.created_at).getTime();
                        if (header >= startOfToday.getTime()) return true;
                        const anyLineToday =
                            (o.lineas ?? []).some((l) => parseDBDate(l.created_at).getTime() >= startOfToday.getTime());
                        return anyLineToday;
                    } catch {
                        // Fallback defensivo: si hay formato raro, no retener por defecto.
                        return false;
                    }
                };

                const merged: KDSOrder[] = serverData.map((serverOrder) => {
                    const local = prevMap.get(serverOrder.id);
                    const baseOrder = local ?? serverOrder;
                    const lineas = mergeLineasFromServer(baseOrder, serverOrder);
                    const parsed = orderWithParsedDates(serverOrder);
                    return { ...parsed, lineas };
                });

                prev.forEach((localOrder) => {
                    const hasTicketState = ticketStateByTicket.current.has(ticketKeyForOrder(localOrder));

                    if (
                        !merged.find((o) => o.id === localOrder.id) &&
                        // Retener solo si pertenece al día en curso o está pendiente de sync.
                        // Evita que finalizadas de días anteriores se "enganchen" indefinidamente en memoria.
                        (isFromToday(localOrder) || hasTicketState)
                    ) {
                        merged.push({ ...localOrder, lineas: localOrder.lineas ?? [] });
                    }
                });

                return applyTicketStateToOrders(merged);
            });
        },
        [mergeLineasFromServer, applyTicketStateToOrders, ticketKeyForOrder]
    );

    const orderWithParsedDates = (order: KDSOrder) => ({
        ...order,
        // Usamos parseDBDate para las fechas de base de datos y evitamos toISOString() 
        // que es lo que estaba provocando el doble desfase al reconvertir a UTC.
        created_at: parseDBDate(order.created_at).toString(),
        completed_at: order.completed_at ? parseDBDate(order.completed_at).toString() : null
    });

    const fetchActiveOrders = useCallback(async (options: { isInitial?: boolean; isSilent?: boolean } = {}) => {
        if (options.isInitial) setLoading(true);
        if (!options.isSilent) setSyncStatus('syncing');

        const startOfToday = getStartOfLocalToday();
        const startIso = startOfToday.toISOString();
        try {
            // Solo día en curso (inicio día local → ahora):
            // - Cualquier línea creada hoy (incl. cancelada/abonada) enlaza la comanda activa; si excluíamos
            //   cancelado, las comandas con solo líneas canceladas no entraban en lineRefs y desaparecían del KDS.
            const { data: lineRefs, error: lineErr } = await supabase
                .from('kds_order_lines')
                .select('kds_order_id')
                .gte('created_at', startIso);

            if (lineErr) throw lineErr;

            const { data: headerToday, error: headerErr } = await supabase
                .from('kds_orders')
                .select('id')
                .eq('estado', 'activa')
                .gte('created_at', startIso);

            if (headerErr) throw headerErr;

            const activeIds = Array.from(
                new Set([
                    ...((lineRefs ?? []) as { kds_order_id: string | null }[])
                        .map((r) => r.kds_order_id)
                        .filter(Boolean),
                    ...((headerToday ?? []) as { id: string }[]).map((r) => r.id),
                ])
            ) as string[];

            const ordersParts: KDSOrder[] = [];

            if (activeIds.length > 0) {
                const { data: activeOrders, error: activeErr } = await supabase
                    .from('kds_orders')
                    .select('*, lineas:kds_order_lines(*)')
                    .eq('estado', 'activa')
                    .in('id', activeIds)
                    .order('created_at', { ascending: true });

                if (activeErr) throw activeErr;
                ordersParts.push(...((activeOrders as unknown as KDSOrder[]) ?? []));
            }

            const { data: completedOrders, error: completedErr } = await supabase
                .from('kds_orders')
                .select('*, lineas:kds_order_lines(*)')
                .eq('estado', 'completada')
                .gte('completed_at', startIso)
                .order('completed_at', { ascending: false });

            if (completedErr) throw completedErr;
            ordersParts.push(...((completedOrders as unknown as KDSOrder[]) ?? []));

            const data = ordersParts;

            if (data) {
                const cleanedData = data
                    .map(order => ({
                        ...orderWithParsedDates(order),
                        // Importante: NO filtramos cancelados.
                        // Cocina debe ver cancelaciones/abonos como líneas estado='cancelado' (para aviso visual).
                        lineas: (order.lineas ?? []),
                    }))
                    .filter(
                        (order) =>
                            order.estado === 'completada' ||
                            (order.estado === 'activa' && (order.lineas?.length ?? 0) > 0)
                    );

                // 1) Traer estado manual por ticket (kds_ticket_state) para los tickets presentes
                const ticketKeys = Array.from(
                    new Set(
                        cleanedData
                            .map((o) => ticketKeyForOrder(o))
                            .filter(Boolean)
                    )
                );
                if (ticketKeys.length > 0) {
                    const { data: ticketRows, error: ticketErr } = await supabase
                        .from('kds_ticket_state')
                        .select('*')
                        .in('id_ticket', ticketKeys);
                    if (ticketErr) throw ticketErr;
                    ticketStateByTicket.current = new Map(
                        ((ticketRows as unknown as KDSTicketStateRow[]) ?? []).map((r) => [r.id_ticket, r])
                    );
                } else {
                    ticketStateByTicket.current = new Map();
                }

                const derived = applyTicketStateToOrders(cleanedData);

                if (options.isInitial) {
                    setOrders(derived);
                } else {
                    startTransition(() => mergeOrders(derived));
                }
                kdsFetchSucceededOnce.current = true;
                setIsOffline(false);
                if (!options.isSilent) setStatusWithTimeout('success');
            }
        } catch (e: any) {
            console.error('Error KDS Fetch:', e?.message ?? e);
            // Refetch silencioso o fallo puntual: no forzar DESCONECTADO si ya hubo carga OK (evita falso positivo).
            if (options.isSilent) return;
            setSyncStatus('error');
            if (!kdsFetchSucceededOnce.current) {
                setIsOffline(true);
            }
        } finally {
            if (options.isInitial) setLoading(false);
        }
    }, [supabase, mergeOrders, setStatusWithTimeout]);

    useEffect(() => {
        let reconnectTimeout: ReturnType<typeof setTimeout>;
        let backoffDelay = 2000;
        let pollTimer: ReturnType<typeof setInterval> | undefined;

        const setupSubscription = () => {
            fetchActiveOrders({ isInitial: true });

            const channel = supabase
                .channel('kds_resilient_sync_v2')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_orders' }, (p) => {
                    const startOfToday = getStartOfLocalToday().getTime();
                    const isOrderRowFromToday = (row: any) => {
                        try {
                            const estado = row?.estado as string | undefined;
                            if (estado === 'completada') {
                                const ca = row?.completed_at ? parseDBDate(row.completed_at).getTime() : 0;
                                return ca >= startOfToday;
                            }
                            const header = row?.created_at ? parseDBDate(row.created_at).getTime() : 0;
                            return header >= startOfToday;
                        } catch {
                            return false;
                        }
                    };

                    const isRowManagedByKds = (row: any) => {
                        const oid = (row as { id?: string } | null)?.id ?? '';
                        const tk = (row?.id_ticket ? String(row.id_ticket).trim() : '') || `order:${oid}`;
                        return ticketStateByTicket.current.has(tk);
                    };

                    if (p.eventType === 'INSERT') {
                        const newOrder = { ...p.new, lineas: [] } as unknown as KDSOrder;
                        // No introducir comandas fuera del día en curso (evita “fantasmas” en Finalizadas).
                        if (!isOrderRowFromToday(p.new) && !isRowManagedByKds(p.new)) return;
                        scheduleUpdate(() => setOrders(prev => {
                            if (prev.find(o => o.id === newOrder.id)) return prev;
                            return applyTicketStateToOrders([...prev, orderWithParsedDates(newOrder)]);
                        }));
                    } else if (p.eventType === 'UPDATE') {
                        // Si llega un UPDATE de un registro fuera del día, lo ignoramos (o lo expulsamos si existía).
                        if (!isOrderRowFromToday(p.new)) {
                            const oid = (p.new as { id?: string } | null)?.id;
                            if (!isRowManagedByKds(p.new)) {
                                if (oid) scheduleUpdate(() => setOrders(prev => prev.filter(o => o.id !== oid)));
                                return;
                            }
                        }
                        scheduleUpdate(() => setOrders(prev => prev.map(o => {
                            if (o.id !== (p.new as { id: string }).id) return o;
                            const updated = orderWithParsedDates({ ...o, ...p.new });
                            return updated;
                        })));
                        // Reaplicar estado por ticket después del merge de fila
                        scheduleUpdate(() => setOrders(prev => applyTicketStateToOrders(prev)));
                    } else if (p.eventType === 'DELETE') {
                        const oid = (p.old as { id?: string } | null)?.id;
                        if (!oid) return;
                        scheduleUpdate(() => setOrders(prev => prev.filter(o => o.id !== oid)));
                    }
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_ticket_state' }, (p) => {
                    const row = (p.new ?? p.old) as any;
                    const idTicket = row?.id_ticket ? String(row.id_ticket) : null;
                    if (!idTicket) return;
                    if (p.eventType === 'DELETE') {
                        ticketStateByTicket.current.delete(idTicket);
                    } else {
                        const next = row as KDSTicketStateRow;
                        ticketStateByTicket.current.set(idTicket, next);
                    }
                    scheduleUpdate(() => setOrders(prev => applyTicketStateToOrders(prev)));
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_order_lines' }, (p) => {
                    if (p.eventType === 'INSERT') {
                        const nl = p.new as KDSOrderLine;
                        if (nl?.estado === 'pendiente' && typeof window !== 'undefined') {
                            window.dispatchEvent(
                                new CustomEvent('kds:new_pending_line', { detail: nl })
                            );
                        }
                        scheduleUpdate(() => setOrders(prev => prev.map(o => {
                            if (o.id !== nl.kds_order_id) return o;
                            if ((o.lineas || []).find(l => l.id === nl.id)) return o;
                            return { ...o, lineas: [...(o.lineas || []), nl] };
                        })));
                        scheduleUpdate(() => setOrders(prev => applyTicketStateToOrders(prev)));
                    } else if (p.eventType === 'UPDATE') {
                        const ul = p.new as KDSOrderLine;
                        scheduleUpdate(() => setOrders(prev => prev.map(o => {
                            if (o.id !== ul.kds_order_id) return o;
                            if (inFlightLineIds.current.has(ul.id)) return o;
                            return { ...o, lineas: (o.lineas || []).map(l => l.id === ul.id ? ul : l) };
                        })));
                        scheduleUpdate(() => setOrders(prev => applyTicketStateToOrders(prev)));
                    } else if (p.eventType === 'DELETE') {
                        const oldRow = p.old as { id?: string; kds_order_id?: string } | null;
                        const lid = oldRow?.id;
                        const orderId = oldRow?.kds_order_id;
                        if (!lid || !orderId) return;
                        scheduleUpdate(() =>
                            setOrders(prev =>
                                prev.map(o => {
                                    if (o.id !== orderId) return o;
                                    return { ...o, lineas: (o.lineas || []).filter(l => l.id !== lid) };
                                })
                            )
                        );
                        scheduleUpdate(() => setOrders(prev => applyTicketStateToOrders(prev)));
                    }
                })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        setIsOffline(false);
                        backoffDelay = 2000;
                        await fetchActiveOrders({ isInitial: false, isSilent: true });
                    }

                    // Realtime puede cortarse (pestaña en segundo plano, Wi‑Fi, reconexión): se reintenta en silencio.
                    // No mezclar eso con "desconectado" ni icono de error; el fetch HTTP es la fuente de verdad.
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                        clearTimeout(reconnectTimeout);
                        reconnectTimeout = setTimeout(() => {
                            backoffDelay = Math.min(backoffDelay * 1.5, 30000);
                            supabase.removeChannel(channel);
                            setupSubscription();
                        }, backoffDelay);
                    }
                });

            return channel;
        };

        const activeChannel = setupSubscription();

        // Fallback operativo (Win7/Firefox/kiosk): Realtime puede no conectar o “dormirse”.
        // El HTTP es la fuente de verdad; hacemos refetch silencioso periódico.
        pollTimer = setInterval(() => {
            void fetchActiveOrders({ isInitial: false, isSilent: true });
        }, 8000);

        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                void fetchActiveOrders({ isInitial: false, isSilent: true });
            }
        };
        const onFocus = () => {
            void fetchActiveOrders({ isInitial: false, isSilent: true });
        };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', onFocus);

        return () => {
            clearTimeout(reconnectTimeout);
            if (pollTimer) clearInterval(pollTimer);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', onFocus);
            supabase.removeChannel(activeChannel);
        };
    }, [supabase, fetchActiveOrders]);

    // A las 00:00 locales, se limpia (refetch con startOfToday nuevo).
    useEffect(() => {
        const scheduleMidnightRefresh = () => {
            const now = new Date();
            const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 50);
            const ms = nextMidnight.getTime() - now.getTime();
            return setTimeout(async () => {
                await fetchActiveOrders({ isInitial: false, isSilent: true });
                timer = scheduleMidnightRefresh();
            }, ms);
        };
        let timer = scheduleMidnightRefresh();
        return () => clearTimeout(timer);
    }, [fetchActiveOrders]);

    // FINALIZAR COMANDA (manual) — todas las tandas (mismo id_ticket) se cierran a la vez
    const completarComanda = async (orderId: string, idTicket?: string | null) => {
        setSyncStatus('syncing');
        const completedAt = new Date().toISOString();
        const ticketKey = (idTicket && String(idTicket).trim()) ? String(idTicket).trim() : `order:${orderId}`;

        const prevTicketState = ticketStateByTicket.current.get(ticketKey) ?? null;
        const optimisticRow: KDSTicketStateRow = {
            id_ticket: ticketKey,
            kitchen_state: 'completada',
            manual_completed_at: completedAt,
            updated_at: completedAt,
        };
        ticketStateByTicket.current.set(ticketKey, optimisticRow);
        setOrders((prev) => applyTicketStateToOrders(prev));

        // 1) Persistir estado manual por ticket
        const { error: ticketErr } = await supabase
            .from('kds_ticket_state')
            .upsert({ id_ticket: ticketKey, kitchen_state: 'completada', manual_completed_at: completedAt });

        // 2) Coherencia visual: marcar cabeceras existentes como completadas
        const { error: ordersErr } = (idTicket && String(idTicket).trim())
            ? await supabase.from('kds_orders').update({ estado: 'completada', completed_at: completedAt }).eq('id_ticket', String(idTicket).trim())
            : await supabase.from('kds_orders').update({ estado: 'completada', completed_at: completedAt }).eq('id', orderId);

        if (ticketErr || ordersErr) {
            setSyncStatus('error');
            if (prevTicketState) ticketStateByTicket.current.set(ticketKey, prevTicketState);
            else ticketStateByTicket.current.delete(ticketKey);
            setOrders((prev) => applyTicketStateToOrders(prev));
            return;
        }

        setStatusWithTimeout('success');
    };

    const tacharProductos = async (lineIds: string[], currentState: KDSItemStatus) => {
        if (lineIds.length === 0) return;
        setSyncStatus('syncing');

        const nextState: KDSItemStatus = currentState === 'pendiente' ? 'terminado' : 'pendiente';
        const completedAt = nextState === 'terminado' ? new Date().toISOString() : null;

        lineIds.forEach(id => inFlightLineIds.current.add(id));

        setOrders(prev => prev.map(o => ({
            ...o,
            lineas: (o.lineas || []).map(l => lineIds.includes(l.id) ? { ...l, estado: nextState, completed_at: completedAt } : l)
        })));

        const { error } = await supabase
            .from('kds_order_lines')
            .update({ estado: nextState, completed_at: completedAt })
            .in('id', lineIds);

        // Sacar del vuelo
        lineIds.forEach(id => inFlightLineIds.current.delete(id));

        if (error) {
            setSyncStatus('error');
            setOrders(prev => prev.map(o => ({
                ...o,
                lineas: (o.lineas || []).map(l => lineIds.includes(l.id) ? {
                    ...l, estado: currentState, completed_at: currentState === 'terminado' ? new Date().toISOString() : null
                } : l)
            })));
        } else {
            setStatusWithTimeout('success');
            // Si al marcar queda TODO terminado/cancelado, equivale a "Finalizar" (acción de cocina).
            // Lo hacemos tras actualizar estado de líneas para que el snapshot sea consistente.
            setOrders((prev) => {
                const affected = prev.find((o) => o.lineas?.some((l) => lineIds.includes(l.id)));
                if (!affected) return prev;

                const allDone =
                    (affected.lineas?.length ?? 0) > 0 &&
                    affected.lineas!.every((l) => l.estado === 'terminado' || l.estado === 'cancelado');

                const alreadyCompleted = affected.estado === 'completada';

                if (allDone && !alreadyCompleted) {
                    queueMicrotask(() => {
                        void completarComanda(affected.id, affected.id_ticket ?? null);
                    });
                }
                return prev;
            });
        }
    };

    // RECUPERAR COMANDA (manual)
    const recuperarComanda = async (orderId: string) => {
        setSyncStatus('syncing');
        const current = ordersRef.current.find((o) => o.id === orderId);
        const ticketKey = current ? ticketKeyForOrder(current) : `order:${orderId}`;

        const prevTicketState = ticketStateByTicket.current.get(ticketKey) ?? null;
        const optimisticRow: KDSTicketStateRow = {
            id_ticket: ticketKey,
            kitchen_state: 'activa',
            manual_completed_at: null,
            updated_at: new Date().toISOString(),
        };
        ticketStateByTicket.current.set(ticketKey, optimisticRow);
        setOrders((prev) => applyTicketStateToOrders(prev));

        const { error: ticketErr } = await supabase
            .from('kds_ticket_state')
            .upsert({ id_ticket: ticketKey, kitchen_state: 'activa', manual_completed_at: null });

        const idTicketRaw = current?.id_ticket ? String(current.id_ticket).trim() : '';
        const { error: ordersErr } = idTicketRaw
            ? await supabase.from('kds_orders').update({ estado: 'activa', completed_at: null }).eq('id_ticket', idTicketRaw)
            : await supabase.from('kds_orders').update({ estado: 'activa', completed_at: null }).eq('id', orderId);

        if (ticketErr || ordersErr) {
            setSyncStatus('error');
            if (prevTicketState) ticketStateByTicket.current.set(ticketKey, prevTicketState);
            else ticketStateByTicket.current.delete(ticketKey);
            setOrders((prev) => applyTicketStateToOrders(prev));
            return;
        }

        setStatusWithTimeout('success');
    };

    const updateLineNotes = async (lineIds: string[], nextNotes: string) => {
        if (lineIds.length === 0) return;
        setSyncStatus('syncing');

        // Optimista
        inFlightLineIds.current = new Set([...inFlightLineIds.current, ...lineIds]);
        setOrders(prev => prev.map(o => ({
            ...o,
            lineas: (o.lineas || []).map(l =>
                lineIds.includes(l.id) ? { ...l, notas_cocina: nextNotes } : l
            ),
        })));

        const { error } = await supabase
            .from('kds_order_lines')
            .update({ notas_cocina: nextNotes })
            .in('id', lineIds);

        lineIds.forEach(id => inFlightLineIds.current.delete(id));

        if (error) {
            setSyncStatus('error');
        } else {
            setStatusWithTimeout('success');
        }
    };

    const updateOrderNotes = async (orderId: string, nextNotes: string) => {
        setSyncStatus('syncing');

        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, notas_comanda: nextNotes } : o));

        const { error } = await supabase
            .from('kds_orders')
            .update({ notas_comanda: nextNotes })
            .eq('id', orderId);

        if (error) {
            setSyncStatus('error');
        } else {
            setStatusWithTimeout('success');
        }
    };

    return { orders, loading, isOffline, syncStatus, tacharProductos, completarComanda, recuperarComanda, updateLineNotes, updateOrderNotes, refresh: fetchActiveOrders };
}