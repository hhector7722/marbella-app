Este documento es el **Blueprint Visual v0** de Marbella. No implementa nada. No reabre ADR-0010 ni los contratos ya cerrados. Parte de la auditoría previa y del código real.

Jerarquía que gobierna a partir de ahora:

```text
BLUEPRINT VISUAL          ← este documento (intención + mapa)
        ↓
DESIGN SYSTEM             ← TOKENS + LENGUAJE + EXPERIENCIA
        ↓
PRIMITIVAS                ← Button, Modal, Surface, Field…
        ↓
PLANTILLAS                ← T1–T8, P2–P13
        ↓
PANTALLAS DE NEGOCIO
```

ADR-0010 sigue siendo la jerarquía de **construcción**. El Blueprint es la capa que faltaba: **qué existe, qué está cerrado, qué hay que decidir, y cómo debe verse lo abierto**.

---

# PARTE 3 — TAXONOMÍA (antes del mapa, para no confundir las capas)

```text
Token
  Valor con nombre. No se toca. Ej: color.marca = #36606F.

Elemento visual
  Cosa que se percibe. Puede no tener componente. Ej: «cabecera de tabla».

Componente
  Pieza de sistema con identidad estable (data-component), variantes cerradas
  y CSS propio. No conoce el negocio. Ej: Button.

Patrón
  Composición que se repite (P2 Modal, P5 Tabla, P7 Filtro temporal).
  Puede materializarse con un componente, o no.

Plantilla
  Receta de pantalla (T1–T8). No es un componente gigante.
  PageScreen es la única plantilla-componente, y solo cubre T2/T3/T4.

Pantalla
  Una ruta de negocio. Compone plantilla + primitivas + dominio.

Dominio
  Anatomía que solo tiene sentido en una capacidad.
  KDS, carta de cliente, desglose de billetes, tira de Labor.
```

Regla contra el error clásico:

> Tres tablas no piden un componente `Table`.
> Piden el **patrón P5** (composición) si la anatomía coincide,
> o piezas de dominio si no coinciden.

Criterio de componente: Parte 9.

---

# PARTE 1 — BLUEPRINT (mapa por capas)

## A. Fundamentos

| Elemento | Qué es hoy | Estado |
|---|---|---|
| Color marca | `#36606F` / intenso `#2F5D6A`. Profundo y suave **declarados, no en CSS** | CERRADO en uso; incompleto en catálogo CSS |
| Envolvente | `#5B8FB9` + degradado. Lienzo, nunca contenido | CERRADO |
| Superficie | Blanco trabajo; inactiva `#F4F4F5`; hundida `#FAFAFA` **sin CSS** | INCOMPLETO |
| Neutros | TOKENS = zinc. El código mezcla `zinc-*` y `gray-*` | DUPLICADO |
| Semánticos | positivo / negativo / aviso / informativo / crítico | CERRADO en tokens; Notice critical no se distingue |
| Borde | 1 px; `borde` / `borde.marcado` | CERRADO |
| Sombra | block = sm; page y modal = 2xl (misma cifra, papeles distintos) | CERRADO |
| Radio | 8 (Button/Segmented) / 12 (control) / 16 (superficie) / circular | CERRADO en primitivas; ABIERTO en el resto |
| Spacing | 4-8-12-16-32 en CSS. **24 y 48 documentados, sin variable** | INCOMPLETO |
| Tipografía | Inter. PageScreen 18/900/uppercase ≠ TOKENS `tipo.titulo` 20/700 | DUPLICADO |
| Iconografía | Lucide, trazo. Icono acompaña; no sustituye salvo chrome | CERRADO como intención |
| Motion | active scale(0.95) Button; spinner 1.2s. Resto ad hoc | INCOMPLETO |
| Estados | hover / active / disabled / focus / invalid / loading | INCOMPLETO fuera de Button/Modal |
| Responsive | md 768. Calendario: desktop cabe en viewport | CERRADO como ley |
| Touch | 48 px no negociable. Incumplido en TimeFilter (32–36) y ± de stepper (28 px de ancho) | CERRADO como ley; ABIERTO en cumplimiento |

## B. Controles

| Elemento | Componente | Estado |
|---|---|---|
| Button | sí | CERRADO |
| Icon button | es Button `icon-only` | CERRADO (no pieza aparte) |
| Chrome close/back Modal | **no** es Button (36×36) | CERRADO |
| Input / Select / Textarea | nativos dentro de Field | INCOMPLETO (Field existe; 2 consumidores) |
| Search | no | SIN CANON (Albaranes es el candidato) |
| Checkbox | nativo local | SIN CANON |
| Radio | PetroleumSegmented cubre elección exclusiva visual | ABIERTO (radio nativo vs segmented) |
| Switch | no aparece como familia | SIN CANON — **no crear** |
| Segmented petróleo | PetroleumSegmented | CERRADO |
| Segmented zinc | local Inventory/Mapeo/Ledger | ESPECIALIZADO / no unificar |
| Date picker | calendarios locales + `input type=date` en Field | ABIERTO como patrón P3, no como DatePicker |
| Time picker | TimeFilter kinds `hours` | ESPECIALIZADO |
| Stepper | duplicado Waste/Inventory/carrito/caja | ABIERTO |
| Dropdown / popover | no hay sistema; pickers van a Modal | CERRADO por omisión (ADR overlay) |
| TimeFilter | TimeFilterModal + Button | INCOMPLETO (táctil y chrome) |

## C. Navegación

| Elemento | Estado |
|---|---|
| App header (Navbar) | existe; no es PageScreen | INCOMPLETO |
| Page header | PageScreen / Surface page | CERRADO |
| Back | PageScreen = Button secondary; Modal = chrome 36 | CERRADO (dos anatomías, papeles distintos) |
| Tabs underline | `TabBar` **cero imports** | SIN CANON / DEPRECADO de facto |
| Segmented (subnav Ventas) | PetroleumSegmented compact | CERRADO |
| Bottom navigation | Navbar dashboard + StaffBottomNav + BottomNavStaff | DUPLICADO (deuda previa, no este ciclo) |
| Breadcrumb | no existe | NO CREAR |
| Navegación interna Modal | historial padre→hijo | CERRADO (ADR-0007/9) |

