---
documento: ADR-0007
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-08-15
depende_de: CANON
supersede: —
---

# ADR-0007 · Nesting de Modal: máximo una superficie derivada

## Contexto

La norma histórica ([EXPERIENCIA §8](../2-diseno/EXPERIENCIA.md#8-modales), [PATRONES P2](../2-diseno/PATRONES.md#p2--modal)) decía: *«No se anidan modales»*. En el código real eso no se cumplía: albaranes, caja, encargos y otros abrían overlays encima de overlays con escaleras de `z-[10050]`, `z-[10100]`, etc.

La [auditoría de Modal](../6-investigacion/spikes/2026-08-15-modal-design-system-audit.md) demostró que muchos de esos segundos overlays **no son un segundo flujo de tarea**, sino una **superficie auxiliar** del modal ya abierto (editar línea, mapear producto, evidencia OCR). Prohibirlos por completo obligaría a rediseñar flujos operativos maduros. Permitir nesting arbitrario perpetuaría el caos de capas.

Se necesitaba una decisión explícita que:

1. Conserve un solo Modal oficial.
2. Admita el caso real de “auxiliar sobre tarea”.
3. Prohíba la cascada `Modal → Modal → Modal`.
4. Sustituya z-index ad hoc por capas semánticas.

## Decisión

**Opción B — máximo una superficie derivada.**

```text
Modal principal (layer: base)
    ↓
superficie derivada (layer: derived)  ← como máximo UNA
    ↓
NO más nesting de negocio
```

### Qué es una superficie derivada

Una superficie `derived` es un overlay **perteneciente** al modal `base` abierto: completa o corrige un paso de la misma tarea sin sustituir el contexto del padre. Ejemplos canónicos previstos en migración: edición de línea de albarán, mapeo, evidencia documental.

No es un segundo modal de tarea independiente. No es un diálogo de sistema global. No es un bottom sheet de consumo.

### Cuándo puede usarse

- Ya hay un Modal con `layer="base"` abierto.
- El contenido es auxiliar al mismo flujo (no un dominio distinto).
- Se expresa con `layer="derived"` en el mismo contrato de Modal (misma identidad, portal, Escape, scroll lock).
- Solo habrá **una** derived a la vez.

### Cuándo NO puede usarse

- Para abrir un tercer overlay de negocio encima de la derived.
- Como sustituto de navegación a otra pantalla o a otro flujo.
- Sin un `base` previo (`derived-without-base` → rechazo).
- Empujando z-index manual (`z-[10200]`, etc.) para “ganar” la pila.
- Para bottom sheets de consumo (excepción `ConsumptionBottomSheet`, capa `sheet`).

### Capas semánticas (stacking)

| Capa | Token CSS | Papel |
|---|---|---|
| `base` | `--z-modal-base` (200) | Modal principal de tarea |
| `sheet` | `--z-modal-sheet` (205) | Bottom sheet de consumo (excepción) |
| `derived` | `--z-modal-derived` (210) | Única superficie auxiliar sobre `base` |
| `system` | `--z-modal-system` (220) | Confirmaciones / avisos de sistema sobre overlays |

La infraestructura asigna la clase; el consumidor **no** elige números. Escapes legacy (`zIndexClass`, `stackElevated`) existen solo para no romper migraciones pendientes y se deprecan.

### Focus

- Al abrir, el panel de la superficie recibe foco (`tabIndex={-1}` + `focus()`).
- Escape y cierre operan sobre la **cima** de la pila registrada.
- Al cerrar la derived, el `base` permanece; la restauración fina de foco al trigger original queda fuera de este ADR (mejora posterior).

### Escape

- Un único listener de documento gestiona Escape.
- Solo la cima de la pila (`registerModalSurface`) recibe el cierre.
- Abrir derived encima de base ⇒ Escape cierra la derived primero; un segundo Escape cierra el base.

### Scroll

- `lockScrollGlobal()` con contador: cada superficie abierta incrementa; cada cierre decrementa.
- El Body del Modal hace scroll interno; Header y Footer no.
- No se permite que el scroll del documento “se cuele” bajo el overlay mientras haya superficies registradas.

### Enforcement en código

`registerModalSurface` rechaza:

- `derived` sin `base` → `derived-without-base`
- segunda `derived` → `derived-already-open`

El componente `Modal` no renderiza si el registro falla (en desarrollo: `console.error`).

## Alternativas descartadas

- **A — Prohibición absoluta (norma literal antigua):** Descartada. Obliga a rehacer flujos de albaranes/caja ya operativos; el coste de producto supera el beneficio de pureza.
- **C — Nesting libre con política de z-index documentada:** Descartada. Es exactamente el problema actual (escaleras por componente); no hay tope semántico.
- **Resolver stacking solo con portales anidados en el DOM:** Descartado. Sin capas semánticas y sin pila Escape, el orden visual sigue siendo frágil entre árboles distintos.

## Consecuencias aceptadas

- EXPERIENCIA §8 y PATRONES P2 dejan de decir “nunca anidar” y citan este ADR.
- La migración de Albaranes (fase posterior) debe usar `layer="derived"` en lugar de `z-[10100]`.
- Consumidores que hoy abren tres capas tendrán que aplanar el flujo o serializar pasos.
- `ConsumptionBottomSheet` convive como excepción explícita (`layer: sheet`), no como Modal centrado.
- Studio no gana capas nuevas en esta decisión; solo se prepara identidad (`data-component` / `data-variant` / `data-instance` / `data-layer`).
