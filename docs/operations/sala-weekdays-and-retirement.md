# Estado de sala: calendario y retirada del sistema de cocina

## Qué permanece activo
- Registro de ventas, líneas de ticket, pagos y cierres.
- Stock e inventarios.
- Radar de sala y la consulta de pedidos abiertos del copiloto.
- Puente TPV y endpoint `/api/telemetria`, solo para Radar.
- Calendario de sala de lunes a viernes, zona horaria `Europe/Madrid`.
  Durante sábados y domingos no se actualiza `public.estado_sala`.

## Qué se ha retirado
- La pantalla y componentes del sistema de cocina.
- Los triggers de proyección de cocina sobre `estado_sala` y `comandero_events`.
- Sus funciones públicas y llamadas RPC exclusivas.
- Siete tablas exclusivas de cocina de la API pública.

Los datos antiguos se conservan **sin borrarse** en `retired_kds`, esquema
privado sin acceso a usuarios web ni al rol anónimo. No pertenece al camino
crítico del TPV. Se puede recuperar si una dependencia no detectada lo exige.
**No purgar el archivo automáticamente**: requiere autorización independiente.

## Migraciones aplicadas a Supabase
- `20261010142000_retire_kds_preserve_sala_and_history.sql`
- `20261010143000_remove_kds_only_public_functions.sql`

Las migraciones antiguas de cocina permanecen en el historial de Git porque
son la historia de versiones de la base de datos. En instalaciones nuevas,
las migraciones anteriores crean los objetos y las dos finales los retiran.

## Comprobación operativa
```sql
-- Debe conservarse Radar y la función de consulta del copiloto.
SELECT to_regclass('public.estado_sala');
SELECT to_regprocedure('public.consultar_pedidos_abiertos()');
-- Debe ser NULL: cocina fuera de la API pública.
SELECT to_regclass('public.kds_orders');
SELECT to_regclass('public.kds_order_lines');
-- En estado_sala solo debe quedar el filtro semanal.
SELECT tgname
FROM pg_trigger
WHERE tgrelid='public.estado_sala'::regclass AND NOT tgisinternal;
```

## Ordenador local
Los cambios de base de datos ya funcionan sin reiniciar el puente del TPV.
Los archivos `integrations/gateway/server.js` y
`integrations/tpv-bridge/index.js` conservan exactamente los endpoints
de ventas/caja/sala. Solo se ha actualizado la terminología de cocina a Radar.
Si se actualiza el gateway local en el futuro, revisar su versión y reiniciarlo
de forma controlada, sin activar catch-up ni cambiar la recepción de tickets.

## Recuperación
Nunca restaurar archivos o tablas de cocina con `CASCADE`. Una reversión
requiere revisión de dependencias y de las migraciones históricas, para evitar
reprocesar automáticamente tickets ya cerrados. Conservar la copia archivada.
