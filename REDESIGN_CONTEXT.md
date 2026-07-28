# Marbella App — Redesign Context (Master Document)

> **Cómo usar este documento**  
> En cualquier chat nuevo de Cursor sobre el rediseño, empieza con:  
> *«Lee `REDESIGN_CONTEXT.md` y úsalo como contexto.»*  
> Este archivo es la fuente de verdad del esfuerzo `redesign-v2`. Complementa (no sustituye) `PROJECT_STATUS.md` para el estado operativo general de la app.

| Campo | Valor |
|-------|--------|
| **Documento** | `REDESIGN_CONTEXT.md` (raíz del repo) |
| **Rama** | `redesign-v2` |
| **Worktree típico** | `/home/hector/Projects/marbella-app-redesign` (si existe) |
| **Última actualización** | 2026-07-26 (Sprint 12 — `/dashboard/scanner`) |
| **Alcance actual** | MDS + AppShell + infra adopción + **5 pantallas V2** |
| **Estado de adopción** | Opt-in `src/config/v2` (+ `scanner`) |
| **Índice ampliado** | §§1–12 (fundación técnica) · §§13–22 (identidad, visión, UX, gobierno del diseño) · Apéndices A–C |

---

## 1. Objetivo del proyecto

### 1.1 Qué es Marbella App

**Bar La Marbella** es la aplicación operativa del restaurante/bar: staff, managers y master dashboard. Cubre fichajes, horarios, caja, stock/albaranes, carta, reservas/encargos, eventos, KDS, propinas, nóminas/horas extras, insights y más.

Stack de producción relevante:

- Next.js (App Router) + React 19 + TypeScript
- Tailwind CSS + shadcn/ui + Radix UI
- Supabase (Auth, Postgres, RLS)
- Lógica de negocio densa en `src/lib/` (Hours Engine, Shadow Mode, payroll, carta, etc.)

### 1.2 Qué pretendemos conseguir

Un **rediseño de presentación y UX** de nivel producto premium (hospitality + software moderno), sin reescribir el negocio:

1. **Interfaz calmada, legible y consistente** — menos ruido visual, más jerarquía.
2. **Design System propio (MDS)** — tokens, temas semánticos, componentes reutilizables.
3. **AppShell V2** — chrome de aplicación (sidebar / topbar / mobile) desacoplado del layout legacy.
4. **Adopción incremental** — pantallas migran una a una; la app actual sigue funcionando.
5. **Referencia visual viva** — `/dev/app-shell` como laboratorio obligatorio antes de producción.

### 1.3 Qué NO queremos modificar (lógica de negocio)

Prohibido tocar en sprints de rediseño salvo petición explícita y aislada:

- Supabase: schema, migraciones, RLS, RPCs, triggers
- Hours Engine / Shadow / payroll / SSOT laboral
- Server Actions de dominio (caja, stock, reservas, carta, etc.)
- Hooks de negocio existentes
- Reglas de permisos / roles (salvo cablear *presentación* de navegación filtrada desde fuera)
- Rutas y contratos de API existentes
- Fórmulas legacy AppSheet / `context/` (salvo migración pedida aparte)

**Regla de oro:** el rediseño cambia *cómo se ve y se navega*; no *qué calcula ni qué persiste*.

### 1.4 Qué SÍ queremos rehacer (presentación y UX)

- Shell de aplicación (Navbar / BottomNav / MainWrapper → AppShell V2)
- Tipografía, color, spacing, elevación, radios
- Componentes UI de producto (botones, tablas, cards, formularios, empty states)
- Jerarquía de información en dashboards y listados
- Responsive (móvil kiosco/staff + desktop manager)
- Microinteracciones sobrias (sin animaciones gratuitas)
- Temas futuros: Light (activo), Dark, High Contrast (infra lista, no adoptada)

---

## 2. Filosofía del rediseño

### 2.1 Menos es más

Cada pantalla debe justificar cada elemento. Si quitar un borde, sombra, badge o KPI no empeora la comprensión, **se quita**. Preferir vacío útil a relleno decorativo.

### 2.2 Información priorizada

- Una idea primaria por viewport / sección.
- Secundario en tipografía muted o detrás de interacción.
- No competir con 8 KPIs del mismo peso visual.
- Regla ZERO-DISPLAY del protocolo Marbella: en vistas de lectura, `0` → espacio vacío `" "` (cuando aplique a datos de negocio; el playground puede mostrar ceros demo).

### 2.3 Interfaces calmadas

Fondos claros, contraste alto, ritmo lento. Sin gritos de color. El petróleo corporativo (`#36606F`) y el azul shell (`#5B8FB9`) son acentos, no papel de pared.

### 2.4 Mucho espacio

Spacing en múltiplos de **4px**. Respiro entre bloques. Targets táctiles **≥ 48px** (`spacing[12]`). Zonas de botonera con `shrink-0`; contenido elástico con `flex-1`.

### 2.5 Alta legibilidad

Tipografía con pesos claros (labels uppercase tracking, títulos black, body medium). Evitar texto `< 10px` salvo captions densas ya tipificadas en MDS. Alto contraste foreground/background.

### 2.6 Consistencia absoluta

Un solo sistema: MDS. Mismos radios, mismas sombras, mismos nombres semánticos. Prohibido “inventar una variante más” por pantalla.

### 2.7 Mobile First sin sacrificar Desktop

- Móvil: header + sheet lateral (sidebar colapsada).
- Desktop (`lg+`): sidebar fija + topbar.
- Misma información; layout adaptativo, no dos productos distintos.

### 2.8 Diseño premium

Sensación Apple HIG × hospitality: superficies blancas, bordes zinc sutiles, Bento (`rounded-xl`, `shadow-sm`, `border-mds-border`). Calidad de Stripe/Linear en densidad y acabado — no look de plantilla gratis.

### 2.9 Diseño atemporal

Evitar modas: neones, glassmorphism extremo, purple gradients, dark-by-default, pills `rounded-full` por doquier. Preferir formas estables (8–16px radius), neutros y un acento de marca.

### 2.10 Principios operativos del protocolo (siempre activos)

Del skill `arquitecto-ui-kiosco` / reglas del repo:

- Tailwind only — **sin estilos inline**.
- `cn()` de `@/lib/utils` para merge de clases.
- `lucide-react` para iconos.
- **Timezone immunity:** no `new Date('YYYY-MM-DD')` nativo; usar `new Date(y, m - 1, d)`.
- Touch first: min-height 48px en interactivos.

---

## 3. Inspiraciones

Referencias de producto y qué **tomar** (no copiar literalmente):

| Referencia | Qué tomar | Qué no copiar |
|------------|-----------|---------------|
| **Apple (HIG / Settings iPhone)** | Claridad, listas respiradas, tipografía fuerte, navegación jerárquica, calma | Skeuomorphism; exceso de blur |
| **Stripe** | Densidad profesional, tipografía editorial, formularios precisos, confianza financiera | Dashboards saturados de charts |
| **Vercel** | Minimalismo técnico, contraste, shell limpio, docs/UI sobria | Estética solo-dev oscura por defecto |
| **Linear** | Navegación rápida, atajos, estados compactos, foco en tarea | Over-animation; UI demasiado “tool for power users” en staff kiosco |
| **Notion** | Composición de páginas, bloques, vacío útil | Editor-as-app completo |
| **ChatGPT** | Conversación limpia, input claro, poco chrome | Chat como metáfora de toda la app |
| **WhatsApp** | Familiaridad móvil, listas táctiles, prioridad a contenido | Verde marca ajena; chat bubbles en dashboards |
| **iPhone Settings** | Agrupación en secciones, labels, chevrons, profundidad simple | iOS exact pixel clone |
| **Tailwind UI** | Patrones de layout probados, espaciado coherente | Aspecto genérico “Tailwind marketing site” |
| **Origin UI** | Componentes shadcn/Radix bien compuestos, variantes sobrias | Añadir registry entero sin criterio |

**Síntesis Marbella:** Apple hospitality calm + Stripe trust + Linear focus + Settings structure + shadcn composition.

---

## 4. Qué NO queremos

Lista explícita de anti-patrones (rechazar en review):

1. Dashboards llenos de KPIs del mismo peso visual  
2. Degradados decorativos (el shell legacy `bg-marbella-shell` **no** es el futuro del MDS)  
3. Tarjetas de colores chillones / rainbow status  
4. Iconos enormes decorativos sin función  
5. Diseño ERP clásico (grids densos grises, toolbars Windows-95)  
6. Bootstrap look (botones primary azules genéricos, paneles default)  
7. Interfaces ruidosas (badges por todas partes, alertas permanentes)  
8. Exceso de bordes / double borders / dividers innecesarios  
9. Sombras pesadas o multi-layer glow  
10. Pills `rounded-full` como default de UI  
11. Purple-on-white / indigo AI-slop gradients  
12. Dark mode forzado sin tema pensado  
13. Colores hex hardcodeados en JSX (`#36606F` en componentes nuevos = deuda)  
14. Espaciados arbitrarios (`p-[13px]`, `gap-[7px]`)  
15. Estilos inline / CSS-in-JS ad hoc  
16. Duplicar Navbar/BottomNav “v2” en paralelo sin retirar el legacy en adopción  
17. Meter lógica de negocio o fetch en AppShell  
18. Evaluar permisos *dentro* del shell (solo declarar; filtrar fuera)  
19. Componentes > ~200 líneas sin partir  
20. `any`, TODOs ornamentales, dependencias nuevas sin necesidad  
21. Cards en heroes / marketing clutter (cuando haya superficies branded)  
22. Timezone bugs por parseo de fechas ISO ingenuo  

