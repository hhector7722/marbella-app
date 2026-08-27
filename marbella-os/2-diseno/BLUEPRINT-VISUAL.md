# Blueprint Visual — Marbella App

Este documento es la **documentación humana del canon visual**.
La fuente técnica editable es `src/lib/design-system/canon/registry.json`.
Este fichero se regenera desde esa fuente. No se edita a mano.

El canon define cómo debe ser Marbella. El código debe cumplirlo.
Si un consumidor no lo cumple, es deuda de implementación y se migra.
Esa deuda no aparece aquí.

```
CANON            →  cómo debe ser Marbella
IMPLEMENTACIÓN   →  el código debe cumplir el canon
AUDITORÍA / DEUDA →  qué partes del código todavía no cumplen
```

Generado: 2026-08-25T20:30:00.000Z.

---

## Vocabulario de estados

| Estado | Significado |
|---|---|
| **CANON CERRADO** | Decidido. Normativo. Contrato obligatorio del código. |
| **BORRADOR / PROPUESTA** | Experimentando. No es contrato. |
| **SIN CANON** | Aún no hay decisión suficiente. |
| **HEREDADO** | Reutiliza el contrato visual de otro elemento. No es anatomía propia. |
| **ESPECIALIZADO** | Patrón de dominio. No es universal. |
| **DEPRECADO** | Histórico. No usar en código nuevo. |

### Regla: CANON CERRADO = contrato obligatorio

Una vez que un elemento se declara **CANON CERRADO**, todos los
consumidores nuevos y existentes deben utilizarlo conforme a su
definición. Una implementación que todavía no cumple el canon **no
modifica el canon**: constituye deuda de implementación y debe
corregirse mediante migración.

Autoridad: **propuesta visual**. No está indexado en el corpus. Si
discrepa de `TOKENS.md`, `SISTEMA-DE-COMPONENTES.md`, `EXPERIENCIA.md`
o un ADR vigente, gana el documento canónico del corpus.

---

## Matriz canónica

Pregunta de cada fila: **¿ya hemos decidido cómo debe ser?**

### Fundamentos

| Elemento | Estado |
|---|---|
| Color | CANON CERRADO |
| Tipografía | CANON CERRADO |
| Espaciado | CANON CERRADO |
| Radios | CANON CERRADO |
| Sombras | CANON CERRADO |
| Táctil | CANON CERRADO |
| Focus ring | CANON CERRADO |

### Cabeceras

| Elemento | Estado |
|---|---|
| Cabecera de página | CANON CERRADO |
| Cabecera de bloque | SIN CANON |
| Cabecera de tabla | Parte de Table / T8 |
| Cabecera de modal | CANON CERRADO |
| Cabecera de modal derived | HEREDADO (hereda Modal Header) |
| App Navbar | ESPECIALIZADO |
| T1 · Sala / Staff | ESPECIALIZADO |
| T1 · Ventas | ESPECIALIZADO |
| Bottom Sheet | ESPECIALIZADO |
| KDS | ESPECIALIZADO |
| Calendario / ScheduleDayEditor | ESPECIALIZADO |
| Carta pública / cliente | ESPECIALIZADO |

### Alineación

| Elemento | Estado |
|---|---|
| Layout / alineación | BORRADOR / PROPUESTA |

### Piezas y patrones

| Elemento | Estado |
|---|---|
| Button | CANON CERRADO |
| Modal | CANON CERRADO |
| Surface | CANON CERRADO |
| PageScreen | CANON CERRADO |
| Field | BORRADOR / PROPUESTA |
| Search | BORRADOR / PROPUESTA |
| Select | BORRADOR / PROPUESTA |
| QuantityStepper | BORRADOR / PROPUESTA |
| Table / T8 | BORRADOR / PROPUESTA |
| EmptyState | BORRADOR / PROPUESTA |
| Notice | CANON CERRADO |
| LoadingSpinner | BORRADOR / PROPUESTA |
| Radio / Segmented | BORRADOR / PROPUESTA |
| Checkbox | BORRADOR / PROPUESTA |
| Calendario | CANON CERRADO |
| TimeFilter (chrome) | BORRADOR / PROPUESTA |
| PetroleumSegmented | CANON CERRADO |

### Especializado

| Elemento | Estado |
|---|---|
| DocumentListRow | ESPECIALIZADO |


## Propiedades congeladas

### Cabecera de página

- Alineación: Extremos
- Vertical: Centro
- Altura: 36 px · estructura.cabecera-modal
- Padding horizontal: 16 px · espacio.4
- Padding vertical: 16 px · espacio.4
- Título: 18 px · título PageScreen

### Cabecera de modal

- Altura: 36 px · estructura.cabecera-modal
- Alineación del título: Izquierda

### Button

- Hit: 48 px · táctil mínimo
- Radio: 8 px · Button / espacio.2
- Padding horizontal: 4 px · espacio.1
- Foco: Marca
- Alineación del contenido: Centro

## Abierto (no es contrato)

- **Cabecera de bloque** (SIN CANON): Existe implementación visual (Surface block > header), pero todavía no existe una decisión canónica. No es PageScreen.
- **Layout / alineación** (BORRADOR / PROPUESTA): Decisiones de izquierda / centro / extremos. No se expone justify-content.
- **Field** (BORRADOR / PROPUESTA): Dirección cerrada: controles nativos dentro de Field. El contrato visual completo sigue abierto.
- **Search** (BORRADOR / PROPUESTA): SearchField existe. No es Field. Lupa + input compactos (32 px, 12 px). El contrato visual completo sigue abierto.
- **Select** (BORRADOR / PROPUESTA): Nativo dentro de Field. No nace primitiva Select de design system.
- **QuantityStepper** (BORRADOR / PROPUESTA): Pieza existe. Recuento de efectivo sigue en DenominationStepper.
- **Table / T8** (BORRADOR / PROPUESTA): Composición, no Table.tsx. Thead de marca y tabular-nums siguen abiertos.
- **EmptyState** (BORRADOR / PROPUESTA): Las tres situaciones de producto existen. Cómo se distinguen none y mismatch no está congelado.
- **LoadingSpinner** (BORRADOR / PROPUESTA): Hay tamaños en código. El contrato (tamaños / currentColor) no está congelado.
- **Radio / Segmented** (BORRADOR / PROPUESTA): PetroleumSegmented 2–5 está cerrado. Cuándo usar radio nativo sigue abierto.
- **Checkbox** (BORRADOR / PROPUESTA): Receta candidata: hit 48, marca, radio 4. No componente.
- **TimeFilter (chrome)** (BORRADOR / PROPUESTA): P7 (vive en cabecera) está cerrado. El chrome visual 32 px no es contrato.

## Alineación

Las decisiones de alineación son semánticas, no CSS arbitrario:

- Horizontal: Izquierda / Centro / Extremos
- Vertical: Arriba / Centro / Abajo

Se congelan en la pieza que las usa (cabecera, Field, tabla), no como token suelto.

## Historial de decisiones

- 2026-08-25 · derived-modal-header · v1 · revision · CANON CERRADO → HEREDADO
