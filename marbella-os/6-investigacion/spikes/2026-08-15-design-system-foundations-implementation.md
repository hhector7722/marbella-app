---
documento: SPIKE-DESIGN-SYSTEM-FOUNDATIONS-IMPLEMENTATION
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

# DESIGN_SYSTEM_FOUNDATIONS_IMPLEMENTATION

> **MATERIAL NO NORMATIVO** — informe de la primera fase de implementación.
> Autorizado por la DECISIÓN PROPUESTA de
> [`2026-08-15-design-system-foundations-audit.md`](./2026-08-15-design-system-foundations-audit.md).

---

## 1. Tokens utilizados

Materializados en `:root` (`src/app/globals.css`), Tailwind (`tailwind.config.ts`) y
`src/lib/design-system/tokens.ts`. Todos existen ya en `TOKENS.md`; no se inventaron nombres nuevos.

| Token TOKENS.md | CSS var | Clase Tailwind |
|---|---|---|
| `color.superficie` | `--color-superficie` | `bg-ds-superficie` |
| `color.borde` | `--color-borde` | `border-ds-borde` |
| `color.texto.fuerte` | `--color-texto-fuerte` | `text-ds-texto-fuerte` |
| `radio.superficie` | `--radio-superficie` | `rounded-ds-superficie` |
| `radio.control` | `--radio-control` | `rounded-ds-control` |
| `espacio.1` | `--espacio-1` | `gap-ds-1` / spacing `ds-1` |
| `espacio.2` | `--espacio-2` | `p-ds-2` / spacing `ds-2` |
| `tactil.minimo` | `--tactil-minimo` | `min-h-ds-tactil` |
| `elevacion.superficie` | `--elevacion-superficie` | `shadow-ds-superficie` |

**Fuera de alcance:** migración global de `#36606F` y resto del catálogo.

El tamaño de label `9px` / `8px` (md) se conserva como estaba en `DashboardIosIcon`
(por debajo de `tipo.minimo` 11px del contrato). No se creó un token nuevo para no inventar norma.

---

## 2. Anatomía final de DashboardShortcut

```text
button[data-component][data-variant][data-instance]   ← host
├── (opcional) badge
├── div[data-element=iconBox][data-studio-target=bg]  ← iconBox
│   └── div[data-element=asset][data-studio-target=asset]
│         └── Image | Lucide | children
└── span[data-element=text][data-studio-target=text]  ← text
```

Encaja con el DOM previo de `DashboardIosIcon` (`bg` / `asset` / `text`).

---

## 3. API del componente

`src/components/dashboards/DashboardShortcut.tsx`

| Prop | Rol |
|---|---|
| `instance` (obligatoria) | Id de negocio estable |
| `variant` | Default `icon-text` |
| `label` | Texto visible (no es identidad) |
| `onClick`, `img`, `icon`, `iconColor`, `iconClassName` | Contenido / acción |
| `className`, `labelClassName`, `contentClassName` | Overrides puntuales de instancia |
| `badgeCount`, `children` | Accesorios (reservas, métricas) |

`DashboardIosIcon` reexporta el mismo componente (deprecated).

---

## 4. Variantes

Resueltas en `src/lib/design-system/dashboard-shortcut-variants.ts`
vía `resolveDashboardShortcutVariant` → propiedades independientes
(`showText`, `showIcon`, `layoutDirection`, `layoutOrder`, `layoutAlign`,
`iconBoxMode`, `hostSurface`, `iconBoxSurface`).

| Variant | Composición |
|---|---|
| `icon-text` | Card en host; iconBox sin card; ambas piezas |
| `icon-card-text-outside` | Host transparente; card en iconBox |
| `separated` | Sin card en host ni iconBox |
| `icon-only` | Sin texto |
| `text-only` | Sin iconBox |

No se reintrodujo el enum `composition: inside | outside | …`.

Master usa solo el default `icon-text`.