---

## 5. Decisiones técnicas

### 5.1 Rama `redesign-v2`

- Todo el trabajo de rediseño vive en **`redesign-v2`**.
- `main` sigue siendo producción operativa (lógica, fixes, SSOT, etc.).
- Worktree recomendado: `marbella-app-redesign` checkout en `redesign-v2`.
- No mezclar refactors de UI masivos en `main` sin PR desde esta rama.

### 5.2 Mantener lógica / rehacer solo UI

Patrón: **presentational shell + data injection**.

- `AppShell` recibe `navigation`, `user`, `breadcrumbs` por props.
- Cero Supabase / auth / fetch en `layout-v2`.
- Las páginas futuras obtienen datos como hoy; solo cambian wrappers visuales.

### 5.3 AppShell V2

Chrome nuevo en `src/components/layout-v2/`. Aislado. Export:

```ts
import { AppShell } from '@/components/layout-v2'
```

Variantes tipadas: `'manager' | 'staff' | 'master'` (`data-shell-variant`) — por ahora solo atributo; sin forks visuales grandes.

### 5.4 Marbella Design System (MDS)

Tokens TypeScript en `src/lib/design-system/`:

| Módulo | Contenido |
|--------|-----------|
| `tokens.ts` | Colores hex de marca |
| `spacing.ts` | Escala ×4 (+ `spacingPx`) |
| `radius.ts` | sm / md / lg / xl |
| `shadows.ts` | **solo** sm / md / lg |
| `typography.ts` | display / title / body / label / caption |
| `themes.ts` | light / dark / high-contrast |
| `css-variables.ts` | mapa `--mds-*` + serializers |
| `index.ts` | barrel |

### 5.5 shadcn + Radix + Tailwind

- shadcn/ui (estilo radix-nova en `components.json`) como primitives (`Button`, `Badge`, `Card`, `Table`, `Dialog`, `Sheet`, `Skeleton`, …).
- Radix debajo (accesibilidad, focus, dialogs).
- Tailwind 3.x con `theme.extend.colors` apuntando a **CSS variables** (no hex en config).
- Nuevos componentes MDS pueden componer shadcn + clases `mds-*`.

### 5.6 CSS Variables y freeze visual

En `src/app/globals.css`:

1. **`--mds-*`** siempre en `:root` (paleta MDS Light).
2. Aliases nuevos: `--surface`, `--success`, `--warning`, `--danger`.
3. Vars shadcn activas (`--background`, `--primary`, …) en **VISUAL FREEZE** (valores oklch legacy) para no romper Button/Badge existentes.
4. Opt-in futuro: `html[data-mds-theme="light"]` enlaza shadcn → MDS.
5. Reserva: `[data-theme="dark"]`, `[data-theme="high-contrast"]`.

**Decisión implícita clave:** no activar `data-mds-theme` en `<html>` hasta un sprint de adopción consciente — evita regresión visual global.

### 5.7 Utilidades Tailwind semánticas

- Compat shadcn: `bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `border-border`, …
- MDS explícito (recomendado en componentes nuevos): `bg-mds-surface`, `text-mds-muted`, `bg-mds-primary`, …
- Nuevos: `bg-surface`, `text-success`, `bg-warning`, `text-danger`, …
- **Cuidado:** `text-muted` solo → DEFAULT de `muted` (superficie). Texto atenuado = `text-muted-foreground` o `text-mds-muted`.

### 5.8 Playground overlay

`/dev/app-shell` usa `fixed inset-0 z-[100]` para cubrir Navbar/BottomNav del root layout **sin modificar** esos componentes. Es un puente temporal hasta que el root layout deje de montar chrome legacy en rutas dev/adopción.

### 5.9 Sin dependencias nuevas

Sprints 1–4: cero packages nuevos. Reutilizar lucide, CVA, Slot, shadcn ya instalados.

---

## 6. Arquitectura

### 6.1 Mapa de carpetas (rediseño)

```
src/
  lib/design-system/          # Tokens + themes (fuente de verdad)
    tokens.ts
    spacing.ts
    radius.ts
    shadows.ts
    typography.ts
    themes.ts
    css-variables.ts
    index.ts

  components/
    design-system/
      README.md               # Contrato MDS + guía de tema

    mds/                      # Componentes de producto (Sprint 5–6)
      README.md
      index.ts
      components/…

    layout-v2/
      v2-page-shell.tsx       # Helper migración (Sprint 8)
      providers/
        layout-provider.tsx
        mds-provider.tsx
        navigation-provider.tsx
        shell-provider.tsx
      …

src/config/
  navigation/                 # shared, manager, staff, admin, registry
  v2/                         # route registry (opt-in paths)

    layout-v2/                # AppShell V2 (presentacional)
      README.md
      index.ts                # barrel público
      app-shell.tsx
      providers/
        layout-provider.tsx   # sidebarCollapsed, isMobile, openMobileMenu
      sidebar/
        navigation.ts         # tipos Navigation* + UserSummary
        sidebar.tsx
        sidebar-item.tsx
        sidebar-section.tsx
        sidebar-footer.tsx
      topbar/
        topbar.tsx
        breadcrumbs.tsx
        search-button.tsx     # placeholder
        user-menu.tsx         # placeholder
      mobile/
        mobile-header.tsx
        mobile-sidebar.tsx    # Sheet left
      page/
        page-container.tsx
        page-header.tsx
        page-actions.tsx
      demo/                   # Solo playground
        navigation.ts
        user.ts
        breadcrumbs.ts
        page-data.ts
        playground-content.tsx
        demo-metric-grid.tsx
        demo-catalog-table.tsx
        demo-side-panel.tsx
        index.ts

  app/dev/app-shell/
    page.tsx                  # Ruta dev; robots noindex; no menú prod
```

### 6.2 Design Tokens (valores actuales)

**Colores (`tokens.ts`):**

| Token | Hex | Uso |
|-------|-----|-----|
| `background` | `#F8FAFC` | Fondo de app MDS |
| `surface` | `#FFFFFF` | Cards / paneles |
| `border` | `#F4F4F5` | Bordes sutiles |
| `primary` | `#36606F` | Petróleo Marbella |
| `secondary` | `#5B8FB9` | Azul corporativo / shell legacy |
| `muted` | `#71717A` | Texto secundario |
| `foreground` | `#18181B` | Texto principal |
| `success` | `#16A34A` | OK |
| `warning` | `#D97706` | Atención |
| `danger` | `#DC2626` | Error / alerta |

**Spacing:** 0, 4, 8, 12, 16, 20, 24, 32, 40, **48 (touch)**, 64, 80, 96.

**Radius:** sm 6px · md 8px · lg 12px · xl 16px (Bento).

**Shadows:** solo sm / md / lg (suaves).

**Typography tokens:** display, title, body, label, caption (pesos 500–800).

### 6.3 Themes

`themes.ts` implementa el contrato `SemanticThemeColors` para:

- `light` — alimentado desde `colors` (activo para `--mds-*`)
- `dark` — placeholder listo, no montado en app
- `high-contrast` — placeholder accesibilidad

`muted` = texto; `mutedSurface` = fondo atenuado (compat `bg-muted` cuando se active MDS en shadcn).

### 6.4 AppShell — contrato

```ts
type AppShellProps = {
  children: React.ReactNode
  navigation: NavigationGroup[]
  user?: UserSummary
  variant?: 'manager' | 'staff' | 'master'
  breadcrumbs?: BreadcrumbItem[]
  className?: string
}
```

**Navegación (tipos):**

- `NavigationItem` — id, label, href, icon?, badge?, shortcut?, permissions?, isActive?, disabled?
- `NavigationSection` — id, label?, items[]
- `NavigationGroup` — id, label?, sections[]

El shell **no** hardcodea rutas de negocio. El playground inyecta mocks en `demo/navigation.ts`.

### 6.5 LayoutProvider

Estado local (sin localStorage):

- `sidebarCollapsed` + toggle
- `isMobile` vía `matchMedia('(max-width: 1023px)')`
- `openMobileMenu` + open/close/toggle  
  Al salir de móvil, cierra el menú.

API: `useLayout()` → `{ state, actions }`. Debe usarse dentro de `LayoutProvider` (AppShell ya lo monta).

### 6.6 Responsive shell

| Breakpoint | Comportamiento |
|------------|----------------|
| `< lg` | `MobileHeader` + `MobileSidebar` (Sheet). Sidebar desktop `hidden`. |
| `≥ lg` | Sidebar fija + `Topbar`. Mobile chrome oculto. |

### 6.7 Page primitives

- `PageContainer` — max-width, padding, columna
- `PageHeader` — title, description, actions slot
- `PageActions` — fila de acciones `shrink-0`

### 6.8 Relación con UI legacy (convivencia)

| Legacy | Estado |
|--------|--------|
| `Navbar` | Sigue en `app/layout.tsx` |
| `BottomNavWrapper` | Sigue |
| `MainWrapper` | Sigue |
| `bg-marbella-shell` | Sigue en body |
| AppShell V2 | Solo `/dev/app-shell` (overlay) |

Hasta el sprint de adopción del root layout, **no** se sustituye el chrome legacy.

