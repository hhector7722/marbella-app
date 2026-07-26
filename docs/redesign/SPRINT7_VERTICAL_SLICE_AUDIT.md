# Auditoría — Sprint 7 Vertical Slice (`/dashboard/instalacion-app`)

Revisión post-migración (Sprint 8). Sin cambios de componentes salvo deuda de adopción (resuelta en Sprint 8).

## Componentes MDS que funcionaron bien

| Componente | Uso en el slice | Nota |
|------------|-----------------|------|
| **Metric** | 3 KPIs de modo (navegador / sin datos / app) | Limpio, ZERO-DISPLAY con `empty`, sin color decorativo |
| **List / ListItem / ListActions** | Filas de equipo | Sustituye cards zinc; touch-friendly |
| **Status** | Modo display + push | Semántica clara (Success/Warning/Neutral) |
| **PageHeader + PageActions** | Título + volver | Sustituye header petróleo legacy |
| **Section** | Agrupa resumen vs equipo | Jerarquía Página → Sección correcta |
| **LoadingBlock** | Estado carga | Mejor que spinner centrado suelto |
| **EmptyState** | Lista vacía | Un solo patrón |
| **Button** (`outline` + `asChild`) | Volver | Link táctil 48px |

## Componentes poco utilizados (en este slice)

- Table / Form / Dialog / Toolbar / Search — no aplicaban (pantalla de informe)
- Notification (Alert/Banner/ToastLayout) — errores vía sonner (legado aceptable)
- Surface directo — List ya aporta superficie

No implica que sobren; el slice no los necesitaba.

## Duplicidades detectadas (pre–Sprint 8)

1. **Nav hardcodeada** en `v2-install-status.ts` acoplada al slice → **resuelto**: `src/config/navigation/manager.ts` + registry.
2. **Paths V2** en constante local de `v2-shell-path.ts` → **resuelto**: `src/config/v2/registry.ts`.
3. **`data-mds-theme`** inline en el Bridge → **resuelto**: `MDSProvider`.
4. **layout-v2 `PageHeader` vs mds `PageHeader`** — coexisten; el slice usa MDS. Documentar alias si se importan juntos.

## Posibles simplificaciones

- Breadcrumbs del slice siguen en la page (aceptable; no forzar registry de crumbs todavía).
- `Metric` + `trend` usado como caption secundaria: válido, o en el futuro un `description`-only sin trend.

## APIs demasiado complejas

Ninguna bloqueante en el slice. El Bridge Sprint 7 pedía `navigation` explícita → fricción; **V2PageShell** ahora solo pide `variant`.

## Mejoras recomendadas (no urgentes)

1. Siguiente slice: `/dashboard/uso` (misma familia nav manager).
2. Sustituir toast sonner por skin `ToastLayout` cuando se cablee cola.
3. Valorar `EmptyState` compact en métricas a cero (hoy Metric empty basta).
4. No crear wrappers “InstallStatus*” específicos — el patrón genérico basta.

## Conclusión

El slice validó MDS + AppShell. La deuda era de **adopción**, no de componentes. Sprint 8 convierte ese aprendizaje en infraestructura reutilizable.
