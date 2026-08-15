---
documento: SPIKE-MODAL-DESIGN-SYSTEM-CONTRACT
clase: inmutable
estado: vigente
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-08-15
caducidad: no aplica
supersede: —
---

# Contrato oficial de Modal — Design System Marbella

> Informe de implementación del **contrato** (no de la migración de consumidores).
> Decisiones aprobadas tras [auditoría](./2026-08-15-modal-design-system-audit.md).
> Nesting: [ADR-0007](../../4-decisiones/ADR-0007-modal-superficie-derivada.md).
> Norma viva actualizada: EXPERIENCIA §8, PATRONES P2, SISTEMA-DE-COMPONENTES (Modal), TOKENS.

**Fuera de alcance de esta fase:** migración Albaranes / Perfil / Staff / Admin; Studio; SCREEN; Supabase.

---

# 1. Contrato Modal

Un único patrón oficial para overlays de **tarea**:

```text
TOKENS → Modal (ui/modal.tsx) → variants → instances → Studio (futuro)
```

Anatomía obligatoria:

```text
Modal
├── Overlay (backdrop)
├── Header   (altura mínima táctil, shrink-0)
├── Body     (flex-1, scroll interno)
└── Footer   (opcional, shrink-0, fijo respecto al Body)
```

Código: `src/components/ui/modal.tsx` + `src/lib/design-system/modal-*.ts`.

---

# 2. API

```ts
type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;           // Body
  variant?: ModalVariant;        // default: 'compact'
  layer?: ModalLayer;            // default: 'base'
  instance?: string;             // identidad estable (= usageId)
  footer?: ReactNode;            // slot fijo
  headerTone?: 'white' | 'petroleum';
  closeOnBackdrop?: boolean;     // default true
  // …compat legacy: usageId, zIndexClass, stackElevated, hideHeader*, etc.
};
```

Filosofía: el consumidor elige **variante + contenido**; el componente gobierna estructura, overlay, Escape, scroll lock, capas e identidad.

**Nuevos usos deben pasar `instance` estable.** `usageId` se conserva por compatibilidad.

---

# 3. Tokens

Reutilizados / adoptados (sin inventar catálogo paralelo):

| Token / concepto | Origen | CSS / Tailwind |
|---|---|---|
| `color.superficie` / borde / texto / marca | TOKENS | `--color-*`, `bg-ds-*` |
| `radio.superficie` / `radio.control` | TOKENS | `rounded-ds-*` |
| `espacio.2/3/4` | TOKENS | `p-ds-*`, `gap-ds-*` |
| `tactil.minimo` | TOKENS | `min-h/w-ds-tactil` |
| `elevacion.modal` | TOKENS | `--elevacion-modal`, `shadow-ds-modal` |
| `estructura.alto-modal` | TOKENS | `--modal-max-height`, `max-h-ds-modal` |
| Overlay | valor histórico `bg-black/40` | `--modal-overlay` |
| Capas | ADR-0007 | `--z-modal-base|derived|sheet|system` |

No se tokenizaron anchos por variante: se reutilizan utilidades Tailwind ya usadas en producto (`max-w-sm|md|2xl|4xl`).

---

# 4. Variantes

| Variante | max-width | preferTall | Uso |
|---|---|---|---|
| `compact` | `max-w-sm` | no | Confirmaciones / formularios cortos (default histórico) |
| `standard` | `max-w-md` | no | Formularios estándar |
| `work` | `max-w-4xl` | sí | Trabajo real en panel ancho |
| `day` | `max-w-4xl` | sí | Modal de día (P4) |
| `amplify` | `max-w-2xl` | no | Ampliación de imagen/dato |

No existen SMALL/MEDIUM/LARGE/XL.

---

# 5. Header

- `shrink-0`, `min-h-ds-tactil` (48px).
- Título truncado; acciones trailing; cierre ≥ 48×48.
- Tonos: `white` | `petroleum` (marca).
- No es un canvas libre: `hideHeader` es escape legacy, no patrón nuevo.

---

# 6. Body

- `flex-1 min-h-0`; scroll con `overflow-y-auto` + `overscroll-contain` cuando `scrollContent` (default true).
- Contenido largo no empuja el modal fuera del viewport: tope `max-h-ds-modal`.

---

# 7. Footer

