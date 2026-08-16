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

> Contrato **global** (no preferencias por pantalla).
> Auditoría: [2026-08-15-modal-design-system-audit.md](./2026-08-15-modal-design-system-audit.md).
> Nesting: [ADR-0007](../../4-decisiones/ADR-0007-modal-superficie-derivada.md).
> Backdrop / capas visuales: [ADR-0008](../../4-decisiones/ADR-0008-modal-backdrop-capas.md).

**Fuera de alcance aún:** migración de consumidores (Albaranes, Perfil, …); Studio.

---

# 1. Contrato Modal

```text
TOKENS → Modal → variants → instances → Studio (futuro)
```

Anatomía:

```text
Modal
├── Overlay (backdrop de la CAPA)
├── Header   (altura FIJA)
├── Body     (scroll vertical; NUNCA horizontal)
└── Footer   (fijo; NUNCA horizontal)
```

Todo modal nuevo o migrado **hereda** ancho, max-height, centrado, header, footer, backdrop, capas, scroll, safe-area e identidad. El consumidor no reconstruye estas reglas.

---

# 2. API

```ts
<Modal
  open onClose
  title children
  variant?              // compact | standard | work | day | amplify
  layer?                // base | derived | system | sheet
  instance?             // usageId estable
  footer?
  headerTone?           // white | petroleum
  headerActionChrome?   // plain (default) | soft (explícito)
  closeOnBackdrop?
/>
```

Prohibido en consumidores: backdrops `fixed inset-0` propios, blur/saturate/opacity/z-index ad hoc para stacking.

---

# 3. Tokens

| Concepto | Valor (ref. Albaranes) | CSS |
|---|---|---|
| `estructura.cabecera-modal` | **72px** | `--modal-header-height` |
| `estructura.alto-modal` (Modal) | **min(68dvh, 100dvh − safe − 2.5rem)** | `--modal-max-height` |
| Backdrop base bg | `rgba(0,0,0,0.32)` | `--modal-overlay-base` |
| Backdrop base filter | `blur(8px) saturate(65%)` | `--modal-overlay-base-filter` |
| Backdrop elevado | `rgba(0,0,0,0.28)` sin filtros | `--modal-overlay-elevated` |
| Ancho work/day | `max-w-5xl` | variante |

---

# 4. Variantes (anchos normalizados)

Referencia Albaranes medida en código:

| Superficie Albaranes | Ancho real | Variante contrato |
|---|---|---|
| Detalle (host) | `max-w-5xl` | **`work`** (estándar trabajo) |
| Evidence | `max-w-5xl` | `work` |
| Line mapping | `sm:max-w-4xl` | tarea ancha intermedia → al migrar: `work` o documentar excepción |
| Line edit / filtros | `max-w-lg` / `sm:max-w-lg` | `standard` |
| Confirmaciones cortas | `max-w-sm` | `compact` |

| Variante | max-width | preferTall |
|---|---|---|
| `compact` | `max-w-sm` | no |
| `standard` | `max-w-md` | no |
| `work` | **`max-w-5xl`** | sí |
| `day` | **`max-w-5xl`** | sí |
| `amplify` | `max-w-2xl` | no |

Prohibido: `width: 713px`, `91vw`, etc. fuera de estas variantes.

---

# 5. Header (altura fija)

- Altura **fija** `--modal-header-height` (72px). No crece.
- Contenido se **adapta** (clamp de tipografía e iconos). Prioridad: altura fija + contenido visible.
- No usar `truncate` como estrategia primaria para “encajar”.
- Botones/iconos: **sin marco/borde/fondo** por defecto (`headerActionChrome="plain"`). `soft` solo si se pide.

---

# 6. Body

- `flex-1`, scroll **vertical** si hace falta.
- `overflow-x: hidden` obligatorio.
- Tablas: `max-width: 100%`; adaptación por wrapping/reorganización — **nunca** `overflow-x-auto` silencioso. Si un caso lo hace imposible: documentar y detener.

---

# 7. Footer

- `shrink-0`, fijo respecto al Body.
- Sin scroll horizontal.

---

# 8. Alturas

- Modal ≤ `--modal-max-height`.
- Puede ser más bajo si el contenido no lo exige.
- Header fijo; Body flexible; Footer fijo.

---

# 9. Responsive / 375px / centrado

- Centrado vertical y horizontal respecto al **viewport visible** (`fixed inset-0` + `flex items-center justify-center` + padding safe-area simétrico).
- Sin `top` fijo ni transformaciones dependientes del contenido para centrar.
- Safe-area respetada; modal no supera el viewport.

---

# 10. Overlay / Backdrop (ADR-0008)

**Base / sheet:**

```css
backdrop-filter: blur(8px) saturate(65%);
background: rgba(0, 0, 0, 0.32);
```

**Derived / system:** solo `rgba(0,0,0,0.28)` — **sin** blur, saturate ni grayscale.

No aumentar blur. No escala de grises. Desaturación parcial.

---

# 11. Portal

Único: `createPortal(..., document.body)` en Modal y ConsumptionBottomSheet.

---

# 12. Capas

```text
aplicación → base(200) → sheet(205) → derived(210) → system(220)
```

Backdrop ligado a `layer` vía `data-modal-backdrop`.

---

# 13. Superficie derivada

ADR-0007: máx. una `derived` sobre `base`.
Sub-submodal de sistema: `layer="system"` (no segunda `derived`).

---

# 14. BottomSheet

Excepción `ConsumptionBottomSheet`: misma infra de backdrop base, header fijo, overflow-x, identidad. No vía libre de overlays.

---

# 15. Identidad

`data-component`, `data-variant`, `data-instance`, `data-layer`, `data-element`, `data-modal-backdrop`.

---

# 16. Studio futuro

Solo lectura de identidad; sin nuevas capas de persistencia en esta fase.

---

# 17. Migración futura Albaranes

Pendiente de aprobación explícita. Debe adoptar tokens/variantes/layers y eliminar portal/backdrop locales.

---

# 18. Criterios de aceptación (ampliación visual)

| # | Criterio | Infra |
|---|---|---|
| 1 | Header altura fija 72px | sí |
| 2 | Contenido header adaptativo (clamp) | sí |
| 3 | Iconos/botones plain por defecto | sí |
| 4 | Ancho normalizado (work=5xl) | sí |
| 5 | Max-height Albaranes 68dvh | sí |
| 6 | Centrado viewport + safe-area | sí |
| 7–8 | Sin scroll horizontal Modal/tablas (CSS) | sí (enforzado en shell; tablas consumidor pendientes de migración) |
| 9–12 | Backdrop base exacto; elevated sin blur | sí |
| 13 | Jerarquía base→derived→system | sí |
| 14 | 375px contemplado en contrato | código |
| 15 | Sin backdrop ad hoc | norma; consumidores legacy aún no migrados |

---

## Valores medidos Albaranes (código)

```text
HEADER_CURRENT        = 72px   (py-3 + min-h-12 en detalle)
MODAL_WIDTH_CURRENT   = max-w-5xl (host/evidence); también 4xl y lg en derivados
MODAL_MAX_HEIGHT_CURRENT = min(68dvh, calc(100dvh - safe-areas - 2.5rem))
```

---

## Validación

Distinguir siempre:

- **VALIDADO POR EJECUCIÓN REAL**
- **VALIDADO POR CÓDIGO**
- **NO VALIDADO VISUALMENTE**
