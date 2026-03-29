"use client";

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { KDSOrder, KDSOrderLine, KDSItemStatus } from '@/components/kds/types';

export function useKDS() {
    const [orders, setOrders] = useState<KDSOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOffline, setIsOffline] = useState(false);
    const supabase = createClient();

    // 1. CARGA INICIAL: Sincronizamos Activas y Completadas recientes (ej. último día)
    const fetchActiveOrders = useCallback(async () => {
        setLoading(true);

        // Calculamos la fecha de hace 24 horas para no cargar todo el historial
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const { data, error } = await supabase
            .from('kds_orders')
            .select('*, lineas:kds_order_lines(*)')
            .or(`estado.eq.activa,and(estado.eq.completada,completed_at.gte.${yesterday.toISOString()})`)
            .order('created_at', { ascending: true });

        if (!error && data) {
            setOrders(data);
            setIsOffline(false);
        } else if (error) {
            console.error('Error KDS Initial Fetch:', error.message);
            setIsOffline(true);
        }
        setLoading(false);
    }, [supabase]);

    useEffect(() => {
        let reconnectTimeout: any;
        let backoffDelay = 2000;

        const setupSubscription = () => {
            fetchActiveOrders();

            const channel = supabase
                .channel('kds_resilient_sync')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_orders' }, (p) => {
                    if (p.eventType === 'INSERT') {
                        const newOrder = { ...p.new, lineas: [] } as unknown as KDSOrder;
                        setOrders(prev => [...prev, newOrder]);
                    } else if (p.eventType === 'UPDATE') {
                        // Ahora NO eliminamos las completadas del estado local, solo actualizamos
                        setOrders(prev => prev.map(o => o.id === p.new.id ? { ...o, ...p.new } : o));
                    }
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_order_lines' }, (p) => {
                    if (p.eventType === 'INSERT') {
                        const nl = p.new as KDSOrderLine;
                        setOrders(prev => prev.map(o => o.id === nl.kds_order_id ? { ...o, lineas: [...(o.lineas || []), nl] } : o));
                    } else if (p.eventType === 'UPDATE') {
                        const ul = p.new as KDSOrderLine;
                        setOrders(prev => prev.map(o => {
                            if (o.id !== ul.kds_order_id) return o;
                            return { ...o, lineas: (o.lineas || []).map(l => l.id === ul.id ? ul : l) };
                        }));
                    }
                })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        setIsOffline(false);
                        backoffDelay = 2000;
                        await fetchActiveOrders();
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

    // 3. TACHADO OPTIMISTA
    const tacharProducto = async (lineId: string, currentState: KDSItemStatus) => {
        const nextState: KDSItemStatus = currentState === 'pendiente' ? 'terminado' : 'pendiente';
        const completedAt = nextState === 'terminado' ? new Date().toISOString() : null;

        setOrders(prev => prev.map(o => ({
            ...o,
            lineas: (o.lineas || []).map(l => l.id === lineId ? { ...l, estado: nextState, completed_at: completedAt } : l)
        })));

        const { error } = await supabase
            .from('kds_order_lines')
            .update({ estado: nextState, completed_at: completedAt })
            .eq('id', lineId);

        if (error) {
            setOrders(prev => prev.map(o => ({
                ...o,
                lineas: (o.lineas || []).map(l => l.id === lineId ? {
                    ...l, estado: currentState, completed_at: currentState === 'terminado' ? new Date().toISOString() : null
                } : l)
            })));
        }
    };

    // 4. CIERRE DE COMANDA OPTIMISTA
    const completarComanda = async (orderId: string) => {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: 'completada', completed_at: new Date().toISOString() } : o));

        const { error } = await supabase
            .from('kds_orders')
            .update({ estado: 'completada', completed_at: new Date().toISOString() })
            .eq('id', orderId);

        if (error) {
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: 'activa', completed_at: null } : o));
        }
    };

    // 5. RECUPERAR COMANDA OPTIMISTA
    const recuperarComanda = async (orderId: string) => {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: 'activa', completed_at: null } : o));

        const { error } = await supabase
            .from('kds_orders')
            .update({ estado: 'activa', completed_at: null })
            .eq('id', orderId);

        if (error) {
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: 'completada', completed_at: new Date().toISOString() } : o));
        }
    };

    return { orders, loading, isOffline, tacharProducto, completarComanda, recuperarComanda, refresh: fetchActiveOrders };
}