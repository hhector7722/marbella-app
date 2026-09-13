---
documento: ADR-0011
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-09-13
depende_de: ADR-0001
supersede: —
---

# ADR-0011 · Proyección diaria hija y `carry_out` para lecturas SELECT

## Contexto

[ADR-0001](./ADR-0001-hours-engine-productor-unico.md) fija el flujo HECHO → Hours Engine (al escribir) → proyección persistida → Read Model → UI. La fase 3b corta el motor en lectura.

El contrato [PROYECCION-v1](../3-ingenieria/contratos/PROYECCION-v1.md) materializó solo la fila semanal. Dejó fuera `carryOut` y `dailyBreakdown`. Las pantallas de historial, tarjeta semanal y coste laboral extra diario seguían liquidando al cargar ([D5](../5-estado/DEUDA.md)).

Persistir el `LiquidationResult` entero duplicaría fichajes y segmentos. Un read model de historial paralelo duplicaría `total_cost` y `pending_balance` y crearía un segundo productor.

## Decisión

La proyección semanal existente se amplía, no se sustituye:

1. **`weekly_snapshots.carry_out`** es columna C: `LiquidationResult.carryOut`. Hace falta en la semana en curso, que no tiene W+1 de donde leer `pending_balance`.
2. **`weekly_snapshot_days`** es tabla hija de `(user_id, week_start)`: por día, `overtime_hours` (OT bruto) y `overtime_cost` (reparto de `total_cost`).
3. El pie de extras **no** se persiste. El Read Model lo deriva con la fórmula ya existente (INV-P03) a partir de columnas C + `prefer_stock_effective`.
4. El Writer único escribe fila semanal y días en el mismo barrido. Nadie más escribe C.
5. Las lecturas de historial, tarjeta y coste extra diario son SELECT. Si falta proyección v2, el sistema grita; no liquida.

El contrato que operacionaliza esta decisión es [PROYECCION-v2](../3-ingenieria/contratos/PROYECCION-v2.md). Subordina a ADR-0001: no cambia `liquidateWeek`, `computeCarry` ni el Cost Engine.

## Alternativas descartadas

| Alternativa | Motivo de descarte |
|---|---|
| Read model de historial aparte | Segunda fuente de verdad junto a `weekly_snapshots`. Historial, extras y labor pueden divergir. |
| JSON de `dailyBreakdown` en la fila semanal | Acopla el esquema al vector interno del motor; no se consulta bien por día. |
| Solo SELECT de agregados semanales, sin días | La tarjeta pierde Ex por día; el coste laboral no puede prorratear € extra. |
| Caché de UI o de petición | No es persistencia. El cálculo seguiría ocurriendo al leer. |
| Persistir `LiquidationResult` completo | Duplica `time_logs` y segmentos regenerables. |

## Consecuencias

- Toda corrección de hecho (fichaje, contrato, pagada, bolsa) regenera desde el lunes afectado hasta hoy, igual que hoy. Los días de esas semanas se reescriben enteros.
- Hasta que el Writer regenere una semana, `carry_out` y los días son NULL/ausentes. Eso es un hueco de escritura, no una autorización para liquidar en lectura.
- ADR-0001 sigue vigente. PROYECCION-v1 queda superado por v2.
