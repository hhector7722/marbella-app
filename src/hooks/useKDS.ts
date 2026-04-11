"use client";

import { useEffect, useState, useCallback, useRef, startTransition } from 'react';
import { createClient } from '@/utils/supabase/client';
import { KDSOrder, KDSOrderLine, KDSItemStatus } from '@/components/kds/types';
import { getStartOfLocalToday, parseTPVDate, parseDBDate } from '@/utils/date-utils';

export function useKDS() {
    const [orders, setOrders] = useState<KDSOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOffline, setIsOffline] = useState(false);
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
    const supabase = createClient();

    const setStatusWithTimeout = useCallback((status: 'success' | 'error') => {
        setSyncStatus(status);
        if (status === 'success') {
            const timeout = setTimeout(() => {
                setSyncStatus(prev => prev === 'success' ? 'idle' : prev);
            }, 2000);
            return () => clearTimeout(timeout);
        }
    }, []);

    const localCompletedIds = useRef<Set<string>>(new Set());
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

    const mergeOrders = useCallback((serverData: KDSOrder[]) => {
        setOrders(prev => {
            const prevMap = new Map(prev.map(o => [o.id, o]));

            const merged = serverData.map(serverOrder => {
                const local = prevMap.get(serverOrder.id);

                if (localCompletedIds.current.has(serverOrder.id)) {
                    const baseOrder = local ?? serverOrder;
                    const serverLinesMap = new Map((serverOrder.lineas || []).map(l => [l.id, l]));
                    const mergedLineas = (baseOrder.lineas || []).map(localLine => {
                        const serverLine = serverLinesMap.get(localLine.id);
                        if (inFlightLineIds.current.has(localLine.id)) return localLine;
                        return serverLine ?? localLine;
                    });
                    (serverOrder.lineas || []).forEach(sl => {
                        if (!mergedLineas.find(l => l.id === sl.id)) mergedLineas.push(sl);
                    });
                    return {
                        ...serverOrder,
                        estado: 'completada' as const,
                        completed_at: baseOrder.completed_at ?? serverOrder.completed_at,
                        lineas: mergedLineas,
                    };
                }

                if (!local) return serverOrder;

                const serverLinesMap = new Map((serverOrder.lineas || []).map(l => [l.id, l]));
                const mergedLineas = (local.lineas || []).map(localLine => {
                    if (inFlightLineIds.current.has(localLine.id)) return localLine;
                    return serverLinesMap.get(localLine.id) ?? localLine;
                });
                (serverOrder.lineas || []).forEach(sl => {
                    if (!mergedLineas.find(l => l.id === sl.id)) mergedLineas.push(sl);
                });

                return { ...orderWithParsedDates(serverOrder), lineas: mergedLineas };
            });

            const startOfToday = getStartOfLocalToday();

            prev.forEach(localOrder => {
                const isFromToday = parseTPVDate(localOrder.created_at) >= startOfToday;
                const isWaitingSync = localCompletedIds.current.has(localOrder.id);
                
                if (!merged.find(o => o.id === localOrder.id) && (isFromToday || isWaitingSync)) {
                    merged.push(localOrder);
                }
            });

            return merged;
        });
    }, []);

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
            // - Activas: cabecera creada hoy, O alguna línea no cancelada creada hoy (mesa abierta con pedido nuevo hoy).
            const { data: lineRefs, error: lineErr } = await supabase
                .from('kds_order_lines')
                .select('kds_order_id')
                .gte('created_at', startIso)
                .neq('estado', 'cancelado');

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
                .order('created_at', { ascending: true });

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

                if (options.isInitial) {
                    cleanedData.forEach(o => {
                        if (o.estado === 'completada') localCompletedIds.current.add(o.id);
                    });
                    setOrders(cleanedData);
                } else {
                    startTransition(() => mergeOrders(cleanedData));
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

        const setupSubscription = () => {
            fetchActiveOrders({ isInitial: true });

            const channel = supabase
                .channel('kds_resilient_sync_v2')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_orders' }, (p) => {
                    if (p.eventType === 'INSERT') {
                        const newOrder = { ...p.new, lineas: [] } as unknown as KDSOrder;
                        scheduleUpdate(() => setOrders(prev => {
                            if (prev.find(o => o.id === newOrder.id)) return prev;
                            return [...prev, orderWithParsedDates(newOrder)];
                        }));
                    } else if (p.eventType === 'UPDATE') {
                        scheduleUpdate(() => setOrders(prev => prev.map(o => {
                            if (o.id !== p.new.id) return o;
                            const updated = orderWithParsedDates({ ...o, ...p.new });
                            if (localCompletedIds.current.has(o.id)) {
                                return { ...updated, estado: 'completada' };
                            }
                            return updated;
                        })));
                    }
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_order_lines' }, (p) => {
                    if (p.eventType === 'INSERT') {
                        const nl = p.new as KDSOrderLine;
                        scheduleUpdate(() => setOrders(prev => prev.map(o => {
                            if (o.id !== nl.kds_order_id) return o;
                            if ((o.lineas || []).find(l => l.id === nl.id)) return o;
                            return { ...o, lineas: [...(o.lineas || []), nl] };
                        })));
                    } else if (p.eventType === 'UPDATE') {
                        const ul = p.new as KDSOrderLine;
                        scheduleUpdate(() => setOrders(prev => prev.map(o => {
                            if (o.id !== ul.kds_order_id) return o;
                            if (inFlightLineIds.current.has(ul.id)) return o;
                            return { ...o, lineas: (o.lineas || []).map(l => l.id === ul.id ? ul : l) };
                        })));
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

        return () => {
            clearTimeout(reconnectTimeout);
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
        }
    };

    // CIERRE DE COMANDA OPTIMISTA — todas las tandas (mismo id_ticket) se cierran a la vez
    const completarComanda = async (orderId: string, idTicket?: string | null) => {
        setSyncStatus('syncing');
        const completedAt = new Date().toISOString();
        const ticketKey = (idTicket && String(idTicket).trim()) ? String(idTicket).trim() : null;

        let affectedIds: string[] = [];
        setOrders((prev) => {
            const targets = ticketKey
                ? prev.filter((o) => (o.id_ticket ?? null) === ticketKey && o.estado === 'activa')
                : prev.filter((o) => o.id === orderId);
            affectedIds = targets.map((t) => t.id);
            affectedIds.forEach((id) => localCompletedIds.current.add(id));
            return prev.map((o) => {
                if (ticketKey && (o.id_ticket ?? null) === ticketKey && o.estado === 'activa') {
                    return { ...o, estado: 'completada' as const, completed_at: completedAt };
                }
                if (!ticketKey && o.id === orderId) {
                    return { ...o, estado: 'completada' as const, completed_at: completedAt };
                }
                return o;
            });
        });

        const payload = { estado: 'completada' as const, completed_at: completedAt };
        const { error } = ticketKey
            ? await supabase.from('kds_orders').update(payload).eq('id_ticket', ticketKey).eq('estado', 'activa')
            : await supabase.from('kds_orders').update(payload).eq('id', orderId);

        if (error) {
            setSyncStatus('error');
            affectedIds.forEach((id) => localCompletedIds.current.delete(id));
            setOrders((prev) =>
                prev.map((o) =>
                    affectedIds.includes(o.id) ? { ...o, estado: 'activa' as const, completed_at: null } : o
                )
            );
        } else {
            setStatusWithTimeout('success');
        }
    };

    // RECUPERAR COMANDA OPTIMISTA
    const recuperarComanda = async (orderId: string) => {
        setSyncStatus('syncing');
        // Quitar del veto local
        localCompletedIds.current.delete(orderId);

        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: 'activa', completed_at: null } : o));

        const { error } = await supabase
            .from('kds_orders')
            .update({ estado: 'activa', completed_at: null })
            .eq('id', orderId);

        if (error) {
            setSyncStatus('error');
            localCompletedIds.current.add(orderId);
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: 'completada', completed_at: new Date().toISOString() } : o));
        } else {
            setStatusWithTimeout('success');
        }
    };

    const updateLineNotes = async (lineIds: string[], nextNotes: string) => {
        if (lineIds.length === 0) return;
        setSyncStatus('syncing');

        // Optimista
        inFlightLineIds.current = new Set([...inFlightLineIds.current, ...lineIds]);
        setOrders(prev => prev.map(o => ({
            ...o,
            lineas: (o.lineas || []).map(l => lineIds.includes(l.id) ? { ...l, notas: nextNotes } : l),
        })));

        const { error } = await supabase
            .from('kds_order_lines')
            .update({ notas: nextNotes })
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