### 6.9 Componentes shadcn usados por el playground

Button, Badge, Card (+ Header/Title/Description/Content), Table (+ Head/Body/Row/Cell), Dialog (+ Trigger/Content/Header/Footer), Skeleton, Sheet (mobile sidebar).

Estilados hacia MDS con clases `mds-*` donde aplica.

---

## 7. Sprints realizados

### Sprint 1 — MDS Foundation (2026-07-25)

**Qué hizo**

- Creó `src/lib/design-system/` (tokens, spacing, radius, shadows, typography, barrel).
- READMEs placeholder en `components/design-system/` y `components/layout-v2/`.
- Cero componentes visuales. Cero cambios de pantallas.

**Pendiente entonces**

- Cableado CSS/Tailwind, AppShell, playground.

**Aprendizajes / decisiones**

- Separar tokens TS de componentes UI.
- Alinear primary/secondary a hex ya usados en la app (`#36606F`, `#5B8FB9`).
- Shadows limitados a 3 niveles para evitar inflación.

### Sprint 2 — Semantic Theme (2026-07-25)

**Qué hizo**

- `themes.ts` + `css-variables.ts`.
- Vars `--mds-*` + aliases en `globals.css`.
- Tailwind `theme.extend.colors` semántico + namespace `mds`.
- Freeze visual shadcn; opt-in `data-mds-theme` / `data-theme`.

**Pendiente entonces**

- Activar tema MDS en `<html>` (adopción).
- Dark / High Contrast reales y testeados.

**Aprendizajes / decisiones**

- **Freeze > migración agresiva:** cambiar `--primary` global rompería shadcn existente.
- Namespace `mds-*` permite construir UI nueva sin esperar el cutover.
- Documentar `text-muted` vs `text-mds-muted` / `text-muted-foreground`.

### Sprint 3 — AppShell V2 Architecture (2026-07-25)

**Qué hizo**

- Arquitectura completa presentacional: AppShell, Sidebar*, Topbar*, Mobile*, Page*, LayoutProvider.
- Tipos de navegación sin lógica.
- Search/User menú como placeholders estructurales.
- Export barrel `@/components/layout-v2`.
- **No** montado en layouts/páginas.

**Pendiente entonces**

- Playground visual, comportamiento real de search/user, filtrado de nav por rol desde fuera.

**Aprendizajes / decisiones**

- Shell 100% presentacional evita acoplar rediseño a Auth/Supabase.
- `permissions` declarativos en items; evaluación fuera.
- `forceExpanded` + `showCollapseControl={false}` en mobile Sheet.
- Archivos < 200 líneas; composición.
- Context con `.Provider` (consistente con el resto del repo).

### Sprint 4 — AppShell Playground (2026-07-25)

**Qué hizo**

- Ruta `/dev/app-shell` (noindex, sin menú prod).
- Mocks en `layout-v2/demo/`.
- Contenido referencia: métricas, tabla, card lateral, botones, badges, skeleton, dialog.
- Overlay fullscreen para no contaminar con Navbar legacy.

**Pendiente entonces**

- Checklist visual formal desktop/tablet/mobile.
- Convertir playground en suite de regresión visual continua.
- Ocultar chrome legacy en `/dev/*` desde root layout (cuando se permita tocar layout).

**Aprendizajes / decisiones**

- Overlay es puente válido sin editar Navbar (restricción de sprint).
- Playground = **gate**: todo componente MDS nuevo se prueba aquí primero.
- Partir contenido demo en `DemoMetricGrid` / `DemoCatalogTable` / `DemoSidePanel`.

---

### Sprint 5 — MDS Components (2026-07-26)

**Qué hizo**

- Creó `src/components/mds/` como capa de componentes de producto encima de shadcn.
- Implementó Surface, Section, Page*, Text, Metric, EmptyState, Loading*, Status*.
- Stubs documentados para Button / Table / Form.
- Catálogo vivo `DemoMdsLibrary` en `/dev/app-shell`; `DemoMetricGrid` usa `Metric`.

**Pendiente entonces**

- Wrappers Button/Table/Form MDS.
- Auditoría visual formal del catálogo (desktop/móvil).
- Adopción en pantallas reales (fuera de este sprint).

**Aprendizajes / decisiones**

- MDS components ≠ layout-v2 Page*: shell vs contenido de producto.
- Info status = `mds-secondary` hasta existir token `info` (si se decide).
- Reutilizar Skeleton shadcn; no inventar loader paralelo.

### Sprint 6 — Foundation Components II (2026-07-26)

**Qué hizo**

- Button MDS canónico; Table composites; Form fields; Dialog layers; Notification (diseño); Toolbar; Search; List.
- Catálogo `DemoMdsFoundationII` en `/dev/app-shell`.
- README MDS con ejemplos de uso.

**Pendiente entonces**

- Primitives shadcn opcionales (Select/Checkbox Radix) si se quiere sustituir nativos.
- Integración real de toast (sonner) usando `ToastLayout`.
- Auditoría visual formal + adopción de pantallas.

**Aprendizajes / decisiones**

- Form: nativos MDS donde no hay ui shadcn, sin instalar deps.
- Button MDS = único botón en producto V2.
- Table = composición, no fork de shadcn Table.

### Sprint 7 — Vertical Slice Instalación app (2026-07-26)

**Qué hizo**

- Primera pantalla real en AppShell V2 + MDS: `/dashboard/instalacion-app`.
- Opt-in de chrome: `isV2ShellPath` + `V2AppShellBridge`.
- Nav tipada inyectada (`src/config/navigation/v2-install-status.ts`).
- `data-mds-theme="light"` solo en el subárbol V2.

**Pendiente entonces**

- Ampliar `V2_SHELL_PATHS` con más pantallas de bajo riesgo.
- Fuente de navegación canónica por rol (hoy: slice mínimo).
- User menu / Search reales.

**Aprendizajes / decisiones**

- Primera adopción = path allowlist, no route group `(v2)` todavía (menos churn de carpetas).
- Nav de negocio fuera de `layout-v2` (`src/config/navigation/`).
- No modificar Server Actions ni gates de la página migrada.

### Sprint 8 — V2 Adoption Infrastructure (2026-07-26)

**Qué hizo**

- Navigation registry (`shared` / `manager` / `staff` / `admin` / `registry`).
- V2 route registry (`src/config/v2`); `isV2ShellPath` delega.
- `MDSProvider`, `NavigationProvider`, `ShellProvider`.
- Helper `V2PageShell` (solo `variant` + user/breadcrumbs; nav automática).
- Refactor del slice 1 al nuevo patrón; eliminada config slice-específica.
- Auditoría documentada en `docs/redesign/SPRINT7_VERTICAL_SLICE_AUDIT.md`.

**Pendiente entonces**

- Segunda pantalla usando solo registry + `V2PageShell`.
- Ampliar nav manager/staff con cobertura real de módulos.

**Aprendizajes / decisiones**

- Fuente de verdad nav = `src/config/navigation/` (nunca el Bridge).
- Fuente de verdad rutas V2 = `src/config/v2/registry.ts`.
- Themes MDS encapsulados en `MDSProvider` (light ahora; dark/HC reservados).

### Sprint 9 — Migración `/dashboard/uso` (2026-07-26)

**Qué hizo**

- Segunda pantalla V2 con patrón Sprint 8 (registry + `V2PageShell` + MDS).
- Cero componentes MDS nuevos; infra sin fricción repetitiva.

**Pendiente entonces**

- `/dashboard/web` como siguiente slice natural de la misma familia.
- Ampliar nav manager más allá de herramientas de adopción/analytics.

**Aprendizajes / decisiones**

- Coste de migración bajó: trabajo = UI MDS, no arquitectura.
- Filtros multi-usuario con chips checkbox nativos + skin MDS (sin CheckboxField por densidad).

### Sprint 10 — Migración `/dashboard/web` (2026-07-26)

**Qué hizo**

- Tercera pantalla V2; suite analytics manager completa (uso + web + instalación).
- Cero MDS nuevos; mismo patrón Sprint 8–9.

**Pendiente entonces**

- Siguiente familia de pantallas fuera de analytics (p. ej. listados operativos de bajo riesgo).

**Aprendizajes**

- Coste por pantalla sigue bajando: registry + shell + composición MDS.
- `Alert` cubre loadError sin inventar banner ad hoc.
- `Metric` escala bien a 6 KPIs en grid responsive.

### Sprint 11 — Migración `/dashboard/insights` (2026-07-26)

**Qué hizo**

- Cuarta pantalla V2; rentabilidad manager (gráficos Recharts + KPIs financieros).
- Cero MDS nuevos; `ActionDialog` sustituye portal modal ad hoc; filtros con `DateField`/`Button`.

**Pendiente entonces**

- Siguiente slice fuera de analytics/insights (p. ej. listados operativos de bajo riesgo).

**Aprendizajes**

- Recharts sigue fuera del MDS: colores vía tokens CSS (`var(--mds-*)`); no hace falta primitiva Chart todavía.
- `Metric` + botón wrapper cubre KPIs clicables sin extender la API de Metric.
- Pantallas densas (charts + filtros) migran sin infra nueva; el coste es composición.

### Sprint 12 — `/dashboard/scanner` (2026-07-26)

**Qué hizo**

- Inventario Dashboard + migración de la candidata más simple con `DashboardDetailLayout`.
- Orden razonado: shell liviano antes que caja/horas/ventas.