## D. Contenido

| Elemento | Estado |
|---|---|
| Surface page / block | CERRADO |
| Card universal | no existe y **no debe existir** (ADR-0010) |
| RecipeCard | huérfano | ESPECIALIZADO / no referencia |
| DocumentListRow | CERRADO |
| ListRow operativo | no | SIN CANON — **no crear genérico** |
| SelectionOption | decisión D27: no | SIN CANON — **no crear** |
| Table | composición T8/P5 | ABIERTO (receta sí, componente no) |
| KPI T1 | KpiStat | INCOMPLETO (un consumidor real: Ventas mosaico) |
| KPI otros | tiras Labor, Propinas, `/dashboard/ventas` 7–9 px | ESPECIALIZADO o deuda |
| Badge / Chip | familias incompatibles | SIN CANON |
| Insignia de estado | PavilionMatchingBadge anatomía local | ESPECIALIZADO |
| EmptyState | existe; `none` ≈ `mismatch` | INCOMPLETO |
| Notice | existe; critical = negative | INCOMPLETO |
| Alert | no hay pieza aparte; es Notice o Modal system | no crear |
| Toast | sonner | CERRADO (feedback de acción, no Notice) |
| Loading | LoadingSpinner | INCOMPLETO (sin contrato de color/tamaño en DS) |
| Skeleton | EXPERIENCIA lo desaconseja como bloque gris genérico | NO CREAR fábrica |

## E. Estructuras

| Elemento | Materialización | Estado |
|---|---|---|
| Dashboard mosaico T1 | Surface + Shortcut + KpiStat | CERRADO como receta; collage Admin INCOMPLETO |
| List T2 | PageScreen `list` | CERRADO chrome; CSS no distingue template |
| Detail T3 | PageScreen `detail` (Carta) | CERRADO chrome |
| Form T4 | PageScreen `form` — **cero usos** | ABIERTO |
| Modal T5 | Modal | CERRADO |
| Derived T6 | layer derived + ADR-0009 | CERRADO |
| Bottom sheet | ConsumptionBottomSheet, excepción única | CERRADO / ESPECIALIZADO |
| Wizard | IngredientWizard local | ESPECIALIZADO |
| Table layout T8 | composición | ABIERTO (receta) |
| Calendar P3 | Labor / Reservas dentro de PageScreen | CERRADO como patrón; no componente |

## F. Especializados (permanecen de dominio)

| Dominio | Qué no es de sistema |
|---|---|
| KDS | tipografía Teko, número de mesa a 3 m, tarjetas de comando |
| Carta cliente | radio.amplio, foto, PlatoMarbella |
| Caja | denominaciones, QuickCalculator, DenominationZoom (techo overlay) |
| Labor | tira 4 cols, WeekCard P6, púrpura horas extras |
| Inventario / Recetas | escandallo, RecipeCard, segmented zinc |
| Reservas / Encargos | filas de producto, quantity en carrito |
| Staff | menú icono+label 36 y 48 (D27: no unificar) |
| Sala LIVE | radar de mesas, umbrales de tiempo (P11) |
| Impresos | marca impresa `#1F5FAF` ≠ marca pantalla |

---

# PARTE 2 — DEFINICIÓN DE CADA ELEMENTO

Los **cerrados** van compactos: no se rediseñan. Los **abiertos** llevan anatomía y decisión.

---

## Cerrados (no reabrir)

**Button**  
Control de acción. No es enlace ni chrome de Modal. Cuatro variantes, hug/fill, texto XOR icono, hit 48 / visual 28 / radio 8. Componente: sí. Canon: contrato + footers Eventos/Albaranes.

**Icon button**  
No es un elemento aparte. Es Button `icon-only` 48×48 con `aria-label`. El close/back de Modal **no** entra aquí.

**Modal / Derived modal**  
Estructura de overlay. Variantes compact/standard/work/day/amplify. Capas base/derived/system. No reabrir ADR-0007/8/9. Densidad de cuerpo: Labor día.

**Surface**  
Contenedor de trabajo. `page` (16 + shadow-2xl, sin borde) / `block` (12 + shadow-sm + borde). No es Card. Padding no encapsulado (layout del consumidor).

**PageScreen**  
Plantilla T2/T3/T4. Cabecera petróleo canónica. `template` hoy no cambia el CSS. `compactHeader` es API muerta visualmente: **no reabrir ahora**; se registra como deuda de API.

**PetroleumSegmented**  
Elección exclusiva 2–5 opciones. Densidades comfortable (48) / compact. No es Tab. No absorbe zinc.

**DocumentListRow**  
Solo documentos de perfil (nómina, comunicado, contrato). No es ListRow.

**DashboardShortcut**  
Atajo de mosaico T1. Master, Staff y Admin ya lo usan.

**Toast**  
Feedback efímero de una acción (sonner). No es Notice.

**ConsumptionBottomSheet**  
Única hoja inferior autorizada. No se copia.

---

## Field

```text
Nombre: Field
Qué es: Envoltorio de un dato de formulario (etiqueta + control + error/ayuda).
No es: Barra de búsqueda, stepper, date picker de calendario, filtro de cabecera.
Para qué sirve: Recoger un valor con nombre visible.
Cuándo usarlo: Formularios y filtros con etiqueta (T4, filtros de Modal).
Cuándo NO: Buscador compacto, cantidad ±, chrome de cabecera, celdas de tabla.
Nivel: control
Anatomía:
    label 11/900 uppercase tenue
    control nativo (input | select | textarea)
    error 12/700 negativo  XOR  hint 12 tenue
Estados: reposo, foco, inválido. Disabled: NO está en el CSS.
Variantes: ninguna (una densidad).
Densidades: una. min-h 48, radio.control 12, tipo 16/700, borde.marcado.
Relaciones: vive en T4 y en filtros de Modal. Search es otra familia.
¿Componente?: sí (ya existe)
Canon actual: CSS [data-component=Field]. Consumidores: filtros Albaranes, Eventos crear.
Problemas: casi nadie lo usa; inputs paralelos por toda la app;
           disabled ausente; foco marca (bien) vs envolvente local (mal).
Decisión pendiente: congelar Field como ÚNICO control de formulario
                    y declarar Search como familia distinta, no como variante.
```

