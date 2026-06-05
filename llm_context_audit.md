# Auditoría de contexto LLM — Bar La Marbella

**Archivo auditado:** `context/LLM_PROMPT.md` (361 líneas)  
**Fecha de auditoría:** 2026-06-05  
**Metodología:** Comparación exhaustiva contra estructura del repositorio, código fuente, migraciones (229 archivos), configuración, `PROJECT_STATUS.md`, `README.md`, `.env.example` y documentación en `context/`.

---

## Resumen ejecutivo

`context/LLM_PROMPT.md` es un **buen punto de partida** para un LLM externo: cubre identidad, stack, reglas duras, rutas principales, APIs, esquema DB resumido y un changelog auto-sincronizado (§11). Sin embargo, **no alcanza el nivel de un desarrollador senior** que lleva meses en el repo.

**Fortalezas:**
- Reglas de negocio críticas (zero-display, timezone immunity, AcumulaHoras, tríada albaranes, anti-silent failures).
- Mapa de APIs exacto (17/17 rutas verificadas).
- Mecanismo de sincronización §11 desde `PROJECT_STATUS.md` documentado y funcional.
- Referencias a fuentes de verdad externas al prompt (`context/index.txt`, `INGREDIENTS_PRECIOS_Y_ALBARANES.md`).

**Debilidades críticas:**
- Rutas y permisos **desactualizados o incorrectos** (`/dashboard/finanzas` inexistente; `/dashboard/kds` documentado para staff pero bloqueado en `proxy.ts`).
- Módulos enteros **no documentados** (notificaciones push, PWA, horarios/plantilla, perfil empleado, manager ledger, onboarding).
- Stack de voz **incorrecto** (documenta LiveKit; el código usa OpenAI Realtime, sin imports de LiveKit en `src/`).
- Sin mapa de **server actions**, **componentes clave**, ni **índice de localización** ("¿dónde toco X?").
- Variables de entorno **incompletas** (faltan VAPID, vars obsoletas de voice WS en `.env.example`).
- Testing, CI/CD y observabilidad **ausentes**.

---

## Cobertura general

Escala 0–100. Criterio: ¿podría un LLM sin acceso al repo completar la tarea solo con esta sección?

| Dimensión | Puntuación | Justificación breve |
|-----------|:----------:|---------------------|
| **Arquitectura** | **70** | Proxy/SSR/RBAC bien descritos; falta diagrama de capas, mapa `src/`, dual `date-utils`, estructura server actions, flujo BDP end-to-end |
| **Frontend** | **65** | Rutas §5 útiles pero incompletas; sin componentes por dominio, layouts, nav (staff vs admin), PWA, chat UI, modales clave |
| **Backend** | **72** | APIs §6 precisas; server actions dispersas sin índice; webhooks documentados; copilot sin detalle de tools/RBAC |
| **Base de datos** | **75** | Tablas/RPCs §7 sólidas pero selectivas (229 migraciones, ~15 tablas omitidas); sin RLS por tabla; colisión timestamp migraciones no documentada |
| **APIs** | **88** | 17 rutas coinciden 100% con el repo; métodos y propósito correctos |
| **Flujos de negocio** | **68** | Dominios §1 claros; faltan flujos paso a paso (fichaje, cierre caja, mapeo albarán, reparto propinas, horarios) |
| **Convenciones** | **85** | §3 excelente; reglas táctiles, fechas, dinero, query safety bien cubiertas |
| **DevOps** | **50** | Sync LLM documentado; sin CI, sin testing, `vercel.json` crons no detallados, despliegue BDP parcial, `.env.example` roto |
| **Seguridad** | **72** | RLS/proxy/auth bien; permisos staff/KDS contradictorios; roles `chef` poco documentados; storage buckets incompletos |
| **Contexto funcional** | **70** | Identidad clara; changelog §11 rico pero §11 contiene enlaces stale; módulos nuevos omitidos |

### Puntuación total del archivo actual

**Promedio ponderado: 74/100**

*(Promedio aritmético simple de las 10 dimensiones: 73,5 → redondeado a **74**)*

---

## Información faltante

### 1. Mapa de localización ("¿dónde está X?")

