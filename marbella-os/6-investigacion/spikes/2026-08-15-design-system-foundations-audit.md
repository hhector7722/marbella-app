---
documento: SPIKE-DESIGN-SYSTEM-FOUNDATIONS-AUDIT
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

# DESIGN_SYSTEM_FOUNDATIONS_AUDIT

> **MATERIAL NO NORMATIVO — SPIKE-DESIGN-SYSTEM-FOUNDATIONS-AUDIT**
>
> Nombre de fichero según CANON §7: `2026-08-15-design-system-foundations-audit.md`.
> Título de entregable pedido: **DESIGN_SYSTEM_FOUNDATIONS_AUDIT**.
>
> Análisis fechado el 2026-08-15. **No autoriza implementación** hasta aprobación explícita.
> Ante discrepancia con el corpus vigente (`TOKENS`, `SISTEMA-DE-COMPONENTES`, `DEUDA`), gana el corpus.
>
> Pedido del propietario: fase de FUNDACIONES; piloto futuro `DashboardShortcut`; **sin programación en este turno**.

---

# 1. Estado actual

## 1.1 Qué existe de verdad

| Área | Realidad verificada |
|---|---|
| `src/lib/design-system/` | **No existe** |
| Tokens de pantalla en Tailwind / CSS vars de marca | **No adoptados**. `tailwind.config.ts` tiene `theme.extend: {}` |
| Contrato de tokens | Existe y es normativo: `marbella-os/2-diseno/TOKENS.md` |
| Contrato de componentes | Existe: `marbella-os/2-diseno/SISTEMA-DE-COMPONENTES.md` (base ausente en código) |
| Kit PDF | Existe: `src/lib/pdf/design-system-v2/` (canal distinto; marca `#1F5FAF`) |
| Marbella Studio | Existe: `src/app/playground/studio/` + `src/components/studio/StudioPreviewClient.tsx` |
| Deuda reconocida | `DEUDA.md` D1 (tokens) y D2 (componentes base) |

## 1.2 Qué funciona hoy en producto

- Shell visual: `.bg-marbella-shell` (único color de envolvente centralizado).
- Tipografías: Inter (layout) y Teko (KDS cocina).
- Utilidades estructurales en `globals.css` (cabecera, fin de lista, modal, calendario).
- Componentes de sistema parciales: Modal, Navbar, StaffBottomNav, DashboardDetailLayout, Spinner, etc.
- Atajo de dashboard “oficial” parcial: `DashboardIosIcon` (solo consumido por Master).

## 1.3 Qué parece diseñado pero está incompleto

- Catálogo completo de tokens en `TOKENS.md` casi todo en estado **declarado**.
- Studio con scopes UI Global / Tipo / Este, pero **sin VARIANT ni SCREEN** tipados.
- `VisualOverride` tipa shape/elevation/flex/outline… que **no aplica** el runtime.
- Anatomía Studio (`bg` / `asset` / `text`) solo anclada en 2 componentes de producto.
- Recipe/movidas del Studio existen; no son la fuente de verdad del producto.

## 1.4 Qué debería existir y aún no

- Tokens de pantalla adoptados (CSS variables / Tailwind theme).
- Componentes base (Button, Input, Card, EmptyState…) según `SISTEMA-DE-COMPONENTES`.
- Un único componente de atajo de dashboard con contrato estable.
- Identidad estable `component` / `variant` / `instance` en markup.
- Cascada GLOBAL → COMPONENT → VARIANT → INSTANCE consumible por Studio **sin** heurística de texto+índice.

---

# 2. Tokens existentes

## 2.1 Fuente normativa (pantalla)

Documento: `marbella-os/2-diseno/TOKENS.md`.

Familias declaradas:

