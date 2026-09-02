---
documento: DOMINIO-HORAS
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-09-02
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

Agosto es el mes de vacaciones del establecimiento. Un segmento staff cuya **Semana Marbella empieza en agosto** (el lunes cae en agosto) no genera deuda de asistencia:

```
si el lunes de la semana ∈ agosto:
  balance semanal = max(0, horas fichadas − jornada contratada efectiva)
```

Es el mismo anclaje histórico que `extract(month from week_start) = 8`: incluye la última semana de agosto aunque desborde a septiembre.

### Qué sí hace

- Semana con lunes en agosto sin fichajes (o por debajo del contrato): balance 0; no arrastra deuda nueva.
- Semana con lunes en agosto por encima del contrato: sigue generando extras con normalidad.
- Una deuda arrastrada **desde julio** permanece; agosto no la amplía por infraasistencia.

### Qué no hace

- **No** restaura el régimen histórico que trataba todas las horas de agosto como extras.
- **No** exime la semana mixta julio/agosto cuyo lunes cae en julio.
- **No** aplica a regímenes sin tope staff (`manager`, `fixed`, `pre_alta`, `gap`): ya no generan deuda por jornada.

---

## 3. Cuando falta un dato

Si faltan hechos de contrato o de frontera laboral, aplica el contrato efectivo que resuelve el Hours Engine. La ausencia de fichajes en una semana staff con lunes en agosto **no** es un error: es balance 0 por esta regla.

---

## 4. Invariantes

| ID | Afirmación |
|---|---|
| INV-H01 | En segmento staff con lunes de semana en agosto: `weeklyBalancePart ≥ 0` |
| INV-H02 | En segmento staff con lunes en agosto y horas > contrato: `overtimeHours = horas − contrato` y `weeklyBalancePart = overtimeHours` (tras redondeo Marbella del balance) |
| INV-H03 | Ordinarias/extras de un segmento staff no dependen del suelo de agosto: se calculan como `min/max` respecto al contrato efectivo del segmento |
| INV-H04 | Un segmento staff cuyo lunes de semana no está en agosto no aplica el suelo: `weeklyBalancePart = horas − contrato` |
