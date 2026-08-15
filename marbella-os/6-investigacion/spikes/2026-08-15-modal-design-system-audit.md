---
documento: SPIKE-MODAL-DESIGN-SYSTEM-AUDIT
clase: inmutable
estado: vigente
capa: investigacion
normativo: false
precedencia: 0
responsable: propiedad del producto
fechado: 2026-08-15
caducidad: no aplica
supersede: —
---

# Auditoría Modal — segundo piloto del Design System

> **MATERIAL NO NORMATIVO.** No autoriza implementación.
> Corpus vigente que manda sobre modales: `EXPERIENCIA §8`, `PATRONES P2/P4`, `SISTEMA-DE-COMPONENTES` (Modal), `TOKENS` (`estructura.alto-modal`, `elevacion.modal`, `radio.superficie`).
> Si el código contradice el corpus, el código tiene un defecto — salvo decisión explícita (ADR) que cambie la norma.
>
> Fase: **solo auditoría y diseño**. Sin migración, sin tokens nuevos en código, sin tocar Studio.

---

# 1. Estado actual

## 1.1 Lo que existe de verdad

| Pieza | Estado |
|---|---|
| `src/components/ui/modal.tsx` | Componente de sistema real: portal a `body`, backdrop, Escape, scroll lock (`lockScrollGlobal` → `data-modal-open`), tracking de uso, `headerVariant` white\|petroleum |
| Contrato documental | Fuerte en EXPERIENCIA / PATRONES / SISTEMA |
| Adopción | **Parcial**: ~29 importadores de `Modal`; **≥30 familias** con overlay propio (`fixed inset-0`) |
| Tokens de modal | `estructura.alto-modal` adoptado (CSS carta); `elevacion.modal` declarado; anchos/header **no tokenizados** |
| Identidad DS (`data-component`) | **No** en Modal (sí en `DashboardShortcut`) |
| Pie de acciones (PATRONES P2) | **Prescrito, no implementado** en `Modal` (no hay slot Footer) |
| Anidación | **Prohibida por norma**; **sistemática en código** vía `zIndexClass` / z ad hoc |

## 1.2 Qué funciona

- Shell canónico usable y ya adoptado en perfil, pedidos, tips staff, time filter, albaranes *derivados* (híbridos), etc.
- Scroll lock compartido con contador (`lockCount`) y atenuación de Navbar/BottomNav vía `html[data-modal-open]`.
- Telemetría (`usageId` / `usageLabel`) en el Modal de sistema.

## 1.3 Qué parece diseñado pero está incompleto

- `zIndexClass` / `stackElevated` como API de nesting sin arquitectura semántica.
- Híbridos `hideHeader` + cabecera petroleum casera (duplican anatomía).
- Variantes documentadas (compacta / fullscreen / día / ampliación) **no** existen como API tipada del componente.
- Footer fijo prescrito, ausente en el componente.

## 1.4 Conflicto norma ↔ código (crítico)

> EXPERIENCIA §8 / PATRONES P2: *«No se anidan modales»*.

El código de albaranes, caja, encargos, tip override, attendance, etc. **anida** overlays y documenta z-index locales (`z-[10050]` → `z-[10100]`). Esa divergencia es el problema arquitectónico central de esta fase: o se hace cumplir la norma, o se cambia la norma con ADR. **No se puede fingir que ambas son verdad.**

---

# 2. Inventario de modales

## 2.1 Usan `@/components/ui/modal` (muestra representativa)

Perfil (Datos*, Contrato, Nominas, Comunicados…), pedidos (SupplierSelection, OrderSummary), tips (`StaffTipModalShell`, TipConfirm), albaranes derivados (`LineEdit`, `LineMapping`, `DocumentEvidence`), TimeFilter, DaySummary, CashBoxEdit, Staff/Admin Product, CartaImageLightbox, DenominationZoom, NominasModal, RecipeNamePhotoEdit, EventEncargoCartFooter, etc.

**Patrón frecuente en albaranes derivados:** `Modal` + `hideHeader` + chrome petroleum propio + `zIndexClass="z-[10100]"` para vivir encima del detalle.

## 2.2 Overlay propio (no usan Modal) — familias principales