| Qué falta | Por qué es importante | Impacto en un LLM |
|-----------|----------------------|-------------------|
| Índice archivo → responsabilidad (`src/app/actions/`, `src/lib/`, `src/components/<dominio>/`) | Un LLM modifica el archivo equivocado sin mapa mental | Alto: parches en rutas legacy, duplicación de lógica |
| Tabla "funcionalidad → ruta → actions → RPC → componente" | Localización es la tarea #1 de cualquier cambio | Alto: horas perdidas en búsqueda simulada |
| Distinción `src/utils/date-utils.ts` vs `src/lib/date-utils.ts` | Dos SSOT de fechas; solo uno documentado | Alto: bugs de timezone al usar el archivo incorrecto |

### 2. Módulos funcionales no documentados

| Qué falta | Por qué es importante | Impacto en un LLM |
|-----------|----------------------|-------------------|
| **Notificaciones** (`user_notifications`, `NotificationsBell`, push VAPID, `src/app/actions/notifications.ts`) | Feature en producción montada en `layout.tsx` | Alto: ignora RLS/triggers al tocar notificaciones |
| **PWA** (`sw.js`, `manifest.json`, `ServiceWorkerRegistration`, `usePWAInstall`) | App instalable en móviles de sala | Medio: rompe registro SW o push |
| **Horarios / plantilla** (`ScheduleDayEditor`, `shifts`, `StaffScheduleModal`, rentabilidad día) | Dominio operativo diario | Alto: cambios en fichajes/horarios sin contexto |
| **Perfil empleado** (`/profile`, modales nóminas/contrato/DNI, `src/app/actions/profile.ts`) | Gestión documental y avatar | Medio: toca storage/RLS sin saber buckets |
| **Manager ledger** (`manager_ledger`, `ManagerLedgerView`, migraciones `20260302*`) | Tesorería gerencial separada | Medio: confunde con `treasury_log` |
| **Onboarding** (`OnboardingOverlay`, `needs_onboarding` en profiles) | Primer uso empleados | Bajo-Medio |
| **Chat Copiloto UI** (`ChatMarbella`, `src/lib/copilot/*`, `aiStore.ts`, tools RBAC) | IA integrada en toda la app | Alto: modifica copilot sin conocer `permissions.ts` |
| **Traducción CA↔ES** (`translate-ca-es.ts`, Gemini en imports) | Recetas/carta multilingüe | Medio |
| **Manuales staff** (`staff-manuals.ts`, `public/docs/manuals/`) | UX operativa | Bajo |
| **KDS v2** (`useKDSv2.ts`, migraciones `20260420100000_kds_v2_*`) | Pipeline cocina actual | Alto: asume KDS v1 de §8 |

### 3. Infraestructura y operaciones

| Qué falta | Por qué es importante | Impacto en un LLM |
|-----------|----------------------|-------------------|
| `vercel.json` crons (03:00 audio, 03:30 PDFs) | Limpieza automática documentada solo por nombre | Medio: borra assets o falla cron |
| Variables `VAPID_*`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Push notifications requieren par | Alto: feature rota en prod |
| Ausencia total de testing (0 frameworks) | LLM podría añadir tests inexistentes o asumir CI | Medio |
| Carpeta `sql/` (39 scripts ad-hoc fuera de migraciones) | Scripts legacy no versionados formalmente | Medio: ejecuta SQL obsoleto |
| `types_db.ts` en raíz vs `src/types/supabase.ts` | Dos fuentes de tipos | Medio: tipos inconsistentes |

### 4. Base de datos

| Qué falta | Por qué es importante | Impacto en un LLM |
|-----------|----------------------|-------------------|
| Tablas: `user_notifications`, `manager_ledger`, `import_runs`, `notification_recipients_rules` | Existen en migraciones, no en §7 | Alto: inventa columnas o omite RLS |
| Storage buckets completos (`cash_closings`, `carta_items`, `employee_documents`, `ai_assets`, `orders`, `albaranes`, `nominas`) | Operaciones de archivos dispersas | Alto: sube a bucket incorrecto |
| Políticas RLS por dominio (resumen, no exhaustivo) | Seguridad es regla #1 del proyecto | Alto: propone políticas contradictorias |
| Estado `expense_only` en §7 mencionado pero flujo PyG no explicado | Feature en curso (`PROJECT_STATUS` 🚧) | Medio |
| 229 migraciones sin índice temático | Imposible navegar historial DB | Medio |

### 5. Roles y permisos