**Pendiente entonces**

- Siguiente natural: `inventory/waste` o `inventory/ledger` (mismo layout legacy).

### Sprint 16 — Eliminación de `DashboardDetailLayout` (2026-07-27)

**Qué hizo**

- Migró los últimos 3 consumidores: albaranes, carta, recetas-tpv.
- Eliminó `src/components/dashboard/DashboardDetailLayout.tsx` (0 refs en `src/`).
- Cierra el shell Dashboard V1: nuevas migraciones solo con `V2PageShell`.

**Aprendizajes / decisiones**

- Clientes con `rightSlot` stateful (p. ej. albaranes) montan `PageHeader`/`PageActions` en el client y `V2PageShell` en el server page — sin reintroducir un layout wrapper.
- Borrar el layout solo cuando la búsqueda global en `src/` sea cero (docs históricas pueden mencionar el nombre).

---

## 8. Roadmap

Orden recomendado (dependencias de izquierda a derecha):

### Fase A — Consolidar sistema (corto plazo)

1. **Auditoría playground** en desktop / tablet / móvil (checklist escrito) — incluye catálogo MDS Sprint 5–6.
2. **Opcional:** primitives Radix Select/Checkbox/Switch en `ui/` + re-skin MDS Form (sustituir nativos).
3. **Documentar inventario** de pantallas a migrar (prioridad manager vs staff).

### Fase B — Adopción de shell (medio)

4. **Layout opt-in** — ✅ `src/config/v2` + `isV2ShellPath` + `V2PageShell` / `ShellProvider`.
5. **Fuente de navegación real** — ✅ seed registry (`manager`/`staff`/`admin`); ampliar cobertura.
6. **User menu / Search** con comportamiento real (aún sin ensuciar el shell con fetch: callbacks o slots).
7. Activar **`data-mds-theme="light"`** en el subárbol V2 — ✅ vía `MDSProvider`.

### Fase C — Migración de pantallas (largo)

8. Migrar pantallas de bajo riesgo (settings, listados simples) → PageContainer/Header.
9. Dashboards: reducir KPIs, aplicar filosofía “menos es más”.
10. Staff kiosco: touch targets, bottom affordances con `shrink-0`.
11. Retirar chrome legacy cuando cobertura sea suficiente.

### Fase D — Temas y accesibilidad

12. Dark theme real (contraste WCAG, no solo tokens placeholder).
13. High contrast.
14. Preferencias de usuario (sin localStorage hasta decidir persistencia).

### Dependencias críticas

| Trabajo | Depende de |
|---------|------------|
| Migrar una página a AppShell | Nav config + layout opt-in |
| Quitar Navbar | Rutas V2 cubriendo mismos flujos |
| Activar MDS en shadcn global | QA visual exhaustivo / freeze review |
| Dark mode | Tokens dark validados + playground |

### Fuera de roadmap de rediseño

- Reescrituras Hours Engine / Shadow / payroll
- Cambios de schema Supabase “porque el UI lo pide”
- Nuevas features de negocio camufladas como UI

---

## 9. Reglas para Cursor (IA)

Instrucciones **obligatorias** para cualquier agente que continúe `redesign-v2`:

### 9.1 Antes de codear

1. Leer este `REDESIGN_CONTEXT.md`.
2. Leer `PROJECT_STATUS.md` (estado global).
3. Activar skill `arquitecto-ui-kiosco` para UI; `db-supabase-master` solo si el usuario pide DB de verdad.
4. Confirmar que estás en rama/worktree **`redesign-v2`**.

### 9.2 Prohibiciones duras

- No modificar lógica de negocio, Supabase, Hours Engine, Server Actions de dominio.
- No tocar `Navbar`, `BottomNavWrapper`, `MainWrapper`, `app/layout.tsx` salvo sprint explícito de adopción.
- No eliminar archivos legacy “por limpieza” sin petición.
- No instalar dependencias sin necesidad clara.
- No estilos inline. No hex/rgb en componentes nuevos.
- No espaciados arbitrarios fuera de `spacing`.
- No añadir niveles de sombra más allá de sm/md/lg.
- No `any`. No TODO ornamentales.
- No evaluar permisos dentro del shell.
- No fetch/auth/Supabase dentro de `layout-v2`.
- No duplicar componentes que ya existen en MDS/shadcn — **componer**.
- No copiar pantallas del dashboard actual al playground.
- No integrar AppShell en producción sin sprint de adopción.

### 9.3 Obligaciones

- Usar tokens / utilidades `mds-*` o semánticas documentadas.
- Targets táctiles ≥ 48px.
- `cn()` para clases.
- `lucide-react` para iconos.
- Archivos preferiblemente &lt; 200 líneas.
- TypeScript estricto.
- Probar componentes nuevos en `/dev/app-shell` antes de usarlos en Marbella.
- Actualizar `PROJECT_STATUS.md` al completar features de rediseño.
- Actualizar **este** documento si cambian decisiones de arquitectura o filosofía.

### 9.4 Patrones preferidos

- Presentational components + props injection.
- Composition over boolean prop proliferation.
- LayoutProvider / context para estado de chrome.
- shadcn primitives + skin MDS.
- Route groups / opt-in layouts para adopción gradual.

### 9.5 Cómo hablar del trabajo

- Español (salvo que el usuario pida otro idioma).
- Directo, escéptico, viable en operación de bar.
- No preguntar “¿qué hago ahora?” — el siguiente paso está en Roadmap + `PROJECT_STATUS.md`.

---

## 10. Convenciones

### 10.1 Nombres

| Concepto | Convención |
|----------|------------|
| Design System | **MDS** (Marbella Design System) |
| Shell | **AppShell V2** / `layout-v2` |
| Tokens CSS MDS | `--mds-<token>` |
| Utilidad Tailwind MDS | `bg-mds-*`, `text-mds-*`, `border-mds-*` |
| Freeze shadcn | comentario `VISUAL FREEZE` en `globals.css` |
| Playground | `/dev/app-shell`, carpeta `demo/` |
| Variantes shell | `manager` \| `staff` \| `master` |

### 10.2 Organización

- Tokens en `lib/` (sin React).
- UI shell en `components/layout-v2/`.
- Docs de contrato en `components/design-system/README.md` + este archivo.
- Demo/mocks **nunca** importan Supabase.

### 10.3 Import público

```ts
import {
  AppShell,
  PageContainer,
  PageHeader,
  PageActions,
  useLayout,
  type NavigationGroup,
  type UserSummary,
} from '@/components/layout-v2'

import {
  Surface,
  Section,
  Metric,
  EmptyState,
  Status,
  PageHeader as MdsPageHeader,
  PageContent,
  LoadingBlock,
  Text,
} from '@/components/mds'

import { colors, spacing, themes } from '@/lib/design-system'
```

> **Nota:** `PageHeader` existe en layout-v2 (chrome) y en mds (contenido). Preferir alias (`MdsPageHeader`) si se importan ambos en el mismo archivo.

### 10.4 Patrones de estilo en JSX nuevo

```tsx
// Bien
<div className="rounded-xl border border-mds-border bg-mds-surface p-4 text-mds-foreground shadow-sm">
  <p className="text-mds-muted">Secundario</p>
  <button className="min-h-12 bg-mds-primary text-mds-primary-foreground">OK</button>
</div>

// Mal
<div style={{ background: '#36606F', padding: 13 }}>
```

### 10.5 Buenas prácticas

- Preferir `text-mds-muted` en UI MDS nueva.
- En shadcn legacy: `text-muted-foreground`.
- Botoneras inferiores: contenedor `shrink-0`.
- Listas largas: scroll en `main` del shell (`overflow-y-auto`).
- Mobile sheet: cerrar al navegar (`onNavigate={closeMobile}`).

### 10.6 Git / rama

- Commits de rediseño en `redesign-v2`.
- No force-push a `main`.
- PRs pequeños por sprint o por familia de componentes.
- No commitear `.env` ni secretos.

---

## 11. Decisiones abiertas

Pendientes de decisión explícita del producto/equipo:

1. **¿Cuándo activar `data-mds-theme="light"`** en producción (global vs route group)?
2. **Estrategia de retirada de Navbar/BottomNav** — big bang por rol vs pantalla a pantalla.
3. **Fuente canónica de navegación** — ¿archivo TS por rol, CMS, tabla Supabase, o derivado de permisos existentes?
4. **Search global** — ¿qué indexa? ¿solo rutas? ¿entidades?
5. **User menu** — perfil, logout, switch de sede/rol: ¿slots o rutas fijas?
6. **Persistencia de `sidebarCollapsed`** — ¿sessionStorage / localStorage / ninguna?
7. **Dark / High Contrast** — ¿prioridad accesibilidad o estética?
8. **¿El playground requiere auth?** Hoy hereda el root layout (puede exigir sesión según proxy).
9. **Tipografía de marca** — ¿seguir con Inter/Geist del root o tipografía display propia para MDS?
10. **¿`bg-marbella-shell` tiene sucesor MDS** o el fondo V2 es flat `mds-background`?
11. **Densidad staff vs manager** — ¿variantes tipográficas/spacing por `variant`?
12. **Librería de charts** — ¿mantener Recharts con skin MDS o rediseñar visualizaciones después?
13. **Convención de motion** — ¿solo CSS transitions cortas o librería (sin instalar hasta decidir)?
14. **Testing visual** — ¿Playwright screenshots del playground en CI?

