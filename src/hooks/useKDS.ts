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

    /**
     * Estado MANUAL de comanda (activa/completada) decidido por cocina.
     * - Una vez una comanda entra en KDS, su `estado` NO debe cambiar por lógica automática.
     * - Solo cambia por acciones explícitas del usuario (Finalizar / Recuperar).
     *
     * Persistimos por día (se limpia al cambiar el startOfToday local).
     */
    const localOrderOverride = useRef<Map<string, { estado: 'activa' | 'completada'; completed_at: string | null }>>(
        new Map()
    );
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

    const loadOverridesFromStorage = useCallback(() => {
        if (typeof window === 'undefined') return;
        const key = 'kds_order_state_overrides_v1';
        try {
            const raw = window.localStorage.getItem(key);
            if (!raw) return;
            const parsed = JSON.parse(raw) as {
                dayStartIso?: string;
                byId?: Record<string, { estado: 'activa' | 'completada'; completed_at: string | null }>;
            };
            const todayStart = getStartOfLocalToday().toISOString();
            if (!parsed?.dayStartIso || parsed.dayStartIso !== todayStart) {
                window.localStorage.removeItem(key);
                return;
            }
            const byId = parsed.byId ?? {};
            localOrderOverride.current = new Map(Object.entries(byId));
        } catch {
            // Si está corrupto, lo limpiamos.
            try {
                window.localStorage.removeItem(key);
            } catch {}
        }
    }, []);

    const saveOverridesToStorage = useCallback(() => {
        if (typeof window === 'undefined') return;
        const key = 'kds_order_state_overrides_v1';
        try {
            const byId: Record<string, { estado: 'activa' | 'completada'; completed_at: string | null }> = {};
            for (const [id, v] of localOrderOverride.current.entries()) byId[id] = v;
            window.localStorage.setItem(
                key,
                JSON.stringify({ dayStartIso: getStartOfLocalToday().toISOString(), byId })
            );
        } catch {
            // ignore
        }
    }, []);

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

                    // Anclar estado a override manual (si existe) o al primer estado observado.
                    const existingOverride = localOrderOverride.current.get(serverOrder.id);
                    const pinned = existingOverride ?? {
                        estado: (parsed.estado as 'activa' | 'completada') ?? 'activa',
                        completed_at: (parsed.completed_at as string | null) ?? null,
                    };
                    if (!existingOverride) {
                        localOrderOverride.current.set(serverOrder.id, pinned);
                    }

                    const finalEstado = pinned.estado;
                    const finalCompletedAt = finalEstado === 'completada'
                        ? (pinned.completed_at ?? parsed.completed_at ?? null)
                        : null;

                    return {
                        ...parsed,
                        estado: finalEstado,
                        completed_at: finalCompletedAt,
                        lineas,
                    };
                });

                prev.forEach((localOrder) => {
                    const hasOverride = localOrderOverride.current.has(localOrder.id);

                    if (
                        !merged.find((o) => o.id === localOrder.id) &&
                        // Retener solo si pertenece al día en curso o está pendiente de sync.
                        // Evita que finalizadas de días anteriores se "enganchen" indefinidamente en memoria.
                        (isFromToday(localOrder) || hasOverride)
                    ) {
                        merged.push({ ...localOrder, lineas: localOrder.lineas ?? [] });
                    }
                });

                // Persistir el anclaje de estados manuales (por día).
                // (Se ejecuta dentro de setOrders; es ligero: solo JSON de map.)
                queueMicrotask(() => saveOverridesToStorage());

                return merged;
            });
        },
        [mergeLineasFromServer, saveOverridesToStorage]
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

                if (options.isInitial) {
                    loadOverridesFromStorage();
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

                    if (p.eventType === 'INSERT') {
                        const newOrder = { ...p.new, lineas: [] } as unknown as KDSOrder;
                        // No introducir comandas fuera del día en curso (evita “fantasmas” en Finalizadas).
                        if (!isOrderRowFromToday(p.new)) return;
                        // Anclar estado inicial observado si no existe override.
                        const oid = (p.new as { id?: string } | null)?.id;
                        if (oid && !localOrderOverride.current.has(oid)) {
                            const estado = ((p.new as any)?.estado ?? 'activa') as 'activa' | 'completada';
                            const completed_at = (p.new as any)?.completed_at ? String((p.new as any).completed_at) : null;
                            localOrderOverride.current.set(oid, { estado, completed_at });
                            saveOverridesToStorage();
                        }
                        scheduleUpdate(() => setOrders(prev => {
                            if (prev.find(o => o.id === newOrder.id)) return prev;
                            return [...prev, orderWithParsedDates(newOrder)];
                        }));
                    } else if (p.eventType === 'UPDATE') {
                        // Si llega un UPDATE de un registro fuera del día, lo ignoramos (o lo expulsamos si existía).
                        if (!isOrderRowFromToday(p.new)) {
                            const oid = (p.new as { id?: string } | null)?.id;
                            if (oid) scheduleUpdate(() => setOrders(prev => prev.filter(o => o.id !== oid)));
                            return;
                        }
                        scheduleUpdate(() => setOrders(prev => prev.map(o => {
                            if (o.id !== (p.new as { id: string }).id) return o;
                            const updated = orderWithParsedDates({ ...o, ...p.new });
                            // Estado manual anclado: ignorar flips automáticos de estado.
                            const pinned = localOrderOverride.current.get(o.id);
                            if (!pinned) {
                                const estado = (updated.estado as 'activa' | 'completada') ?? 'activa';
                                localOrderOverride.current.set(o.id, { estado, completed_at: (updated.completed_at as string | null) ?? null });
                                saveOverridesToStorage();
                                return updated;
                            }
                            return {
                                ...updated,
                                estado: pinned.estado,
                                completed_at: pinned.estado === 'completada' ? (pinned.completed_at ?? (updated.completed_at as string | null) ?? o.completed_at) : null,
                            };
                        })));
                    } else if (p.eventType === 'DELETE') {
                        const oid = (p.old as { id?: string } | null)?.id;
                        if (!oid) return;
                        localOrderOverride.current.delete(oid);
                        saveOverridesToStorage();
                        scheduleUpdate(() => setOrders(prev => prev.filter(o => o.id !== oid)));
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

    // FINALIZAR COMANDA (manual) — todas las tandas (mismo id_ticket) se cierran a la vez
    const completarComanda = async (orderId: string, idTicket?: string | null) => {
        setSyncStatus('syncing');
        const completedAt = new Date().toISOString();
        const ticketKey = (idTicket && String(idTicket).trim()) ? String(idTicket).trim() : null;

        let affectedIds: string[] = [];
        const prevOverrides = new Map<string, { estado: 'activa' | 'completada'; completed_at: string | null }>();
        setOrders((prev) => {
            const targets = ticketKey
                ? prev.filter((o) => (o.id_ticket ?? null) === ticketKey && o.estado === 'activa')
                : prev.filter((o) => o.id === orderId);
            affectedIds = targets.map((t) => t.id);
            affectedIds.forEach((id) => {
                const prior = localOrderOverride.current.get(id);
                if (prior) prevOverrides.set(id, prior);
                localOrderOverride.current.set(id, { estado: 'completada', completed_at: completedAt });
            });
            saveOverridesToStorage();
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
            affectedIds.forEach((id) => {
                const prior = prevOverrides.get(id);
                if (prior) localOrderOverride.current.set(id, prior);
                else localOrderOverride.current.delete(id);
            });
            saveOverridesToStorage();
            setOrders((prev) =>
                prev.map((o) =>
                    affectedIds.includes(o.id) ? { ...o, estado: 'activa' as const, completed_at: null } : o
                )
            );
        } else {
            setStatusWithTimeout('success');
        }
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

                const pinned = localOrderOverride.current.get(affected.id);
                const alreadyCompleted = (pinned?.estado ?? affected.estado) === 'completada';

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
        const prev = localOrderOverride.current.get(orderId) ?? null;
        localOrderOverride.current.set(orderId, { estado: 'activa', completed_at: null });
        saveOverridesToStorage();

        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, estado: 'activa', completed_at: null } : o));

        const { error } = await supabase
            .from('kds_orders')
            .update({ estado: 'activa', completed_at: null })
            .eq('id', orderId);

        if (error) {
            setSyncStatus('error');
            if (prev) localOrderOverride.current.set(orderId, prev);
            else localOrderOverride.current.delete(orderId);
            saveOverridesToStorage();
            setOrders(prev2 => prev2.map(o => o.id === orderId ? { ...o, estado: 'completada', completed_at: new Date().toISOString() } : o));
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