- Color de marca (`color.marca*` → `#36606F` y variantes).
- Envolvente (`color.envolvente*` → `#5B8FB9` / `#7EB0D4` / `#46769C`).
- Superficies, texto, bordes, semánticos.
- Tipografía (`tipo.*`): Inter adoptada; escala de tamaños/pesos declarada.
- Espaciado `espacio.1…12` (escala 4px; “adoptado por herencia” del motor Tailwind, **sin nombres de token en código**).
- Forma `radio.*`, elevación `elevacion.*`, táctil `tactil.*`.
- Estructura `estructura.*` (varias utilidades CSS adoptadas).
- Movimiento `movimiento.*` (spinner adoptado).

## 2.2 Tokens realmente utilizados / adoptados en código de pantalla

| Token / familia | Adopción real |
|---|---|
| `color.envolvente*` | **Adoptado** vía `.bg-marbella-shell` |
| `tipo.familia` Inter | **Adoptado** en `layout.tsx` |
| `tipo.familia.cocina` Teko | **Adoptado** en KDS |
| `estructura.cabecera`, fin-de-lista, alto-modal, barra inferior (parcial) | **Adoptado** vía clases en `globals.css` |
| `movimiento.espera` | **Adoptado** vía `.animate-spinner-fade` |
| `color.marca` y resto de colores de pantalla | **Declarados, no centralizados** — hex literal (`#36606F` aparece ~881 veces en `src`) |
| Escala tipográfica nombrada, radios, elevaciones, táctil como token | **No centralizados** — literales Tailwind (`rounded-2xl`, `min-h-[48px]`, `shadow-sm`…) |

## 2.3 Tokens documentados pero no conectados al código de UI

Prácticamente todo el catálogo de color de marca/superficie/texto/borde/semántico, radios nombrados, elevaciones nombradas y tipografía dimensional. El propio `TOKENS.md` lo declara: *«la práctica totalidad de los tokens está en estado declarado»*.

## 2.4 Canal PDF (existe, no es el DS de pantalla)

`src/lib/pdf/design-system-v2/tokens.ts` exporta `DS_COLORS`, `DS_TYPE`, `DS_SPACE`, etc. Marca impresa `#1F5FAF` ≠ marca pantalla `#36606F` (conflicto documentado en `LENGUAJE-VISUAL` / deuda D13). **No inventar un DS de pantalla copiando el PDF.**

## 2.5 Hardcodes que deberían depender de tokens (ejemplos del piloto)

En `DashboardIosIcon` y clones:

- `bg-white`, `border-gray-100`, `text-gray-800`, `rounded-2xl`, `rounded-xl`, `shadow-sm`
- Tamaños `w-12 h-12`, `text-[9px]` / `text-[8px]`
- Overrides de instancia en Master: `bg-emerald-600` (“C INICIAL”)
- Staff/Admin: mismos literales duplicados, sin tokens ni anclas Studio

---

# 3. Problemas detectados

## 3.1 Arquitectónicos (raíz)

1. **No hay Design System de pantalla adoptado** → las páginas nuevas copian hex y clases.
2. **Studio interpreta DOM genérico** → identidad frágil (`ruta + kind + scope + label + índice`).
3. **El producto no declara componentes al Studio** salvo `data-studio-target` en 2 piezas.
4. **Tres implementaciones del mismo patrón de atajo** (Master / Staff / Admin).
5. **Jerarquía de estilos incompleta**: hay Global (root) + Component (heurístico) + Instance (key frágil); no hay Variant ni Screen tipados.
6. **Cascada parcialmente violenta**: tipografía/color se fuerzan a descendientes con `*:not([data-studio-has-…]) !important` en `globals.css`.
7. **Studio ≠ producción**: estéticas en `localStorage` (`marbella-sandbox-storage`); la app real no las consume como tema de producto.

## 3.2 Shortcuts: inventarios

| Implementación | Ubicación | ¿Usa `DashboardIosIcon`? | Anclas Studio | Identidad de negocio |
|---|---|---|---|---|
| `DashboardIosIcon` | `src/components/dashboards/DashboardIosIcon.tsx` | — | Sí (`bg`, `asset`, `text`) | No en el componente |
| `MasterShortcutGrid` | `…/MasterShortcutGrid.tsx` | **Sí (único consumidor)** | Heredadas | **Sí: `key: 'asistencia'`, etc.** |
| `IOSIconBoxed` | inline en `StaffDashboardView.tsx` | No | No | No |
| `renderQuickActionSquare` | inline en `AdminDashboardView.tsx` | No | No | No (usa `title` visible) |