## Input / Select / Textarea

```text
Nombre: Input, Select, Textarea
Qué es: El control nativo, no una pieza de sistema.
No es: Un componente Marbella.
Cuándo usar: Siempre dentro de Field, salvo Search.
Cuándo NO: No crear <Input> / <Select> de DS con 20 props.
Nivel: control (elemento, no componente)
¿Componente?: no
Canon actual: el CSS de Field pinta el nativo.
Decisión: no nacerán primitivas Input/Select/Textarea.
```

## Search

```text
Nombre: Search
Qué es: Filtro de lista por texto, en el cuerpo, sin etiqueta uppercase.
No es: Field. No es Button.
Cuándo: Listados T2 (Albaranes).
Cuándo NO: Campos de formulario con nombre («Proveedor», «Desde»).
Nivel: control
Anatomía: icono Search + input + acción opcional (filtros) a la derecha.
Estados: reposo, foco, con texto, vacío.
¿Componente?: todavía no (1 anatomía clara, pocos clones buenos)
Canon actual: Albaranes — min-h-12, radio.control, borde.marcado, 16/600.
Problemas: SISTEMA lo confundía con Field.
Decisión: congelar la receta; componente solo si aparece el 3.er clon idéntico.
```

## Checkbox / Radio nativo / Switch

```text
Checkbox: selección múltiple en listas de exportación, ingredientes, uso.
          Anatomías locales. ¿Componente?: todavía no.
Radio nativo: si la elección es 2–5 opciones visibles → PetroleumSegmented.
              Radio HTML solo dentro de Field cuando las opciones son muchas
              o vienen de datos. ¿Componente Radio?: no.
Switch: no hay familia. No inventar iOS-switch.
```

## QuantityStepper

```text
Nombre: QuantityStepper
Qué es: Control de magnitud ± con valor tecleable. Cero es válido (P10).
No es: Button. No es Field.
Cuándo: merma, inventario, carrito, denominaciones.
Nivel: control
Anatomía (candidato Waste):
    caja 48 de alto, radio.control, borde.marcado, sombra block
    [−] | valor tabular centrado | [+]
    − hover rosa; + hover verde (semántica de quitar/añadir)
Estados: 0, >0, foco, disabled
Densidades: una (servicio). Compacta de carrito es dominio si no cabe 48.
¿Componente?: sí, cuando se congele (frecuencia alta, anatomía estable)
Canon actual: no hay pieza; Waste es el mejor candidato.
Problemas: ± solo 28 px de ancho (el alto de caja sí es 48);
           focus ring marca a 25% (local); tipo 10–11 px en el valor.
Decisión: componente estrecho, sin variantes de color de negocio.
```

## TimeFilter

```text
Nombre: TimeFilter (P7)
Qué es: El control de periodo de cualquier vista temporal.
No es: DatePicker. No es PetroleumSegmented.
Cuándo: cabecera de pantalla con dimensión tiempo (P7).
Cuándo NO: un solo campo «fecha de nacimiento» → Field input[type=date].
Nivel: navegación / patrón
Anatomía: periodo visible + anterior/siguiente + modal de kinds.
¿Componente?: el Modal+kinds ya existe (TimeFilterModal). No es primitiva DS.
Canon: P7. El chrome TimeFilterButton (32–36 px, icono+texto) viola Button
       y viola táctil 48.
Problemas: táctil; vive en petróleo con clases white/10, no en Button tertiary.
Decisión: P1 — o Button tertiary invertido en PageScreen, o chrome documentado
          como excepción de cabecera, pero subirlo a 48.
```

## Date picker / Calendario / Time picker

```text
DatePicker componente: NO.
Calendario: patrón P3, no componente. Golden: Labor / Reservas dentro de PageScreen.
Time picker: kind hours de TimeFilter, o Field. No pieza nueva.
Celdas de día: dominio P3 (tipo por debajo de 11 en desktop, ya exceptuado).
```

## Dropdown / Popover

```text
Qué es: capa corta sobre un ancla.
En Marbella: no existe sistema, y no debe nacer en paralelo al Modal
(ADR overlay). Un picker de opciones es Modal compact o PetroleumSegmented.
¿Componente?: no.
Excepción: no se inventa.
```

## Tabs

```text
Qué es: navegación entre secciones de la misma tarea, anatomía underline.
No es: PetroleumSegmented (eso es radiogroup).
TabBar: código muerto (cero imports). SISTEMA lo cita como referencia de Tabs.
¿Componente?: todavía no. Activar TabBar solo con 2.º consumidor real.
Mientras: SubNavVentas = PetroleumSegmented. Mapping FilterButton = local.
```

## Table (P5 / T8)

```text
Nombre: Tabla operativa
Qué es: Comparar filas. Es un PATRÓN, no un componente.
No es: <Table> con 40 props.
Cuándo: ventas, movimientos, propinas, ledger, albaranes líneas.
Cuándo NO: mosaico T1, lista de documentos, KDS.
Nivel: contenido / estructura (composición)
Anatomía:
    thead color.marca, texto invertido, 9–11 px 900 uppercase
    filas altura uniforme, hover zinc-50
    cifras tabular-nums a la derecha
    sin scroll X en Modal
Estados: loading (spinner en cuerpo), vacío (EmptyState), error (Notice)
¿Componente?: no
Canon actual: receta T8 escrita; código divergente (Ventas thead literal #36606F;
              Propinas thead bg-ds-marca — mejor).
Decisión: congelar la receta de composición. No nacer Table.tsx.
```

## List row operativo

