---
documento: DOMINIO-HORAS
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-09-27
caducidad: 6 meses
supersede: —
---

# DOMINIO · Horas

Reglas de cálculo del balance semanal de asistencia y de su arrastre. La arquitectura del productor único está en [ADR-0001](../../4-decisiones/ADR-0001-hours-engine-productor-unico.md). Este documento fija **qué** se calcula; el ADR fija **quién** lo calcula.

Términos en [GLOSARIO](../../GLOSARIO.md).

---

## 1. Balance semanal staff

```
balance semanal = horas fichadas − jornada contratada efectiva de la semana
```

- Si el balance es positivo: crédito (extras o bolsa, según modo).
- Si el balance es negativo: **deuda de horas**.
- Las horas ordinarias y las extras se clasifican contra la misma jornada contratada. Un suelo de deuda **no** convierte infraasistencia en extras.

---

## 2. Exención de deuda en agosto

Agosto es el mes de vacaciones del establecimiento. En staff, el cierre no genera obligación de horas **a efectos de deuda de asistencia**. La regla se aplica por los días reales del tramo, no por el mes del lunes de la Semana Marbella.

Hay tres clases de semana:

- **Semana normal**, sin ningún día de agosto. No cambia. La jornada que puede generar deuda es la jornada contratada efectiva.
- **Semana entera de agosto.** La jornada que puede generar deuda es 0. No hace falta ninguna distribución.
- **Semana frontera**: tiene al menos un día de agosto y al menos un día fuera. Ahí puede existir una distribución prevista, día a día, solo para esa persona y esa semana.

La distribución es un hecho de entrada en `weekly_expected_hours`. No forma parte del tramo (`hours_contract_terms`). No se deduce de fichajes, de una ausencia, de un permiso ni del horario operativo (`shifts`). Un turno borrado no cambia las horas previstas. Cero es un valor real. Hacen falta las siete filas; con una a seis el motor no rellena y falla de forma visible. Con cero filas, la frontera sigue el prorrateo civil legado (días del tramo fuera de agosto / 7 × jornada) y queda marcada como legado, no como distribución confirmada. Esa entrada pendiente está en [D33](../../5-estado/DEUDA.md).

En una frontera configurada, para los días del tramo que están activos:

```
total previsto = suma de las horas previstas de los 7 días
exento por cierre = suma de las horas previstas de los días de agosto
exigible = total previsto − exento por cierre
```

La deuda del tramo es la parte exigible de sus días activos. Un día de pre-alta o de gap no crea obligación aunque la distribución tenga horas ese día. Alta y baja siguen prorrateando la jornada efectiva por días civiles / 7.

El Contract Resolver produce dos magnitudes distintas para cada tramo staff:

- **Jornada contratada efectiva**: días del tramo / 7 × jornada semanal. Clasifica ordinarias y extras, y es el prorrateo de alta y baja. Agosto no la reduce.
- **Jornada que puede generar deuda**: en una frontera configurada, las horas previstas de los días activos fuera de agosto. Sin distribución, el prorrateo civil legado. En una semana entera de agosto, 0.

Ambas magnitudes pasan por el redondeo Marbella.

Por segmento staff:

```
balance_base = horas fichadas − jornada contratada efectiva

si balance_base >= 0:
  balance semanal = balance_base

si balance_base < 0:
  balance semanal = min(
    0,
    horas fichadas − jornada que puede generar deuda
  )
```

Esto crea, cuando corresponde, una franja neutra: las horas exentas por agosto pueden evitar deuda, pero **no se convierten por ello en horas extra**. Las extras siguen naciendo únicamente al superar la jornada contratada efectiva completa del tramo. Que la deuda quede en 0 no baja ese umbral.

### Semanas frontera

La distribución la guarda un manager en el editor semanal de `/staff/history`. Los días de agosto se pueden rellenar: guardar 8 h un sábado cerrado significa «tenía 8 previstas y quedan exentas», no «tenía 0».

Ejemplo, 40 h previstas de lunes a viernes y 0 el fin de semana, semana **27 jul–2 ago**, 32 h fichadas y el viernes sin fichaje:

```
total previsto = 40 h
exento por cierre = 0 h
exigible = 40 h
balance semanal = 32 − 40 = −8 h
```

El viernes sigue valiendo 8 h previstas. Que no haya fichaje, o que el turno de ese día desaparezca del horario, no lo convierte en 0.

Ejemplo, misma frontera, 0 de lunes a viernes y 8 h el sábado y el domingo:

```
total previsto = 16 h
exento por cierre = 16 h
exigible = 0 h
balance semanal = 0
```

La jornada contratada efectiva sigue siendo 16 h. Trabajar por encima de 16 h sí genera extras.

Ejemplo, 40 h de lunes a viernes, semana **31 ago–6 sep**:

```
exento por cierre = 8 h
exigible = 32 h
```

La jornada contratada efectiva sigue siendo 40 h: las horas entre 32 y 40 no son deuda ni extras.

Ejemplo, 0 entre semana y 8 h el sábado y el domingo de esa misma semana: el lunes 31 vale 0 previsto, así que el exento es 0 y lo exigible son 16 h.

Sin las siete filas, el ejemplo legado de **8 h/semana** y semana **31 ago–6 sep** sigue siendo `roundMarbella(6 / 7 × 8) = 7 h`.