**Conclusión:** sí deben converger en un único componente de sistema. El nombre propuesto `DashboardShortcut` es el candidato correcto; hoy el código llama `DashboardIosIcon`.

## 3.3 Studio: identificación actual

Key real generada en `VisualLab.tsx`:

```text
`${route}:${kind}:${scope}:${label}:${index}`
```

- `label` = `aria-label` o `textContent` truncado.
- `scope` = heurística (`button:primary`, `card:default`, `icon-box:default`…).
- `data-studio-component` se **inyecta en runtime**, no viene del React del producto.
- No existen `data-component` / `data-variant` / `data-instance` en la app.

**Dependencia de heurísticas DOM:** `TARGET_SELECTOR` amplio, `classify()`, conteo de índices, detección de “primary” por clases Tailwind, composición solo si hay `data-studio-target`.

## 3.4 Respuestas a las 11 preguntas de auditoría

1. **¿Tokens reales?** → Catálogo en `TOKENS.md` + kit PDF; UI casi sin adopción.
2. **¿Utilizados?** → Envolvente, Inter/Teko, estructura CSS, spinner; marca y resto por literales.
3. **¿Documentados sin conectar?** → La mayoría del catálogo de pantalla.
4. **¿Hardcodes?** → Hex de marca masivo; radios/sombras/tipografía dimensional; clones de shortcut.
5. **¿Cuántas implementaciones de shortcuts?** → **3** (más el componente compartido Master).
6. **¿Mismo patrón?** → Las 3: botón-tarjeta con icono/imagen + label uppercase.
7. **¿Identificación Studio?** → Key frágil + scopes heurísticos + targets manuales puntuales.
8. **¿Heurísticas?** → Indexación, classify, resolución component/instance, hit-testing.
9. **¿Reutilizable del Studio?** → iframe/postMessage, draft+undo, composition props, ResponsiveOverride, inspector ±, presets de composición, sandbox.
10. **¿Cambiar después?** → Modelo de claves, resolución de capas, forzado a hijos, persistencia de producto, dejar de clasificar DOM genérico como “tipo”.
11. **¿Arquitectura mínima para editar componentes reales?** → Contrato de identidad en markup + componente piloto con anatomía estable + resolución de patches por id estable (no por texto).

---

# 4. Arquitectura objetivo

Dirección aprobable (alineada con el pedido y con D1→D2):

```text
TOKENS.md
  → CSS variables / Tailwind theme (adopción)
    → COMPONENTES MARBELLA (React + contrato data-*)
      → VARIANTES (props / data-variant)
        → PÁGINAS (componen; no rediseñan)
          → INSTANCIAS (data-instance estable)
            → STUDIO (edita layers; no inventa el sistema)
```

**Prohibido como dirección permanente:**

```text
PÁGINA → DOM → heurísticas Studio → overrides arbitrarios
```

## 4.1 Principios

- Una magnitud visual, un productor (tokens).
- Identidad estable ≠ copy visible.
- Variante = diferencia estructural reutilizable; no cada excepción cromática.
- Cascada preferida: CSS variables + `data-*` + selectores; no walk que pinte hijos.
- Studio edita el **contrato**, no CSS libre universal.
- Mantener composición por propiedades independientes (no reintroducir enum `composition`).

## 4.2 Piloto

Solo `DashboardShortcut` (evolución de `DashboardIosIcon`). No migrar Button/Modal/Navbar en esta fase.

---

# 5. DashboardShortcut

## 5.1 Decisión de convergencia

**Sí: un único componente.** Evidencia:

