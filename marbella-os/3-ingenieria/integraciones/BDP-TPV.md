---
documento: INTEGRACION-BDP-TPV
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 6 meses
supersede: context/ARQUITECTURA_SYNC_KDS.md
---

# INTEGRACIÓN · Punto de venta

Cómo llega a Marbella lo que ocurre en el punto de venta. Alimenta el radar de sala y la pantalla de cocina.

**El punto de venta no se sustituye.** Marbella lee de él y no escribe en él. Es una decisión de producto declarada en [VISION](../../1-producto/VISION.md).

| Rol | Ubicación |
|-----|-----------|
| Radar (lectura acumulativa `estado_sala`) | `src/components/dashboards/RadarSala.tsx` |
| KDS (deltas `kds_order_lines`) | `src/components/kds/KDSView.tsx`, hook `src/hooks/useKDS.ts` |
| Fechas del punto de venta (sin desfase de zona) | `src/utils/date-utils.ts` — `parseTPVDate` para su JSON; `parseDBDate` para marcas de Supabase |
| Receptor HTTP (escritura en `estado_sala`) | [`integrations/gateway/server.js`](../../../integrations/gateway/server.js) |
| Extractor en el equipo del punto de venta | [`integrations/tpv-bridge/index.js`](../../../integrations/tpv-bridge/index.js) |

Procedimiento de despliegue: [operacion/RUNBOOK-BDP-VENTAS](../operacion/RUNBOOK-BDP-VENTAS.md). Esquema del sistema ajeno: [`reference/legacy-bdp/`](../../../reference/legacy-bdp/README.md).

## Flujo de datos

1. **TPV (MSSQL)** → extractor periódico → JSON → **receptor** (DuckDNS/Express) → `POST` telemetría.
2. **Supabase** `estado_sala` (`id = 1`, `radiografia_completa` JSONB) actualizado por service role.
3. **Trigger** `trg_update_kds_on_sala_change` → `fn_trg_process_kds_from_sala` → `fn_calculate_and_insert_delta` → `fncalcdelta` (reconcilia objetivo TPV con líneas KDS y aplica deltas).
4. **Frontend** suscribe Realtime a `estado_sala`, `kds_orders`, `kds_order_lines`.

### Anulaciones visibles en cocina

- **`fncalcdelta`** construye el mapa objetivo (solo artículos con `envia_a_kds` efectivo) a partir de `productos` y lo compara con un **FULL OUTER JOIN** frente a los conteos de líneas **no canceladas** por `(articulo_id, notas)` en comandas activas del mismo `id_ticket`. Así se cancelan líneas cuando el TPV deja de enviar un artículo, baja unidades o envía `productos: []`.
- **`fn_trg_process_kds_from_sala`** recorre `NEW.radiografia_completa` y, además, para cada `id_ticket` que figura en `OLD.radiografia_completa` pero **no** en `NEW` (mesa vacía / ticket fuera del POST), llama al delta con `productos` vacío para marcar `pendiente` → `cancelado` sin pasar `kds_orders` a `completada` (el cierre sigue siendo manual en cocina).
- **Limitación (abono sobre mesa ya cerrada)**: la telemetría del extractor solo incluye comandas abiertas y un subconjunto de documentos. Si el abono no genera filas en ese payload, Supabase no recibe el evento; habría que ampliar la consulta MSSQL o el envío (ver nota en [`integrations/tpv-bridge/index.js`](../../../integrations/tpv-bridge/index.js)).

## SQL versionado

Definición exportada y mantenida en Git:

- [`supabase/migrations/20260408120000_kds_estado_sala_pipeline_snapshot.sql`](../../../supabase/migrations/20260408120000_kds_estado_sala_pipeline_snapshot.sql)
- Reconciliación de anulaciones y tickets solo en OLD: [`supabase/migrations/20260417120000_kds_reconcile_cancellations_and_old_tickets.sql`](../../../supabase/migrations/20260417120000_kds_reconcile_cancellations_and_old_tickets.sql)
- Fix `FULL OUTER JOIN` hashable en `fncalcdelta` (evitar `IS NOT DISTINCT FROM` en el `ON`): [`supabase/migrations/20260418120000_kds_fncalcdelta_full_join_hashable.sql`](../../../supabase/migrations/20260418120000_kds_fncalcdelta_full_join_hashable.sql)

Si el esquema en el dashboard diverge, volver a exportar funciones/trigger con `pg_get_functiondef` / `pg_get_triggerdef` o la herramienta SQL del proyecto Supabase y actualizar esa migración o añadir una nueva encima.

## Reglas de depuración

- **Sala duplicada**: revisar deduplicación por mesa en `RadarSala` (`processData` / `Map`).
- **KDS falta o duplica**: revisar `fncalcdelta` y datos en `radiografia_completa`; filtrado por artículo/departamento (`envia_a_kds`) vive en catálogo BDP en Supabase, no en el front.
- **Anulación no llega a cocina**: comprobar que el JSON refleja la baja; si el ticket desaparece del array, debe ejecutarse el paso OLD→NEW con `productos []` (migración anterior).
