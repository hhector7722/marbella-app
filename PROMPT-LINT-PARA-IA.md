# TAREA: Corregir 292 errores de ESLint en Marbella App SIN romper nada

Repo: Next.js 16.2.11 · React 19.2.8 · TypeScript strict · Tailwind local · ESLint 9
(flat config `eslint.config.mjs` extiende `eslint-config-next/core-web-vitals` +
`eslint-config-next/typescript`) · `eslint-plugin-react-hooks@7` (reglas del React
Compiler: `set-state-in-effect`, `refs`, `immutability`, `purity`,
`preserve-manual-memoization`).

## Objetivo

Dejar el comando `npx eslint` con **0 errores** (los warnings de `<img>` no se
tocan) modificando únicamente los ficheros listados abajo, en sus líneas
indicadas. **Prohibido** desactivar reglas, cambiar `eslint.config.mjs`, añadir
`eslint-disable`/`@ts-ignore` nuevos, cambiar versiones o borrar código para que
el linter calle.

## Regla de oro (no romper la app)

1. Antes de tocar un fichero, léelo entero (no a ciegas por número de línea).
2. `any` → sustituir por el tipo REAL. Si no es deducible del código, usa
   `unknown` + estrechamiento explícito (`typeof`, `in`, `Array.isArray`,
   guardia propia), NUNCA `any` otra vez.
3. `set-state-in-effect` → el estado debe derivarse en render (`useMemo`,
   variable calculada) o moverse al manejador/evento. Solo si de verdad
   sincroniza con un sistema externo (DOM, socket, storage) se mantiene en
   efecto con `useState` + guardia; nunca con `setState` síncrono en el cuerpo.
4. `refs` → no leer ni escribir `ref.current` durante el render. Mover a
   `useEffect`/`useLayoutEffect` o a manejadores.
5. `immutability` → no mutar props/estado/hook return. Copiar antes de modificar.
6. `purity` → nada de llamadas impuras (`Date.now`, `Math.random`, mutaciones)
   en el cuerpo del render.
7. `preserve-manual-memoization` → respetar las dependencias declaradas; no
   reconstruir la memoización por dentro.
8. **Conservar el comportamiento visible exacto.** Si un cambio de lógica es
   necesario, que sea el mínimo y explica en el commit por qué.
9. No cambiar la firma pública de componentes exportados ni props.
10. No renombrar ficheros ni mover código entre módulos.
11. Si un `any` viene de un tipo de Supabase sin generación (`stock_movements`,
    etc.), el repo ya tiene `src/types/supabase.ts`: importar de ahí en vez de
    inventar un tipo. Si el tipo no existe, tiparlo localmente en el fichero.
12. **NO toques ningún fichero que no esté en la lista.** En particular, no
    toques `src/app/dashboard/inventory/ledger/LedgerClient.tsx` ni
    `src/app/dashboard/inventory/ledger/actions.ts` (tienen cambios sin commitear
    de otra tarea) ni `src/components/ui/modal.tsx` más allá de lo indicado.

## Verificación obligatoria (al terminar)

```
npx tsc --noEmit          # debe salir 0
npx eslint                # debe salir 0 errores
npm run test:design-system
npm run test:hours-engine
```

Los 4 tests que fallan en `test:design-system` son PREEXISTENTES y ajenos a
esta tarea (`DashboardShortcut separa icono y nombre`, `dashboard caja/ventas y
staff usan Surface`, `el resumen semanal es WeekSummary`, `reservas dispara +
reserva con Button`). No los arregles salvo que tu cambio los toque; documenta
si cambian.

## Orden de trabajo recomendado (de mayor a menor riesgo de rotura)

1. `prefer-const` (1) y `purity` (1): triviales.
2. `no-explicit-any` (218): por fichero, empezando por los de 1 solo caso.
3. `set-state-in-effect` (61) y `immutability` (3): requieren entender el flujo.
4. `refs` (6) y `preserve-manual-memoization` (2): los más delicados; hacerlos
   al final y revisando el efecto real en la UI.

---

## LISTA EXACTA DE ERRORES (292)

Formato: `fichero :: líneas`.

