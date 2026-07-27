# V2 Visual Debt — Sprint 23

**Fecha:** 2026-07-27  
**Rama:** `redesign-v2`  
**Alcance:** Consolidación ligera post-Staff. Sin migraciones. Sin infra nueva. Sin lógica de negocio.

---

## 1. Contexto

| Dominio | Estado |
|---------|--------|
| Staff | **100% V2** (9/9) |
| Dashboard producto | **~52%** (14 pantallas; excl. `kds`) |
| Arquitectura V2 | Estable (~100% adopción infra) |
| Design System / MDS | Estable; 0 componentes nuevos desde Sprint 17 |
| Hours Engine | Intacto |

Tras cerrar Staff, el cuello de botella ya no es infraestructura: es **deuda visual residual** en pantallas V2 parcialmente tokenizadas y el **volumen** de Dashboard legacy.

---

## 2. Deuda corregida en este sprint

Solo chrome visual, sin cambio de comportamiento.

| Ubicación | Tipo | Corrección |
|-----------|------|------------|
| `src/app/staff/error.tsx` | Botón primary / outline hex + zinc | `mds-primary` / `mds-border` / `mds-surface` |
| `src/app/dashboard/carta/CartaEditorClient.tsx` | Botón Guardar activo | `bg-mds-primary` |
| `src/app/dashboard/carta/CartaMappingCreatorClient.tsx` | Botón Añadir activo | `bg-mds-primary` |

**No tocado (a propósito):** editores densos (`MappingClient`), modales complejos, OCR, Hours Engine, paletas de negocio (p. ej. familia «Petróleo» en gestión de actividades).

---

## 3. Inventario de deuda restante

### Alta (impacto visual en rutas ya V2)

| Ubicación | Tipo | Impacto | Clasificación |
|-----------|------|---------|---------------|
| `recetas-tpv/MappingClient.tsx` (~7× `#36606F`) | Cabeceras / tabs / botones de editor TPV | Alta inconsistencia en pantalla V2 | **Diferir** — editor complejo; migrar tokens en slice dedicado o al tocar la pantalla |
| `components/dashboards/StaffDashboardView.tsx` (modales) | Headers petroleum en modales hub | Hub V2 con cuerpo/modales legacy | **Diferir** — modales compartidos multi-rol; riesgo de regresión UX |
| `components/staff/MenuAccordion.tsx` | Hex denso en acordeón carta | Carta staff V2, cuerpo de menú | **Diferir** — interacción densa; no chrome aislado |
| `DayAgendaModal` / `PedidoClientEditModals` / `EncargoOrderViewModal` | Hex en modales reservas | Reservas V2 | **Diferir** — modales de flujo operativo |

### Media (V2 parcial o satélites Staff)

| Ubicación | Tipo | Impacto | Clasificación |
|-----------|------|---------|---------------|
| `staff/ConsumptionModal.tsx` | Modal consumo al fichar | Satélite history/hub | **Diferir** — modal con lógica de consumo |
| `TipsDashboardView.tsx` / `TipOverrideModal.tsx` | Hex tips manager | `/dashboard/propinas` **V2 Sprint 25** | ✅ Chrome principal migrado; emerald botes/banner = semántica |
| `TipDistributionHistorySection.tsx` | Label petroleum | Tips manager | ✅ `text-mds-primary` Sprint 25 |
| `StaffCartaEditor.tsx` | Headers editor | Menos usado si inline editor cubre flujo | **Diferir** |

### Baja / negocio (no sustituir por tokens a ciegas)

| Ubicación | Tipo | Clasificación |
|-----------|------|---------------|
| `actividades/gestion` paleta «Petróleo» `#36606F` | **Dato de color de actividad** | **Pertenece a negocio** — conservar |
| Gradientes rojo cabecera calendario (día semana) | Semántica visual de producto | **Pertenece a negocio / marca** — diferir |
| Hex residual en modales hub (`StaffDashboardView`) / acentos `#5B8FB9` | Chrome/modales compartidos | **Diferir** — no bloquea 100% Dashboard; riesgo UX multi-rol |
| Homónimos `layout-v2/PageHeader` vs `mds/PageHeader` | Confusión agentes | **Diferir** — documentado Sprint 17; no bloquea producto |
| Entradas registry inventory hijas redundantes | Prefijo | **Diferir** — intencional / no visual |

---

## 4. Prioridades

| Prioridad | Acción |
|-----------|--------|
| **P0** | No invertir más en infra; migrar Dashboard pendiente por dominios |
| **P1** | Al migrar cada pantalla V2 restante: tokens chrome en el mismo PR (no dejar hex de botón/cabecera) |
| **P2** | Slice visual dedicado a `MappingClient` + modales reservas **solo** si no hay migración activa |
| **P3** | Homogeneizar modales hub (`StaffDashboardView`) cuando se toque hub multi-rol |

---

## 5. Estado V2 (métricas)

| Métrica | Valor |
|---------|------:|
| Pantallas Dashboard V2 | **27** (**100%** producto excl. kds) |
| Pantallas Staff V2 | **9** (**100%**) |
| Total pantallas V2 | **36** |
| % arquitectura V2 (infra) | **~100%** |
| % roadmap global (aprox.) | **~99%** (kds excluido) |
| Dominios cerrados | Staff · Compras · Caja · Imports · Sala/Ventas · Personal · **Hub** |
| Componentes MDS nuevos Sprint 33 | **0** |
| Infra nueva Sprint 33 | **0** (regla exact-only registry hub) |
| Lógica de negocio modificada | **0** |

### Dominios pendientes (Dashboard)

| Bloque | Rutas |
|--------|-------|
| Ninguno funcional | — |
| No migrar | `kds` |

---

## 6. Próximo roadmap

### Dominios V2 cerrados

| Dominio | Estado |
|---------|--------|
| Staff | **100%** |
| Compras | **100%** |
| Caja | **100%** |
| Imports | **100%** |
| Sala / Ventas | **100%** |
| Personal | **100%** |
| Hub `/dashboard` | **100%** ✅ Sprint 33 |

### Dashboard producto

**Cerrado al 100% V2** (excepción explícita: KDS).

**Deuda visual residual (no bloquea cierre)**

| Ítem | Notas |
|------|-------|
| Modales `StaffDashboardView` petroleum | Compartidos multi-rol; diferir |
| Acentos `#5B8FB9` / purple en filas overtime hub | Semántica / legado menor |
| Homónimos PageHeader layout-v2 vs mds | Documentado Sprint 17 |

**Siguiente (opcional)**

- Pulido deuda visual residual
- Master tools fuera del registry Dashboard si aplica
- KDS permanece independiente

---

## 7. Confirmaciones Sprint 33

- Infraestructura nueva: **0**
- Componentes MDS nuevos: **0**
- Registry: alta `/dashboard` + matching **exact-only** (necesario para no marcar hijos no registrados)
- Navigation: ítem Inicio
- AppShell / Providers / Design System / lógica hub: **sin cambios de negocio**
- `getDashboardData` / `DashboardSwitcher`: **intactos**
