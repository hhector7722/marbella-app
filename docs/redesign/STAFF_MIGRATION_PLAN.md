# Staff Migration Plan — Sprint 18

**Fecha:** 2026-07-27  
**Rama:** `redesign-v2`  
**Alcance:** Inventario y roadmap de `src/app/staff/`. **Sin migraciones. Sin cambios de código.**

Patrón de adopción (igual que Dashboard):

1. Registrar ruta en `src/config/v2/registry.ts` (`staff: […]`)
2. Ampliar `src/config/navigation/staff.ts`
3. Envolver con `<V2PageShell variant="staff" …>`
4. Sustituir UI por MDS — lógica / queries / actions intactas

---

## 1. Contexto de chrome Staff

Antes de migrar pantallas, el plan debe asumir este hecho del repo:

| Pieza | Rol actual |
|-------|------------|
| `src/app/staff/layout.tsx` | Toaster + padding inferior + monta `StaffBottomNav` (salvo `/staff/carta`) |
| `StaffBottomNav` | Nav táctil: Horarios (modal), Asistencia → `/staff/history`, Inicio, Pedidos → `/orders/new`, Perfil |
| Navbar / BottomNav globales | Siguen en root layout; Dashboard V2 los oculta con `isV2ShellPath` |

**Implicación:** el primer slice Staff V2 necesitará el mismo opt-in de chrome (`isV2ShellPath` / registro `staff`) y decidir cómo convive `StaffBottomNav` con `AppShell` variant staff (ocultar bottom nav legacy en rutas V2, o diferir AppShell sidebar hasta tener nav staff completa). Eso es trabajo del **primer slice de implementación**, no de este plan.

`staffNavigation` actual (placeholder): Inicio, Reservas, Carta — **no** incluye propinas, history ni actividades.

---

## 2. Inventario de rutas reales

Rutas con `page.tsx` bajo `src/app/staff` (9). No se inventan dominios.

| # | Ruta | Archivos clave | LOC aprox. (página + client local) |
|---|------|----------------|-----------------------------------|
| 1 | `/staff/dashboard` | `dashboard/page.tsx` | ~19 + `DashboardSwitcher` (compartido) |
| 2 | `/staff/reservas` | `reservas/page.tsx` + `ReservasClient.tsx` | ~6 + **~1444** |
| 3 | `/staff/reservas/encargo/[eventId]` | `page.tsx` + `StaffEncargoPageClient.tsx` | ~65 + ~36 + libs encargo |
| 4 | `/staff/carta` | `carta/page.tsx` → `StaffCartaView` / `MenuAccordion` | ~230 SSR + componentes staff carta |
| 5 | `/staff/history` | `history/page.tsx` + WeekCard / PlantillaWeekCard | **~1265** + cards + hours-engine |
| 6 | `/staff/propinas` | `propinas/page.tsx` → `StaffPropinasView` | ~55 + **~246** view |
| 7 | `/staff/actividades` | `actividades/page.tsx` (client) + `actions.ts` | ~424 + ~486 actions |
| 8 | `/staff/actividades/gestion` | `gestion/page.tsx` + `actions.ts` | ~422 + ~134 (master-only) |
| 9 | `/staff/actividades/revision` | `revision/page.tsx` + `actions.ts` | ~544 + ~239 (master-only, OCR) |

**No-ruta / soporte (no migrar como pantalla):**

- `layout.tsx`, `error.tsx`
- `actions.ts` (consumo personal al fichar)
- `ConsumptionModal.tsx` (acoplado a fichaje / history)

---

## 3. Ficha por pantalla

Escala: **Baja / Media / Alta / Crítica**.

### 3.1 `/staff/dashboard`

| Dimensión | Valor |
|-----------|--------|
| **Complejidad** | Media (página fina; UI real = `DashboardSwitcher` multi-rol) |
| **Dependencias** | Auth session, `profiles`, `DashboardSwitcher`, atajos/modales globales |
| **Riesgo** | Medio — hub compartido con `/dashboard` y `/master/dashboard`; tocar shell puede afectar otros roles |
| **MDS previsto** | Bajo en el primer pase (el hub es denso y legacy); más adelante Metric/Surface en atajos |
| **Prioridad** | Media-baja como slice temprano; mejor cuando exista patrón staff estable |

### 3.2 `/staff/reservas`

