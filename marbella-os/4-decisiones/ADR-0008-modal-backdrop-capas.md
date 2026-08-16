---
documento: ADR-0008
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-08-15
depende_de: ADR-0007
supersede: —
---

# ADR-0008 · Backdrop y jerarquía visual de capas Modal

## Contexto

El contrato Modal ([ADR-0007](./ADR-0007-modal-superficie-derivada.md)) fijó capas semánticas y nesting, pero el tratamiento visual del backdrop seguía siendo ad hoc: `backdrop-blur-sm`, opacidades distintas y riesgo de **blur acumulado** al abrir una superficie derivada sobre otra.

La referencia operativa (detalle de Albaranes) y el contrato visual ampliado exigen:

1. Backdrop base exacto: `blur(8px) saturate(65%)` + `rgba(0,0,0,0.32)`.
2. Capas superiores sin blur/saturate adicionales.
3. Profundidad por oscurecimiento controlado, no por degradación progresiva.
4. Backdrop perteneciente a la capa Modal, no montado por cada consumidor.

## Decisión

### Backdrop es propiedad de la capa

La infraestructura emite `data-modal-backdrop="base|elevated"` según `layer`. Los consumidores **no** implementan `fixed inset-0` ni filtros propios para el stacking de Modal.

| Layer | Backdrop | Filtros |
|---|---|---|
| `base`, `sheet` | `rgba(0,0,0,0.32)` | `blur(8px) saturate(65%)` |
| `derived`, `system` | `rgba(0,0,0,0.28)` | **ninguno** |

### No acumular blur

```text
CORRECTO:
  pantalla → [backdrop base] → Modal → [solo oscurecer] → derived/system

INCORRECTO:
  pantalla → blur → Modal → blur → derived
```

El Modal inferior permanece nítido y reconocible.

### Jerarquía visual

```text
PANTALLA
  → MODAL base
    → SUBMODAL (derived)
      → SUB-SUBMODAL / sistema (system)
```

- `derived` = submodal de la misma tarea (máx. uno; ADR-0007).
- `system` = confirmación o superficie de sistema encima (sub-submodal permitido vía capa `system`, no vía segunda `derived`).
- Cada nivel se percibe encima del anterior; ninguno “borra” cromáticamente al inferior.

### Valores dimensionales de referencia (código Albaranes)

Medidos en `AlbaranesHistoricoClient` / derivados **sin inventar**:

| Magnitud | Valor real | Token / contrato |
|---|---|---|
| Header (detalle) | `py-3` + `min-h-12` ⇒ **72px** | `--modal-header-height` |
| Ancho estándar trabajo | `max-w-5xl` (1024px) | variante `work` / `day` |
| Anchos funcionales adicionales | `max-w-4xl` (mapping), `max-w-lg` (edit/filtros) | `amplify` no aplica; usar `standard`/`compact` o `work` según tarea |
| Max-height (detalle) | `min(68dvh, calc(100dvh − safe − 2.5rem))` | `--modal-max-height` |

## Alternativas descartadas

- **Repetir el backdrop base en cada capa:** Descartado; acumula blur y desatura Marbella.
- **Grayscale / saturate(0) en base:** Descartado; la desaturación debe ser parcial (~35%).
- **Dejar blur en manos del consumidor:** Descartado; es la causa del caos de overlays.

## Consecuencias aceptadas

- Migraciones futuras deben eliminar backdrops locales.
- `backdropClassName` legacy no debe reintroducir blur en capas elevadas.
- Carta u otros shells con CSS propio de altura (94svh) no quedan autorizados a divergir del contrato Modal cuando usen `Modal`.