| Familia | Representante | Notas |
|---|---|---|
| Detalle albarán (host) | `AlbaranesHistoricoClient` | Portal `z-[10050]`; abre hijos |
| Visor / filtro albarán | mismo | Overlays custom |
| Caja | `CashClosingModal`, `CashChangeModal` | Anidan calc / historial |
| Movimientos | `MovementDetailModal` | `z-[10050]` + QuickCalculator |
| Tips | `TipOverrideModal` | Portal `z-[9999]` |
| Horarios | `StaffScheduleModal` | Custom + portal `z-[10100]` |
| Reservas/encargos | `EncargoOrderViewModal`, `DayAgendaModal`, editors | Cascada 10050–10080 |
| Create* | `CreateIngredientModal`, `CreateRecipeModal` | Sin scroll lock |
| Carta edit | `MenuItemEditModal`, `MenuCategoryEditModal` | z 350–360 |
| Lightbox | `ImageLightbox` | Ampliación P2, custom |
| KDS notes | `NotesModal` | `z-[2147483647]` |
| Consumo | `ConsumptionModal` | Bottom sheet en móvil |
| Dashboards inline | Staff/Admin/history/movements | Muchos ad hoc |
| Pavilion day | `PavilionDayModal` | Patrón día, custom |

## 2.3 No son Modal (deben quedar fuera del contrato overlay)

| Pieza | Motivo |
|---|---|
| `IngredientWizard` | **Panel de contenido** sin overlay propio; el host decide |
| Dropdowns / popovers | No dialog fullscreen |
| Toasts (Sileo/Sonner) | Canal distinto |
| Chat / loading fullscreen | Casos de app chrome, no modal de tarea |

---

# 3. Infraestructuras existentes

## 3.1 `Modal` (`ui/modal.tsx`) — anatomía real

```text
createPortal → body
└── container (fixed inset-0, flex center, p-4, z-100|110|custom)
    ├── backdrop button (absolute inset-0, bg-black/40 blur)
    └── wrapper (max-w-sm por defecto, pointer-events-none)
        └── panel role=dialog aria-modal
            └── ModalPanelShell
                ├── Header (opcional; white|petroleum; back/close/trailing)
                └── Body (scroll opcional)
                    └── children (+ overlay loading)
```

**No hay Footer.** Acciones viven dentro de `children`.

Props de escape hatch abundantes: `className`, `wrapperClassName`, `containerClassName`, `panelHostClassName`, `backdropClassName`, `zIndexClass`, `hideHeader*`, `scrollContent`, `stackElevated`, `usageId`…

## 3.2 Scroll lock

`src/hooks/useScrollLock.ts` → `lockScrollGlobal()` con contador. Compatible con nesting de locks; **no** resuelve Escape ni focus stack.

## 3.3 Atenuación de chrome

`html[data-modal-open="true"]` + `.marbella-fixed-topbar/bottombar` en `globals.css`.

## 3.4 CSS de altura especial

`.carta-modal-shell-max` / `.carta-plato-modal-shell` → ~94svh − safe-area (token `estructura.alto-modal`).

## 3.5 Norma de herramienta paralela

`.cursor/rules/modals.mdc` (DEUDA D27): exige Modal o tracking; **no cita Marbella OS**. Refuerza el contrato de facto del código, no sustituye EXPERIENCIA.

## 3.6 Z-index observados (realidad)

```text
50–110   Modal default / stackElevated / varios custom
150–400  caja, tips calc, carta, denomination
999–9999 chat, tip override, errores
10050+   albaranes, pavilion, reservas, movements
10100    derivadas albarán / schedule portal
2147483647  NotesModal (KDS)
```

No hay capas semánticas: solo números mayores.

---

# 4. Problemas y divergencias

1. **Dos mundos**: Modal sistema vs ~30 overlays custom.
2. **Anidación vs norma** (albaranes, caja, encargos…).
3. **Z-index como arquitectura** (anti-patrón confirmado).
4. **Footer prescrito, no implementado**.
5. **Tamaños por literales** (`max-w-sm`…`5xl`, `max-h-[85–95vh]`) sin familia tipada.
6. **Header duplicado** (`hideHeader` + petroleum casero).
7. **Safe-area inconsistente** (carta tiene svh; Modal usa `100dvh-2rem` sin safe-area explícita en el panel).
8. **Escape sin pila**: varios listeners; cierre ambiguo con nesting.
9. **Sin focus trap** real (solo `focus()` al abrir).
10. **Bottom sheets** en consumo/eventos vs regla de centrado de `modals.mdc`.
11. **Studio** solo detecta `[role=dialog]` por heurística; sin identidad DS.
12. **Conflicto corpus**: P2 dice no anidar; el producto operativo (albaranes) *necesita* superficies derivadas. Hay que decidir con ADR.