| Dimensión | Valor |
|-----------|--------|
| **Complejidad** | Alta–crítica (calendario + estados + encargos + modales + notificaciones) |
| **Dependencias** | Supabase client, `createEncargoAction` (dashboard/eventos), `DayAgendaModal`, editores encargo, usage tracking |
| **Riesgo** | Alto — operación diaria sala; regresiones caras |
| **MDS previsto** | PageHeader, Button, ActionDialog, EmptyState, LoadingBlock, DateField/calendar skin |
| **Prioridad** | Alta en beneficio; **baja** como primer slice |

### 3.3 `/staff/reservas/encargo/[eventId]`

| Dimensión | Valor |
|-----------|--------|
| **Complejidad** | Media |
| **Dependencias** | `loadEncargoPageById`, `canCreateEncargo`, `event_orders`, client editor |
| **Riesgo** | Medio — solapa dominio Eventos ya V2 en dashboard |
| **MDS previsto** | PageHeader, Alert, Button, List |
| **Prioridad** | Media (después o junto a Reservas) |

### 3.4 `/staff/carta`

| Dimensión | Valor |
|-----------|--------|
| **Complejidad** | Alta (`MenuAccordion`, covers, permisos `carta_editors`, selects resilientes) |
| **Dependencias** | `categories`, `digital_menu`, `StaffCartaView`, permisos carta; fullscreen sin BottomNav |
| **Riesgo** | Alto — UX fullscreen + edición; ya hay carta V2 en `/dashboard/carta` (otro flujo) |
| **MDS previsto** | Limitado al chrome; cuerpo = componente dominio denso |
| **Prioridad** | Media (reutilizar aprendizajes dashboard/carta, no duplicar) |

### 3.5 `/staff/history` (Asistencia)

| Dimensión | Valor |
|-----------|--------|
| **Complejidad** | **Crítica** (HE, plantilla, PDF/XLSX, simulación, modales asistencia) |
| **Dependencias** | `hours-engine`, overtime actions, plantilla, exports, `AcumulaHoras` / liquidación |
| **Riesgo** | **Crítico** — dinero y nómina; skill `auditor-horas-nominas` |
| **MDS previsto** | PageHeader, Toolbar, List, Dialog; tablas densas después |
| **Prioridad** | Alta en negocio; **última** en orden de adopción visual temprana |

### 3.6 `/staff/propinas`

| Dimensión | Valor |
|-----------|--------|
| **Complejidad** | Baja–media (SSR gate + view ~246 líneas) |
| **Dependencias** | `tip_distribution_lines`, `mapStaffTipHistoryRows`, `StaffPropinasView`; roles staff/supervisor/chef/manager/admin |
| **Riesgo** | Medio-bajo (dinero, pero lectura/historial personal; gestión manager en `/dashboard/propinas`) |
| **MDS previsto** | **Alta:** PageHeader, Metric, List/ListItem, EmptyState, LoadingBlock, Button, Alert; tokens vs hex |
| **Prioridad** | **Máxima como vertical slice #1** |

### 3.7 `/staff/actividades`

| Dimensión | Valor |
|-----------|--------|
| **Complejidad** | Media–alta (calendario mes, colores, `PavilionDayModal`) |
| **Dependencias** | `fetchActivitiesForRangeAction`, date-fns, usage, master flag para atajos |
| **Riesgo** | Medio |
| **MDS previsto** | PageHeader, Button, LoadingBlock; calendario puede quedarse custom |
| **Prioridad** | Media |

### 3.8 `/staff/actividades/gestion`

| Dimensión | Valor |
|-----------|--------|
| **Complejidad** | Media (CRUD colores, merge, filtros pista) |
| **Dependencias** | Actions gate `isMasterDashboardUser` |
| **Riesgo** | Medio (master-only; menos usuarios) |
| **MDS previsto** | PageHeader, Form fields, Button, ConfirmDialog, List |
| **Prioridad** | Media (tras calendario o en slice Actividades) |

### 3.9 `/staff/actividades/revision`

| Dimensión | Valor |
|-----------|--------|
| **Complejidad** | Alta (OCR/parse pabellón, merge, venues, categorías reporte) |
| **Dependencias** | `prepareReviewAction`, `reporte/actions`, master-only |
| **Riesgo** | Alto (import datos ocupación) |
| **MDS previsto** | PageHeader, Alert, Button, List, Dialog |
| **Prioridad** | Baja temprana; junto al dominio Actividades master |

---

## 4. Agrupación por dominio (estructura real)

```
Staff
├── Hub
│   └── /staff/dashboard
├── Reservas y encargos
│   ├── /staff/reservas
│   └── /staff/reservas/encargo/[eventId]
├── Carta
│   └── /staff/carta
├── Asistencia / historial
│   └── /staff/history
│       (+ ConsumptionModal / actions de consumo — satélites)
├── Propinas
│   └── /staff/propinas
└── Actividades (pabellón)
    ├── /staff/actividades
    ├── /staff/actividades/gestion    (master)
    └── /staff/actividades/revision   (master)
```

