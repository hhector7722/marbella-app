"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import type { KDSItemStatus, KDSOrder, KDSOrderLine } from '@/components/kds/types';
import { getStartOfEuropeMadridToday } from '@/utils/date-utils';

type ProjectionOrderRow = {
  id_ticket: string;
  mesa: string | null;
  estado: 'activa' | 'completada';
  opened_at: string;
  completed_at: string | null;
  last_event_at: string;
  notas_comanda: string | null;
};

type ProjectionLineRow = {
  id_ticket: string;
  articulo_id: number;
  notas_norm: string;
  producto_nombre: string | null;
  qty_added: number;
  qty_done: number;
  qty_cancel_notice: number;
  last_event_at: string;
};

function buildSyntheticUnitId(parts: {
  id_ticket: string;
  articulo_id: number;
  notas_norm: string;
  kind: 'pendiente' | 'terminado' | 'cancelado';
  idx: number;
}) {
  return [
    parts.id_ticket,
    String(parts.articulo_id),
    encodeURIComponent(parts.notas_norm ?? ''),
    parts.kind,
    String(parts.idx),
  ].join('|');
}

function parseSyntheticUnitId(id: string): { id_ticket: string; articulo_id: number; notas_norm: string } | null {
  const [id_ticket, articuloRaw, notasEnc] = id.split('|');
  const articulo_id = Number(articuloRaw);
  if (!id_ticket || !Number.isFinite(articulo_id)) return null;
  return { id_ticket, articulo_id, notas_norm: decodeURIComponent(notasEnc ?? '') };
}