### @typescript-eslint/no-explicit-any (218)
- `src/components/dashboards/AdminDashboardView.tsx` :: 65, 106, 113, 146, 146, 169, 187, 188, 194, 195, 214, 259, 268, 340, 362, 362, 365, 381, 401, 402, 403, 403, 403, 404, 404, 404, 406, 408, 417, 418, 418, 418, 424, 446, 460, 482, 582, 879, 883, 885, 886, 889, 890, 890, 891, 941
- `src/components/dashboards/StaffDashboardView.tsx` :: 300, 369, 379, 380, 382, 387, 464, 471, 515, 516, 543, 548, 555, 555, 558, 581, 583, 583, 584, 584, 587, 600, 601, 601, 601, 607, 617, 645, 659, 697, 815, 816, 817
- `src/app/dashboard/history/page.tsx` :: 119, 156, 174, 216, 444, 453, 455, 464, 470, 480, 488, 516, 608, 619, 627, 648, 660, 668, 706, 712, 713, 714, 720, 1037, 1098, 1255, 1285, 1860, 1860, 2289
- `src/components/dashboards/MasterDashboardView.tsx` :: 51, 52, 110, 118, 126, 127, 315, 324, 356, 357, 357, 357, 358, 358, 358, 360, 362, 370, 374, 386, 386, 389, 409, 410, 410, 410, 416, 439, 453, 493
- `src/app/dashboard/consumo-personal/page.tsx` :: 300, 377, 378, 378, 379, 380, 381, 381, 387, 388, 388, 405, 410
- `src/app/recipes/[id]/page.tsx` :: 62, 67, 68, 69, 193, 193, 294, 298, 307, 349, 395, 606, 1418
- `src/app/dashboard/movements/page.tsx` :: 46, 57, 145, 150, 365, 418, 425, 457, 467, 545
- `src/app/dashboard/overtime/page.tsx` :: 98, 126, 151, 288, 292, 318
- `src/components/CreateRecipeModal.tsx` :: 11, 12, 16, 20, 138
- `src/components/MovementDetailModal.tsx` :: 21, 65, 70, 72, 86
- `src/components/ledger/ManagerLedgerView.tsx` :: 74, 126, 235, 272, 289
- `src/components/staff/StaffCartaEditor.tsx` :: 183, 197, 199, 201, 206
- `src/components/CashChangeModal.tsx` :: 148, 164, 176, 419
- `src/components/carta/MenuItemEditModal.tsx` :: 167, 170, 208, 570
- `src/components/NominasModal.tsx` :: 121, 158
- `src/components/modals/CashBoxEditModal.tsx` :: 54, 77
- `src/app/dashboard/albaranes/AlbaranesHistoricoClient.tsx` :: 92
- `src/components/CashClosingModal.tsx` :: 491
- `src/components/carta/MenuCategoryEditModal.tsx` :: 91
- `src/components/profile/ComunicadosModal.tsx` :: 127
- `src/components/profile/ContratoModal.tsx` :: 114

### react-hooks/set-state-in-effect (61)
- `src/app/staff/reservas/ReservasClient.tsx` :: 315, 847, 861, 903
- `src/components/CashClosingModal.tsx` :: 149, 159, 173, 204
- `src/components/modals/DaySummaryModal.tsx` :: 111, 118, 123, 132
- `src/app/dashboard/albaranes/AlbaranesHistoricoClient.tsx` :: 223, 227, 385
- `src/components/orders/OrderSuccessModal.tsx` :: 41, 51, 64
- `src/app/dashboard/consumo-personal/page.tsx` :: 260, 313
- `src/app/dashboard/history/page.tsx` :: 867, 896
- `src/app/dashboard/insights/InsightsClient.tsx` :: 1078, 1082
- `src/app/dashboard/recetas-tpv/MappingClient.tsx` :: 562, 567
- `src/app/recipes/[id]/page.tsx` :: 261, 271
- `src/components/CashChangeModal.tsx` :: 154, 187
- `src/components/PushNotificationsPrompt.tsx` :: 39, 71
- `src/components/dashboards/AdminDashboardView.tsx` :: 234, 305
- `src/components/modals/AttendanceDetailModal.tsx` :: 176, 412
- `src/components/reservas/EncargoProductEditor.tsx` :: 470, 479
- `src/components/ui/modal.tsx` :: 488, 500
- `src/app/dashboard/overtime/page.tsx` :: 117
- `src/app/ingredients/page.tsx` :: 63
- `src/components/MovementDetailModal.tsx` :: 34
- `src/components/NominasModal.tsx` :: 72
- `src/components/albaranes/LineMappingModal.tsx` :: 309
- `src/components/carta/MenuCategoryEditModal.tsx` :: 68
- `src/components/carta/MenuItemEditModal.tsx` :: 123
- `src/components/dashboards/MasterDashboardView.tsx` :: 225
- `src/components/kds/KDSView.tsx` :: 248
- `src/components/kds/NotesModal.tsx` :: 61
- `src/components/modals/InfoMenuModals.tsx` :: 57
- `src/components/modals/SimulationPlantillaExportModal.tsx` :: 51
- `src/components/profile/ComunicadosModal.tsx` :: 70
- `src/components/profile/ContratoModal.tsx` :: 64
- `src/components/recipes/RecipeNamePhotoEditModal.tsx` :: 60
- `src/components/reservas/DayAgendaModal.tsx` :: 215
- `src/components/staff/StaffCajaCambioModal.tsx` :: 58
- `src/components/staff/StaffCartaEditor.tsx` :: 529
- `src/components/suppliers/SupplierSelectionModal.tsx` :: 102
- `src/components/tips/TipOverrideModal.tsx` :: 55
- `src/components/ui/DenominationZoomModal.tsx` :: 34

