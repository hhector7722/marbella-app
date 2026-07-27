# V2 Architecture Audit — Sprint 17

**Fecha:** 2026-07-27  
**Rama:** `redesign-v2`  
**Alcance:** Auditoría post-eliminación de `DashboardDetailLayout`. Sin migraciones de pantallas. Sin componentes MDS nuevos.

---

## 1. Estado actual

### Veredicto

La infraestructura de adopción V2 está **lista para soportar el resto del proyecto** sin volver a tocar el Design System ni inventar wrappers de shell.

| Capa | Estado |
|------|--------|
| Shell producto | `V2PageShell` → `ShellProvider` → `AppShell` |
| Registro de rutas | `src/config/v2/registry.ts` + `isV2ShellPath` |
| Navegación | `src/config/navigation/*` + `resolveNavigation` |
| MDS | 16 familias en `src/components/mds` |
| Chrome legacy | Navbar / BottomNav / padding ocultos vía `isV2ShellPath` |
| Layout Dashboard V1 | **Eliminado** (`DashboardDetailLayout` = 0 refs en `src/`) |

### Fortalezas

1. **Patrón de migración estable y corto:** registrar ruta → nav → `V2PageShell` → MDS. Validado en 14 pantallas Dashboard sin infra nueva desde Sprint 8.
2. **Separación clara:** `layout-v2` = chrome; `mds` = contenido de producto; `config/v2` + `config/navigation` = fuente de verdad.
3. **Opt-in por path:** legacy y V2 conviven sin route groups.
4. **Nav anidada correcta:** `isNavItemActive` cede a href más específico (Inventory / Eventos).
5. **MDS reutilizado de verdad:** PageHeader / Button lideran adopción; 0 componentes MDS nuevos en Sprints 9–16.

### Riesgos

1. **Doble chrome en rutas no migradas:** Navbar + BottomNav legacy siguen vivos; riesgo de inconsistencia UX hasta completar Dashboard.
2. **Hex `#36606F` residual** en pantallas V2 parcialmente migradas (clients de `carta`, `recetas-tpv`) y densamente en legacy (history, ventas, labor…).
3. **`NavigationProvider` sin consumidores del hook:** la nav se pasa por props a `AppShell`; el context está montado pero `useShellNavigation` no se usa en producción.
4. **Homónimos Page\*:** `layout-v2/PageHeader` vs `mds/PageHeader` — playground usa layout-v2; producto migrado usa MDS. Confusión posible para agentes.
5. **Registry con entradas redundantes:** `/dashboard/inventory/waste|ledger` ya cubiertas por prefijo `/dashboard/inventory`; documentadas a propósito, no rotas.
6. **Variantes `staff` / `master` / `admin` en route registry vacías** mientras nav admin/staff ya tienen placeholders — asimetría esperable, no bloqueante.

---

## 2. Legacy Audit

### Búsqueda `DashboardDetailLayout`

| Ámbito | Resultado |
|--------|-----------|
| `src/` | **0 referencias** (archivo eliminado en Sprint 16) |
| Docs / `PROJECT_STATUS` / `REDESIGN_CONTEXT` | Menciones históricas (correcto conservar) |

### Otros hallazgos V1 / deuda visual

| Elemento | Consumidores | Acción Sprint 17 |
|----------|--------------|------------------|
| `DashboardDetailLayout` | 0 | Ya eliminado (Sprint 16) |
| `V2AppShellBridge` (alias deprecated) | **0** (solo export) | **Eliminado** en este sprint |
| `AppInstallStatusClient` | `/dashboard/instalacion-app` | Conservar (producto V2) |
| `src/components/dashboards/*` | home / master / staff / ventas / sala | Conservar (UI home legacy, no es DDL) |
| `isV2ShellPath` + `lib/v2-shell-path.ts` | Navbar, MainWrapper, BottomNavWrapper | Conservar (puente chrome) |
| Hex `#36606F` en Dashboard | Legacy denso; V2: carta (2), recetas-tpv MappingClient (7) | No borrar estilos vivos; limpiar en migración de cada pantalla |
| `layout-v2/demo/*` + `/dev/app-shell` | Playground | Conservar (herramienta de diseño) |

### Código muerto eliminado en este sprint

- Alias `V2AppShellBridge` en `v2-page-shell.tsx` y re-export en `layout-v2/index.ts`.

### No eliminado (sigue teniendo valor o consumidores)

- Providers, registries, MDS “poco usados”, nav staff/admin placeholders, playground, `getV2VariantForPath` (API pública sin caller actual — útil para futuros gates por variante).

---

## 3. MDS Audit

### Más utilizados (imports fuera de `mds/`)

| Componente | ~Imports |
|------------|---------|
| `PageHeader` | 17 |
| `Button` | 16 |
| `Section` / `Text` | 10 |
| `Alert` / `EmptyState` / `Surface` | 8 |
| `PageActions` | 7 |
| `List` / `ListItem` | 6 |
| `LoadingBlock` / `Metric` | 5 |
| `DateField` | 4 |
| `ActionDialog` / Toolbar* | 3 |
| `SearchInput` / `Status` / `PageContent` | 2 |