```text
Qué es: Fila que abre, selecciona o expande algo que no es un documento.
No es: DocumentListRow. No es Button.
¿Componente?: no (D27 decisión C). Familias incompatibles.
Decisión: cada módulo conserva la suya hasta que 3 sitios compartan
          anatomía milimétrica. Entonces pieza estrecha, no ListRow universal.
Golden master: NO EXISTE.
```

## SelectionOption

```text
Grid de avatares, listbox, chips de elección: anatomías distintas.
¿Componente?: no. D27 lo cerró.
```

## Badge / Chip / Insignia de estado

```text
Badge 18px: dismiss compacto, no hit 48. No es Button.
Chip de filtro: food-cost recipes, distinto de badge.
Insignia de estado: color Y texto (EXPERIENCIA). PavilionMatchingBadge = anatomía
de dominio. No chip factory.
¿Componente?: no, hasta vocabulario cerrado por capacidad.
```

## KpiStat

```text
Cifra protagonista de T1.
Canon: 18 / 30 md, peso 900, label 11 uppercase tenue, tonos semantic.
No cubre tira Labor ni KPIs de /dashboard/ventas (7–9 px — por debajo de mínimo).
¿Componente?: sí, ya. No añadir densidades.
Decisión: Ventas página o adopta KpiStat o declara tira de dominio (como Labor).
```

## EmptyState

```text
Tres situaciones distintas (EXPERIENCIA §7): none / mismatch / error.
Componente: sí. Problema: none y mismatch son idénticos visualmente.
Eso viola la ley que el componente dice cumplir.
Decisión P0 de producto (principio 2): distinguir las tres.
Propuesta visual en Parte 5. No iconos decorativos.
```

## Notice

```text
Aviso embebido, persistente. No es toast. No es EmptyState error
(vacío de carga ≠ condición del sistema).
5 variantes. critical y negative pintan igual.
¿Componente?: sí. Decisión: critical usa color.critico (ya en tokens),
no el mismo fill que negative.
Sin icono ni acción en v1 (el consumidor pone Button debajo si hace falta).
```

## Loading

```text
LoadingSpinner existe. Tamaños sm–xl. Color = currentColor.
No hay pantalla completa por dato secundario (EXPERIENCIA §5).
¿Componente DS con contrato?: todavía no. Congelar tamaños y prohibir color literal.
Skeleton genérico: no.
```

## Navegación inferior / App header

```text
P8: máx 5 destinos, no se encoge, se atenúa con Modal.
Implementada 2–3 veces. Deuda previa. No se toca en este ciclo (ADR-0010).
¿Componente único?: sí, pero no ahora. Orden: después de fundamentos + Field.
```

## KPI en otros contextos / filtros / navegación interna

Ya cubiertos: KPI no-T1 = dominio o deuda; filtros de formulario = Field; filtros de lista = Search + TimeFilter; navegación interna = Modal historial o PetroleumSegmented.

---

# PARTE 4 — MATRIZ CANÓNICA

| Elemento | Tipo | Canon actual | Estado | ¿Componente? | Variantes | Pendiente |
|---|---|---|---|---|---|---|
| Color marca / envolvente | fundamento | TOKENS + CSS | CERRADO | — | — | no reabrir |
| Neutros zinc vs gray | fundamento | TOKENS = zinc | DUPLICADO | — | — | migrar gray→zinc |
| Radios 8/12/16 | fundamento | Button 8; control 12; page/modal 16 | CERRADO en primitivas | — | 3 radios | prohibir 2.5rem; no colapsar a 2 |
| Tipografía título | fundamento | PageScreen 18/900/uppercase vs TOKENS 20/700 | DUPLICADO | — | — | gana PageScreen en pantalla |
| Spacing 6 y 12 | fundamento | documentados, sin CSS | INCOMPLETO | — | — | adoptar variables |
| Focus marca vs envolvente | fundamento | Field/Button = marca; locales = envolvente | DUPLICADO | — | — | solo marca |
| Button | control | Button | CERRADO | sí | 4 + hug/fill | — |
| Icon button | control | Button icon-only | CERRADO | no (es Button) | — | — |
| Modal chrome | control | 36×36 no Button | CERRADO | no | — | — |
| Field | control | Field CSS | INCOMPLETO | sí | 1 | disabled; adopción |
| Input/Select/Textarea | control | nativo en Field | ABIERTO | no | — | no crear piezas |
| Search | control | Albaranes | ABIERTO | todavía no | 1 receta | congelar receta |
| Checkbox | control | nativo | SIN CANON | todavía no | — | no forzar |
| Switch | control | — | SIN CANON | no | — | no crear |
| PetroleumSegmented | control | PetroleumSegmented | CERRADO | sí | 2 densidades | — |
| Segmented zinc | control | local | ESPECIALIZADO | no | — | no absorber |
| QuantityStepper | control | Waste (local) | ABIERTO | sí (cuando se congele) | 1 | táctil ± |
| TimeFilter | navegación | TimeFilterModal | INCOMPLETO | host sí; chrome no | kinds | táctil 48 |
| DatePicker | control | — | SIN CANON | no | — | P3 / Field date |
| Calendario | estructura | P3 Labor/Reservas | CERRADO (patrón) | no | — | — |
| Dropdown | control | — | SIN CANON | no | — | usar Modal |
| Tabs | navegación | TabBar muerto | SIN CANON | todavía no | underline | 2.º uso |
| App header | navegación | Navbar | INCOMPLETO | local | — | no este ciclo |
| Page header | navegación | PageScreen/Surface | CERRADO | sí (plantilla) | — | — |
| Back | navegación | 2 anatomías | CERRADO | — | page vs modal | no unificar |
| Bottom nav | navegación | 2–3 impl. | DUPLICADO | no ahora | por rol | deuda previa |
| Surface | contenido | Surface | CERRADO | sí | page/block | — |
| Card universal | contenido | — | DEPRECADO como idea | no | — | ADR-0010 |
| DocumentListRow | contenido | DocumentListRow | CERRADO | sí | 0 | — |
| ListRow operativo | contenido | — | SIN CANON | no | — | no genérico |
| SelectionOption | control | — | SIN CANON | no | — | D27 C |
| Table | contenido | T8 composición | ABIERTO | no | receta | congelar receta |
| KpiStat | contenido | KpiStat | INCOMPLETO | sí | 4 tonos | no densidades |
| Badge/Chip | contenido | locales | SIN CANON | no | — | no factory |
| Insignia estado | contenido | PavilionMatchingBadge | ESPECIALIZADO | no | vocabulario dominio | — |
| EmptyState | contenido | EmptyState | INCOMPLETO | sí | 3 | distinguir none/mismatch |
| Notice | contenido | Notice | INCOMPLETO | sí | 5 | critical ≠ negative |
| Toast | contenido | sonner | CERRADO | lib | — | — |
| Loading | contenido | LoadingSpinner | INCOMPLETO | local | sm–xl | contrato mínimo |
| T1 Dashboard | estructura | receta ADR-0010 | INCOMPLETO | no | — | Admin collage |
| T2/T3 PageScreen | estructura | PageScreen | CERRADO | sí | list/detail/form | form sin usos; CSS plano |
| T4 Form | estructura | PageScreen form | ABIERTO | plantilla | — | primer consumidor |
| T5/T6 Modal | estructura | Modal | CERRADO | sí | 5 + layers | — |
| Bottom sheet | estructura | ConsumptionBottomSheet | ESPECIALIZADO | excepción | 1 | no copiar |
| Wizard | estructura | IngredientWizard | ESPECIALIZADO | no | — | — |
| T8 Table layout | estructura | receta | ABIERTO | no | — | igual que Table |
| KDS / Carta / Caja… | especializado | dominio | ESPECIALIZADO | no | — | no absorber |