- Slot `footer` opcional.
- `shrink-0`, borde superior, padding `px-ds-4 py-ds-3`.
- No hace scroll con el Body.
- Acciones primarias/secundarias las compone el consumidor **dentro** del slot; no hay footer ad hoc fuera del contrato.

---

# 8. Alturas

- Contenedor: `max-h-ds-modal` (= `estructura.alto-modal` + safe-area).
- `work` / `day`: `preferTall` → `min-h` acotado por el mismo tope.
- Header/Footer fijos; Body flexible.

---

# 9. Responsive

- Centrado con `p-ds-4` + `pt/pb` con `max(1rem, env(safe-area-inset-*))`.
- En 375px el ancho es `w-full` limitado por la variante.
- Bottom sheet: anclado abajo en móvil, centrado desde `sm`.

---

# 10. Overlay

- Un backdrop único: `--modal-overlay` + blur ligero.
- Cierre al pulsar fuera: `closeOnBackdrop` (default true).
- Scroll del documento: `lockScrollGlobal` (contador; atenúa chrome vía `data-modal-open`).
- Escape: pila semántica (ADR-0007).
- Focus inicial al panel del dialog.

---

# 11. Portal

- Un solo `createPortal(..., document.body)` en Modal y en `ConsumptionBottomSheet`.
- Prohibido inventar portales paralelos en nuevos consumidores del contrato.

---

# 12. Capas

```text
aplicación
  → base (200)
  → sheet (205)          ← excepción consumo
  → derived (210)        ← máx. 1
  → system (220)
```

Consumidor elige `layer`, no un número.

---

# 13. Superficie derivada

Ver [ADR-0007](../../4-decisiones/ADR-0007-modal-superficie-derivada.md).

```tsx
<Modal instance="albaran-detail" variant="work" layer="base" … />
<Modal instance="albaran-line-edit" variant="standard" layer="derived" … />
```

Segunda `derived` → no se renderiza (`derived-already-open`).
`derived` sin `base` → rechazo (`derived-without-base`).

---

# 14. BottomSheet

Excepción explícita: `src/components/ui/ConsumptionBottomSheet.tsx`.

- Misma infra: portal, capas (`sheet`), Escape, scroll lock, Footer fijo, identidad.
- No es Modal centrado; no es vía libre para overlays nuevos.
- Una familia; sin variantes ad hoc adicionales en esta fase.

---

# 15. Identidad

```html
data-component="Modal"
data-variant="work"
data-instance="albaran-detail"
data-layer="base"
data-element="header|body|footer|overlay|container"
```

`data-instance` = usageId estable. Nunca título visible, índice DOM ni ruta+texto.

Studio: **solo preparado**; no se añaden capas VARIANT/INSTANCE de persistencia.

---

# 16. Integración futura con Studio

El Studio podrá leer `data-component` / `data-variant` / `data-instance` como en `DashboardShortcut`. Esta fase no modifica el playground ni la persistencia de Estética.

---

# 17. Migración futura de Albaranes

Primera migración **después** de aprobar este contrato:

1. Host detalle → `Modal` `variant="work"` `layer="base"` `instance="…"`.
2. LineEdit / LineMapping / Evidence → `layer="derived"` sin `z-[10100]`.
3. Eliminar portales/backdrops locales del host.
4. Mover acciones al slot `footer` donde aplique.
5. No migrar Perfil en la misma fase.

---

# 18. Criterios de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | Un solo Modal oficial evolucionado (no paralelo) | código |
| 2 | Variantes compact/standard/work/day/amplify | código + tests |
| 3 | Header / Body / Footer en anatomía | código |
| 4 | Body scroll + Footer fijo | código |
| 5 | max-height vía token | código |
| 6 | Safe-area en contenedor | código |
| 7 | Escape / backdrop / scroll lock unificados | código + tests pila |
| 8 | Identidad data-* | código |
| 9 | derived máx. 1 + requiere base | código + tests + ADR |
| 10 | BottomSheet excepción | código |
| 11 | Sin migrar Albaranes/Perfil/Studio | cumplido |
| 12 | Validación visual en navegador | **NO hecha en esta entrega** |

---

## Validación ejecutada (ver informe de entrega)

Distinguir siempre:

- **VALIDADO POR EJECUCIÓN REAL** — tsc, build, tests, git diff --check
- **VALIDADO POR CÓDIGO** — anatomía, tokens, capas
- **NO VALIDADO VISUALMENTE** — no se abrió navegador real en esta fase