- Misma anatomía visual en Master/Staff/Admin.
- Solo Master está tipado y Studio-ready.
- Staff/Admin son clones locales (deuda D2 aplicada al patrón).
- `MasterShortcutGrid` ya tiene claves de negocio (`asistencia`, `recetas`, …) — base ideal de `data-instance`.

## 5.2 Qué NO es variante

| Caso | Clasificación correcta |
|---|---|
| Label “Asistencia” vs “CONTROL DE ASISTENCIA” | Contenido / i18n — **no** identidad |
| `bg-emerald-600` en C INICIAL | Override de **instancia** (o slot métrico) |
| Badge de reservas | Slot / prop de instancia |
| Navegar a distinta ruta | Comportamiento — fuera del DS visual |
| Padding distinto Admin vs Master | Hoy deuda; unificar al default del componente |

## 5.3 Nombre

- Contrato DS: **`DashboardShortcut`**
- Código actual: `DashboardIosIcon` (renombrar o envolver en migración posterior; **no en este turno**)

---

# 6. Anatomía del componente

Tras revisar el markup real de `DashboardIosIcon`:

```text
button (host)
├── [opcional] badge
├── div data-studio-target="bg"     ← caja de icono / zona de contenido
│   └── div data-studio-target="asset"
│         └── Image | Lucide wrapper | children (métrica)
└── span data-studio-target="text"  ← label
```

### Veredicto sobre la anatomía pedida

```text
DashboardShortcut
├── host
├── iconBox
│   └── asset
└── text
```

**Es correcta y ya está casi materializada** por `data-studio-target` (`bg` ≈ iconBox, `asset`, `text`). El host es el `<button>`.

Ajustes conceptuales (para la implementación futura, no ahora):

- Renombrar semánticamente `bg` → `iconBox` en el contrato (o mapear `bg`/`icon` → iconBox en Studio).
- Badge es **accesorio de instancia**, no pieza de composición base.
- `children` en asset = modo métrico (C INICIAL, H. extras, cajas) — contenido, no variante estructural obligatoria.

Staff/Admin carecen de esta anatomía etiquetada; por eso el Studio no puede componerlos igual.

---

# 7. Variantes

## 7.1 Criterio

- **VARIANT** = estructura/composición reutilizable entre muchas instancias.
- **Config / override** = token-level o StylePatch (color, escala, tipografía).
- **INSTANCE** = una sola tecla de negocio.

## 7.2 Variantes propuestas (mínimas)

Basadas en presets reales de `composition.ts` + usos reales:

| Variant id | Equivale a | showText | showIcon | iconBoxMode | Superficie host (default) |
|---|---|---|---|---|---|
| `icon-text` | preset `together` | true | true | `none` | card del host |
| `icon-card-text-outside` | preset `icon-card-text-out` | true | true | `box` | host transparente; card en iconBox |
| `separated` | preset `separated` | true | true | `none` | host transparente |
| `icon-only` | props | false | true | según uso | hereda |
| `text-only` | props | true | false | n/a | hereda |

**No crear** variantes por: color emerald, badge, children métricos, responsive md, pantalla admin vs master.

## 7.3 Modelo de datos de variante

La variante es un **paquete nombrado de props independientes** (mismo modelo que `compositionPresetPatches`), no un enum `composition` cerrado.

Default recomendado del componente: `icon-text` (comportamiento actual de `DashboardIosIcon`).

---

# 8. Identidad estable

## 8.1 Contrato propuesto (markup)

```html
<button
  data-component="DashboardShortcut"
  data-variant="icon-text"
  data-instance="asistencia"
>
  <div data-element="iconBox">…</div>
  <div data-element="asset">…</div>
  <span data-element="text">Asistencia</span>
</button>
```

Reglas:

- `data-instance` = id de negocio (`asistencia`), **nunca** el label.
- Si el label cambia, el override permanece en `asistencia`.
- `MasterShortcutGrid` ya usa `key: 'asistencia'` → reutilizar ese vocabulario.
- Elementos internos: `data-element` (o seguir `data-studio-target` durante transición) con valores cerrados: `iconBox` | `asset` | `text`.

