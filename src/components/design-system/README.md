# Marbella Design System (MDS)

## Propósito

Fundación visual del rediseño de Bar La Marbella. Tokens TypeScript + tema semántico CSS/Tailwind + **componentes** en `src/components/mds/` (Sprint 5+).

La UI actual (Navbar, MainWrapper, pantallas) **no** activa aún la paleta MDS. Convivencia sin ruptura visual.

## Componentes UI

Importar desde `@/components/mds`. Ver `src/components/mds/README.md`.

- Capa **encima** de shadcn (nunca un reemplazo).
- Gate visual: `/dev/app-shell` → sección «Librería MDS».
- shadcn sigue en `@/components/ui/*`.

## Principios

1. **Una sola fuente de verdad** — Hex en `src/lib/design-system/tokens.ts` / `themes.ts`.
2. **Cero invención en componentes** — Sin `#hex`, `rgb` ni espaciados arbitrarios.
3. **Touch first** — Targets ≥ 48px (`spacing[12]`).
4. **Hospitality Apple HIG** — Fondos claros, alto contraste, Bento.
5. **Compatibilidad** — Adopción incremental. shadcn sigue usando vars legacy congeladas.

---

## Sprint 2 — Semantic Theme

### Dónde viven las variables

| Capa | Ubicación | Rol |
|------|-----------|-----|
| Tokens hex | `src/lib/design-system/tokens.ts` | Fuente de verdad de color |
| Temas (light / dark / high-contrast) | `src/lib/design-system/themes.ts` | Contrato semántico por tema |
| Nombres CSS | `src/lib/design-system/css-variables.ts` | Mapa `--mds-*` |
| Variables en runtime | `src/app/globals.css` (`:root`, `[data-theme]`, `[data-mds-theme]`) | Valores CSS aplicados |
| Utilidades Tailwind | `tailwind.config.ts` → `theme.extend.colors` | `bg-surface`, `text-mds-muted`, … |

### Variables MDS (`--mds-*`)

Siempre presentes en `:root` (Light por defecto):

- `--mds-background`, `--mds-surface`, `--mds-foreground`, `--mds-border`
- `--mds-primary`, `--mds-primary-foreground`
- `--mds-secondary`, `--mds-secondary-foreground`
- `--mds-muted` (texto), `--mds-muted-surface` (fondo atenuado)
- `--mds-success`, `--mds-warning`, `--mds-danger`

Aliases públicos (nuevos, sin romper legacy):

- `--surface`, `--success`, `--warning`, `--danger`

### Freeze visual (importante)

Las variables shadcn activas (`--background`, `--primary`, `--muted`, …) **mantienen los valores oklch anteriores**. Así Button, Badge, body `@apply`, etc. no cambian de aspecto.

Para enlazar shadcn → MDS en el futuro (sin hacerlo aún):

```html
<html data-mds-theme="light">
```

Temas reservados (infra lista, no cableados a la app):

- `[data-theme="dark"]`
- `[data-theme="high-contrast"]`

### Cómo añadir un nuevo color

1. Añadir el hex en `tokens.ts` (y en `SemanticThemeColors` + los 3 temas en `themes.ts`).
2. Añadir el nombre en `cssVariableNames` (`css-variables.ts`).
3. Declarar `--mds-<nombre>` en `globals.css` (`:root` + bloques `data-theme` si aplica).
4. Exponer en `tailwind.config.ts` bajo `colors` y/o `colors.mds`.
5. Usar solo la utilidad semántica (`bg-<nombre>` / `text-mds-<nombre>`), nunca el hex.

### Cómo usar en componentes nuevos (MDS)

Preferir la paleta MDS explícita (no depende del freeze):

```tsx
<div className="rounded-xl border border-mds-border bg-mds-surface text-mds-foreground shadow-sm">
  <p className="text-mds-muted">Texto secundario</p>
  <button className="min-h-12 bg-mds-primary text-mds-primary-foreground">
    Acción
  </button>
  <span className="text-mds-success">OK</span>
</div>
```

Utilidades semánticas ya disponibles sin opt-in:

| Utilidad | Variable |
|----------|----------|
| `bg-surface` / `text-…` | `--surface` |
| `bg-success` / `text-success` | `--success` |
| `bg-warning` / `text-warning` | `--warning` |
| `bg-danger` / `text-danger` | `--danger` |
| `bg-mds-*` / `text-mds-*` | `--mds-*` |

Compat shadcn (valores legacy hasta adopción):

| Utilidad | Notas |
|----------|--------|
| `bg-background` `text-foreground` | Vars shadcn congeladas |
| `bg-primary` `text-primary-foreground` | Idem |
| `bg-muted` | Superficie atenuada |
| `text-muted-foreground` | Texto secundario shadcn (usar esto, no `text-muted`) |
| `border-border` | Borde shadcn |
| `bg-destructive` | Peligro shadcn; MDS usa `danger` |

**Texto atenuado:** usar `text-muted-foreground` (shadcn) o `text-mds-muted` (MDS). Evitar `text-muted` solo: en Tailwind apunta al DEFAULT de `muted` (superficie).

### Tokens TS

```ts
import {
  colors,
  themes,
  cssVariableNames,
  themeToCssVariables,
} from '@/lib/design-system'
```

## Qué no hacer

- Cambiar valores del bloque «VISUAL FREEZE» en `globals.css` sin sprint de adopción.
- Hardcodear colores en JSX de componentes MDS.
- Activar `data-mds-theme` / `data-theme` en layouts legacy sin decisión explícita.
- Modificar Navbar, MainWrapper o pantallas existentes desde este directorio.
