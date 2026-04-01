"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { KDSOrder, KDSOrderLine, KDSItemStatus } from '@/components/kds/types';

export function useKDS() {
    const [orders, setOrders] = useState<KDSOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOffline, setIsOffline] = useState(false);
    const supabase = createClient();

    // Conjunto de IDs de comandas que el cocinero marcó como completas localmente.
    // Actúa como "veto": aunque el servidor diga que están activas, aquí las
    // forzamos a completada para que no reaparezcan tras un re-fetch.
    const localCompletedIds = useRef<Set<string>>(new Set());
    // IDs de líneas en vuelo (optimistic updates en curso)
    const inFlightLineIds = useRef<Set<string>>(new Set());

    // Merge inteligente: no reemplaza todo el estado de golpe (evita parpadeo),
    // sino que fusiona las órdenes nuevas con el estado local existente.
    const mergeOrders = useCallback((serverData: KDSOrder[]) => {
        setOrders(prev => {
            const prevMap = new Map(prev.map(o => [o.id, o]));

            const merged = serverData.map(serverOrder => {
                const local = prevMap.get(serverOrder.id);

                // Si el cocinero la completó localmente, forzamos ese estado
                // independientemente de lo que diga el servidor.
                if (localCompletedIds.current.has(serverOrder.id)) {
                    const baseOrder = local ?? serverOrder;
                    // Fusionamos líneas del servidor con el estado local
                    const serverLinesMap = new Map((serverOrder.lineas || []).map(l => [l.id, l]));
                    const mergedLineas = (baseOrder.lineas || []).map(localLine => {
                        const serverLine = serverLinesMap.get(localLine.id);
                        // Si la línea está en vuelo (optimistic), guardamos el estado local
                        if (inFlightLineIds.current.has(localLine.id)) return localLine;
                        return serverLine ?? localLine;
                    });
                    // Añadir líneas nuevas que no existían localmente
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

                // Fusionamos líneas: respetamos las locales en vuelo
                const serverLinesMap = new Map((serverOrder.lineas || []).map(l => [l.id, l]));
                const mergedLineas = (local.lineas || []).map(localLine => {
                    if (inFlightLineIds.current.has(localLine.id)) return localLine;
                    return serverLinesMap.get(localLine.id) ?? localLine;
                });
                // Añadir líneas nuevas del servidor
                (serverOrder.lineas || []).forEach(sl => {
                    if (!mergedLineas.find(l => l.id === sl.id)) mergedLineas.push(sl);
                });

                return { ...serverOrder, lineas: mergedLineas };
            });

            // Conservar órdenes locales que el servidor aún no conoce (race conditions)
            prev.forEach(localOrder => {
                if (!merged.find(o => o.id === localOrder.id)) {
                    merged.push(localOrder);
                }
            });

            return merged;
        });
    }, []);

    // 1. CARGA: Sincronizamos las comandas del día en curso
    const fetchActiveOrders = useCallback(async (options: { isInitial?: boolean } = {}) => {
        if (options.isInitial) setLoading(true);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startOfToday = today.toISOString();

        try {
            const { data, error } = await supabase
                .from('kds_orders')
                .select('*, lineas:kds_order_lines(*)')
                .gte('created_at', startOfToday)
                .order('created_at', { ascending: true });

            if (!error && data) {
                if (options.isInitial) {
                    // En la carga inicial restauramos el localCompletedIds con las
                    // comandas que ya están completadas en BD (sesión reanudada).
                    data.forEach(o => {
                        if (o.estado === 'completada') localCompletedIds.current.add(o.id);
                    });
                    setOrders(data);
                } else {
                    // Actualizaciones posteriores: merge silencioso (sin parpadeo)
                    mergeOrders(data);
                }
                setIsOffline(false);
            } else if (error) {
                console.error('Error KDS Fetch:', error.message);
                setIsOffline(true);
            }
        } finally {
            if (options.isInitial) setLoading(false);
        }
    }, [supabase, mergeOrders]);

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
                        setOrders(prev => {
                            if (prev.find(o => o.id === newOrder.id)) return prev;
                            return [...prev, newOrder];
                        });
                    } else if (p.eventType === 'UPDATE') {
                        setOrders(prev => prev.map(o => {
                            if (o.id !== p.new.id) return o;
                            // Si localmente la completamos, no dejar que el servidor la "destache"
                            if (localCompletedIds.current.has(o.id)) {
                                return { ...o, ...p.new, estado: 'completada' };
                            }
                            return { ...o, ...p.new };
                        }));
                    }
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_order_lines' }, (p) => {
                    if (p.eventType === 'INSERT') {
                        const nl = p.new as KDSOrderLine;
                        setOrders(prev => prev.map(o => {
                            if (o.id !== nl.kds_order_id) return o;
                            if ((o.lineas || []).find(l => l.id === nl.id)) return o;
                            return { ...o, lineas: [...(o.lineas || []), nl] };
                        }));
                    } else if (p.eventType === 'UPDATE') {
                        const ul = p.new as KDSOrderLine;
                        setOrders(prev => prev.map(o => {
                            if (o.id !== ul.kds_order_id) return o;
                            // Si la línea está en un optimistic update en vuelo, ignorar el evento
                            if (inFlightLineIds.current.has(ul.id)) return o;
                            return { ...o, lineas: (o.lineas || []).map(l => l.id === ul.id ? ul : l) };
                        }));
                    }
                })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        setIsOffline(false);
                        backoffDelay = 2000;
                        // Fetch de sincronización silencioso (merge, sin loading)
                        await fetchActiveOrders({ isInitial: false });
                    }

                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                        setIsOffline(true);
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

    // TACHADO OPTIMISTA EN LOTE (BATCH) — tachan todas las IDs del grupo
    const tacharProductos = async (lineIds: string[], currentState: KDSItemStatus) => {
        if (lineIds.length === 0) return;

        const nextState: KDSItemStatus = currentState === 'pendiente' ? 'terminado' : 'pendiente';
        const completedAt = nextState === 'terminado' ? new Date().toISOString() : null;

        // Marcar como en vuelo para que el merge las ignore
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
            setOrders(prev => prev.map(o => ({
                ...o,
                lineas: (o.lineas || []).map(l => lineIds.includes(l.id) ? {
                    ...l, estado: currentState, completed_at: currentState === 'terminado' ? new Date().toISOString() : null
                } : l)
            })));
        }
    };

    // CIERRE DE COMANDA OPTIMISTA
    const completarComanda = async (orderId: string) => {
        // Registrar en el veto local ANTES del update
        localCompletedIds.current.add(orderId);

        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: 'completada', completed_at: new Date().toISOString() } : o));

        const { error } = await supabase
            .from('kds_orders')
            .update({ estado: 'completada', completed_at: new Date().toISOString() })
            .eq('id', orderId);

        if (error) {
            // Revertir el veto
            localCompletedIds.current.delete(orderId);
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: 'activa', completed_at: null } : o));
        }
    };

    // RECUPERAR COMANDA OPTIMISTA
    const recuperarComanda = async (orderId: string) => {
        // Quitar del veto local
        localCompletedIds.current.delete(orderId);

        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: 'activa', completed_at: null } : o));

        const { error } = await supabase
            .from('kds_orders')
            .update({ estado: 'activa', completed_at: null })
            .eq('id', orderId);

        if (error) {
            localCompletedIds.current.add(orderId);
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: 'completada', completed_at: new Date().toISOString() } : o));
        }
    };

    return { orders, loading, isOffline, tacharProductos, completarComanda, recuperarComanda, refresh: fetchActiveOrders };
}