## 8.2 Qué abandonar

| Hoy | Mañana |
|---|---|
| `…:Asistencia:0` en la key | `instance:asistencia` (+ screen si hace falta) |
| `component:button:secondary` heurístico | `component:DashboardShortcut` |
| Índice DOM como identidad | Prohibido para persistencia |

## 8.3 Compatibilidad Studio (futuro, no ahora)

El indexador debe **preferir** atributos estables; caer a heurística solo para nodos sin contrato (legado). Las keys nuevas no deben incluir texto visible.

---

# 9. Jerarquía de estilos

## 9.1 Capas conceptuales

```text
GLOBAL          → TokenSet / Theme / estética root
COMPONENT       → defaults de DashboardShortcut
VARIANT         → paquete de composición + superficies default
INSTANCE        → excepción de una tecla (asistencia, caja-inicial)
ELEMENT         → iconBox | asset | text (pieza interna)
```

Viewport ortogonal en cada capa:

```text
all ≺≺ mobile | tablet | desktop
```

## 9.2 Encaje con el sistema actual

| Pieza actual | Encaje |
|---|---|
| `Estetica` + `recipe` | Candidato a capa GLOBAL / Theme (hoy laboratorio) |
| `VisualOverrides` `Record<string, ResponsiveOverride>` | Hay que **reindexar** por layer+id; la forma ResponsiveOverride se conserva |
| `overrideFor`: component ≺≺ instance | Ampliar: component ≺≺ variant ≺≺ instance ≺≺ element; global en cascada real |
| Zustand persist | Conservar para sandbox; producto versionado = fase posterior |
| Draft + `history.ts` | Conservar sin cambios de concepto |
| postMessage + iframe | Conservar |
| `applyOverrideAttributes` + forzado `*` | Adaptar después: menos inline, menos hijos forzados |

## 9.3 Screen

No es obligatorio en el piloto. La ruta hoy vive dentro de la key de instancia. Se puede añadir `data-screen` / layer SCREEN cuando aparezcan desviaciones sistemáticas por página. **Decisión propuesta:** posponer SCREEN hasta que duela.

---

# 10. Integración futura con Studio

## 10.1 Qué se conserva

- Iframe + `MARBELLA_STUDIO_SYNC` / click / drag.
- Draft independiente + undo/redo.
- Composición por props independientes + presets + tests.
- Steppers ± (no sliders).
- `ResponsiveOverride`.
- Sandbox / `data-marbella-sandbox`.
- Selección granular host / iconBox / asset / text (ya alineada con anatomía).
- Persistencia local de estéticas (como laboratorio).

## 10.2 Qué se adapta después (sin features nuevas ahora)

1. Resolución de identidad: leer `data-component|variant|instance|element`.
2. Scopes del inspector: Global / Component / Variant / Instance / Element.
3. Dejar de regenerar keys por label+índice para nodos con contrato.
4. Retirar (o acotar) el forzado tipográfico a todos los hijos.
5. Conectar VARIANT al mismo modelo que presets de composición.
6. (Más tarde) Aplicador de tema en producto real, fuera de localStorage.

## 10.3 Arquitectura mínima para “editar componentes reales”

1. Componente React emite identidad estable.
2. Studio indexa por esa identidad.
3. Patches se guardan por `(layer, id, viewport, element?)`.
4. Aplicación preferente por CSS/`data-*`; overrides quirúrgicos solo en instance/element.
5. Heurística DOM queda como fallback de legado, no como diseño.

**En esta fase de fundaciones no se cambia el Studio** salvo que una decisión de contrato lo exija al implementar el piloto (y solo tras aprobación).

---

# 11. Migración incremental

## Fase A — Contrato (documento + aprobación) ← **estamos aquí**

- Este spike.
- Decisión cerrada del piloto (sección final).
- Sin código de producto.

## Fase B — Tokens mínimos para el piloto (tras aprobación)