### react-hooks/refs (6)
- `src/components/chat/ChatMarbella.tsx` :: 69, 81, 94
- `src/components/ui/modal.tsx` :: 416, 420, 431

### react-hooks/immutability (3)
- `src/app/recipes/[id]/page.tsx` :: 270
- `src/app/staff/actividades/gestion/page.tsx` :: 59
- `src/components/CashClosingModal.tsx` :: 218

### react-hooks/preserve-manual-memoization (2)
- `src/components/albaranes/LineMappingModal.tsx` :: 361
- `src/components/tips/TipOverrideModal.tsx` :: 93

### react-hooks/purity (1)
- `src/app/recipes/[id]/page.tsx` :: 379

### prefer-const (1)
- `src/app/staff/reservas/ReservasClient.tsx` :: 722

---

## Notas específicas por caso difícil

- `src/components/ui/modal.tsx` (líneas 488, 500 + refs 416/420/431): es el Modal
  de sistema usado por 98 consumidores. Cualquier cambio aquí afecta a toda la
  app. Los `ref.current = fn` en render deben pasar a
  `useLayoutEffect(() => { ref.current = fn })`. Los `setState` dentro de
  `useEffect` deben pasar a inicialización perezosa o a `key`/derivación. **No
  cambiar la API pública del componente.** Tras tocarlo, ejecuta también
  `npm run test:design-system` porque `modal-contract.test.ts` inspecciona este
  fichero por regex (p. ej. espera el literal
  `headerToneProp ?? headerVariant ?? 'petroleum'`).
- `src/app/dashboard/movements/page.tsx:365`: ejemplo canónico de `any` con
  `pageMoves.map((m: any) => ...)`. Tipar `pageMoves` con la forma real del
  movimiento (ver `src/types/supabase.ts` y el resto del fichero).
- `src/components/CashClosingModal.tsx`: tiene 4 `set-state-in-effect` que
  parecen sincronización real con `blob:` URLs (líneas 149/159) — esos van
  bien como efecto, pero el `setState` debe derivarse o guardarse en
  `useMemo`/`useLayoutEffect`; el warning es por el `setState` síncrono, no
  por el efecto.
- `src/components/dashboards/AdminDashboardView.tsx:234`: `setIsDesktop(...)`
  dentro de efecto sin guardia. Patrón correcto: inicializar con
  `useState(() => window.innerWidth >= 768)` cuando sea `'use client'` y el
  servidor no renderice ese bloque; si hay SSR, usar guardia + no volver a
  escribir si el valor no cambió.
- `src/components/dashboards/{Admin,Staff,Master}DashboardView.tsx`: contienen
  la mayoría de los `any`. Casi todos son accesos a datos de Supabase; se
  resuelven tipando el resultado de las consultas con las filas de
  `src/types/supabase.ts`.

## Entregable

- Un commit por grupo de regla (o por fichero si un fichero es grande), con
  mensaje `fix(lint): <regla> en <zona>`.
- Al final, un resumen: ficheros tocados, errores antes/después
  (`npx eslint -f json | jq '[.[].messages[] | select(.severity==2)] | length'`),
  y confirmación de que `tsc`, `eslint`, `test:design-system` y
  `test:hours-engine` pasan.