---

# PARTE 5 — PROPUESTA ESTÉTICA V1

No es un SaaS. Marbella es **instrumental de cocina**: plato blanco sobre mantel azul mediterráneo, petróleo de marca como el mango de un cuchillo, verde solo cuando se confirma, rojo solo cuando cuesta dinero.

Lo que ya está congelado **pinta el resto**. No se inventa una segunda estética.

### Fundamentos que propongo congelar (sin implementar)

**Radios — no se colapsan a dos.** LENGUAJE habla de dos radios «principales»; el código ya tiene un tercero legítimo:

| Papel | Valor | Quién lo usa |
|---|---|---|
| Chrome compacto | 8 px (`espacio.2`) | Button, PetroleumSegmented |
| Control / bloque | 12 px (`radio.control`) | Field, Search, Surface block, DocumentListRow, Stepper, Notice |
| Superficie | 16 px (`radio.superficie`) | Surface page, Modal |
| Circular | pleno | avatar, punto Live |
| Amplio | 24 px | **solo** carta de cliente |

Prohibido: `rounded-[2.5rem]`, `rounded-[32px]` en gestión, mezclar radios en un bloque.

**Focus:** siempre `color.marca`, outline 2 px. Nunca envolvente (`#5B8FB9`) como anillo. El envolvente no es acento.

**Neutros:** zinc. `gray-*` es deuda, no variante.

**Tipografía de pantalla (gana el código de PageScreen, no el párrafo viejo de TOKENS):**

| Papel | Tamaño / peso | Transform |
|---|---|---|
| Título de página (petróleo) | 18 / 20 md, 900 | uppercase |
| Título de bloque | 11, 900 | uppercase |
| Label Field | 11, 900 | uppercase |
| Cuerpo | 14, 400–600 | — |
| Control | 16, 700 | — |
| Button | 12, 800 | uppercase |
| KPI | 18 / 30 md, 900 tabular | — |
| Mínimo | 11 | — |

Nada de 5–7–9 px salvo celdas P3 en escritorio (excepción ya escrita).

**Color de acción:** primary = positivo (ya cerrado). Petróleo = identidad y tertiary, no confirmación.

---

### ELEMENTOS ABIERTOS — canon propuesto

**FIELD** (y los nativos que envuelve)

```text
Canon propuesto: el CSS actual de Field, más disabled.
Anatomía: label + nativo + error|hint
Altura: tactil.minimo 48
Padding: espacio.3 inline
Radio: radio.control 12
Tipografía: label 11/900 uppercase tenue; valor 16/700 texto
Color: superficie blanca; texto; label tenue
Border: 1px borde.marcado; foco marca; inválido negativo
Shadow: ninguna
Estados: reposo / focus / invalid / disabled (opacity 0.5, no pointer)
Densidades: una
Referencia: filtros Albaranes (Field), no el buscador
```

**SEARCH**

```text
Canon propuesto: receta Albaranes, no Field.
Anatomía: [icono tenue] [input sin label] [Button tertiary opcional]
Altura: 48
Padding: espacio.3
Radio: radio.control
Tipografía: 16/600; placeholder tenue
Border: borde.marcado; foco marca
Shadow: ninguna
Densidades: una
Referencia: AlbaranesHistoricoClient buscador fijo
```

**QUANTITYSTEPPER**

```text
Canon propuesto: caja Waste, corrigiendo el ancho táctil de ±.
Anatomía: [−] valor [+]
Altura: 48; ± mínimo 48 de ancho táctil (el visual puede ser más estrecho
        si el hit-area se extiende, pero hoy w-7 no llega)
Radio: radio.control
Tipografía: valor 16/900 tabular (subir desde 10–11)
Border: borde.marcado; focus-within marca
Shadow: elevacion.superficie
Estados: 0 visible; hover − negativo suave; hover + positivo suave
Densidades: una de sistema. Carrito compacto = dominio si no cabe.
Referencia: WasteClient QuantityControl
```

**TABLE (composición, no componente)**

