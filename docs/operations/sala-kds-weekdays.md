# Pausa semanal de Estado de sala y KDS

## Calendario
- **Lunes a viernes, Europe/Madrid:** operaciones normales de sala/KDS.
- **Sábados y domingos, Europe/Madrid:** no se publican snapshots ni se
  ejecuta el procesamiento del KDS derivado de `public.estado_sala`.
- Hora de reinicio: **lunes 00:00 en Barcelona**, incluidos cambios CET/CEST.

## Protección aplicada en producción
Migración de Supabase `20261010114901_pause_estado_sala_kds_weekends_madrid`:
un trigger BEFORE INSERT/UPDATE (`trg_00_estado_sala_weekdays_gate`)
devuelve NULL en fin de semana. Se ejecuta antes del trigger
`trg_update_kds_on_sala_change`, evitando que este recalcule todas las mesas.

El puente del TPV sigue libre para enviar sus tickets, líneas, cobros y
movimientos de caja. **No alterar ese tráfico ni modificar datos históricos.**

## Aplicación web
KDS y Radar de sala no consultan ni presentan snapshots anteriores durante
el fin de semana. Vuelven a montarse al llegar el lunes, sin recargar la web
(chequeo cada 30 segundos).

## Receptor de telemetría
`integrations/gateway/server.js` responde a `/api/telemetria` con HTTP 200
`{ "success": true, "skipped": true, "reason": "weekend_europe_madrid" }`
sin consultar Supabase. Esto requiere desplegar/reiniciar **el gateway local**:
un despliegue de Vercel no actualiza ese proceso.

El bridge de Windows no se modifica; puede seguir enviando telemetría, pero
el gateway y el guard de Supabase la omiten. Para evitar el trabajo local de
leer mesas SQL Server será necesaria una actualización independiente del bridge.

## Lunes y datos antiguos
`estado_sala` conserva el último snapshot previo a la pausa. El primer
snapshot de lunes vuelve a aplicar el delta real por `fn_trg_process_kds_from_sala_v1`.
No borrar registros KDS, cerrar tickets antiguos ni vaciar snapshots al pausar.
No se reproducen pedidos del fin de semana; esos pedidos no entran al KDS.

## Validación/operación
- Comprobar `SELECT tgname FROM pg_trigger WHERE tgrelid='public.estado_sala'::regclass`.
- En sábado/domingo `UPDATE ... RETURNING id` sobre `estado_sala` produce **0 filas**.
- Verificar que la marca `ultima_actualizacion` permanece estable el fin de semana.
- Comprobar en lunes que el primer snapshot se actualiza y que las comandas
  nuevas aparecen en el KDS; observar logs de errores 500/statement_timeout.
- Nunca modificar los endpoints `/api/ventas` ni `/api/caja` al aplicar esto.

### Reversión de emergencia
Para restablecer temporalmente la sala durante el fin de semana:
```sql
DROP TRIGGER IF EXISTS trg_00_estado_sala_weekdays_gate ON public.estado_sala;
```
El receptor local también deberá omitir su regla de fin de semana para que
vuelva a enviar snapshots. Una reversión debe revisarse según la incidencia.