function nowIdSuffix() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function useKDSv2() {
  const supabase = createClient();
  const [orders, setOrders] = useState<KDSOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFetchedOnce = useRef(false);

  const setStatusSuccess = useCallback(() => {
    setSyncStatus('success');
    window.setTimeout(() => {
      setSyncStatus((prev) => (prev === 'success' ? 'idle' : prev));
    }, 1500);
  }, []);

  const fetchProjection = useCallback(
    async (opts: { initial?: boolean; silent?: boolean } = {}) => {
      if (opts.initial) setLoading(true);
      if (!opts.silent) setSyncStatus('syncing');

      const startIso = getStartOfEuropeMadridToday().toISOString();
      try {
        const { data: projOrders, error: oErr } = await supabase
          .from('kds_projection_orders')
          .select('*')
          // Solo día en curso (medianoche local → ahora):
          // - Activas: si se abrieron hoy o tuvieron eventos hoy (líneas nuevas / cambios).
          // - Completadas: si se completaron hoy.
          .or(
            `and(estado.eq.activa,opened_at.gte.${startIso}),and(estado.eq.activa,last_event_at.gte.${startIso}),and(estado.eq.completada,completed_at.gte.${startIso})`
          )
          .order('opened_at', { ascending: true });
        if (oErr) throw oErr;

        const ids = (projOrders ?? []).map((o: any) => String(o.id_ticket));
        const { data: projLines, error: lErr } = ids.length
          ? await supabase.from('kds_projection_lines').select('*').in('id_ticket', ids)
          : { data: [], error: null };
        if (lErr) throw lErr;

        const linesByTicket = new Map<string, ProjectionLineRow[]>();
        (projLines ?? []).forEach((l: any) => {
          const row = l as ProjectionLineRow;
          const arr = linesByTicket.get(row.id_ticket) ?? [];
          arr.push(row);
          linesByTicket.set(row.id_ticket, arr);
        });

        const mapped: KDSOrder[] = (projOrders ?? []).map((oAny: any) => {
          const o = oAny as ProjectionOrderRow;
          const rows = linesByTicket.get(o.id_ticket) ?? [];

          const lineas: KDSOrderLine[] = [];
          rows.forEach((r) => {
            const pending = Math.max(0, Number(r.qty_added ?? 0) - Number(r.qty_done ?? 0));
            const done = Math.max(0, Number(r.qty_done ?? 0));
            const cancel = Math.max(0, Number(r.qty_cancel_notice ?? 0));
            const nombre = (r.producto_nombre ?? '').trim() || `Artículo ${r.articulo_id}`;
            const notas = (r.notas_norm ?? '').trim();

            for (let i = 0; i < pending; i++) {
              lineas.push({
                id: buildSyntheticUnitId({
                  id_ticket: o.id_ticket,
                  articulo_id: r.articulo_id,
                  notas_norm: notas,
                  kind: 'pendiente',
                  idx: i + 1,
                }),
                kds_order_id: o.id_ticket,
                producto_nombre: nombre,
                cantidad: 1,
                notas: notas ? notas : null,
                departamento: null,
                estado: 'pendiente',
                created_at: o.opened_at,
                completed_at: null,
              });
            }

            // Mostrar hechos en verde (no desaparecen de la comanda). Se pueden recuperar (item_undone).
            for (let i = 0; i < done; i++) {
              lineas.push({
                id: buildSyntheticUnitId({
                  id_ticket: o.id_ticket,
                  articulo_id: r.articulo_id,
                  notas_norm: notas,
                  kind: 'terminado',
                  idx: i + 1,
                }),
                kds_order_id: o.id_ticket,
                producto_nombre: nombre,
                cantidad: 1,
                notas: notas ? notas : null,
                departamento: null,
                estado: 'terminado',
                created_at: o.opened_at,
                completed_at: o.completed_at,
              });
            }

            for (let i = 0; i < cancel; i++) {
              lineas.push({
                id: buildSyntheticUnitId({
                  id_ticket: o.id_ticket,
                  articulo_id: r.articulo_id,
                  notas_norm: notas,
                  kind: 'cancelado',
                  idx: i + 1,
                }),
                kds_order_id: o.id_ticket,
                producto_nombre: nombre,
                cantidad: 1,
                notas: notas ? notas : null,
                departamento: null,
                estado: 'cancelado',
                created_at: o.opened_at,
                completed_at: o.completed_at,
              });
            }
          });

          return {
            id: o.id_ticket,
            id_ticket: o.id_ticket,
            origen_referencia: null,
            mesa: o.mesa ?? null,
            notas_comanda: o.notas_comanda ?? null,
            origen: 'TPV',
            estado: o.estado,
            created_at: o.opened_at,
            completed_at: o.completed_at,
            lineas,
          };
        });

        setOrders(mapped.filter((o) => (o.lineas?.length ?? 0) > 0 || o.estado === 'completada'));
        hasFetchedOnce.current = true;
        setIsOffline(false);
        if (!opts.silent) setStatusSuccess();
      } catch (e) {
        console.error('KDS v2 fetchProjection error:', e);
        if (!opts.silent) setSyncStatus('error');
        if (!hasFetchedOnce.current) setIsOffline(true);
      } finally {
        if (opts.initial) setLoading(false);
      }
    },
    [setStatusSuccess, supabase]
  );

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      void fetchProjection({ initial: false, silent: true });
    }, 160);
  }, [fetchProjection]);

  useEffect(() => {
    void fetchProjection({ initial: true, silent: false });
    const channel = supabase
      .channel('kds_v2_events_only')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kds_events' }, () => scheduleRefresh())
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [fetchProjection, scheduleRefresh, supabase]);

  const tacharProductos = useCallback(
    async (lineIds: string[], currentState: KDSItemStatus) => {
      if (lineIds.length === 0) return;
      const parsed = parseSyntheticUnitId(lineIds[0]);
      if (!parsed) return;
      if (currentState === 'cancelado') return;

      const nextState: KDSItemStatus = currentState === 'pendiente' ? 'terminado' : 'pendiente';
      const eventType = nextState === 'terminado' ? 'item_done' : 'item_undone';
      const qty = lineIds.length;

      setSyncStatus('syncing');
      const sourceEventId = `kitchen|${parsed.id_ticket}|${eventType}|${parsed.articulo_id}|${parsed.notas_norm}|${qty}|${nowIdSuffix()}`;
      const { error } = await supabase.rpc('kds_ingest_event', {
        p_source_event_id: sourceEventId,
        p_id_ticket: parsed.id_ticket,
        p_mesa: null,
        p_event_type: eventType,
        p_articulo_id: parsed.articulo_id,
        p_producto_nombre: null,
        p_notas: parsed.notas_norm,
        p_qty: qty,
      });
      if (error) {
        console.error('kds_ingest_event error:', error);
        setSyncStatus('error');
      } else {
        setStatusSuccess();
        scheduleRefresh();
      }
    },
    [scheduleRefresh, setStatusSuccess, supabase]
  );

  const completarComanda = useCallback(
    async (orderId: string, idTicket?: string | null) => {
      const ticket = ((idTicket ?? orderId) as string).trim();
      if (!ticket) return;
      setSyncStatus('syncing');
      const sourceEventId = `kitchen|${ticket}|order_completed|${nowIdSuffix()}`;
      const { error } = await supabase.rpc('kds_ingest_event', {
        p_source_event_id: sourceEventId,
        p_id_ticket: ticket,
        p_mesa: null,
        p_event_type: 'order_completed',
        p_articulo_id: null,
        p_producto_nombre: null,
        p_notas: null,
        p_qty: 1,
      });
      if (error) {
        console.error('order_completed rpc error:', error);
        setSyncStatus('error');
      } else {
        setStatusSuccess();
        scheduleRefresh();
      }
    },
    [scheduleRefresh, setStatusSuccess, supabase]
  );

  const recuperarComanda = useCallback(
    async (orderId: string) => {
      const ticket = (orderId ?? '').trim();
      if (!ticket) return;
      setSyncStatus('syncing');
      const sourceEventId = `kitchen|${ticket}|order_reopened|${nowIdSuffix()}`;
      const { error } = await supabase.rpc('kds_ingest_event', {
        p_source_event_id: sourceEventId,
        p_id_ticket: ticket,
        p_mesa: null,
        p_event_type: 'order_reopened',
        p_articulo_id: null,
        p_producto_nombre: null,
        p_notas: null,
        p_qty: 1,
      });
      if (error) {
        console.error('order_reopened rpc error:', error);
        setSyncStatus('error');
      } else {
        setStatusSuccess();
        scheduleRefresh();
      }
    },
    [scheduleRefresh, setStatusSuccess, supabase]
  );

  const updateLineNotes = useCallback(async () => {}, []);
  const updateOrderNotes = useCallback(async () => {}, []);

  return {
    orders,
    loading,
    isOffline,
    syncStatus,
    tacharProductos,
    completarComanda,
    recuperarComanda,
    updateLineNotes,
    updateOrderNotes,
    refresh: () => fetchProjection({ initial: false, silent: false }),
  };
}