```text
Canon propuesto: thead marca + cuerpo blanco + cifras a la derecha
Anatomía: table-fixed, thead sticky si el cuerpo scrollea
Altura de fila: uniforme; no kitchen-sink
Padding celda: espacio.3 / espacio.4
Radio: el de la Surface que la envuelve, no la tabla
Tipografía thead: 10–11 / 900 uppercase invertido
Tipografía td: 12–14 / 700; importes tabular-nums right
Color thead: color.marca (token, no #36606F literal)
Border: filas borde (zinc-100 / borde)
Shadow: ninguna en la tabla; la Surface block la aporta
Densidades: revisión = esta. Servicio no usa tabla.
Referencia: Propinas matriz (bg-ds-marca). Ventas thead es el mismo papel
            con literal — conservar estructura, cambiar el literal.
```

**EMPTYSTATE**

```text
Canon propuesto: tres variantes VISIBLEMENTE distintas, sin icono.
none: título fuerte 14/600; descripción tenue; acción opcional (Button).
mismatch: igual + una línea «Filtro activo» en color.marca o aviso
          (el filtro es la causa; hay que poder quitarlo).
error: título color.negativo; role=alert (ya); acción Reintentar si aplica.
Padding: espacio.8 / espacio.4 (ya)
Referencia: Albaranes mismatch; Eventos none; Sala none.
Qué cambiar: CSS de mismatch (hoy idéntico a none).
```

**NOTICE**

```text
Canon propuesto: 5 variantes, critical ≠ negative.
negative: negocio (descuadre, deuda) — color.negativo + fondo negativo.
critical: sistema (no se pudo leer) — color.critico en texto y borde;
          fondo por mezcla del crítico, no el mismo que negative.
positive / warning / info: como hoy.
Radio: radio.control. Padding espacio.3. Tipo 12/700; title 11/900 uppercase.
Sin icono v1.
Referencia: Notice actual + OrphanedSupplierAlert como origen.
```

**TIMEFILTER chrome**

```text
Canon propuesto: en PageScreen, Button tertiary invertido (ya existe CSS)
o un chrome de cabecera de 48×48 icon-only (calendario) + label de periodo
como texto de cabecera, no como botón 32 px.
No: min-h 32, no icono+texto en Button.
Referencia de periodo visible: cabecera Labor / Ventas (el texto del mes).
Referencia de acción: Button tertiary en cabecera Albaranes.
```

**T4 FORM (PageScreen template=form)**

```text
Canon propuesto: PageScreen + Field + footer Button (primary confirmar,
secondary cancelar). Cero usos hoy: el primer formulario de página
que se toque (no un Modal) debe nacer así.
No crear Form.tsx.
Referencia: Eventos crear (Field dentro de Modal) para los campos;
            PageScreen para el chrome cuando sea página.
```

**CHECKBOX** (si hace falta receta, no componente)

```text
Hit 48. Color marca al checked. Radio 4 px (excepción de control pequeño,
no 12). Label cuerpo 14. Local hasta 3 clones idénticos.
```

**KPI fuera de T1**

```text
O es KpiStat, o es dominio (Labor).
Prohibido: label 7–9 px en /dashboard/ventas. Esa tira o sube a KpiStat
o se declara excepción de dominio por escrito.
```

**TABS**

```text
No crear. Si un 2.º módulo necesita underline de sección, se resucita TabBar
con tokens (marca, zinc, 48 de alto). Hasta entonces PetroleumSegmented
o navegación de rutas.
```

**LISTROW / SELECTIONOPTION / CHIP FACTORY / DATEPICKER / DROPDOWN / SWITCH / CARD / TABLE.tsx**

```text
Canon propuesto: no existen. La propuesta estética es la ausencia.
```

---

# PARTE 6 — GOLDEN MASTERS

| Elemento | Golden master | Archivo | Conservar | Cambiar |
|---|---|---|---|---|
| Button | Footers Eventos / Albaranes | `button.tsx` + esos footers | anatomía, 4 variantes | nada |
| Modal shell | el contrato | `modal.tsx` + CSS | todo | nada |
| Modal densidad cuerpo | Labor día | detalle día Labor | inset, ritmo | nada |
| Surface page | PageScreen / Labor | `DashboardDetailLayout.tsx` | radio 16, sombra página | nada |
| Surface block | Staff / Propinas matriz | `TipsDashboardView.tsx` | header petróleo 11 | nada |
| PageScreen | Labor + Albaranes | `labor/page.tsx`, `AlbaranesHistoricoClient.tsx` | chrome | `template` inerte; compactHeader muerto |
| PetroleumSegmented | Waste comfortable | `WasteClient.tsx` | densidades | nada |
| DocumentListRow | Nóminas | `NominasModal.tsx` | todo | nada |
| DashboardShortcut | Master + Staff | `MasterShortcutGrid.tsx`, `StaffDashboardView.tsx` | todo | nada |
| Field | Filtros Albaranes | `AlbaranesHistoricoClient.tsx` Field Desde/Hasta/Proveedor | CSS Field | disabled; más consumidores |
| Search | Buscador Albaranes | mismo fichero, bloque fijo | receta | no llamarlo Field |
| EmptyState | Albaranes mismatch + Eventos none | esos clientes | copy; slot action | CSS none vs mismatch |
| Notice | contrato + usos Albaranes/Eventos | `Notice.tsx` | 5 nombres | critical visual |
| KpiStat | Dashboard ventas mosaico | `DashboardVentasSection.tsx` | 3 instancias | no extender |
| T1 mosaico | DashboardVentasSection | idem | Surface+KpiStat | Admin sigue collage |
| Table thead | Propinas | `TipsDashboardView.tsx` thead `bg-ds-marca` | token, no hex | Ventas/ledger literales |
| Table cuerpo | Propinas / Ventas tickets | ambos | tabular right | labels 7 px en Ventas KPI |
| Calendario P3 | Labor / Reservas | `labor/page.tsx`, `ReservasClient.tsx` | dentro de PageScreen | nada de componente |
| QuantityStepper | Waste | `WasteClient.tsx` QuantityControl | caja 48, ± semántico | ancho táctil ±; tipo valor |
| TimeFilter lógica | TimeFilterModal | `TimeFilterModal.tsx` | kinds | chrome Button/táctil |
| TimeFilter chrome | **NO EXISTE GOLDEN MASTER** a 48 px | `TimeFilterButton.tsx` es el anti-ejemplo | — | subir a 48 o Button tertiary |
| ListRow operativo | **NO EXISTE GOLDEN MASTER** | — | — | no inventar |
| Tabs | **NO EXISTE GOLDEN MASTER** (TabBar sin usos) | `TabBar.tsx` | — | no promover |
| Badge/Chip sistema | **NO EXISTE GOLDEN MASTER** | — | — | no factory |
| Insignia estado | PavilionMatchingBadge (anatomía) | pabellón | color+texto | no extraer aún |
| Loading | LoadingSpinner | `LoadingSpinner.tsx` | forma 12 barras | color via currentColor |
| Nav inferior | **NO EXISTE GOLDEN MASTER único** | Navbar vs StaffBottomNav | P8 | no unificar este ciclo |
| T4 form página | **NO EXISTE GOLDEN MASTER** | cero `template=form` | Field en Eventos Modal | primer PageScreen form |
| Dropdown | **NO EXISTE GOLDEN MASTER** | — | Modal compact | no popover |
| Segmented zinc | **NO unificar** | Inventory vs Mapeo vs Ledger | — | local |

