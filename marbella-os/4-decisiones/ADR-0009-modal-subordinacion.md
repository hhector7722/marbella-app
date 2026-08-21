---
documento: ADR-0009
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-08-20
depende_de: ADR-0007, ADR-0008
supersede: —
---

# ADR-0009 · Subordinación visual del panel Modal cubierto

## Contexto

[ADR-0008](./ADR-0008-modal-backdrop-capas.md) fijó que el **backdrop** de cada capa es propiedad de la infraestructura Modal y que las capas `derived` / `system` **no** repiten el filtro blur del backdrop base (no se acumula blur de fondo). En el mismo documento aparece la lectura visual: *«El Modal inferior permanece nítido y reconocible»*.

El código vigente del contrato Modal hace otra cosa sobre el **panel** (no sobre el backdrop) cuando una superficie `derived` o `system` queda por encima de un Modal base vivo: marca el panel cubierto como subordinado (`data-subordinate="true"`) y le aplica blur, opacidad reducida y `pointer-events-none`. La superficie superior permanece dominante. Escape, historial `parentInstance`, capas y cierre siguen el contrato existente ([ADR-0007](./ADR-0007-modal-superficie-derivada.md), Modal en SISTEMA-DE-COMPONENTES).

Hacía falta una ADR que registre esa decisión de panel sin reescribir ADR-0008 (registro histórico inmutable).

## Decisión

### Subordinación del panel cubierto

Cuando existe una superficie Modal viva encima de otra en la pila registrada (`registerModalSurface`):

1. Toda superficie que **no** es la cima pasa a estado **subordinado**.
2. La subordinación se aplica al **panel** del Modal cubierto (`data-subordinate` en el contenedor del panel), no inventando un segundo portal ni un z-index manual.
3. La superficie superior permanece visualmente dominante (nitidez y recepción de interacción).
4. El panel subordinado recibe, vía tokens de shell:
   - blur (`--modal-subordinate-blur`, con saturación acotada);
   - reducción de opacity (`--modal-subordinate-opacity`);
   - `pointer-events-none` en el host del overlay subordinado, de modo que no compite por el toque con la cima.

### Qué no cambia

- El backdrop por capa de [ADR-0008](./ADR-0008-modal-backdrop-capas.md) **sigue vigente**: `derived` / `system` solo oscurecen; no se añade blur al backdrop elevado.
- Nesting máximo una `derived` ([ADR-0007](./ADR-0007-modal-superficie-derivada.md)).
- Escape cierra la cima; `parentInstance` / historial y cierre (X, backdrop) no se redefinen aquí.
- No se autorizan portales adicionales ni `zIndexClass` para simular subordinación.

### Relación con ADR-0008

Esta decisión **sustituye la interpretación visual** de ADR-0008 según la cual el Modal inferior debía permanecer nítido. ADR-0008 **no se edita**: permanece como registro histórico del backdrop por capa y de la prohibición de acumular blur en el fondo. Quien lea ambas: backdrop elevado sin blur (0008) + panel base atenuado bajo la cima (0009).

## Alternativas descartadas

- **Mantener el panel base nítido bajo derived/system:** Descartado; el código y la jerarquía percibida dan protagonismo a la cima atenuando el panel cubierto.
- **Conseguir la atenuación con un segundo portal o z-index ad hoc:** Descartado; viola el contrato de un solo Modal y las capas semánticas.
- **Mover el blur al backdrop elevated:** Descartado; reabriría la acumulación de blur de fondo que ADR-0008 cerró.
- **Editar ADR-0008 para reescribir la frase de nitidez:** Descartado; las ADR son inmutables; una decisión nueva se registra aparte.

## Consecuencias aceptadas

- Documentación viva del Modal (SISTEMA, EXPERIENCIA, PATRONES, TOKENS, GLOSARIO, índices) debe citar ADR-0009 para subordinación de panel.
- Los tests de contrato que exigen `data-subordinate` y tokens `--modal-subordinate-*` describen esta decisión, no un detalle accidental.
- ADR-0008 sigue siendo la referencia del backdrop; no se interpreta ya como mandato de nitidez del panel inferior.