- Adoptar en Tailwind/CSS solo los tokens que `DashboardShortcut` necesite (superficie, texto, radio, elevación, táctil, gap).
- **No** migrar los ~881 hex de toda la app.

## Fase C — Componente `DashboardShortcut`

- Extraer/renombrar desde `DashboardIosIcon`.
- Emitir `data-component` / `data-variant` / `data-instance` (instance lo pasa el grid).
- Mantener props de composición independientes.
- Sustituir usos en `MasterShortcutGrid` (ya tiene keys).

## Fase D — Convergencia Staff / Admin

- Reemplazar `IOSIconBoxed` y `renderQuickActionSquare` por `DashboardShortcut`.
- Misma variante default; instances con ids estables.

## Fase E — Studio lee identidad estable (adaptación mínima)

- Preferir atributos nuevos en indexación.
- Mapear presets ↔ `data-variant`.
- No añadir paneles nuevos; reutilizar inspector.

## Fase F — (Posterior) más componentes con el mismo contrato

Button → Surface/Card → DashboardDetailLayout → Modal → Navbar → BottomNav.

---

# 12. Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Migrar tokens de golpe en toda la app | Alta | Solo tokens del piloto |
| Romper overrides guardados en localStorage | Media | Fase E con dual-read (estable + legacy key) |
| Explosión de variantes | Alta | Lista cerrada §7; excepciones = instance |
| Renombrar `DashboardIosIcon` rompe imports | Baja | Un solo consumidor hoy (`MasterShortcutGrid`) |
| Staff/Admin layout distinto al unificar | Media | Paridad visual con checklist |
| Studio sigue pintando DOM genérico | Alta a 2 años | Identidad estable obligatoria en componentes DS |
| Tratar Studio localStorage como producción | Alta | Mantener sandbox hasta aplicador de producto |
| Reintroducir enum `composition` | Media | Constitución: presets → props independientes |

---

# 13. Criterios de aceptación

Esta auditoría / fase de fundaciones se considera lista para implementación **solo cuando** el propietario apruebe la sección DECISIÓN PROPUESTA y, en la primera PR de código, se cumplan:

### Piloto `DashboardShortcut` (futuro)

- [ ] Un solo componente tipado para atajos Master (y plan claro para Staff/Admin).
- [ ] Anatomía host / iconBox / asset / text estable en markup.
- [ ] `data-component="DashboardShortcut"`.
- [ ] `data-variant` ∈ lista cerrada §7.
- [ ] `data-instance` estable e independiente del label.
- [ ] Cambiar label no invalida overrides de instancia (criterio de diseño verificado en contrato Studio futuro).
- [ ] Composición solo vía props independientes; **cero** escritura del enum legacy.
- [ ] Presets existentes mapean a variantes sin hacks por pantalla.
- [ ] Valores visuales del default salen de tokens adoptados del piloto (no hex nuevos).
- [ ] Sin cambios de negocio, rutas, Supabase ni APIs.
- [ ] Studio: sin features nuevas; como mucho lectura de identidad estable.

### Fundaciones (este documento)

- [ ] Inventario de shortcuts verificado (3 implementaciones).
- [ ] Tokens adoptados vs declarados distinguidos.
- [ ] Arquitectura objetivo y no-hacer explícitos.
- [ ] Lista de archivos tocables / intocables.

---

# 14. Archivos que deberían cambiar

*(Solo tras aprobación; orden aproximado)*

| Archivo / zona | Motivo |
|---|---|
| `tailwind.config.ts` + `src/app/globals.css` | Adoptar tokens mínimos del piloto |
| `src/components/dashboards/DashboardIosIcon.tsx` | Evolucionar a `DashboardShortcut` + identidad |
| `src/components/dashboards/MasterShortcutGrid.tsx` | Pasar `instance` desde `key` ya existente |
| `src/components/dashboards/StaffDashboardView.tsx` | Eliminar `IOSIconBoxed` → usar componente |
| `src/components/dashboards/AdminDashboardView.tsx` | Eliminar `renderQuickActionSquare` → usar componente |
| (Opcional) `src/components/dashboards/DashboardShortcut.tsx` | Nombre canónico nuevo |
| `marbella-os/2-diseno/SISTEMA-DE-COMPONENTES.md` | Declarar el componente cuando exista |
| `marbella-os/5-estado/DEUDA.md` / CHANGELOG | Registrar pago parcial D1/D2 |
| Más tarde: `VisualLab.tsx`, `types.ts` | Lectura de identidad estable |