---

# 5. Anatomía propuesta de Modal

Tras revisar el DOM real y P2, la anatomía objetivo es:

```text
Modal (overlay infrastructure)
├── Overlay (backdrop)
└── Container (size + max-height viewport)
    ├── Header          ← altura fija / shrink-0
    │   ├── leading (back | spacer)
    │   ├── title (+ subtitle)
    │   └── actions (trailing + close)
    ├── Body            ← flex-1, scroll interno
    │   └── content
    └── Footer          ← NUEVO slot prescrito por P2; shrink-0
        └── actions
```

**Encaja** con `ModalPanelShell` actual salvo Footer (a añadir en implementación futura).

**No** convertir `IngredientWizard` en Modal: es contenido del Body (o de una variante `work`).

**Viewers / lightbox**: misma infraestructura Overlay+Container; Header puede ser mínimo; Body centrado en media.

---

# 6. Tokens necesarios

## 6.1 Reutilizar (ya en TOKENS.md)

| Token | Uso en Modal |
|---|---|
| `color.superficie` | Panel |
| `color.marca` | Header petroleum (hoy `#36606F` literal) |
| `color.texto*` / invertido | Títulos |
| `radio.superficie` | Esquinas del panel (`rounded-2xl` hoy) |
| `elevacion.modal` | Sombra panel (`shadow-2xl` hoy) |
| `estructura.alto-modal` | Tope de altura (~94% visible / svh−safe) |
| `espacio.2`–`4` | Paddings header/body |
| `tactil.minimo` | Close / back |
| `movimiento.transicion` | Entrada |

## 6.2 Propuestos (nombres tentativos — no implementar)

Solo lo que el inventario demuestra necesario y no cubre lo anterior:

| Concepto | Papel | Notas |
|---|---|---|
| `modal.ancho.compacto` | ~24rem (`max-w-sm`) | Confirmaciones / 2–3 campos |
| `modal.ancho.medio` | ~28–32rem (`md`/`lg`) | Formularios |
| `modal.ancho.amplio` | ~42–56rem (`2xl`–`4xl`) | Tablas / mapping |
| `modal.ancho.trabajo` | ~64rem (`5xl`) | Detalle documento |
| `modal.margen-viewport` | ~1–2rem + safe-area | Evita “salirse” |
| `modal.header.alto` | ~48–56px + padding | Cabecera fija |
| `modal.overlay` | `black/40` + blur | Unificar literales |
| `modal.capa.base` | capa semántica 1 | No número mágico |
| `modal.capa.derivada` | capa semántica 2 | Solo si ADR permite derivadas |
| `modal.capa.sistema` | lightbox / calc / alert | Encima de trabajo |

**No** hace falta un token por cada `z-[10100]`.

---

# 7. Política de tamaños

Familias **reales** observadas (no inventadas):

| Familia propuesta | Equivale en uso actual | Casos |
|---|---|---|
| **compact** | `max-w-sm` (~24rem) | Confirmaciones, info, DenominationZoom estrecho |
| **standard** | `max-w-md`–`lg` | Formularios perfil, productos, filtros |
| **wide** | `max-w-2xl`–`4xl` | Tablas, mapping líneas, schedules |
| **document** | `max-w-5xl` | Detalle albarán, evidence |
| **viewport** | ~fullscreen / 94svh | Trabajo día, Plato Marbella, algunos viewers |

**Distinción obligatoria:**

- **Ancho del modal** = familia de tamaño (token / prop `size`).
- **Altura del contenido** = intrínseca del Body.
- **Tope viewport** = siempre `min(contenido, estructura.alto-modal − márgenes)`; **nunca** crecer sin techo.

Default del componente hoy (`max-w-sm`) es correcto para **compact**; muchos consumidores ya lo sobreescriben — la API futura debe hacer el tamaño **explícito**.

---

# 8. Política de alturas

Propuesta alineada con EXPERIENCIA y con el shell actual:

| Zona | Política |
|---|---|
| Header | Altura fija / `shrink-0`; no scroll |
| Footer | Altura fija / `shrink-0`; no scroll (cuando exista) |
| Body | `flex-1 min-h-0`; scroll interno si desborda |
| Container | `max-height` acotado por viewport + safe-area |
| Formularios cortos | Alto según contenido, sin forzar pantalla completa |
| Tablas / wizards / mapping | Body scroll; opcional altura mínima de trabajo |
| Viewers | Body flex center; media con `max-h` propia |