---

## 12. Historial de decisiones importantes

| Fecha | Decisión | Por qué |
|-------|----------|---------|
| 2026-07-25 | Rama dedicada `redesign-v2` | Aislar UI del stream de lógica/SSOT en `main`. |
| 2026-07-25 | Solo presentación; no tocar negocio | El coste de regresiones laborales/caja es inaceptable. |
| 2026-07-25 | Crear MDS antes que pantallas | Evitar rediseñar 20 veces con hex sueltos. |
| 2026-07-25 | Primary `#36606F`, secondary `#5B8FB9` | Ya son identidad visual operativa; no inventar paleta paralela. |
| 2026-07-25 | Shadows solo 3 niveles | Evitar inflación de elevaciones. |
| 2026-07-25 | Spacing base 4 + touch 48 | Protocolo kiosco / accesibilidad táctil. |
| 2026-07-25 | CSS vars `--mds-*` + freeze shadcn | Construir futuro sin romper UI actual. |
| 2026-07-25 | No activar `data-mds-theme` aún | Cutover global es un sprint propio, no un side effect. |
| 2026-07-25 | AppShell presentacional sin Supabase | Testeable, reutilizable, sin acoplar auth. |
| 2026-07-25 | `permissions` declarativos no evaluados en shell | Separación de concerns; filtrado en capa de datos/nav config. |
| 2026-07-25 | Placeholders Search/User sin comportamiento | Arquitectura primero; comportamiento después. |
| 2026-07-25 | Breakpoint móvil `max-width: 1023px` (`lg`) | Alinea Tailwind `lg` con LayoutProvider. |
| 2026-07-25 | No montar AppShell en layouts prod | Adopción consciente; evita doble chrome accidental. |
| 2026-07-25 | Playground en `/dev/app-shell` | Laboratorio permanente; noindex. |
| 2026-07-25 | Overlay `fixed z-[100]` en playground | Cumple “no modificar Navbar” y permite ver solo V2. |
| 2026-07-25 | Demo data 100% mock | Playground usable offline de lógica/auth. |
| 2026-07-25 | Gate: componentes MDS → playground primero | Evita deuda visual en pantallas reales. |
| 2026-07-26 | Documento maestro `REDESIGN_CONTEXT.md` | Recuperar contexto completo en chats nuevos. |
| 2026-07-26 | Ampliación §§13–22 (identidad, visión, UX, lifecycle, glosario, decision framework, review, evolución) | Convertir el doc en gobierno de diseño a 1–2 años, sin borrar la fundación técnica. |
| 2026-07-26 | Capa `src/components/mds` encima de shadcn (Sprint 5) | Lenguaje de marca reutilizable sin reemplazar primitives ni tocar producción. |
| 2026-07-26 | Separar Page* layout-v2 vs Page* mds | Shell presentacional ≠ tipografía/estructura de contenido de producto. |
| 2026-07-26 | `Status.Info` → `mds-secondary` | No hay token `info`; secondary es el acento informativo de marca. |
| 2026-07-26 | Sprint 6: Button/Table/Form/Dialog/Notification/Toolbar/Search/List | Completar librería antes de migrar pantallas. |
| 2026-07-26 | Form fields nativos MDS (select/checkbox/switch/textarea) | No había primitives en `ui/`; cero deps nuevas; Input shadcn donde aplica. |
| 2026-07-26 | ToastLayout sin lógica de cola | Separar skin de infraestructura sonner hasta sprint de adopción. |
| 2026-07-26 | Primera ruta V2: `/dashboard/instalacion-app` | Vertical slice de bajo riesgo (lista+métricas, sin caja/horas). |
| 2026-07-26 | Opt-in por `isV2ShellPath` (no route group aún) | Ocultar Navbar/BottomNav solo en paths V2; menos churn que mover carpetas. |
| 2026-07-26 | Nav de producto en `src/config/navigation/` | Shell sigue presentacional; rutas de negocio inyectadas. |
| 2026-07-26 | Sprint 8: registries + MDSProvider + V2PageShell | Cada migración futura = registrar ruta + nav + MDS + helper. |
| 2026-07-26 | Bridge no recibe navigation arrays | Solo `variant`; `resolveNavigation` + pathname. |
| 2026-07-26 | Sprint 9: `/dashboard/uso` sin MDS nuevos | Valida que la infra reduce coste por pantalla. |
| 2026-07-26 | Sprint 10: `/dashboard/web` — 3ª migración, 0 MDS nuevos | Suite analytics V2 cerrada; patrón estabilizado. |
| 2026-07-26 | Sprint 11: `/dashboard/insights` — 4ª migración, 0 MDS nuevos | Charts + KPIs financieros sin infra nueva. |
| 2026-07-26 | Sprint 12: inventario Dashboard + `/dashboard/scanner` | Primera ruta operativa (no analytics) en V2. |
| 2026-07-27 | Sprint 16: eliminar `DashboardDetailLayout` | Fin shell Dashboard V1; migraciones nuevas = solo `V2PageShell` + registry + nav + MDS. |
| 2026-07-27 | Sprint 33: hub `/dashboard` + registry exact-only | Alta del hub raíz; `/dashboard` no usa matching por prefijo (evita contagiar rutas no registradas p. ej. kds). Dashboard producto 100% V2 excl. kds. |
| 2026-07-28 | Bottom nav V2 vive en `AppShell` (`StaffBottomNav`) | Paridad producción; `BottomNavWrapper` / `staff/layout` siguen null en V2 (sin duplicar). Safe-area en `MobileHeader`. |

### Decisiones implícitas (documentadas a posteriori)

- El rediseño es **premium hospitality**, no “admin template”.
- Staff y manager comparten sistema; difieren en densidad/chrome (`variant`), no en design language.
- shadcn es **infrastructure**, MDS es **brand language**.
- Legacy UI y MDS **conviven** meses si hace falta; no hay presión de feature flag global día 1.
- La calidad se mide en calma + legibilidad + touch, no en número de widgets.

---

## 13. Marbella Brand Identity

### 13.1 Qué debe sentir quien usa la app

Marbella no es solo una interfaz: es la cara digital del negocio. Cada pantalla debe transmitir, de forma acumulativa y silenciosa:

- **Calma operativa** — En un turno real hay ruido, prisas y fricción humana. La UI no debe sumar ansiedad. Fondos claros, ritmo visual lento, ausencia de gritos cromáticos.
- **Confianza** — Quien cierra caja, firma un albarán o liquida horas debe sentir que el sistema no le va a traicionar. Tipografía legible, estados inequívocos, confirmaciones sobrias.
- **Limpieza** — Superficies ordenadas, márgenes generosos, sin basura visual. Lo que no aporta a la tarea no aparece.
- **Rapidez percibida** — Respuesta inmediata al toque, jerarquía que permite encontrar lo importante en un vistazo, cero pasos de teatro.
- **Profesionalidad** — Acabado de producto serio. No “proyecto interno chapucero”; no “plantilla comprada”.
- **Precisión** — Números, horas, importes y estados con tratamiento tabular y semántica clara (éxito / aviso / peligro sin ambigüedad).
- **Calidad** — Detalles consistentes: mismos radios, mismos espaciados, mismos patrones de error y vacío.
- **Premium sin ostentación** — Sensación de software caro por contención y oficio, no por efectos.
- **Hecho a medida** — Debe oler a Bar La Marbella: hostelería real, roles reales (staff / manager / master), flujos reales del local. No genérico SaaS.

### 13.2 Qué nunca debe parecer

Si una captura de pantalla podría confundirse con cualquiera de estos arquetipos, el diseño ha fallado:

| Arquetipo a evitar | Por qué choca con Marbella |
|--------------------|----------------------------|
| ERP tradicional | Densidad gris, toolbars infinitas, miedo a dejar espacio vacío |
| Plantilla de panel de administración | Widgets genéricos, cards de colores, “look Bootstrap/Tailwind marketing” |
| Demo de librería de componentes | Galería de variantes sin tarea de negocio |
| Dashboard financiero de startup | 12 KPIs, sparklines decorativas, vanity metrics |
| Landing / web de marketing | Heroes, slogans, collage visual, CTAs de venta |
| IDE o herramienta solo-dev | Estética dark-for-engineers, densidad de power-user sin empatía de sala |

### 13.3 Identidad en una frase guía

> Marbella es el instrumento digital del local: sereno, exacto y digno de usarse con las manos durante un servicio.

Cualquier decisión de color, tipografía, copy o layout debe poder justificarse contra esa frase.

### 13.4 Voz de marca en la UI (complemento)

- Copy corto, en español operativo, sin jerga de producto tech.
- Etiquetas de acción con verbo concreto (“Cerrar caja”, no “Procesar”).
- Errores que digan qué falló y qué hacer, sin culpar al usuario.
- Evitar emojis decorativos en chrome de producto.
- Mayúsculas tracking solo en labels de sistema (ya tipificados en MDS), no en párrafos.

### 13.5 Relación con el color de marca

- Petróleo `#36606F` y azul `#5B8FB9` son **acento y herencia**, no wallpaper.
- El protagonismo visual lo llevan superficie blanca, texto zinc y jerarquía tipográfica.
- El “shell azul” legacy (`bg-marbella-shell`) no define el futuro MDS; la identidad V2 es más quieta.

---

