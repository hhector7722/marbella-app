# layout-v2

Nuevo **AppShell V2** del rediseño Marbella. Presentacional y aislado de la UI de producción.

## Playground (Sprint 4)

Referencia visual: [`/dev/app-shell`](/dev/app-shell)

- Datos mock en `demo/` (navegación, usuario, breadcrumbs, métricas)
- No aparece en menús de producción
- Overlay a pantalla completa para no mezclar con Navbar/BottomNav legacy
- Probar aquí cada componente MDS nuevo antes de usarlo en Marbella

## Import

```ts
import { AppShell, PageContainer, PageHeader } from '@/components/layout-v2'
```

## Estructura

```
layout-v2/
  app-shell.tsx
  index.ts
  demo/        fixtures + playground content
  sidebar/     navigation types + Sidebar*
  topbar/      Breadcrumbs, SearchButton, UserMenu
  mobile/      MobileHeader, MobileSidebar (Sheet)
  page/        PageContainer, PageHeader, PageActions
  providers/   LayoutProvider
```

## Reglas

- Sin Supabase, auth ni fetch en el shell ni en el playground.
- Navegación inyectada por props (sin rutas de negocio hardcodeadas en el shell).
- Estilos MDS (`bg-mds-*`) + shadcn.
- No cablear en layouts de producción hasta el sprint de adopción.