**Encaja** con formularios, tablas, wizards (panel en Body), selectores listados, viewers — si el host no anida otro overlay completo.

**No encaja** con bottom sheets actuales de consumo: o se emigran a compact/standard centrado, o se declara patrón excepcional con ADR.

---

# 9. Header

Contrato propuesto (derivado de `ModalPanelShell` + norma):

- Siempre hay identidad accesible (`title` o `ariaLabel`).
- Salida visible (close) salvo casos documentados (`hideCloseButton` + alternativa).
- Variantes cromáticas: **white** | **petroleum** (ya existen); prohibir petroleum casero con `hideHeader` salvo migración.
- `onBack` = navegación *dentro* del mismo modal (wizard step / volver a lista), **no** “cerrar hijo anidado”.
- Padding desde tokens (`espacio.*`); compact opcional.
- Título = de qué es; no imperativo de acción (PATRONES).

Altura: token `modal.header.alto` (fija).

---

# 10. Body y scroll

- Un solo scroll principal: el Body (`overscroll-contain`).
- Prohibido scroll del `document` detrás (ya vía `lockScrollGlobal`).
- Listas largas / tablas: scroll en Body o región interna justificada, nunca el Container entero sin header fijo.
- Loading: overlay dentro del panel (ya existe).
- Wizards: pasos dentro del Body; progreso en Header trailing o subtítulo.

---

# 11. Responsive

## Desktop / tablet

- Centrado; `size` define ancho; margen viewport.
- Header/Footer no colapsan (`shrink-0`).

## Smartphone ~375px

Política única propuesta:

1. Mismo Modal centrado (no bottom sheet por defecto).
2. Ancho: `min(size, 100vw − 2×margen)`.
3. Alto: `min(contenido, alto-modal − safe-areas)`.
4. Padding container ≥ táctil / espacio seguro.
5. Close/back ≥ `tactil.minimo` (hoy close es 40px en Modal — **bajo el mínimo 48**; deuda a corregir en implementación).
6. Teclado virtual: Body scroll; no depender de `100vh` teórico (preferir `dvh`/`svh` + safe-area como carta).

Consumo/eventos bottom sheet: migrar o exceptuar por ADR, no copiar.

---

# 12. Overlay

- Un backdrop semitransparente + blur (token `modal.overlay`).
- Clic fuera → `onClose` (salvo modal con datos dirty → confirmación, EXPERIENCIA).
- Overlay no recibe scroll (touch-none / overscroll-none — ya en Modal).
- Con superficie **derivada** (si ADR lo permite): backdrop de la derivada oscurece también al padre, o el padre se atenúa; **una** política, no 30.

---

# 13. Z-index y stacking

**Prohibido** como diseño: escalera `10100`, `10200`, `10300`…

## Capas semánticas propuestas

| Capa | Nombre | Quién |
|---|---|---|
| 0 | `app` | Navbar ~100, BottomNav ~95 (hoy; revisar coherencia) |
| 1 | `modal.base` | Modal de tarea |
| 2 | `modal.derived` | Solo si ADR autoriza superficie derivada |
| 3 | `modal.system` | Calculadora / lightbox / confirm crítica puntual |

Implementación futura: tokens de capa o variables CSS (`--layer-modal-base`), **no** props `z-[n]` libres en cada pantalla.

`stackElevated` / `zIndexClass` actuales = deuda a eliminar tras la capa semántica.

---

# 14. Modales anidados

## Norma vigente

No anidar. Un modal no abre otro.

## Realidad operativa

Albaranes (y otros) **necesitan** “segunda superficie” (editar línea, mapear, evidencia, picker).

## Política arquitectónica propuesta (requiere decisión)

**Opción A — Cumplir norma (preferida a largo plazo)**  
Flujos derivados = **reemplazo** del contenido del mismo Modal (push interno: Header `onBack`) o **navegación de ruta**. Cero stacking.

**Opción B — ADR de “superficie derivada”**  
Permitir **como máximo una** derivada sobre un base, con:

- portal siempre a `body`;
- capas `base` / `derived`;
- Escape cierra solo la cima;
- focus trap en la cima;
- scroll lock compartido (contador);
- backdrop de derived cubre base;
- **prohibido** derived → derived (no Modal C).

**Opción C — Status quo**  
Seguir subiendo z-index. **Rechazada** como arquitectura.

### Recomendación de este spike

