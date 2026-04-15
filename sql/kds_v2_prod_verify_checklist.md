## KDS v2 — Checklist de verificación (producción)

### 1) Migraciones Supabase aplicadas
- `supabase/migrations/20260420100000_kds_v2_events_schema.sql`
- `supabase/migrations/20260420101000_kds_v2_ingest_rpc_and_projection.sql`
- `supabase/migrations/20260420102000_kds_v2_pipeline_estado_sala_to_events.sql`

### 2) Realtime
- Confirmar que `public.kds_events` está en `supabase_realtime` (solo INSERT).

### 3) Datos llegan desde TPV
- En Supabase SQL editor:

```sql
select source, event_type, id_ticket, mesa, articulo_id, producto_nombre, qty, created_at
from public.kds_events
order by created_at desc
limit 50;
```

- Deben aparecer eventos `source='tpv'` + `event_type='item_added'`.

### 4) Proyección se actualiza

```sql
select *
from public.kds_projection_orders
order by last_event_at desc
limit 20;
```

```sql
select id_ticket, articulo_id, notas_norm, qty_added, qty_done, qty_cancel_notice,
       greatest(qty_added - qty_done, 0) as qty_pending
from public.kds_projection_lines
order by last_event_at desc
limit 50;
```

### 5) Cocina marca hecho (por unidad)
- En `/dashboard/kds`, tocar un artículo pendiente 1 vez.
- Ver en BD:

```sql
select *
from public.kds_events
where source='kitchen'
order by created_at desc
limit 20;
```

- Debe aparecer `event_type='item_done'` con `qty=1`.
- La proyección debe reflejar `qty_done` incrementado y `qty_pending` decrementar.

### 6) Anulación/abono (solo aviso rojo)
- Cuando TPV baje unidades (o elimine un artículo del snapshot), deben aparecer eventos:
  - `event_type='item_cancel_notice'` con `source='tpv'`
- Verificar que:
  - `qty_cancel_notice` sube
  - **`qty_pending` no baja automáticamente** por cancel_notice (solo cambia si cocina marca done).

### 7) Reconexión / dedupe
- Forzar varios POST de telemetría con el mismo `timestamp_tpv` (si aplica).
- Confirmar que no se duplican eventos con `source_event_id` en TPV.

### 8) Observabilidad
- Si el receptor muestra errores al hacer upsert en `estado_sala`, revisar:
  - triggers en `estado_sala`
  - errores en `fn_emit_kds_events_from_sala`

