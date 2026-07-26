# layout-v2

**AppShell V2** del rediseño Marbella. Presentacional. Adopción opt-in por ruta.

## Adopción V2 (Sprint 8)

Migrar una pantalla:

1. **Registrar la ruta** en `src/config/v2/registry.ts`
2. **Añadir/ajustar nav** en `src/config/navigation/{manager|staff|admin}.ts`
3. **Sustituir UI** legacy por `@/components/mds`
4. **Envolver** con el helper (lógica intacta):

```tsx
import { V2PageShell } from '@/components/layout-v2'

export default async function Page() {
  // auth / fetch / gates — sin cambios
  return (
    <V2PageShell variant="manager" user={userSummary} breadcrumbs={crumbs}>
      <MyClientView />
    </V2PageShell>
  )
}
```

`V2PageShell` resuelve la navegación vía registry (`variant` + `usePathname`).  
No pasar arrays de rutas al Bridge.

Chrome legacy se oculta solo si la ruta está en el registro V2 (`isV2ShellPath` → `src/config/v2`).

### Providers

| Provider | Rol |
|----------|-----|
| `MDSProvider` | `data-mds-theme` / futuros themes |
| `NavigationProvider` | Nav resuelta en contexto |
| `ShellProvider` | Compone MDS + Nav + AppShell + PageContainer |
| `LayoutProvider` | Estado chrome (sidebar / mobile) — interno a AppShell |

## Playground

[`/dev/app-shell`](/dev/app-shell) — laboratorio visual (overlay; no usa el registro de prod).

## Import

```ts
import { V2PageShell, AppShell, PageContainer } from '@/components/layout-v2'
import { resolveNavigation } from '@/config/navigation'
```

## Estructura

```
layout-v2/
  app-shell.tsx
  v2-page-shell.tsx      # helper de migración
  providers/
    layout-provider.tsx
    mds-provider.tsx
    navigation-provider.tsx
    shell-provider.tsx
  sidebar/ topbar/ mobile/ page/ demo/
```

## Config externa

```
src/config/navigation/   # shared, manager, staff, admin, registry
src/config/v2/           # route registry
src/lib/v2-shell-path.ts # thin helper → config/v2
```

## Reglas

- Sin Supabase / auth / fetch en el shell.
- Nav de negocio solo en `src/config/navigation/`.
- Rutas V2 solo en `src/config/v2/registry.ts`.
- Compatibilidad legacy: paths no registradas siguen con Navbar/BottomNav.