---

# PARTE 7 — CONTRADICCIONES (solo decisiones, no correcciones)

### P0 — impiden el lenguaje

1. **Tipografía de título de pantalla:** TOKENS `tipo.titulo` 20/700 vs PageScreen 18–20/900/uppercase. **Decisión:** gana PageScreen en pantalla; TOKENS se alinea después (sin hacerlo ahora).
2. **EmptyState none = mismatch.** **Decisión:** tres aspectos distintos, o no se cumple EXPERIENCIA §7.
3. **Notice critical = negative.** **Decisión:** critical usa `color.critico`; si no se distingue, sobra la variante.
4. **Focus marca vs envolvente.** **Decisión:** el foco interactivo es marca. Envolvente no es acento.
5. **Radio ilegítimo 2.5rem / italic de título** en pantallas no migradas (Ventas aún italic). **Decisión:** prohibición ADR-0010 se aplica al tocar; no es estilo opcional.

### P1 — se ven todos los días

6. **zinc vs gray.** **Decisión:** zinc canónico; gray es migración, no sabor.
7. **Thead de tabla:** `bg-ds-marca` vs `#36606F` vs thead no petróleo. **Decisión:** T8 = marca token.
8. **Labels 7–9 px** en Ventas y similares. **Decisión:** mínimo 11, o excepción P3 escrita.
9. **TimeFilter 32–36 px** y stepper ± de 28 px de ancho. **Decisión:** 48 de hit-area.
10. **Field vs inputs sueltos.** **Decisión:** formulario = Field; búsqueda = receta Search; no tercera vía.
11. **KpiStat vs cifras locales.** **Decisión:** T1 = KpiStat; resto = dominio declarado.
12. **`template` de PageScreen no pinta nada.** **Decisión:** o el atributo significa algo, o se deja como identidad sin CSS y se documenta así (no es variante visual).

### P2 — puede esperar

13. `espacio.6` / `espacio.12` sin CSS.
14. `color.marca.profundo` / `.suave` / `superficie.hundida` / `texto.medio` / `.suave` declarados y no adoptados.
15. Bottom nav duplicada.
16. LoadingSpinner sin contrato DS.
17. Motion tokens no adoptados (120/200 ms).
18. Marca impresa ≠ marca pantalla (ya declarado; no es de UI de gestión).
19. TabBar muerto.
20. PageScreen `compactHeader` API muerta.
21. Button secondary sobre petróleo (Volver) vs tertiary invertido. **No reabrir Button;** es un detalle de PageScreen a decidir en oleada de plantilla, no ahora.

---

# PARTE 8 — REGLAS DE COMPOSICIÓN

```text
Pantalla de gestión (T2/T3/T4)
    PageScreen
        header (petróleo, sistema)
        body
            Search? (lista)
            Field* (formulario)
            Surface block? (sección)
                contenido (tabla | lista | calendario P3)
            EmptyState | Notice
        footer? (Button)

Mosaico (T1)
    Surface page
        header
        KpiStat*
        DashboardShortcut*
        (no PageScreen)

Overlay
    Modal (T5) o derived (T6)
        nunca un popover paralelo
        nunca un 3.er overlay de negocio

LIVE / cocina
    anatomía de dominio (P11 / KDS)
    Surface si hay card de trabajo; no PageScreen
```

Respuestas directas:

- **¿Cuándo Surface?** Siempre que haya una superficie de trabajo sobre el envolvente (`page`) o un bloque interior (`block`). No se pinta `bg-white rounded-2xl shadow-2xl` a mano.
- **¿Cuándo PageScreen?** Listado, detalle o formulario de **gestión**. No mosaico, no KDS, no carta cliente, no Sala LIVE, no overlay.
- **¿Surface dentro de Surface?** `page` no anida `page`. Dentro, `block` o zona hundida. Una sola `page` por pantalla.
- **¿Cuándo una card?** Nunca una Card de sistema. Tarjeta de dominio (KDS, plato) si es pulsable y conoce el negocio.
- **¿DocumentListRow?** Solo nómina / comunicado / contrato (o un 4.º documento de perfil de la misma anatomía).
- **¿Lista local?** Cualquier otra fila (tickets, mesas, productos, avatares).
- **¿Button?** Ejecutar una operación. Primary = confirmar. Destructive = daño. Tertiary = menor. Secondary = cancelar/volver de página.
- **¿Enlace?** Cambio de ruta sin mutar. `<Link>` o `router`. No Button fingiendo navegación, salvo icon-only de cabecera ya establecido (Insights).
- **¿Chrome?** Close/back Modal 36×36; recarga de cabecera puede ser Button tertiary invertido (Albaranes). No se duplica como «IconButton».
- **¿Segmented?** 2–5 opciones exclusivas en el mismo sitio (Waste, receta, SubNavVentas).
- **¿NO segmented?** Tabs de sección underline; zinc track; TimeFilter; CartaLangPicker; celdas de calendario.
- **¿Componente?** Parte 9.
- **¿Composición?** Table, calendario, T1, T8, Search (hasta 3 clones), filas operativas.