## 14. Marbella Product Vision

### 14.1 Tesis

Marbella App aspira a ser el **sistema operativo del negocio**: el lugar donde el día a día del bar se dirige, se registra y se entiende. No es un álbum de pantallas ni un muro de KPIs. Es una herramienta de mando.

### 14.2 Qué significa “sistema operativo del negocio”

- Unifica operación (fichaje, caja, stock, carta, reservas, eventos, personal, costes) bajo un mismo lenguaje visual y de navegación.
- Reduce el coste cognitivo de cambiar de tarea: mismo shell, mismos patrones, mismos estados.
- Hace que la información crítica aparezca en el momento y el lugar donde se decide.
- Protege la verdad del negocio (SSOT laboral, cierres, precios) detrás de una UI que no miente ni oculta.

### 14.3 Producto ≠ Dashboard

Un dashboard es una vitrina. Marbella es un **puesto de trabajo**:

- Staff en sala/cocina con dedos y prisa.
- Manager cerrando, corrigiendo, planificando.
- Master auditando y dirigiendo.

El éxito no se mide en “bonito en Figma”, sino en **turno más fluido**, **menos errores**, **menos clics**, **menos segundos** por acción frecuente.

### 14.4 Economía del clic y del segundo

Toda decisión de diseño debe poder responder:

1. ¿Cuántos toques ahorra en un flujo diario (× veces/día × personas)?
2. ¿Cuánta duda elimina (relectura, confirmar dos veces, buscar el botón)?
3. ¿Qué error operativo evita (importe mal leído, fichaje ambiguo, filtro olvidado)?

Si no mejora la operación, es decoración. La decoración se corta.

### 14.5 Diseño al servicio de la productividad

- La estética premium existe para **acelerar confianza**, no para entretener.
- La consistencia existe para **transferir aprendizaje** entre módulos.
- El espacio vacío existe para **reducir fallos de toque y de lectura**.
- La adopción incremental existe para **no romper el negocio mientras se embellece**.

### 14.6 Norte a 24 meses

- Un solo AppShell V2 adoptado por roles.
- MDS como única lengua visual de producto nuevo.
- Playground como puerta de calidad.
- Pantallas legacy retiradas cuando su equivalente V2 cubra el mismo trabajo con menos fricción.
- Temas dark / high-contrast cuando aporten operación (turno noche, accesibilidad), no moda.

---

## 15. Design Principles

Principios de diseño que cualquier persona o IA debe aplicar **antes** de dibujar o codear. Están ordenados por prioridad de conflicto: si dos chocan, gana el de arriba.

### 15.1 Principios nucleares

1. **Restar antes que sumar** — Ante la duda, quita el elemento. Solo se añade lo que la tarea exige.
2. **Aplanar antes que ornar** — Resolver con tipografía, espacio y contraste; no con texturas, degradados ni adornos.
3. **Reutilizar antes que inventar** — Buscar en MDS / shadcn / layout-v2. Un patrón nuevo es deuda hasta probarse en playground.
4. **Componer antes que copiar** — Preferir piezas pequeñas ensambladas a clones con props booleanas eternas.
5. **Uniformar antes que expresar** — La creatividad individual cede ante el sistema. La marca se expresa en el sistema, no en excepciones.
6. **Leer antes que impresionar** — Legibilidad y contraste ganan a espectáculo.
7. **Contenido antes que marco** — El dato o la acción son el héroe; el chrome es sirviente.
8. **Respuesta antes que efecto** — Feedback inmediato > animación elaborada.
9. **Claridad antes que densidad** — Mejor menos filas bien entendidas que una matriz ilegible.
10. **Operación antes que novelty** — Si un patrón “moderno” empeora el turno, se descarta.

### 15.2 Principios de sistema

11. **Tokens antes que literales** — Color, espacio, radio, sombra y tipo salen del MDS.
12. **Semántica antes que hex** — `bg-mds-primary`, no `#36606F` en JSX.
13. **Un acento, muchos neutros** — El color de marca se usa con avaricia.
14. **Tres elevaciones, no treinta** — Solo `shadows.sm|md|lg`.
15. **Touch antes que mouse** — 48px mínimo; el escritorio se beneficia del mismo tamaño.
16. **Estados completos** — Toda vista contempla vacío, carga, error, éxito y deshabilitado.
17. **Una fuente de verdad visual** — Playground + este documento + tokens; no “estilo de la pantalla X”.

### 15.3 Anti-principios (prohibidos)

- “Por si acaso lo dejamos visible.”
- “En esta pantalla el color va distinto para destacar.”
- “Copio el dashboard viejo y le cambio el radius.”
- “Añado un KPI más; no molesta.”
- “Es solo un hex rápido.”

---

## 16. Visual Hierarchy

### 16.1 Cascada oficial

```
Página (Page)
  └─ Secciones (Sections)
       └─ Superficies (Surfaces / Cards / Panels)
            └─ Contenido (Content: texto, datos, tablas)
                 └─ Acciones (Actions: botones, icon-buttons, menús)
```

Cada nivel inferior **cuelga** del superior y no compite con él en peso visual.

### 16.2 Qué hace cada nivel

| Nivel | Responsabilidad | Señales visuales típicas |
|-------|-----------------|--------------------------|
| **Página** | Una tarea o dominio (“Playground”, “Historial”, “Caja”) | `PageHeader` (título + descripción), `PageContainer`, fondo `mds-background` |
| **Sección** | Agrupa un propósito dentro de la página | Espaciado vertical entre bloques; a veces label uppercase muted |
| **Superficie** | Contenedor táctil/visual del bloque | `mds-surface`, `border-mds-border`, `rounded-xl`, `shadow-sm` |
| **Contenido** | Información que se lee o selecciona | Tipografía title/body/label; tablas; listas |
| **Acción** | Lo que cambia estado o navega | Botones ≥ 48px; primarios escasos; destructivos inequívocos |

### 16.3 Por qué esta jerarquía

- Evita que un botón “grite” más que el título de página.
- Impide que cinco cards peleen al mismo nivel que el header.
- Obliga a decidir **qué es la tarea** antes de decorar.
- Escala de móvil a desktop: se reordenan secciones, no se inventa otra gramática.

### 16.4 Reglas de peso

1. Como máximo **un** acento primary fuerte por viewport principal (CTA dominante).
2. Los títulos de página superan en peso a títulos de card.
3. Los datos (importes, horas) pueden ser tipográficamente fuertes **dentro** de su superficie, sin robar el PageHeader.
4. Badges informan; no encabezan la página.
5. Iconos acompañan; no sustituyen la jerarquía tipográfica.

### 16.5 Cuándo se puede romper (excepciones controladas)

| Excepción | Condición | Ejemplo |
|-----------|-----------|---------|
| Acción fija inferior | Flujo táctil de captura (caja, pedido) | Barra `shrink-0` con CTA siempre visible |
| Alerta crítica a pantalla completa | Seguridad o pérdida de dinero inminente | Bloqueo de cierre con descuadre grave |
| Modo kiosco / KDS | Lectura a distancia en cocina | Tipografía mayor; sigue habiendo un solo foco |
| Wizard corto | Secuencia de 2–4 pasos | Stepper por encima del contenido, no 10 KPIs |

Toda excepción debe documentarse en el PR y, si se vuelve patrón, entrar en MDS — no quedarse como rareza local.

### 16.6 Cuándo NO se rompe nunca

- Para “hacerlo más divertido”.
- Para imitar un dashboard de plantilla.
- Para meter marketing dentro de operación.
- Para compensar falta de claridad con más color.

---

## 17. UX Principles

Reglas de experiencia (no inventario de componentes). Aplican a producto V2 y a cualquier pantalla que adopte MDS.

### 17.1 Navegación

- La navegación la **inyecta** la app; el shell no inventa rutas.
- Un ítem activo visible en todo momento (`isActive` / `aria-current`).
- Profundidad: breadcrumb en desktop; en móvil, título claro + volver explícito cuando haga falta.
- No esconder acciones críticas solo en menús overflow si son diarias.
- Badges de nav: solo conteos accionables, no adorno.

### 17.2 Tablas

- Columnas con propósito; ocultar o agrupar lo secundario en viewport estrecho.
- Alineación: texto a la izquierda, cantidades a la derecha, estados como badge semántico.
- Filas con altura táctil razonable; hover/selected sobrios (`muted-surface`).
- Cabeceras quietas; no competir con el PageHeader.
- Vacío de tabla = empty state de sección, no tabla “rota”.

### 17.3 Formularios

- Una pregunta dominante por paso cuando el flujo es largo; en formularios cortos, agrupar por afinidad.
- Labels visibles (no solo placeholder).
- Validación: preferir al enviar + errores junto al campo; no sorpresas solo en toast.
- Inputs ≥ 48px de alto en contextos touch.
- Nunca depender del color solo para error (texto + borde/ring).

### 17.4 Filtros

- Filtros frecuentes visibles; los raros, detrás de “Más filtros”.
- Estado de filtro activo siempre legible (chip o resumen).
- “Limpiar” explícito cuando hay filtros aplicados.
- No resetear filtros al re-renderizar sin intención del usuario.

### 17.5 Búsquedas

- Search del topbar es placeholder hasta tener alcance definido (rutas vs entidades).
- Placeholder de input: ejemplo de query, no instrucciones largas.
- Resultados: destacar coincidencia sin arcoíris.
- Sin resultados: empty state con sugerencia de ampliar criterio.