Chrome transversal: `layout.tsx` + `StaffBottomNav` (enlaces a history, dashboard, orders, profile; **no** lista propinas/actividades/carta/reservas en la bottom bar — carta/reservas viven en atajos del hub o nav V2 futura).

---

## 5. Roadmap propuesto

Orden por: **1) riesgo ↑ preferir bajo primero**, **2) reutilización MDS**, **3) complejidad**, **4) beneficio**.

| Fase | Rutas | Por qué |
|------|-------|---------|
| **A — Vertical slice** | `/staff/propinas` | Menor complejidad local, gate claro, MDS natural, riesgo acotado, valida `variant="staff"` + registry `staff` + chrome |
| **B — Actividades staff** | `/staff/actividades` → luego `gestion` → `revision` | Dominio cohesivo; calendario antes que OCR; master-only al final del bloque |
| **C — Encargo puntual** | `/staff/reservas/encargo/[eventId]` | Reusa patrones Eventos V2; prepara Reservas sin abrir el monolito |
| **D — Reservas** | `/staff/reservas` | Alto beneficio, alto riesgo; solo con shell staff ya estable |
| **E — Carta** | `/staff/carta` | Fullscreen + acordeón; coordinar con dashboard/carta |
| **F — Hub** | `/staff/dashboard` | `DashboardSwitcher` compartido — migrar atajos con cuidado multi-rol |
| **G — Asistencia** | `/staff/history` | Máximo riesgo de negocio; última fase visual |

**No empezar por:** history, reservas monolito, carta fullscreen, revision OCR.

---

## 6. Riesgos globales Staff

| Riesgo | Mitigación |
|--------|------------|
| Doble chrome (`StaffBottomNav` + AppShell) | Extender `isV2ShellPath`; en layout staff, no montar BottomNav en paths V2 (espejo Dashboard) |
| Nav staff incompleta vs BottomNav | Ampliar `staffNavigation` al ritmo de migraciones; BottomNav puede seguir para Horarios/Pedidos/Perfil fuera de `/staff` |
| Páginas client-only sin SSR gate | Preferir auth en server page al migrar (como propinas/carta) sin cambiar reglas de negocio |
| Hex `#36606F` denso | Sustituir por tokens solo en el slice migrado |
| Hours Engine / tips / encargos | Prohibido tocar lógica; solo presentación |
| `DashboardSwitcher` compartido | No “V2-ificar” el switcher entero en el primer slice |

---

## 7. Prioridades (resumen)

| Prioridad | Ruta | Motivo corto |
|-----------|------|--------------|
| P0 slice | `/staff/propinas` | Bajo riesgo relativo + alta reutilización MDS |
| P1 | `/staff/actividades` (+ gestion/revision) | Dominio cerrado, beneficio operativo |
| P2 | encargo `[eventId]` → reservas | Beneficio alto tras shell estable |
| P3 | carta | Fullscreen / deuda UI |
| P4 | dashboard hub | Compartido multi-rol |
| P5 | history | Crítico de negocio |

---

## 8. Primer vertical slice recomendado

### Candidato: `/staff/propinas`

**Cumple:**

- Poco riesgo relativo (historial del empleado; no motor HE ni reservas)
- Poca deuda estructural (page SSR delgada + un view)
- Alta reutilización MDS (cabecera, listas, vacíos, loading, botones, alertas)
- Ideal para **estrenar** `V2_ROUTE_REGISTRY.staff` y `V2PageShell variant="staff"`

**Fuera de alcance del slice:**

- `/dashboard/propinas` (manager)
- Cambios en RPC/reparto
- Rediseño de tipología de negocio

**Checklist de implementación (Sprint 18 Slice I — hecho):**

1. ~~Añadir `/staff/propinas` a `V2_ROUTE_REGISTRY.staff`~~
2. ~~Item «Propinas» en `staffNavigation`~~
3. ~~Opt-in chrome: ocultar `StaffBottomNav` vía `isV2ShellPath` en `staff/layout`~~
4. ~~`V2PageShell variant="staff"` + MDS en `StaffPropinasView`~~
5. ~~Tokens `mds-primary` (view + `StaffTipRepartoPanel`)~~
6. QA manual: roles, historial, responsive, empty/loading

