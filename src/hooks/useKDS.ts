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
        // Ventana rodante para comandas activas (mesas de la noche que cruzan medianoche).
        const rollingStart = new Date(Date.now() - 36 * 60 * 60 * 1000);
        const startIso = startOfToday.toISOString();
        const rollingIso = rollingStart.toISOString();
        // PostgREST: los ':' en ISO deben ir entre comillas dentro de .or() o el filtro falla y devuelve 0 filas.
        try {
            const { data, error } = await supabase
                .from('kds_orders')
                .select('*, lineas:kds_order_lines(*)')
                .or(
                    `and(estado.eq.activa,created_at.gte."${rollingIso}"),and(estado.eq.completada,completed_at.gte."${startIso}")`
                )
                .order('created_at', { ascending: true });

            if (!error && data) {
                const cleanedData = data
                    .map(order => ({
                        ...orderWithParsedDates(order),
                        lineas: (order.lineas ?? []).filter((l: { estado: string }) => l.estado !== 'cancelado'),
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
                setIsOffline(false);
                if (!options.isSilent) setStatusWithTimeout('success');
            } else if (error) {
                console.error('Error KDS Fetch:', error.message);
                setIsOffline(true);
                setSyncStatus('error');
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

                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                        setIsOffline(true);
                        setSyncStatus('error');
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

    // CIERRE DE COMANDA OPTIMISTA
    const completarComanda = async (orderId: string) => {
        setSyncStatus('syncing');
        // Registrar en el veto local ANTES del update
        localCompletedIds.current.add(orderId);

        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: 'completada', completed_at: new Date().toISOString() } : o));

        const { error } = await supabase
            .from('kds_orders')
            .update({ estado: 'completada', completed_at: new Date().toISOString() })
            .eq('id', orderId);

        if (error) {
            setSyncStatus('error');
            // Revertir el veto
            localCompletedIds.current.delete(orderId);
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: 'activa', completed_at: null } : o));
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

    return { orders, loading, isOffline, syncStatus, tacharProductos, completarComanda, recuperarComanda, refresh: fetchActiveOrders };
}