1. Corto plazo: **Opción B** documentada en ADR (albaranes ya viven así).
2. Medio plazo: migrar albaranes hacia **Opción A** (un Modal, stack de vistas internas).
3. Calculadora / lightbox: capa `system`, no “tercer modal de negocio”.

Wizards: **nunca** un Modal hijo; pasos en el Body.

Selectores: lista en el mismo Modal o patrón popover; si hoy son Modal encima, son deuda de nesting.

---

# 15. Variantes

Variantes **estructurales** alineadas con PATRONES P2 (cerradas):

| Variant | Qué fija | No fija |
|---|---|---|
| `compact` | size compact, alto contenido | color puntual |
| `standard` | size medio | — |
| `work` | size wide/document + altura de trabajo | — |
| `day` | contrato P4 (navegación día, alto repartido) | — |
| `amplify` | lightbox / cifra (poca chrome, foco media) | — |

**No son variantes:** petroleum vs white (eso es `headerTone` / token), `max-w-5xl` suelto, “modal verde de caja”, z-index.

Confirmación: `compact` + Footer de acciones, no variante `confirmation` obligatoria.

Wizard: **patrón de contenido**, no variante (salvo que `work` + steps sea el default documentado).

---

# 16. Patrones

| Nombre | Clasificación | Relación con Modal |
|---|---|---|
| Modal estándar | **Componente** + variant | `Modal` |
| Confirmación | **Patrón** de uso | `compact` + Footer |
| Modal de día | **Variante** `day` / patrón P4 | Modal |
| Ampliación | **Variante** `amplify` | Modal o ImageLightbox → Modal |
| Wizard | **Patrón de contenido** | Body; no overlay propio |
| Selector / picker | **Patrón** | Preferir vista interna; hoy a menudo Modal anidado (deuda) |
| Viewer / evidence | **Patrón** | `work`/`amplify` + Body media |
| Editor de línea | **Patrón de dominio** | Debe vivir en stack interno o derived (ADR) |
| Modal “secundario/anidado” | **No patrón deseable** | Solo derived bajo ADR, o eliminar |

---

# 17. Identidad estable

Mismo contrato que `DashboardShortcut`:

| Atributo | Significado Modal | Ejemplo |
|---|---|---|
| `data-component` | `Modal` | fijo |
| `data-variant` | familia estructural | `compact` \| `standard` \| `work` \| `day` \| `amplify` |
| `data-instance` | identidad de uso estable | = `usageId` (`line-edit`, `albaran-detail`, …) |

- El **título visible** no es identidad (puede cambiar copy).
- `usageId` ya existe parcialmente → reutilizar como `instance`.
- Elementos internos futuros: `data-element="overlay|header|body|footer"`.
- Render en **producción** (como Shortcut), no solo Studio.

---

# 18. Integración futura con Studio

Sin tocar Studio ahora. Preparación:

1. Modal emite `data-component` / `data-variant` / `data-instance` / `data-element`.
2. Studio indexa preferentemente esos attrs (como Shortcut).
3. Editable a nivel GLOBAL (tokens modal.*), COMPONENT, VARIANT, INSTANCE.
4. No editar z-index libre ni CSS arbitrario de cada dialog heurístico.
5. `[role=dialog]` sigue siendo fallback para legado.

---

# 19. Migración propuesta

## Fase 0 — Decisión (esta auditoría + ADR nesting)

Aprobar Opción A vs B (§14).

## Fase 1 — Contrato Modal (PR siguiente recomendada)

- Tokens mínimos modal (anchos, overlay, header alto, capas).
- API `size` / `variant` tipada; slot **Footer**.
- Identidad `data-*`.
- Safe-area + táctil 48px en close/back.
- Focus trap + Escape por pila (aunque solo haya una capa).
- Deprecar `zIndexClass` libre (mapear a capas semánticas temporalmente).

**No** migrar 50 modales en esa PR.

## Fase 2 — Piloto de dominio

Migrar **una** familia completa a contrato:

- **Recomendado:** albaranes (host + derivadas) — es el peor nesting; o  
- perfil (ya casi en Modal) como smoke test más seguro.

## Fase 3 — Oleadas

Caja → tips → reservas → create* → carta edit → dashboards inline → lightbox.

## Fase 4 — Studio

Lectura de identidad Modal (paralelo a Shortcut).

---