**Alternativa descartada para el #1:** `/staff/dashboard` — demasiado acoplada al hub compartido.

---

## 8b. Sprint 19 — Slice II Actividades (hecho)

**Migrado:** `/staff/actividades` + `gestion` + `revision`.

**Agrupación:** cuerpos UI distintos (<80% compartido), pero registro del padre por prefijo obliga a envolver los tres hijos en `V2PageShell` (no se puede dejar revision en chrome V2 sin shell).

**Checklist:**

1. ~~Registry `/staff/actividades`~~
2. ~~Nav «Actividades»~~
3. ~~`V2PageShell variant="staff"` en las 3 páginas~~
4. ~~PageHeader / PageActions / LoadingBlock / Alert / Button~~
5. ~~Tokens chrome → `mds-primary` (paleta Petróleo de negocio intacta)~~
6. ~~Suspense en revision (`useSearchParams`)~~

**Pendiente Staff:** dashboard, reservas (+encargo), carta, history.

---

## 8c. Sprint 20 — Slice III Encargos (hecho)

**Migrado:** `/staff/reservas` + `/staff/reservas/encargo/[eventId]`.

**Agrupación:** cuerpos distintos (calendario monolito vs editor de pedido); dominio único + prefijo registry → migrar ambas.

**Checklist:**

1. ~~Registry `/staff/reservas`~~
2. ~~Nav «Reservas» (ya existía; sin alta nueva de ítem)~~
3. ~~`V2PageShell variant="staff"` en ambas páginas~~
4. ~~PageHeader / PageActions / LoadingBlock / Alert / Button~~
5. ~~Suspense (`useSearchParams` en calendario)~~
6. ~~Tokens chrome página + `EncargoProductEditor`~~
7. Hex residual en modales satélite — diferido (sin impacto de lógica)

**Pendiente Staff:** dashboard, carta, history.

---

## 8d. Sprint 21 — Slice IV Hub + Carta (hecho)

**Migrado:** `/staff/dashboard` + `/staff/carta`.

**Nota:** no existe `page.tsx` en `/staff` — el hub real es `/staff/dashboard`.

**Agrupación:** cuerpos distintos; cierre operativo Staff antes de `history` (HE).

**Checklist:**

1. ~~Registry `/staff/dashboard` + `/staff/carta`~~
2. ~~Nav Inicio / Carta (ya existían)~~
3. ~~`V2PageShell variant="staff"`~~
4. ~~Hub: PageHeader + Suspense + `DashboardSwitcher`~~
5. ~~Carta: `withPageContainer={false}` + PageHeader (logo) + PageActions~~
6. ~~Tokens chrome hub cabecera semana + StaffCartaView / spinner inline editor~~

**Limitación fullscreen carta:** AppShell V2 (MobileHeader/Topbar/sidebar lg) sustituye el full-bleed legacy; el cuerpo del menú (max-w-2xl, edición, acordeón) se conserva. BottomNav legacy sigue oculto.

**Hex residual diferido:** `MenuAccordion`, modales hub (`StaffDashboardView`), `StaffCartaEditor` — sin cambio de lógica.

**Pendiente Staff:** únicamente `/staff/history`.

---

## 8e. Sprint 22 — Slice Final `/staff/history` (hecho)

**Migrado:** `/staff/history`.

**Separación HE vs presentación:**

| Hours Engine (NO tocado) | Presentación (sí) |
|--------------------------|-------------------|
| `src/lib/hours-engine/**` | `V2PageShell` / registry / nav |
| `patchWeeksFromLiquidation`, carry-in, paid lookup | PageHeader / PageActions |
| `buildEmployeeWeeks*`, plantilla, exports PDF/XLSX | LoadingBlock / EmptyState |
| `updateWeeklyWorkerConfig` | tokens chrome `#36606F` → `mds-primary` |
| Modales de negocio (asistencia, día, export) | focus rings WeekCard |

**Checklist:**

1. ~~Registry `/staff/history`~~
2. ~~Nav «Asistencia»~~
3. ~~`V2PageShell` + Suspense (`useSearchParams`)~~
4. ~~PageHeader / PageActions / LoadingBlock / EmptyState / Button~~
5. ~~0 cambios HE / overtime / builders~~

**Dominio Staff:** **completado** (9/9).

---

## 9. Criterio de éxito de este sprint (planificación)

Existe un plan con:

- inventario fiel al repo (9 rutas)
- agrupación real
- roadmap justificado
- riesgos y prioridades
- **un** primer slice claro: **Propinas staff**

Listo para ejecutar migraciones Staff con la misma disciplina que Dashboard.