---

# 15. Archivos que NO deberían tocarse todavía

| Zona | Motivo |
|---|---|
| Supabase / migraciones / RLS | Fuera de alcance |
| APIs, server actions de negocio | Fuera de alcance |
| Navegación / rutas productivas | Fuera de alcance |
| Modal, Navbar, BottomNav, DashboardDetailLayout (migración) | Siguiente oleada |
| Persistencia Studio → DB / producción | Tras piloto estable |
| Recipe/movidas / BarraIntencion (rediseño) | No bloquea fundaciones |
| Kit PDF `design-system-v2` | Canal distinto; no mezclar |
| Migración masiva de `#36606F` en toda `src` | Fuera del piloto |
| Reintroducir enum `composition` | Prohibido |
| Features nuevas del inspector Studio | Explícitamente fuera |

---

## DECISIÓN PROPUESTA

### Qué hacer primero

1. **Aprobar este spike** (o enmendarlo) antes de cualquier PR.
2. Tras aprobación: **Fase B+C** — tokens mínimos del atajo + componente único `DashboardShortcut` con identidad estable, wired primero en `MasterShortcutGrid`.
3. Después: convergencia Staff/Admin (Fase D).
4. Después: adaptación mínima del Studio para **leer** la identidad (Fase E).

### Qué NO hacer todavía

- No añadir funcionalidades al Studio.
- No migrar Button/Card/Modal/Navbar/BottomNav.
- No adoptar todos los tokens de `TOKENS.md` de golpe.
- No persistir estéticas de Studio en producción.
- No usar texto visible ni índice DOM como identidad persistente.
- No crear variantes por color, badge o métricas.
- No reintroducir `composition: inside|outside|…` como fuente de verdad.

### Contrato de `DashboardShortcut`

- Componente de sistema del dominio dashboard.
- Anatomía: **host → iconBox → asset** + **text** (badge/children = accesorios).
- API visual: props de composición independientes (`showText`, `showIcon`, `layoutDirection`, `layoutOrder`, `layoutAlign`, `iconBoxMode`, …) + `variant` nombrada que solo empaqueta esas props.
- Default visual: variante `icon-text` (equivalente al `DashboardIosIcon` actual).
- Estilos default desde tokens adoptados del piloto; excepciones cromáticas = instance patch o className de instancia justificada (p. ej. C INICIAL), no nueva variante.

### Cómo se identificará

```text
data-component="DashboardShortcut"
data-variant="<variant-id>"
data-instance="<business-id>"   // ej. asistencia — desde MasterShortcutGrid.key
data-element="iconBox|asset|text"  // piezas internas
```

El label visible **no** forma parte de la identidad.

### Cómo se manejarán las variantes

Lista cerrada inicial:

- `icon-text`
- `icon-card-text-outside`
- `separated`
- `icon-only`
- `text-only`

Los presets del Studio mapean 1:1 a esta lista (icon-only / text-only vía props). Cualquier otra diferencia = override de instancia o contenido.

### Cómo se conectará posteriormente con el Studio

1. El componente emite el contrato.
2. El indexador prioriza `data-component|variant|instance|element`.
3. Los patches se resuelven: GLOBAL → COMPONENT → VARIANT → INSTANCE → ELEMENT, con viewport ortogonal.
4. La composición sigue siendo declarativa (`data-studio-*` / `data-element` + CSS).
5. Heurística DOM queda como fallback de legado.
6. iframe/postMessage/draft/undo/steppers se conservan.

---

*Fin del spike. Esperando revisión y aprobación explícita antes de implementar.*