### Catálogo con 0 imports de producto (fuera de MDS / demo)

Usados **internamente** o solo playground — **no borrar**:

| Símbolo | Nota |
|---------|------|
| `PageTitle` / `PageSubtitle` | Usados por `PageHeader` internamente |
| `Status.Success|Warning|…` | Usados vía compound `Status.*` (instalacion-app + demo) |
| `TableLoading`, `FieldLabel|Description|Error|Hint|Shell`, `ToolbarSpacer`, `ListMeta` | API de familia; casi solo re-export / futuro |
| Gran parte de Table/Form/Search/Dialog | 1 uso (playground Foundation II) — reserva para migraciones densas |

### APIs que podrían simplificarse (solo propuesta)

1. **Homónimos Page\* layout-v2 vs mds** — documentar “producto = MDS; chrome title en playground = layout-v2”; eventual deprecar export público de Page\* en layout-v2 cuando el playground migre a MDS.
2. **Table:** muchos composites (Toolbar, Filters, Search, Pagination, Selection…) con adopción ≈1 — mantener, no fusionar aún.
3. **Form Field\* shell** — superficie amplia vs uso real (DateField sí; FieldShell no en producto).
4. **Button `loading`** muestra spinner **y** children — edge case visual; afinar en sprint MDS, no ahora.

### Conclusión MDS

El sistema **no está sobredimensionado para el roadmap**: la cola de pantallas legacy (labor, ventas, history…) necesitará Table/Form/Dialog. No crear ni eliminar familias ahora.

---

## 4. Navigation Audit

### Estructura actual (`managerNavigation`)

| Sección | Items |
|---------|-------|
| adoption | Master, Uso, Instalación, Web, Insights, Escáner |
| inventory | Inventario, Mermas, Stock |
| compras-carta | Albaranes, Carta, Mapeo TPV |
| eventos | Encargos, Pedidos |

### Hallazgos

| Tema | Detalle |
|------|---------|
| Duplicidades | Ninguna href duplicada en manager |
| Rutas legacy en nav | Ninguna: todos los href manager apuntan a rutas V2 (salvo `/master/dashboard`, fuera del registry Dashboard) |
| Nav no usada | `staffNavigation` / tramo admin: placeholders correctos; route registry staff/admin vacío |
| `adminNavigation` | Extiende manager + `/admin/import`, `/admin/mapeo` (existen) |
| Simplificación | Sección `adoption` mezcla analytics + scanner + link Master — se puede renombrar/partir cuando crezca, no urgente |
| Active state | Longest-match OK para inventory / eventos |

### Propuestas (no implementadas)

- Separar “Analytics” vs “Operación” en secciones cuando se migren ventas/labor.
- Añadir items nav solo al migrar la ruta (regla actual: correcta).

---

## 5. Providers Audit

| Provider | Responsabilidad | Consumo real | Duplicidad |
|----------|-----------------|--------------|------------|
| `MDSProvider` | `data-mds-theme` + fondo tipografía MDS | Sí (vía ShellProvider) | No |
| `LayoutProvider` | Estado sidebar móvil / collapse | Sí (Sidebar, Mobile*) | No |
| `NavigationProvider` | Context de nav resuelta | **Hook sin callers** | Nav también por props en AppShell |
| `ShellProvider` | Compone MDS + Nav + AppShell + PageContainer | Sí (V2PageShell) | Orquestador legítimo |

### Dependencias

```
V2PageShell
  └─ resolveNavigation(variant, pathname)
  └─ ShellProvider
       ├─ MDSProvider
       ├─ NavigationProvider  (context hoy sin lectores)
       └─ AppShell(+ LayoutProvider)
            └─ PageContainer?
```

### Propuestas (no implementadas)

1. **Riesgo nulo-bajo:** o bien empezar a leer nav vía `useShellNavigation` en Sidebar, o bien dejar de montar `NavigationProvider` hasta que haga falta — hoy es harness muerto.
2. No fusionar MDSProvider + ShellProvider: opt-in de tema en subárboles futuros.

---

## 6. Registry Audit

### `V2_ROUTE_REGISTRY.manager` (12 entradas)

```
/dashboard/instalacion-app
/dashboard/uso
/dashboard/web
/dashboard/insights
/dashboard/scanner
/dashboard/inventory          ← cubre waste/ledger por prefijo
/dashboard/inventory/waste    ← redundante (explícito)
/dashboard/inventory/ledger   ← redundante (explícito)
/dashboard/eventos            ← cubre pedidos + [eventId]/pedidos
/dashboard/albaranes
/dashboard/carta
/dashboard/recetas-tpv
```

### Consistencia

| Check | OK? |
|-------|-----|
| Toda ruta V2 con `V2PageShell` está registrada | Sí |
| Prefijo no enciende V2 en hermanos no migrados | Sí (paths exactos / hijos) |
| `master` / `staff` / `admin` arrays | Vacíos (OK) |
| `getV2VariantForPath` | Sin callers en producto — API reservada |
| `isV2ShellPath` thin wrapper | Correcto (Navbar no importa config/v2 directo) |