| Qué falta | Por qué es importante | Impacto en un LLM |
|-----------|----------------------|-------------------|
| Rol `chef` (propinas, copilot, consumo) | Existe en DB y copilot; no en §4 | Medio: guards incorrectos |
| Matriz rol × ruta × acción | Solo lista parcial en §4 | Alto: abre rutas prohibidas a staff |
| `isMasterDashboardUser` hardcoded email | Único usuario master | Medio: rompe hub master |

---

## Información desactualizada

| Elemento en LLM_PROMPT | Estado real en repo | Severidad |
|------------------------|---------------------|-----------|
| `/dashboard/finanzas` (§1, §5, §10) | **No existe** `page.tsx`; PyG vive en `/dashboard/insights` | **Crítica** |
| Staff puede acceder `/dashboard/kds` (§4 líneas 121-122) | `proxy.ts` `staffDashboardAllowed` **no incluye kds** | **Crítica** |
| `src/app/staff/page.tsx` (§11 hito reservas) | **Eliminado** 2026-05-30; redirect en proxy | Alta |
| Voz con **LiveKit** (§1, §2, §9) | Paquetes en `package.json` pero **0 imports en `src/`**; voz usa **OpenAI Realtime** (`/api/copiloto/voice/token`) | Alta |
| `POST /api/webhooks/albaranes` activo | Existe pero retorna **410 Gone** (correcto en §6, pero §1 dice "escáner Gemini" sin aclarar webhook retirado en flujo principal) | Baja |
| Finanzas como ruta separada de Insights | Consolidado en `/dashboard/insights` desde 2026-05-30 | Alta |
| Referencia única a `date-utils.ts` | Existen **dos** archivos con responsabilidades distintas | Media |
| `.env.example` alineado con §9 | Solo vars STT/voice WS obsoletas | Alta (repo, no prompt) |
| `README.md` con `/api/ai/stt` y `voice-server/` | **Obsoleto** vs `/api/copiloto/*` | Alta (repo adjacente) |

### Migraciones con naming conflictivo (no documentado)

Dos archivos con prefijo `20260604150000_*`:
- `20260604150000_get_period_card_payments.sql`
- `20260604150000_fix_consumption_order_save_delete_where.sql`

Riesgo al aplicar migraciones en entornos nuevos.

---

## Información incorrecta

| Afirmación en LLM_PROMPT | Realidad verificada | Archivo evidencia |
|-------------------------|---------------------|-------------------|
| "KDS: `/dashboard/kds`" accesible staff/supervisor (§4) | Staff/supervisor redirigidos a `/staff/dashboard` al visitar `/dashboard/kds` | `src/proxy.ts` L94-98 |
| "Finanzas: `/dashboard/finanzas`" (§5) | Ruta inexistente; 0 matches `finanzas` en `src/` | Glob `page.tsx` |
| "Voz: LiveKit" (§2) | Sin código LiveKit; token voz = OpenAI Realtime API | `src/app/api/copiloto/voice/token/route.ts` |
| Enlace `staff/page.tsx` en changelog §11 | Archivo eliminado | Ausente en `src/app/staff/` |
| "sileo en pruebas" (§2) | Montado en producción: `SileoProvider` en `layout.tsx` + `/test-sileo` | `src/app/layout.tsx` |

### Contradicciones internas en el propio prompt

- §4 dice staff puede `/dashboard/kds`; §5 lista KDS bajo "Manager / gestión" sin aclarar excepción staff.
- §1 menciona "Finanzas: PyG vs cash flow" como dominio con ruta implícita `/dashboard/finanzas`; §11 documenta Insights como hogar del PyG sin actualizar §1/§5.

---

## Riesgos para un LLM

### Riesgo 1 — Modificar archivo equivocado
**Escenario:** Tarea "arreglar formato de fecha en insights".  
**Error probable:** Edita `src/lib/date-utils.ts` (ISO week UTC) en lugar de `src/utils/date-utils.ts` (Madrid/TPV).  
**Consecuencia:** Regresión timezone en KPIs.

### Riesgo 2 — Crear ruta fantasma
**Escenario:** "Añadir gráfico a finanzas".  
**Error probable:** Crea `/dashboard/finanzas/page.tsx` duplicando Insights.  
**Consecuencia:** Arquitectura bifurcada, navbar roto.

### Riesgo 3 — Permisos proxy incorrectos
**Escenario:** "Dar acceso KDS a supervisores".  
**Error probable:** Asume que ya tienen acceso (§4) y solo cambia UI.  
**Consecuencia:** No añade excepción en `proxy.ts`; feature inaccesible.