---

# PARTE 9 — REGLA DE ORO PARA COMPONENTES

Una pieza entra al Design System **solo si cumple las cinco**:

1. **Anatomía única** — se dibuja igual en todos los usos (no «casi»).
2. **≥ 3 consumidores reales** o 2 + patrón normativo (P10 stepper).
3. **Estabilidad** — no va a ganar un booleano por pantalla.
4. **Sin negocio** — no sabe qué es un albarán.
5. **API estrecha** — variantes cerradas; si necesita 5 booleanos, es composición.

Veto automático: un solo uso (SISTEMA §4.7); anatomías incompatibles (ListRow); overlays (ADR); kitchen-sink.

Aplicado a lo abierto:

| Candidato | ¿Entra? | Por qué |
|---|---|---|
| Input/Select/Textarea | no | son nativos de Field |
| Search | todavía no | 1 golden claro; receta sí |
| QuantityStepper | **sí, al congelar** | P10 + ≥3 sitios + anatomía estable |
| Table.tsx | no | patrón P5 |
| ListRow | no | D27 |
| SelectionOption | no | D27 |
| Tabs | todavía no | 0 consumidores de TabBar |
| Chip factory | no | vocabulario de dominio |
| DatePicker | no | P3 + Field date + TimeFilter |
| Dropdown | no | Modal |
| Switch | no | no hay familia |
| Card | no | ADR-0010 |
| TimeFilter chrome | no primitiva nueva | reusar Button o chrome de cabecera |
| Checkbox | todavía no | nativo basta |
| Field | ya está | completar, no reemplazar |
| EmptyState / Notice | ya están | completar distinción visual |

---

# PARTE 10 — RESULTADO PARA CONGELAR

## 1. BLUEPRINT

El mapa de las partes 1–2: fundamentos → controles → navegación → contenido → estructuras → dominio. Eso es el inventario. Nada fuera de esa lista debería inventar CSS «porque esta pantalla es especial», salvo F (especializados).

## 2. CANON CERRADO — no discutir

Button, Modal (+ derived, capas, chrome 36), Surface page/block, PageScreen chrome, PetroleumSegmented, DocumentListRow, DashboardShortcut, Toast, ConsumptionBottomSheet, P3 calendario como patrón, P8 como ley, táctil 48 como ley, primary = verde, petróleo = identidad, envolvente = lienzo, Inter, T1–T8 como recetas (no 8 componentes).

## 3. CANON A DEFINIR — decidir visualmente

1. Field completo (disabled + adopción) y **Search como receta distinta**
2. EmptyState: 3 aspectos
3. Notice: critical ≠ negative
4. Receta T8 de tabla (composición)
5. QuantityStepper (anatomía Waste, táctil ±)
6. TimeFilter chrome 48
7. Tipografía de título de pantalla (congelar PageScreen)
8. Focus = marca
9. Neutros = zinc
10. KPI: T1 = KpiStat; resto dominio o subir de 7 px
11. T4: primer `template=form` cuando toque un formulario-página

## 4. ESPECIALIZADOS — locales

KDS, carta cliente, caja/denominaciones/calculadora, Labor tira y WeekCard, púrpura extras, RecipeCard, segmented zinc, TimeFilter kinds, CartaLangPicker, menús Staff 36/48, SelectionOption, ListRow operativo, insignias de pabellón, wizard ingredientes, AvatarCrop, overlays residuales ADR-0007.

## 5. CONTRADICCIONES P0 / P1 / P2

P0: título de pantalla; EmptyState; Notice critical; focus; radio 2.5rem/italic.  
P1: zinc/gray; thead; tipo <11; táctil TimeFilter/stepper; Field vs sueltos; KpiStat vs locales; `template` inerte.  
P2: tokens no adoptados; nav duplicada; spinner; motion; compactHeader; TabBar muerto.

## 6. PROPUESTA VISUAL V1 (una frase por familia abierta)

Marbella se ve como **plato blanco, mango petróleo, cifra negra tabular, confirmación verde, error rojo, 48 px, 11 px de suelo, 8/12/16 de radio**. Field pinta los formularios; Search pinta las listas; las tablas se componen con thead marca; el stepper es una caja 48; el vacío grita distinto si no hay nada, si el filtro lo esconde, o si falló la lectura; no hay DatePicker, Table.tsx, Card ni ListRow universal.

## 7. ORDEN DE DECISIÓN (para poder decir «congela e implementa»)

```text
1. Fundamentos P0
      radios 8/12/16 + focus marca + zinc + título = PageScreen
2. Field + Search (receta)
      desbloquea T4 y deja de nacer inputs sueltos
3. EmptyState + Notice
      principio 2, se ve en todas las listas
4. Receta Table T8
      sin componente; gate de thead token
5. QuantityStepper
      primer componente NUEVO que sí merece nacer
6. TimeFilter chrome 48
      P7 cumplido de verdad
7. KpiStat vs tiras
      Ventas página decide
8. T4 PageScreen form
      cuando se toque un formulario-página
9. Nav inferior / tokens residuales / TabBar
      después. No bloquean el lenguaje.
```

Hasta el paso 1 no conviene implementar nada más: si el título, el foco y el radio siguen ambiguos, cada pantalla volverá a decidir.

---

**Qué consulté:** ADR-0010, TOKENS, LENGUAJE, EXPERIENCIA, PATRONES, SISTEMA, DEUDA D27/D28, PRINCIPIOS, CSS de primitivas, Field (2 consumidores), Waste stepper, Albaranes Search vs Field, Propinas thead, TimeFilterButton, TabBar (0 imports).

**Qué no hice:** ni un fichero tocado. Ni componente, ni token, ni ADR, ni migración.

Cuando quieras congelar, el siguiente paso natural es el **paso 1** (fundamentos P0) como decisión tuya explícita; después se puede implementar en oleada, no pantalla a pantalla.