### 17.6 Acciones

- Verbo + objeto cuando hay ambigüedad (“Guardar cierre”, no “OK”).
- Primaria / secundaria / destructiva claramente distinguidas.
- Deshabilitar con motivo (tooltip o texto auxiliar), no botones muertos silenciosos.
- Agrupar acciones de página en `PageActions`; no repartir CTAs idénticos en tres sitios.

### 17.7 Botones

- Un primary por zona de decisión.
- Outline/ghost para secundarias.
- Destructive solo para irreversible o peligroso.
- Icono opcional; no icon-only sin `aria-label`.
- Estados: default, hover, active, disabled, loading (spinner o texto “Guardando…”).

### 17.8 Modales (Dialog)

- Para decisiones focales o formularios cortos que bloquean el fondo.
- Título = qué se decide; descripción = consecuencia.
- Esc y botón cancelar siempre disponibles salvo flujo crítico justificado.
- No anidar modal dentro de modal.
- No usar modal para navegación principal.

### 17.9 Sheets

- Preferente en móvil para navegación lateral y paneles contextuales.
- Deslizable / cerrable; en AppShell, cerrar al navegar.
- No sustituir una página completa con un sheet eterno en desktop (usar panel o ruta).

### 17.10 Empty states

- Explicar por qué está vacío + una acción siguiente si existe.
- Sin ilustraciones ruidosas; tipografía y un CTA bastan.
- Distinguir “sin datos aún” de “filtro sin resultados”.

### 17.11 Loading

- Skeleton que imite la forma del contenido final (evitar layout shift).
- No bloquear el shell entero si solo carga una sección.
- Timeouts y fallos visibles (anti silent failure del protocolo).

### 17.12 Errores

- Mensaje humano + código/detalle técnico solo si aporta a soporte.
- Toast para errores no bloqueantes; banner/inline para bloqueantes de sección.
- Nunca tragar errores de datos vitales con `if (!data) return`.

### 17.13 Confirmaciones

