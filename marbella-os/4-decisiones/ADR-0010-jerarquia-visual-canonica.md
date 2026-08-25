---
documento: ADR-0010
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-08-25
depende_de: CANON
supersede: —
---

# ADR-0010 · Jerarquía visual canónica: primitivas y plantillas de pantalla

## Contexto

Durante semanas se normalizó la interfaz cerrando consumidores aislados. El contrato de Modal y el de Button están consolidados ([ADR-0007](./ADR-0007-modal-superficie-derivada.md), [ADR-0008](./ADR-0008-modal-backdrop-capas.md), [ADR-0009](./ADR-0009-modal-subordinacion.md); Button y Modal en [SISTEMA-DE-COMPONENTES](../2-diseno/SISTEMA-DE-COMPONENTES.md)). Aun así el producto seguía decidiendo visualmente cada pantalla: cabeceras petróleo clonadas, tarjetas con radios y sombras distintos, vacíos y avisos ad hoc, campos de formulario reescritos.

Una auditoría del frontend real (2026-08-25) encontró:

- Una cabecera de página buena (`DashboardDetailLayout`) y varios clones (Labor, Propinas, Reservas, Staff).
- El modal de detalle de `/dashboard/labor` como mejor densidad de contenido de Modal (no el shell: el shell ya es el contrato Modal).
- `PetroleumSegmented`, `DocumentListRow` y `DashboardShortcut` como primitivas válidas y estrechas.
- Campo, tarjeta, aviso embebido y vacío: carencias declaradas que el código resolvía pantalla a pantalla.
- Variantes ilegítimas: `rounded-[2.5rem]` + italic en Propinas; labels de 5–7 px; `RecipeCard` huérfano.

Hacía falta una decisión que fije **cómo se construye una pantalla nueva** sin reabrir los contratos de overlay ni convertir cada patrón local en un componente universal.

## Decisión

La interfaz se construye en cuatro capas, de arriba abajo:

```text
DESIGN SYSTEM (tokens, lenguaje, experiencia)
      ↓
PRIMITIVAS (Button, Modal, Surface, Field, …)
      ↓
PLANTILLAS DE PANTALLA (T1–T8, composiciones)
      ↓
PANTALLAS DE NEGOCIO
```

1. **Una familia visual = una implementación canónica** más el mínimo de variantes justificadas por semántica o anatomía, no por gusto de un consumidor.
2. **Las plantillas de pantalla no son ocho componentes gigantes.** Son composiciones documentadas de primitivas. El único componente de plantilla que existe es `PageScreen` (exportado también como `DashboardDetailLayout`): cubre T2 listado, T3 detalle y T4 formulario.
3. **No se crea un UniversalCard, UniversalRow ni UniversalModal.** Si dos anatomías son incompatibles, se mantienen separadas. [D27](../5-estado/DEUDA.md) sigue vigente: DocumentListRow no se convierte en ListRow genérico; PetroleumSegmented no absorbe tabs underline ni segmented zinc.
4. **Esta decisión no reabre** ADR-0007, ADR-0008, ADR-0009, el contrato Modal, el contrato Button, PetroleumSegmented ni DocumentListRow. Si un detalle de esos contratos chocara con esta jerarquía, se registra otra ADR; no se editan aquellas.
5. **Los valores visuales de sistema no se redefinen en el consumidor** (`className` de color, radio, sombra, padding estructural de pieza). Tailwind local sigue permitido para layout y composición interna.

La tabla de familias, las plantillas T1–T8 y las primitivas nuevas viven en [SISTEMA-DE-COMPONENTES](../2-diseno/SISTEMA-DE-COMPONENTES.md). Los valores, en [TOKENS](../2-diseno/TOKENS.md).

## Alternativas descartadas

- **Seguir cerrando deuda pantalla a pantalla:** Descartado; es el método que produjo la deriva. Cada pantalla vuelve a decidir radio, sombra y cabecera.
- **Un componente Universal con decenas de props:** Descartado; [SISTEMA-DE-COMPONENTES §4](../2-diseno/SISTEMA-DE-COMPONENTES.md) prohíbe proliferación de interruptores y piezas que conocen el negocio.
- **Ocho plantillas como componentes monolíticos:** Descartado; T5 y T6 ya son el Modal de sistema; T7 es PetroleumSegmented; T1 es un mosaico de primitivas, no un DashboardShell con 40 props.
- **Rediseñar el estilo desde cero:** Descartado; [TOKENS](../2-diseno/TOKENS.md) recoge lo que el producto ya usa. La referencia es Labor + PageScreen + contratos vigentes, no una estética nueva.
- **Reabrir Button o Modal para cabeceras de página:** Descartado; el chrome de cabecera de Modal no es Button; PageScreen reutiliza Button en `rightSlot` cuando el consumidor ya lo hace, sin quinta variante.

## Consecuencias aceptadas

- Una pantalla nueva de gestión se apoya en `PageScreen` o declara por qué su anatomía es otra (T1 mosaico, calendario mensual P3, KDS, carta de cliente).
- Quedan literales Tailwind fuera de las pantallas migradas hoy: es deuda consciente ([DEUDA](../5-estado/DEUDA.md) D28), no un permiso para clonar cabeceras.
- Propinas abandona `rounded-[2.5rem]` e italic de título: no era semántica, era adorno.
- El vocabulario «plantilla de pantalla» no choca con «plantilla» (equipo): se nombra siempre con el complemento. Ver [GLOSARIO](../GLOSARIO.md).