---

## 5. Identidad

Emitida **en producción** en el host:

| Atributo | Valor | Generado en |
|---|---|---|
| `data-component` | `DashboardShortcut` | constante `DASHBOARD_SHORTCUT_COMPONENT_ID` |
| `data-variant` | p. ej. `icon-text` | prop `variant` |
| `data-instance` | p. ej. `asistencia` | prop `instance` (desde keys de Master) |
| `data-element` | `iconBox` \| `asset` \| `text` | markup fijo del componente |
| `data-studio-target` | `bg` \| `asset` \| `text` | mismo markup (compat Studio) |

Cambiar el label de «Asistencia» a «CONTROL DE ASISTENCIA» **no** cambia `data-instance="asistencia"`.

El Studio **aún no** resuelve overrides por estos atributos (fase futura). Hoy sigue usando keys heurísticas; los `data-studio-target` permiten selección granular como antes.

**No** se emiten `data-studio-layout|order|align|hide-*` desde el componente en el default: el CSS global del Studio alteraría el flex del tile Master.

---

## 6. Migración de MasterShortcutGrid

- Sustituido `DashboardIosIcon` → `DashboardShortcut`.
- Cada ítem pasa `instance` igual a su `key` previo (`asistencia`, `recetas`, …).
- Acciones, rutas, labels, iconos, badges, children métricos y grid responsive: **sin cambio funcional**.
- Excepción cromática de instancia (`caja-inicial` emerald) sigue en `className`.

---

## 7. Compatibilidad con Studio

Conservado:

- `data-studio-target` en iconBox/asset/text
- iframe / postMessage / undo / steppers / composición del Studio (sin tocar el motor)
- `composition.ts` y tests de Studio

No introducido:

- VARIANT / SCREEN como capas persistidas
- nuevos controles u overrides
- cambios de persistencia de Estética

---

## 8. Qué queda deliberadamente fuera

- Migración Staff (`IOSIconBoxed`) y Admin (`renderQuickActionSquare`)
- Adopción global de marca `#36606F`
- Button / Card / Modal / Navbar / BottomNav
- Lectura de identidad estable en VisualLab
- Persistencia de estéticas fuera de localStorage

### Convergencia futura Staff / Admin (solo documentación)

| Hoy | Después |
|---|---|
| `IOSIconBoxed` en `StaffDashboardView` | `<DashboardShortcut instance="…" variant="icon-text" …>` |
| `renderQuickActionSquare` en `AdminDashboardView` | Igual; asignar ids (`asistencia`, `m-obra`, `plantilla`, `stock`) |

---

## 9. Tests realizados

Ejecutados en la sesión de implementación:

| Comando | Resultado |
|---|---|
| `npm run test:design-system` | 6/6 pass |
| `npm run test:studio-composition` | 23/23 pass |
| `npm run test:studio-history` | 11/11 pass |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 (incluye `/playground/studio`) |
| `git diff --check` | exit 0 |
| `npm run generate:corpus` | ok |
| `npm run validate:corpus` | 1 error **preexistente** (`scripts/` sin clasificar en INDEXACION); avisos huérfanos de `.cursor/rules` — no introducidos por esta fase |

Auditoría de criterios:

- [x] Master conserva shortcuts e ids
- [x] Texto ≠ identidad (`data-instance`)
- [x] Variante = composición; sin enum legacy
- [x] Studio sin features nuevas; targets preservados
- [x] Sin cambios de assets / Supabase / APIs

---

## 10. Próxima fase recomendada

1. Migrar Staff y Admin a `DashboardShortcut` (misma variante default).
2. Adaptar VisualLab para **preferir** `data-component` / `data-instance` al indexar (sin nuevas features de UI).
3. Continuar adopción de tokens (marca) al tocar el siguiente componente (Button o DashboardDetailLayout).

**No empezar automáticamente** sin aprobación.