- Confirmar solo lo irreversible o costoso (borrar, cerrar con descuadre, pagar).
- El botón peligroso no es el default focus si hay alternativa segura.
- Texto de confirmación incluye el objeto concreto (“¿Eliminar albarán #123?”).

### 17.14 Responsive

- Mobile first en estructura; desktop enriquece (sidebar, breadcrumbs, más columnas).
- Breakpoint shell: `lg` (1024px) alineado con `LayoutProvider`.
- No ocultar la única acción crítica solo en “hover de desktop”.

### 17.15 Mobile / kiosco / staff

- Dedo gordo: 48px, zonas inferiores `shrink-0`.
- Evitar gestos exclusivos sin alternativa botón.
- Alto contraste; poco texto microscópico.
- Safe areas respetadas (el legacy ya tiene utilidades; V2 no debe romperlas al adoptar).

### 17.16 Desktop / manager / master

- Aprovechar ancho con grid de secciones, no con más ruido.
- Atajos (`shortcut` en nav) son ayuda, no requisito.
- Densidad algo mayor permitida, nunca a costa de legibilidad de importes/horas.

---

## 18. Component Lifecycle

Ciclo de vida **oficial** de cualquier pieza visual nueva del rediseño. Saltar fases = deuda.

```
Idea → Diseño → Implementación → Playground → Review → Producción → Documentación
```

### 18.1 Idea

- ¿Qué tarea de negocio desbloquea?
- ¿Existe ya en shadcn / layout-v2 / pantallas legacy algo reusable?
- ¿Es primitive, composite o feature? (ver Glosario)
- Descartar si solo “queda bonito”.

### 18.2 Diseño

- Encajar en jerarquía visual (§16) y principios (§15).
- Definir estados: empty, loading, error, disabled, success.
- Touch y responsive esbozados, no solo desktop.
- Tokens MDS: qué colores/espacios/radios usa — **ningún hex suelto**.

### 18.3 Implementación

- TypeScript estricto; sin `any`.
- Composición; archivos preferiblemente &lt; 200 líneas.
- Solo presentación si vive en `layout-v2` / MDS; datos por props.
- `cn()`, lucide, sin inline styles.

### 18.4 Playground

- Montar o ilustrar en `/dev/app-shell` (o sección demo dedicada).
- Verificar desktop + móvil (sidebar → sheet).
- Gate obligatorio antes de producción (§7 Sprint 4).

### 18.5 Review

- Pasar **Design Review Checklist** (§21) y Apéndice B.
- Segunda mirada: ¿se puede quitar algo?
- Comprobar que no rompe freeze visual legacy fuera del alcance.

### 18.6 Producción

- Adoptar en una ruta/feature concreta vía sprint de adopción.
- No cablear en `app/layout.tsx` / Navbar sin decisión explícita.
- Monitorizar fricción real (clics, errores, quejas de turno).

### 18.7 Documentación

- Si introduce patrón nuevo → actualizar `REDESIGN_CONTEXT.md` y README MDS/layout-v2.
- Si cierra decisión abierta (§11) → mover a historial (§12).
- `PROJECT_STATUS.md` con el entregable.

### 18.8 Deprecación (fase implícita)

- Marcar legacy al retirar.
- No mantener dos botones “oficiales” indefinidamente.
- El playground conserva el patrón vigente, no el cementerio.

---

## 19. Glossary

Léxico compartido. Usar estos términos en PRs, chats y código para evitar confusión.

| Término | Definición en Marbella |
|---------|------------------------|
| **MDS** | Marbella Design System: tokens, temas y reglas visuales de marca. |
| **Token** | Valor de diseño nombrado (color, espacio, radio, sombra, tipo). Fuente: `src/lib/design-system/`. |
| **Theme** | Mapa semántico de tokens para un modo (`light`, `dark`, `high-contrast`). |
| **CSS variable** | Custom property en runtime (`--mds-primary`, `--background`, …). |
| **Freeze visual** | Política de no alterar vars shadcn activas hasta adopción consciente. |
| **Shell / AppShell** | Chrome de aplicación: sidebar, topbar, mobile header/sheet, contenedor de `main`. |
| **Layout** | Estructura de regiones (legacy `MainWrapper`/`Navbar` o V2 `layout-v2`). |
| **Page** | Unidad de ruta con una tarea principal; usa `PageContainer` + `PageHeader` en V2. |
| **View** | Composición client/server que realiza la página (a menudo `*View.tsx` en legacy). |
| **Section** | Bloque temático dentro de una page (métricas, tabla, lateral). |
| **Surface** | Superficie elevada/contenedora (`mds-surface` + borde/radio/sombra). Card y panel son surfaces. |
| **Panel** | Surface lateral o auxiliar (p. ej. “Cola del día”), no la escena principal. |
| **Container** | Limitador de ancho/padding (`PageContainer`); no aporta elevación por sí solo. |
| **Module** | Área de negocio (Caja, Stock, Personal…). Independiente del layout visual. |
| **Primitive** | Pieza UI mínima (button, input, badge) — habitualmente shadcn/Radix. |
| **Composite** | Composición de primitives (PageHeader, SidebarItem, Dialog de confirmación). |
| **Widget** | Bloque semi-autónomo de UI con propósito acotado (metric card). Usar con parquedad. |
| **Feature** | Capacidad de producto end-to-end (incluye datos + UI). El rediseño no inventa features de negocio. |
| **Action** | Interacción que muta estado o navega (botón, item de menú, submit). |
| **State** | Condición de UI/datos: idle, loading, error, success, disabled, selected. |
| **Empty state** | UI cuando no hay datos que mostrar (aún o por filtro). |
| **Placeholder** | Contenido provisional en controles (search/user menu sin comportamiento; texto de input). |
| **Skeleton** | Placeholder de carga que imita geometría del contenido. |
| **Loading** | Fase de espera; incluye skeleton, spinners de botón, suspense de sección. |
| **NavigationGroup / Section / Item** | Modelo de menú del AppShell (ver `navigation.ts`). |
| **Variant (shell)** | `manager` \| `staff` \| `master` — matiz de chrome/densidad, no otro design system. |
| **Playground** | `/dev/app-shell` — laboratorio visual obligatorio. |
| **Adoption / Adopción** | Cablear V2/MDS en rutas reales sin romper legacy. |
| **Legacy** | UI anterior al rediseño (Navbar, BottomNav, hex sueltos, dashboards densos). |
| **Presentational** | Componente sin fetch/auth/Supabase; solo props → UI. |
| **SSOT** | Single Source of Truth de negocio (p. ej. Hours Engine); el diseño no la redefine. |

---

## 20. Decision Framework

Cuando existen **varias opciones técnicamente válidas**, no se elige por gusto. Se aplica este marco.

### 20.1 Preguntas filtro (en orden)

1. **¿Rompe lógica de negocio, RLS o SSOT?** → Descartada.
2. **¿Rompe el freeze visual o layouts legacy fuera de alcance?** → Descartada o aparcada a sprint de adopción.
3. **¿Se puede resolver reutilizando MDS/shadcn/layout-v2?** → Preferir reutilizar.
4. **¿Reduce clics/segundos/errores en un flujo real?** → Preferir la que más reduzca.
5. **¿Aumenta consistencia global?** → Preferir consistencia frente a one-off brillante.
6. **¿Es más simple de mantener en 12 meses?** → Preferir simplicidad.
7. **¿Mejora rendimiento percibido (menos JS, menos layout shift)?** → Desempate a favor.
8. **¿Mejora accesibilidad / touch?** → Desempate a favor.

### 20.2 Pesos cuando hay empate

Prioridad descendente:

1. Simplicidad  
2. Consistencia con MDS  
3. Mantenibilidad  
4. Reutilización  
5. Rendimiento  
6. Pulido UX (microinteracciones, copy)  

La “creatividad visual” **no** entra en la lista de desempate salvo que el Product Owner la pida explícitamente y pase playground + review.

### 20.3 Cómo documentar la decisión

En el PR o en §12 de este documento:

- Opciones consideradas (A/B).
- Criterio que ganó (§20.1–20.2).
- Qué se deja fuera y por qué.
- Si abre una decisión (§11) o la cierra.

### 20.4 Anti-patrones de decisión

- Elegir la opción que “queda mejor en un screenshot suelto”.
- Añadir dependencia npm para un problema de 20 líneas.
- Copiar un patrón de Linear/Stripe que choque con touch hospitality.
- “Lo dejamos los dos un tiempo” sin fecha de deprecación.

---

## 21. Design Review Checklist

Checklist para **cualquier pantalla o componente** antes de darla por terminada. Úsala en PR review junto al Apéndice B.

### 21.1 Jerarquía y contenido

- [ ] La página tiene **una** tarea dominante evidente en el primer viewport
- [ ] Se respeta la cascada Página → Sección → Superficie → Contenido → Acción (§16)
- [ ] No hay más de un CTA primary compitiendo
- [ ] Se ha intentado **quitar** algo antes de mergear

### 21.2 MDS y consistencia

- [ ] Sin hex/rgb/inline styles en UI nueva
- [ ] Espaciado en escala ×4; radios y sombras del sistema
- [ ] Semántica de color correcta (success/warning/danger/muted)
- [ ] No reintroduce anti-patrones del §4
- [ ] Coherente con otras superficies V2 (no “isla estilística”)

### 21.3 Espaciado y tipografía

- [ ] Márgenes/paddings respiran; no hay zonas aplastadas
- [ ] Tipografía legible; labels no compiten con títulos
- [ ] Importes/horas con `tabular-nums` cuando aplica
- [ ] ZERO-DISPLAY respetado en lecturas de negocio (si aplica)

### 21.4 Touch y responsive

- [ ] Interactivos ≥ 48px
- [ ] Botoneras con `shrink-0`; contenido scrollable sin colapsar controles
- [ ] Probado mentalmente o en dispositivo: móvil y `lg+`
- [ ] Sidebar desktop / sheet móvil coherentes si usa AppShell

### 21.5 Estados

- [ ] Empty / Loading (skeleton) / Error / Success / Disabled contemplados
- [ ] Errores no silenciosos
- [ ] Confirmación solo si es irreversible o costosa

### 21.6 Accesibilidad

- [ ] Contraste suficiente en texto e iconos significativos
- [ ] `aria-label` en icon-only
- [ ] Foco visible; no atrapar teclado en modales rotos
- [ ] No información solo por color

### 21.7 Performance percibida

- [ ] Sin layout shift grosero al cargar
- [ ] Sin dependencias nuevas injustificadas
- [ ] Listas largas: scroll contenido, no re-render del shell completo

### 21.8 Arquitectura y reuso

- [ ] No duplica un composite existente
- [ ] Presentational donde corresponde; datos inyectados
- [ ] Archivos con tamaño razonable / compuestos
- [ ] Probado o documentado en **Playground**

### 21.9 Gobernanza

- [ ] Encaja en Product Vision (§14) y Brand Identity (§13)
- [ ] Decisiones no triviales anotadas (§20 / §12)
- [ ] `PROJECT_STATUS.md` y, si aplica, este documento actualizados

---

## 22. Future Evolution

Cómo debe crecer el Design System y el rediseño en los próximos meses **sin perder el alma**.

### 22.1 Qué puede (y debe) crecer

| Área | Evolución esperada |
|------|-------------------|
| **Primitives skin** | Wrappers MDS sobre shadcn (button, input, toast) cuando el freeze se levante por zona |
| **Composites de producto** | Page headers especializados, metric strip sobria, tablas de hostelería, empty states |
| **Nav config** | Fuente tipada por rol; badges reales; atajos |
| **Temas** | Dark y high-contrast validados en playground → adopción opt-in |
| **Motion** | Transiciones cortas tipificadas (durations tokens), sin librería hasta necesidad |
| **Documentación** | Este archivo + ejemplos vivos en `/dev/app-shell` |
| **Adopción** | Route groups `(v2)`, retirada gradual de Navbar/BottomNav |
| **Calidad** | Checklist §21 en CI cultural; posible screenshot testing del playground |

### 22.2 Qué debe permanecer estable

- Escala de spacing base 4 y mínimo táctil 48
- Límite de sombras sm/md/lg
- Tokens semánticos core: background, surface, foreground, border, primary, muted, success, warning, danger
- AppShell **presentational** (sin Supabase dentro)
- Playground como gate
- Freeze controlado: no cambiar vars globales “de pasada”
- Separación lógica de negocio ↔ presentación
- Rama/worktree `redesign-v2` como hogar del esfuerzo hasta fusión planificada

### 22.3 Qué nunca debería romperse

1. **La calma de marca** — si una evolución vuelve la UI ruidosa, se revierte.
2. **La verdad operativa** — el diseño no puede falsear horas, caja, stock o permisos.
3. **La compatibilidad durante la convivencia** — legacy y V2 pueden coexistir; no sabotear el turno.
4. **El contrato de tokens** — renombrar `--mds-*` a la ligera es un breaking change documentado.
5. **Touch first** — ninguna “densidad desktop” por debajo de 48px en controles primarios de staff.
6. **Un solo idioma visual** — no nacer un “MDS 2” paralelo; evolucionar el actual.
7. **Este documento como memoria** — decisiones grandes se escriben aquí, no solo en chats.

### 22.4 Señales de que el sistema está enfermo

- Hex nuevos fuera de tokens
- Tercer botón primary en la misma vista
- Playground desactualizado respecto a producción V2
- Dos sidebars “oficiales”
- Features de negocio escondidas en PRs de “solo UI”
- Dark mode activado sin pasar por playground ni contraste

### 22.5 Cadencia sugerida

- **Cada PR de UI:** §21 + Apéndice B  
- **Cada sprint de rediseño:** actualizar §7/§8/§12  
- **Cada trimestre:** revisar §11 (abiertas), §22 (evolución), y podar anti-patrones nuevos  
- **Antes de fusionar a main a gran escala:** auditoría de freeze, nav real, y retirada de chrome legacy

---

## Apéndice A — Cómo arrancar un chat de rediseño

```
Lee REDESIGN_CONTEXT.md y úsalo como contexto.
Estamos en redesign-v2.
Objetivo de este chat: <tarea concreta>.
No tocar lógica de negocio ni layouts legacy salvo que lo pida.
```

Verificar worktree/rama:

```bash
git branch --show-current   # debe ser redesign-v2
git worktree list
```

Playground:

```
http://localhost:<port>/dev/app-shell
```

---

## Apéndice B — Checklist de PR de rediseño

- [ ] Solo toca presentación / MDS / layout-v2 / demo (salvo adopción explícita)
- [ ] Sin hex nuevos fuera de `tokens.ts` / `themes.ts` / sync en `globals.css`
- [ ] Sin estilos inline
- [ ] Touch ≥ 48px en controles nuevos
- [ ] Probado o ilustrado en `/dev/app-shell`
- [ ] Archivos razonablemente pequeños / compuestos
- [ ] `PROJECT_STATUS.md` actualizado
- [ ] Si cambia arquitectura o filosofía → actualizar `REDESIGN_CONTEXT.md`
- [ ] Pasado el **Design Review Checklist** completo (§21) cuando el PR introduce UI visible
- [ ] Decisiones no triviales anotadas con el **Decision Framework** (§20) o en §12
- [ ] Vocabulario alineado al **Glossary** (§19)

---

## Apéndice C — Enlaces internos útiles

| Recurso | Ruta |
|---------|------|
| Este documento | `REDESIGN_CONTEXT.md` |
| Estado operativo | `PROJECT_STATUS.md` |
| Contrato MDS | `src/components/design-system/README.md` |
| Componentes MDS | `src/components/mds/` (`@/components/mds`) |
| Adopción V2 | `V2PageShell` + `src/config/v2` + `src/config/navigation` |
| Auditoría slice 1 | `docs/redesign/SPRINT7_VERTICAL_SLICE_AUDIT.md` |
| Contrato layout-v2 | `src/components/layout-v2/README.md` |
| Tokens | `src/lib/design-system/` |
| Playground | `src/app/dev/app-shell/page.tsx` |
| Protocolo AI | `.cursor/rules/BAR-LA-MARBELLA-AI-OPERATING-PROTOCOL.mdc` |
| Identidad / Visión / UX | Este documento §§13–17 |
| Lifecycle / Glosario / Review | Este documento §§18–21 |
| Evolución del sistema | Este documento §22 |

---

*Fin del documento maestro. Mantenerlo vivo: toda decisión nueva de rediseño debe reflejarse aquí. Las secciones 1–12 conservan la fundación técnica de los sprints; las 13–22 gobiernan identidad, producto, UX y evolución a largo plazo.*