### Riesgo 4 — Integración voz LiveKit
**Escenario:** "Configurar sala LiveKit".  
**Error probable:** Busca `LIVEKIT_*` env vars e instala componentes LiveKit.  
**Consecuencia:** Código muerto; la voz real es OpenAI Realtime.

### Riesgo 5 — Silent failure en consumo staff
**Escenario:** "Permitir fichar salida sin consumo".  
**Error probable:** No lee §11 hito 2026-05-20 ni `staff/actions.ts` anti-bypass.  
**Consecuencia:** Rompe política operativa o introduce bypass de seguridad.

### Riesgo 6 — PostgREST query crash
**Escenario:** "Filtrar ingredientes excluidos".  
**Error probable:** Usa `.not('id', 'in', array)` pese a regla §3.  
**Consecuencia:** Crash PostgREST en producción (documentado pero fácil de olvidar).

### Riesgo 7 — Stock albarán sin RPC
**Escenario:** "Borrar movimientos al desmapear".  
**Error probable:** `DELETE` directo en `stock_movements`.  
**Consecuencia:** Fallo RLS; debe usar `delete_stock_movements_for_albaran_line`.

### Riesgo 8 — Migración duplicada
**Escenario:** "Aplicar migraciones pendientes".  
**Error probable:** No detecta colisión `20260604150000_*`.  
**Consecuencia:** Una de las dos migraciones no se aplica.

### Riesgo 9 — Ignorar dependencia oculta BDP
**Escenario:** "Cambiar hora en ticket UI".  
**Error probable:** Modifica solo frontend sin leer `context/index.txt` contrato UTC.  
**Consecuencia:** Desalineación TPV ↔ Supabase ↔ UI.

### Riesgo 10 — Asumir tests/CI
**Escenario:** "Añadir test de regresión".  
**Error probable:** Crea `__tests__/` con Jest; no hay configuración.  
**Consecuencia:** PR sin validación automatizada; falsa sensación de seguridad.

---

## Gap Analysis

| Categoría | Estado | Cobertura | Acción |
|-----------|--------|:---------:|--------|
| **Arquitectura** | Parcial | 70% | Añadir diagrama capas, mapa `src/`, flujo BDP, índice server actions |
| **Frontend** | Parcial | 65% | Completar rutas, componentes por dominio, layouts/nav, PWA, chat |
| **Backend** | Parcial | 72% | Índice server actions + copilot tools; aclarar OpenAI Realtime vs LiveKit |
| **DB** | Parcial | 75% | Ampliar tablas/RPCs, buckets storage, RLS resumen, índice migraciones |
| **Auth** | Parcial | 72% | Matriz rol×ruta; corregir KDS; documentar `chef`; master user |
| **APIs** | Bueno | 88% | Mantener; añadir auth headers y códigos error por ruta |
| **Integraciones** | Parcial | 60% | BDP bien; Gemini/OpenAI bien; push VAPID mal; LiveKit incorrecto |
| **Infraestructura** | Débil | 50% | Documentar Vercel crons, hooks git/cursor, ausencia CI |
| **Testing** | Ausente | 5% | Documentar explícitamente "sin suite formal" + scripts ad-hoc |
| **Observabilidad** | Débil | 30% | Logs copilot/cron nombrados; sin APM; documentar convención `console` |
| **Negocio** | Parcial | 68% | Flujos paso a paso: fichaje, caja, albaranes, propinas, horarios |

---

## Conclusión

`context/LLM_PROMPT.md` es **utilizable como contexto inicial** pero **no autónomo** para un LLM senior. La §11 (changelog) es su mayor activo dinámico; las §§1-10 necesitan una revisión estructural significativa.

**Prioridad de corrección:**
1. Eliminar `/dashboard/finanzas`; consolidar en Insights.
2. Corregir permisos staff/KDS en §4.
3. Sustituir LiveKit por OpenAI Realtime en documentación de voz.
4. Añadir mapa de localización e índice server actions.
5. Documentar módulos omitidos (notificaciones, horarios, PWA, copilot UI).
6. Completar variables de entorno y DevOps.

**Puntuación estimada tras aplicar `llm_context_v2.md`:** **90/100**  
**Mejora conseguida:** **+16 puntos (+22%)**