### Qué sí hace

- Semana íntegramente de agosto sin fichajes: balance 0; no genera deuda nueva.
- Semana normal sin fichajes: consume la jornada. El balance es −jornada, no 0. La tarjeta lee ese resultado en la proyección; no lo recalcula al pintar.
- Semana frontera configurada sin fichajes: deuda solo por las horas previstas fuera de agosto.
- Semana frontera sin distribución: deuda por la parte civil fuera de agosto, marcada como legado.
- Una deuda arrastrada desde antes de agosto permanece. Al guardar una frontera se recalcula desde esa semana, así el arrastre siguiente ve la distribución.
- El exceso por encima de la jornada contratada efectiva sigue generando extras con normalidad.

### Qué no hace

- **No** convierte las horas exentas de agosto en extras.
- **No** usa el mes de `week_start` como interruptor para toda la semana.
- **No** guarda la distribución en `weekly_snapshots` ni en `weekly_snapshot_days`. Esas tablas siguen siendo la proyección.
- **No** aplica la distribución fuera de una semana frontera, aunque hubiera filas accidentales.
- **No** aplica deuda contractual a regímenes sin tope staff (`manager`, `fixed`, `pre_alta`, `gap`).

---

## 3. Saldo a cero al finalizar el contrato

Al terminar la relación laboral —último tramo cerrado, sin tramo «Vigente»— la **bolsa de horas se salda a cero**: en la semana que contiene la fecha de fin del contrato, y en todas las posteriores, `carryOut = 0`. Aplica tanto al crédito (bolsa a favor) como a la deuda.

Es la operacionalización de «ya se gestiona en su nómina»: el saldo pendiente de una persona que deja de trabajar se liquida en su nómina final. Mantenerlo en el arrastre dejaría horas «pendientes» que no corresponden a nadie en activo y falsearía el contador de la tarjeta semanal.

### Qué sí hace

- La última semana activa conserva su `carryIn` histórico (lo que había al cerrar) y su `balanceFinal` calculado, pero su `carryOut` es 0: nada se arrastra a la semana siguiente.
- Desde la semana posterior a la fecha de fin, `carryIn = 0`: el contador de pendientes queda a 0.
- La fecha de fin se toma del último tramo contractual (`max(effectiveTo)`). Si existe un tramo abierto, la relación continúa y no se salda nada.
- Refina las invariantes de arrastre de [ADR-0001](../../4-decisiones/ADR-0001-hours-engine-productor-unico.md) (`INV-C05/C06/C08`) únicamente en la semana de fin de contrato.

### Qué no hace

- **No** modifica las semanas anteriores a la fecha de fin: su arrastre se calcula con la cadena normal.
- **No** borra el histórico: la semana de baja conserva su `balanceFinal` calculado.
- **No** aplica en gaps contractuales entre tramos de una relación vigente (hay tramo abierto después).

---

## 4. Extra gestionado

Tres slots reutilizables (`Extra 1`, `Extra 2`, `Extra 3`) con `staffing_mode = managed_extra`. No son un régimen nuevo del Hours Engine: usan un tramo `staff` real con `weekly_hours = 0`, bolsa desactivada y tarifa inicial 10 €/h en `hours_contract_terms`.

Consecuencia del motor ya existente:

- sin fichajes: ordinarias 0, extras 0, deuda 0, coste 0;
- con fichajes: ordinarias 0, extras = horas trabajadas, deuda 0, coste = horas × tarifa.

No fichan ellos: manager escribe `time_logs` con `is_manual_entry = true` y el Writer oficial (`writeProjectionFromWeek`) proyecta. En el editor de horario no aparecen como tres filas del selector: una sola acción `Extra` elige el slot libre de número más bajo **del día en edición**.

---

## 5. Cuando falta un dato

Si faltan hechos de contrato o de frontera laboral, aplica el contrato efectivo que resuelve el Hours Engine. La ausencia de fichajes en una semana staff entera de agosto **no** es un error: es balance 0 por esta regla. En una semana normal, la ausencia de fichajes consume la jornada.

---

## 6. Invariantes

| ID | Afirmación |
|---|---|
| INV-H01 | En staff, una semana frontera con siete horas previstas debe `debtContractedHours` igual a la suma prevista de los días activos fuera de agosto; sin esas filas, prorratea los días civiles fuera de agosto y lo marca como legado |
| INV-H02 | Si lo exigible del segmento staff es 0, el segmento no puede producir balance negativo |
| INV-H03 | Ordinarias/extras se calculan contra `contractedHours`, no contra `debtContractedHours`; la exención no crea extras ni baja el umbral |
| INV-H04 | En semana frontera, el lado negativo del balance no puede superar las horas previstas fuera de agosto, o la parte civil legada si aún no hay distribución |
| INV-H05 | Fuera de una semana frontera, `debtContractedHours = contractedHours` en staff salvo la semana entera de agosto, donde la deuda es 0 |
| INV-H06 | En la semana que contiene la fecha de fin del contrato (y posteriores), `carryOut = 0`, sea el saldo crédito o deuda |
| INV-H07 | Si existe un tramo abierto, no aplica saldo de fin: `carryOut` sigue la cadena normal de [ADR-0001](../../4-decisiones/ADR-0001-hours-engine-productor-unico.md) |
