---
documento: DOMINIO-HORAS
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-09-07
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

Agosto es el mes de vacaciones del establecimiento. En staff, los **días civiles de agosto no generan obligación de horas a efectos de deuda de asistencia**. La regla se aplica por los días reales del tramo, no por el mes del lunes de la Semana Marbella.

El Contract Resolver produce dos magnitudes distintas para cada tramo staff:

- **Jornada contratada efectiva**: días contractuales del tramo / 7 × jornada semanal. Se usa para clasificar horas ordinarias y extras.
- **Jornada que puede generar deuda**: días contractuales del tramo que **no** caen en agosto / 7 × jornada semanal. Se usa solo para el lado negativo del balance.

Ambas pasan por el redondeo Marbella.

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

Esto crea, cuando corresponde, una franja neutra: las horas exentas por agosto pueden evitar deuda, pero **no se convierten por ello en horas extra**. Las extras siguen naciendo únicamente al superar la jornada contratada efectiva completa del tramo.

### Semanas mixtas

La frontera de mes se comporta igual que cualquier otra frontera temporal que obliga a prorratear contrato:

- **Julio → agosto:** solo los días de julio pueden generar deuda.
- **Agosto → septiembre:** solo los días de septiembre pueden generar deuda.
- **Semana íntegramente en agosto:** la jornada que puede generar deuda es 0.

Ejemplo real de jornada de **8 h/semana**, semana **31 ago–6 sep** y 0 h fichadas:

```
días que pueden generar deuda = 6
jornada deuda = roundMarbella(6 / 7 × 8) = 7 h
balance semanal = −7 h
```

La jornada contratada efectiva de esa semana sigue siendo 8 h para ordinarias/extras.

### Qué sí hace

- Semana íntegramente de agosto sin fichajes: balance 0; no genera deuda nueva.
- Semana mixta sin fichajes: genera deuda solo por la parte proporcional de días fuera de agosto.
- Una deuda arrastrada desde antes de agosto permanece y se combina con la nueva deuda proporcional cuando vuelve a haber días fuera de agosto.
- El exceso por encima de la jornada contratada efectiva sigue generando extras con normalidad.

### Qué no hace

- **No** convierte todas las horas trabajadas en agosto en extras.
- **No** usa ya el mes de `week_start` como interruptor para toda la semana.
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

## 4. Cuando falta un dato

Si faltan hechos de contrato o de frontera laboral, aplica el contrato efectivo que resuelve el Hours Engine. La ausencia de fichajes en una semana staff con lunes en agosto **no** es un error: es balance 0 por esta regla.

---

## 5. Invariantes

| ID | Afirmación |
|---|---|
| INV-H01 | En staff, `debtContractedHours` se prorratea solo con los días contractuales fuera de agosto |
| INV-H02 | Si todos los días contractuales del segmento staff caen en agosto, el segmento no puede producir balance negativo |
| INV-H03 | Ordinarias/extras se calculan contra `contractedHours`, no contra `debtContractedHours`; la exención no crea extras |
| INV-H04 | En semana mixta, el lado negativo del balance no puede superar la deuda correspondiente a los días fuera de agosto |
| INV-H05 | Fuera de agosto, `debtContractedHours = contractedHours` y la regla staff vuelve a `horas − contrato` |
| INV-H06 | En la semana que contiene la fecha de fin del contrato (y posteriores), `carryOut = 0`, sea el saldo crédito o deuda |
| INV-H07 | Si existe un tramo abierto, no aplica saldo de fin: `carryOut` sigue la cadena normal de [ADR-0001](../../4-decisiones/ADR-0001-hours-engine-productor-unico.md) |