### Mejoras propuestas (no implementadas)

- Colapsar entradas hijas inventory cuando se confíe solo en prefijo (documentación / claridad).
- Cuando exista primera ruta staff V2, poblar `staff: []`.

---

## 7. Dashboard Audit

### Dashboard V2 (14 pantallas con `V2PageShell`)

| Dominio | Rutas |
|---------|-------|
| Analytics / adopción | `instalacion-app`, `uso`, `web`, `insights` |
| Operación compras | `scanner`, `albaranes`, `carta`, `recetas-tpv` |
| Inventory | `inventory`, `inventory/waste`, `inventory/ledger` |
| Eventos | `eventos`, `eventos/pedidos`, `eventos/[eventId]/pedidos` |

### Dashboard Legacy (13 producto + 1 no-migrar)

| Ruta | Notas |
|------|-------|
| `/dashboard` (home) | `DashboardSwitcher` — hub, no DDL |
| `albaranes-precios` | Precios compra |
| `consumo-personal` | Consumo staff |
| `history` | Historial / HE |
| `import` | Importaciones |
| `labor` | Coste laboral |
| `ledger` | Tesorería (≠ inventory/ledger) |
| `movements` | Movimientos caja |
| `overtime` | Horas extra |
| `propinas` | Propinas |
| `recetas-import` | Import recetas |
| `sala` | Radar sala |
| `ventas` | Ventas |
| `kds` | Redirect → no migrar |

### % Dashboard

- **Páginas producto migradas:** 14 / 27 (excl. `kds`) ≈ **52%**
- **Páginas totales bajo `dashboard/` (incl. kds):** 14 / 28 ≈ **50%**

### Roadmap actualizado (solo orden recomendado)

1. **Caja / dinero:** `ledger` (tesorería), `movements`, `propinas` — alto riesgo negocio; mismo patrón shell, UI cuidadosa.
2. **Personal / horas:** `overtime`, `labor`, `consumo-personal`, `history` — `auditor-horas-nominas`.
3. **Ventas / sala:** `ventas`, `sala`.
4. **Imports / precios:** `import`, `recetas-import`, `albaranes-precios`.
5. **Home** `/dashboard` — último o en paralelo (hub multi-rol).

Infra: **no tocar** salvo limpiezas de riesgo nulo listadas abajo.

---

## 8. Deuda técnica

### Alta

| Ítem | Impacto | Prioridad |
|------|---------|-----------|
| 13 pantallas Dashboard aún en chrome legacy | UX partida; Navbar vs AppShell | P0 migraciones |
| Módulos caja/HE con lógica crítica sin V2 | Riesgo si se “rediseña” sin disciplina | Migrar con skill de dominio, no reescribir lógica |
| Hex petróleo en clients V2 (`carta`, `MappingClient`) | Inconsistencia visual post-DDL | P1 pase tokens en esas rutas |

### Media

| Ítem | Impacto | Prioridad |
|------|---------|-----------|
| `NavigationProvider` sin lectores | Complejidad muerta | Simplificar en sprint limpio |
| Homónimos Page\* layout-v2 / mds | Confusión agentes | Doc + deprecar export playground a medio plazo |
| Registry inventory hijos redundantes | Ruido | Opcional colapsar |
| MDS Table/Form casi solo playground | OK hasta migrar history/ventas | No borrar |

### Baja

| Ítem | Impacto | Prioridad |
|------|---------|-----------|
| `getV2VariantForPath` sin callers | API dormida | Mantener |
| `V2AppShellBridge` | — | **Hecho:** eliminado |
| Nav staff/admin placeholders | Preparación | Ampliar al migrar |
| Docs históricas mencionan DDL | Ruido búsqueda | Ignorar / no reescribir historia |

---

## 9. Métricas (resumen)

| Métrica | Valor |
|---------|------:|
| Pantallas Dashboard V2 | **14** |
| % Dashboard producto migrado (excl. kds) | **~52%** |
| % Dashboard total (incl. kds) | **~50%** |
| % arquitectura V2 (infra adopción) | **~100%** (lista) |
| Rutas en `V2_ROUTE_REGISTRY` | **12** |
| Consumidores `DashboardDetailLayout` | **0** (eliminado) |
| Componentes MDS nuevos este sprint | **0** |
| Código muerto eliminado | `V2AppShellBridge` |
| Módulos Dashboard pendientes | **13** (+ home) |

---

## 10. Próximos pasos

1. **No abrir sprint de infra.** Migrar pantallas legacy con el patrón actual.
2. **Opcional (riesgo nulo):** decidir destino de `NavigationProvider` (usar o retirar mount).
3. **En cada migración:** sustituir `#36606F` del slice; no barrido global.
4. **Priorizar** bloques caja o personal según negocio (no por facilidad de shell).
5. Mantener regla: **0 MDS nuevos** salvo hueco demostrado por composición fallida.

---

## 11. Criterio de éxito — respuesta

Sí: la arquitectura V2 está preparada para el resto del proyecto **sin volver a tocar infraestructura**.

El cuello de botella restante es **migración de producto** (pantallas + tokens hex), no el sistema de shell/MDS/registry.
