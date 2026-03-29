"use client";

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { KDSOrder, KDSOrderLine, KDSItemStatus } from '@/components/kds/types';

export function useKDS() {
    const [orders, setOrders] = useState<KDSOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOffline, setIsOffline] = useState(false);
    const supabase = createClient();

    // 1. CARGA INICIAL: Sincronización absoluta del estado de cocina
    const fetchActiveOrders = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('kds_orders')
            .select('*, lineas:kds_order_lines(*)')
            .eq('estado', 'activa')
            .order('created_at', { ascending: true });

        if (!error && data) {
            setOrders(data);
            setIsOffline(false); // Reset offline if we can fetch
        } else if (error) {
            console.error('Error KDS Initial Fetch:', error.message);
            setIsOffline(true);
        }
        setLoading(false);
    }, [supabase]);

    useEffect(() => {
        let reconnectTimeout: any;
        let backoffDelay = 2000; // Iniciamos con 2s

        const setupSubscription = () => {
            fetchActiveOrders();

            const channel = supabase
                .channel('kds_resilient_sync')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_orders' }, (p) => {
                    if (p.eventType === 'INSERT') {
                        const newOrder = { ...p.new, lineas: [] } as unknown as KDSOrder;
                        setOrders(prev => [...prev, newOrder]);
                    } else if (p.eventType === 'UPDATE') {
                        if (p.new.estado === 'completada') {
                            setOrders(prev => prev.filter(o => o.id !== p.new.id));
                        } else {
                            setOrders(prev => prev.map(o => o.id === p.new.id ? { ...o, ...p.new } : o));
                        }
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
                            return { ...o, lineas: o.lineas?.map(l => l.id === ul.id ? ul : l) };
                        }));
                    }
                })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('✅ KDS: Conectado a Realtime');
                        setIsOffline(false);
                        backoffDelay = 2000; // Reset backoff
                        // Sincronización obligatoria tras reconexión para no perder lo que entró offline
                        await fetchActiveOrders();
                    }

                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                        console.error('⚠️ KDS: Error de Conexión / Desconectado');
                        setIsOffline(true);

                        // Reintento con Backoff Exponencial
                        clearTimeout(reconnectTimeout);
                        reconnectTimeout = setTimeout(() => {
                            backoffDelay = Math.min(backoffDelay * 1.5, 30000); // Max 30s
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

    // 3. TACHADO OPTIMISTA PURO (Con Rollback de Precisión)
    const tacharProducto = async (lineId: string, currentState: KDSItemStatus) => {
        const nextState: KDSItemStatus = currentState === 'pendiente' ? 'terminado' : 'pendiente';
        const completedAt = nextState === 'terminado' ? new Date().toISOString() : null;

        // A. Mutación Optimista Instantánea
        setOrders(prev => prev.map(o => ({
            ...o,
            lineas: o.lineas?.map(l => l.id === lineId ? { ...l, estado: nextState, completed_at: completedAt } : l)
        })));

        // B. Persistencia
        const { error } = await supabase
            .from('kds_order_lines')
            .update({ estado: nextState, completed_at: completedAt })
            .eq('id', lineId);

        // C. Rollback de Precisión (Solo deshace esta línea, respetando clics paralelos)
        if (error) {
            console.error(`KDS Rollback: Fallo en línea ${lineId}`, error.message);
            setOrders(prev => prev.map(o => ({
                ...o,
                lineas: o.lineas?.map(l => l.id === lineId ? {
                    ...l,
                    estado: currentState,
                    completed_at: currentState === 'terminado' ? new Date().toISOString() : null
                } : l)
            })));
        }
    };

    // 4. CIERRE DE COMANDA OPTIMISTA
    const completarComanda = async (orderId: string) => {
        // Foto local solo de esta orden por si falla
        const orderToArchive = orders.find(o => o.id === orderId);

        // A. Mutación
        setOrders(prev => prev.filter(o => o.id !== orderId));

        // B. Persistencia
        const { error } = await supabase
            .from('kds_orders')
            .update({ estado: 'completada', completed_at: new Date().toISOString() })
            .eq('id', orderId);

        // C. Rollback local
        if (error && orderToArchive) {
            console.error(`KDS Rollback: Fallo al completar comanda ${orderId}`, error.message);
            setOrders(prev => [...prev, orderToArchive].sort((a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            ));
        }
    };

    // 5. RECUPERAR COMANDA (Deshacer completada por error)
    const recuperarComanda = async (orderId: string) => {
        // A. Persistencia (volvemos a ponerla 'activa' y quitamos la fecha de completado)
        const { error } = await supabase
            .from('kds_orders')
            .update({ estado: 'activa', completed_at: null })
            .eq('id', orderId);

        if (error) {
            console.error(`KDS Error: Fallo al recuperar comanda ${orderId}`, error.message);
        } else {
            // B. Refrescar el estado global para que vuelva a aparecer en el grid
            fetchActiveOrders();
        }
    };

    return { orders, loading, isOffline, tacharProducto, completarComanda, recuperarComanda, refresh: fetchActiveOrders };
}