# 20. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| ADR nesting vs EXPERIENCIA | Alta | Decisión explícita antes de código |
| Migración masiva rompe flujos | Alta | Oleadas; piloto estrecho |
| Footer nuevo desplaza layouts | Media | Slot opcional al inicio |
| Safe-area cambia alturas PWA | Media | Paridad con carta-modal-shell |
| Quitar zIndexClass rompe albaranes | Alta | Capas semánticas primero |
| Bottom sheets | Media | Inventario + ADR o eliminación |
| Studio sin identidad | Baja ahora | Diferir; emitir attrs ya en Fase 1 |

---

# 21. Criterios de aceptación

Esta auditoría se da por buena cuando el propietario puede aprobar la §22 y, en la **siguiente** PR (aún no hecha):

- [ ] Un solo componente overlay para nuevos modales.
- [ ] Tamaños tipados; max-height viewport obligatorio.
- [ ] Header fijo + Body scroll (+ Footer cuando haya acciones).
- [ ] Política nesting documentada (A o B) y reflejada en código.
- [ ] Capas semánticas, no escalera numérica nueva.
- [ ] Identidad estable emitida.
- [ ] Close/back ≥ 48px; safe-area respetada.
- [ ] Ningún modal nuevo con `fixed inset-0` ad hoc.

---

# 22. DECISIÓN PROPUESTA

### 1. ¿Debe existir un único componente Modal?

**Sí.** Toda superficie dialog/overlay de tarea debe usar `src/components/ui/modal.tsx` (evolucionado). Prohibido nuevo `fixed inset-0` ad hoc. Paneles sin overlay (`IngredientWizard`) no son Modal.

### 2. ¿Qué debe ser token?

Reutilizar superficie, marca, radios, elevación modal, alto-modal, espacios, táctil.  
Añadir (en implementación futura): anchos de familia, margen viewport, alto de header, overlay, **capas semánticas**.  
No tokenizar cada z-index histórico.

### 3. ¿Qué debe ser variante?

Cerradas: `compact` | `standard` | `work` | `day` | `amplify`.  
Header tone ≠ variante. Color de negocio ≠ variante.

### 4. ¿Qué debe ser patrón?

Confirmación, wizard (contenido), selector, viewer/editor de dominio.  
“Modal anidado” no es patrón deseable.

### 5. ¿Cómo se comporta un modal anidado?

Por defecto: **no**.  
Si se autoriza ADR: **máximo una** superficie `derived` sobre `base`; Escape/focus/backdrop solo en la cima; wizards/selectores preferentemente **dentro** del mismo Modal.  
Calculadora/lightbox = capa `system`, no tercer modal de negocio.

### 6. ¿Cómo se comporta en 375px?

Centrado; ancho acotado al viewport; max-height con safe-area; scroll en Body; controles ≥48px; sin bottom sheet por defecto.

### 7. ¿Cómo se identifica?

```text
data-component="Modal"
data-variant="work"
data-instance="albaran-line-edit"   // = usageId estable
```

### 8. ¿Qué debe converger?

Todos los overlays listados en §2.2 (albaranes host, Cash*, TipOverride, Create*, carta edit, reservas, pavilion day, ImageLightbox, NotesModal, dashboards inline, etc.) hacia Modal + tokens + capas.

### 9. ¿Qué debe mantenerse independiente?

- `IngredientWizard` (contenido).
- Popovers/dropdowns.
- Toasts.
- Chrome de app (Navbar/BottomNav) — solo reaccionan a `data-modal-open`.
- Posible workspace KDS fullscreen (evaluar si es “pantalla” no “modal”).

### 10. ¿Cuál debería ser la siguiente PR?

**PR Modal Foundations (contrato):** tokens mínimos + API size/variant + Footer slot + identidad `data-*` + safe-area/táctil + capas semánticas (reemplazo de `zIndexClass` libre) + tests.  
**Sin** migrar Staff shortcuts ni Studio.  
**Sin** migrar todos los overlays; opcionalmente un único smoke (p. ej. un modal de perfil ya en sistema).

**En paralelo o justo después:** ADR “superficies derivadas” vs cumplimiento estricto de EXPERIENCIA §8.

---

## Preguntas que requieren tu aprobación (bloquean implementación)

1. **Nesting:** ¿ADR Opción B (1 derivada) o cumplimiento estricto Opción A (reemplazo interno)?
2. **Bottom sheets** de consumo: ¿eliminar o exceptuar?
3. **Primera migración de dominio** tras el contrato: ¿albaranes (alto riesgo/alto ROI) o perfil (bajo riesgo)?

---

*Fin del spike. Sin cambios de código de producto. Esperando revisión.*
