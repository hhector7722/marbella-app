---
documento: SISTEMA-DE-COMPONENTES
clase: vivo
estado: vigente
capa: diseno
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-09-02
caducidad: 6 meses
supersede: —
---

# SISTEMA DE COMPONENTES — Contrato

Inventario canónico de los componentes de Marbella y el contrato de cada uno. **Es contrato, no implementación**: describe qué debe hacer un componente y qué no, no cómo está escrito hoy.

Un componente que exista en el código y no esté aquí es una pieza local, no del sistema. Un componente que esté aquí y no exista en el código es una carencia declarada, y hay varias.

Las tres capas del inventario tienen contratos de rigor distinto:

- **Base** — los ladrillos. Contrato estricto y sin variantes improvisadas.
- **Sistema** — piezas transversales con comportamiento propio. Contrato estricto.
- **Dominio** — piezas de una capacidad concreta. Su contrato lo fija la capacidad; aquí solo se declara la frontera.

---

## 1. Componentes base

Los que sostienen toda pantalla. **Button, Surface, Field, SearchField, EmptyState y Notice ya existen.** La insignia de estado sigue reconstruyéndose por vocabulario de dominio (D27).

### Botón

**Propósito**: ejecutar una acción.

**Anatomía**: un único `<button>`. Texto XOR icono. Un Button con texto visible no lleva icono. Un Button icon-only no lleva texto. No existe la combinación icono + texto. Icon-only (48×48) sin etiqueta, con `aria-label` obligatorio. La prop `icon` existe para el caso icon-only.

**Enforcement**: `assertButtonAnatomy` lanza en desarrollo/test ante anatomía inválida (texto+icono, icon-only sin `aria-label`, vacío sin nombre). En producción el render aplica fallback seguro (prioriza texto; no inventa UI nueva). El aspecto lo bloquea CSS `[data-component='Button']`; `className` solo admite composición externa. El chrome close/back de Modal **no** es este componente.

```text
Button
 ├── label     (texto; sin icono)
 └── icon      (icon-only; sin texto; aria-label)
```

**Variantes** (cerradas; nombres de código): `primary`, `secondary`, `tertiary`, `destructive`. No existe `success`, `positive`, `emerald`, `ghost`, `danger`, `confirmar` ni quinta variante. El fill lo fija el contrato, no el consumidor:

| Variante | Token de fill | Papel |
|---|---|---|
| `primary` | `color.positivo` | Acción afirmativa: Guardar, Confirmar, Siguiente, Crear, Enviar, Generar, Aplicar, Continuar |
| `secondary` | `color.superficie.inactiva` | Cancelar, volver, cerrar |
| `tertiary` | `color.marca` | Menor jerarquía. El petróleo no pinta `primary` |
| `destructive` | `color.negativo` | Eliminar, destruir, acción irreversible |

Layout `hug` / `fill` no son variantes semánticas: el default visual es **`hug`** (ancho = contenido + padding horizontal). `fill` / ancho completo solo cuando el consumidor lo declara. El host táctil mide `tactil.minimo` (48 px): área de toque transparente; no obliga al fondo visual. El relleno visual abraza el texto o el icono: 12 px de tipo + `espacio.1` arriba y abajo = 20 px. Padding horizontal compacto: `espacio.1`. Radio contractual del Button: 8 px (`espacio.2`), estrictamente menor que la mitad del alto visual (10 px) para dejar tramo recto, no píldora. No usa `radio.superficie` (16 px), que permanece en Modal. Icon-only conserva toque 48×48; el relleno visual abraza el icono. El Footer de Modal usa Button de texto, sin iconos, hug. `primary` y `destructive` se reconocen por el color, sin doble aro. `secondary` y `tertiary` llevan un hilo negro suave. El relleno tiene un volumen apenas perceptible; al pulsar, se oscurece lo justo. Entrada y Salida del mosaico Staff no son este Button.

**Estados**: reposo, hover (sin scale-up), pulsado (`scale(0.95)` y un oscurecido apenas perceptible del relleno), foco visible (anillo de marca), en curso (equivale a deshabilitado + spinner a la izquierda), deshabilitado (opacity 50). El estado visual de error no se implementa en v1: el error vive en el campo o el aviso.

**Identidad**: `data-component="Button"`, `data-variant`, `data-instance` (id de negocio). El aspecto lo bloquea CSS por atributo; `className` solo admite composición externa (`flex-1`, `shrink-0`, `self-*`, posicionamiento).

**Reglas**:
- En curso, deshabilita su propia pulsación. Nunca dos efectos por dos toques.
- La variante destructiva no comparte aspecto con la principal ni se coloca junto a ella.
- Un Button con texto visible no lleva icono. Un Button icon-only no lleva texto. No existe la combinación icono + texto.
- Un botón sin etiqueta necesita nombre accesible.
- El icono no va a la derecha.
- No se usa para navegar. Navegar es un enlace, aunque parezca un botón.
- El chrome close/back de Modal y Navbar no es este componente. Chrome ≠ Button. `TimeFilterButton`, `DashboardShortcut` y `TabBar` no son Button.
- **Los botones que conviven en un pie de acciones se igualan al ancho del mayor.** El grupo de acciones del pie (`footer-actions`) usa grid `1fr`: todos los `<Button>` del pie miden lo mismo, el del texto más ancho, sean 2 o N. El consumidor no declara nada; es la regla del contenedor del pie.
- El Footer de Modal no convierte los botones en `fill`; el consumidor decide. Igualar al mayor no es `fill`: el grupo se encoge al contenido, no ocupa el pie entero.
- El Footer de Modal usa Button con texto, sin iconos, hug. Icon-only sigue permitido fuera de ese pie.
- El radio contractual es 8 px (`espacio.2`). No píldora: el radio es menor que la mitad del alto visual. Distinto de `radio.superficie` del Modal. El consumidor no puede sobrescribirlo.
- `primary` pinta con `color.positivo`. El petróleo no es el fill de Guardar / Confirmar / Crear. No se inventa variante `confirmar` ni color local en el consumidor.
- La etiqueta va en caja oración. Las mayúsculas no son énfasis de Button; solo van en cabeceras ([LENGUAJE-VISUAL](LENGUAJE-VISUAL.md), [CONTENIDO-Y-TONO](CONTENIDO-Y-TONO.md)).

**Código**: `src/components/ui/button.tsx`, `src/lib/design-system/button-contract.ts`.

**Estado**: existe. Anatomía XOR e `aria-label` icon-only enforced en runtime (dev/test). Piloto footer Modal en Albaranes y Caja/Tesorería; gate global anti-`<button>` en footers con allowlist temporal. `fill` retenido solo donde hay jerarquía explícita de pie (avance de cierre de caja; canje single-box). El resto de la aplicación sigue con `<button>` nativo (bypass). `ActionButton` se retiró.

### Campo de entrada

**Propósito**: recoger un dato.

**Anatomía**: etiqueta, campo, texto de ayuda o de error.

**Estados**: vacío, con contenido, con foco, deshabilitado, con error.

**Reglas**:
- Tamaño de texto suficiente para no provocar zoom automático en el móvil.
- El error se muestra junto al campo y describe qué falta, no que «hay un error».
- Los campos numéricos no muestran los controles nativos de incremento.
- Nada de lo escrito se pierde por navegar o por un fallo de red.

**Estado**: existe. `src/components/ui/Field.tsx`. El aspecto lo fija CSS (`[data-component='Field']`). El consumidor pasa el `input`/`select`/`textarea`. No cubre barras de búsqueda compactas (`SearchField`) ni steppers de denominación ([D27](../5-estado/DEUDA.md)).

### Buscador compacto (`SearchField`)

**Propósito**: filtrar una lista.

**Anatomía**: lupa a la izquierda e input. Sin etiqueta uppercase.

**Reglas**:
- No es Field. No lleva etiqueta de formulario.
- Una sola altura, bloqueada (`height` = `min-height` = `max-height` = 32 px). Tipo 12 px. El ancho lo decide el sitio.
- Radio de control. Foco de marca.
- Los filtros CAT / PROV / FC viven al lado, flotando sobre el fondo: sin tarjeta, sin borde, sin punto.

**Código**: `src/components/ui/SearchField.tsx`. El aspecto lo fija CSS (`[data-component='SearchField']`).

**Estado**: existe. Catálogos, inventario, merma, mapeo, carta, pedido, encargo, scanner, albaranes, consumo y exportes.

### Tarjeta (`Surface`)

**Propósito**: agrupar información con una responsabilidad única.

**Anatomía**: superficie con radio contractual, borde de un píxel en `block`, elevación según variante.

**Variantes** (cerradas): `page` (superficie de trabajo sobre el envolvente; radio.superficie + elevacion.pagina), `block` (agrupación interior; radio.control + elevacion.superficie). No es un Card universal: no hay `hover`, `selected` ni slots de negocio. Una tarjeta pulsable de dominio (KDS, plato) no es esta pieza.

**Reglas**:
- Una tarjeta, una pregunta.
- Si es pulsable, toda su superficie lo es — y entonces es de dominio, no `Surface`.
- No anida `page` dentro de `page`: dentro de una `page` se usa `block` o zonas hundidas.

**Código**: `src/components/ui/Surface.tsx`.

**Estado**: existe. Piloto: `PageScreen`, dashboard caja/ventas, Staff (semana y fichaje), matriz de propinas, Sala LIVE. En `/staff/propinas`, los `Surface` `block` (`staff-propinas-last`, `staff-propinas-history`) no usan `color.superficie`: llevan `--home-widget-fill-secondary` y tinta invertida, igual que las cards de sáb/dom del widget de horario. El modal de detalle del reparto sigue en papel.

### Insignia de estado

**Propósito**: comunicar un estado con una palabra.

**Reglas**:
- Color **y** texto. Nunca solo color.
- Vocabulario cerrado por capacidad; no se inventan estados nuevos en la pantalla.

**Estado**: sin componente.

### Estado vacío

**Propósito**: explicar por qué no hay nada y qué hacer.

**Variantes**: nada todavía, nada que coincida, no se pudo cargar.

**Reglas**: las tres variantes son obligatoriamente distinguibles, según [EXPERIENCIA §7](EXPERIENCIA.md#7-vacío). La tercera se comporta como un error. El aviso es secundario: gris, 12 px, sin mayúsculas. No compite con el contenido.

**Estado**: existe. `src/components/ui/EmptyState.tsx`. Variantes `none` / `mismatch` / `error`. La de `error` usa `role="alert"`.

### Fila de documento (`DocumentListRow`)

**Propósito**: abrir un documento de perfil en una lista (nómina, comunicado, contrato). Familia canónica cerrada; **no** es un ListRow genérico ni un SelectionOption.

**Anatomía**:
```
host (`<li>`)
├── open (`<button>` — acción de abrir)
│   └── body
│       ├── title (obligatorio)
│       └── subtitle (opcional)
└── trailing (slot opcional: compartir, eliminar…)
```

**Contrato**:
- Semántica de **acción** en `open` (`<button type="button">`), no de navegación fingida ni de Button de sistema.
- `instance` obligatorio (`data-instance`). Identidad: `data-component="DocumentListRow"`.
- Título: `tipo.minimo` (11 px), caja oración, `color.texto.fuerte`. Subtítulo: metadato 10 px con `color.texto.tenue` (densidad de esta familia; por debajo de `tipo.minimo` solo aquí).
- Alto mínimo de fila 56 px (≥ `tactil.minimo`). Radio `radio.control`. Espaciado `espacio.1/3/4`.
- `trailing` no conoce negocio: el consumidor pasa chrome (p. ej. compartir) y/o `Button` icon-only (eliminar).
- No hay `className` de estilo de fila: el aspecto lo fija CSS por `data-component`.
- No sustituye filas de agenda, menús con icono 48 px, albaranes multi-columna, popups de filtro ni grids de avatares.

**Estado**: existe. Piloto: `NominasModal`, `ComunicadosModal`, `ContratoModal`. Gate: la huella legacy de la fila ad hoc no debe reaparecer fuera del host.

### Segmented de borde petróleo (`PetroleumSegmented`)

**Propósito**: elegir exactamente una opción entre un conjunto pequeño y cerrado. Familia canónica de Waste, precio de receta y subnav de ventas.

**Anatomía**:
```
host (role=radiogroup)
└── option* (role=radio, exclusivas)
```

**Densidades** (cerradas, obligatorias en la API):
- `comfortable` — alto `tactil.minimo` (48 px); piloto Waste.
- `compact` — padding `espacio.1` vertical; piloto recipes y SubNavVentas (sin imponer 48 px sobre la anatomía compacta existente).

**Contrato**:
- Identidad: `data-component="PetroleumSegmented"`, `data-instance`, `data-density`.
- Selected: fondo `color.superficie.inactiva` + `color.texto.fuerte`. Reposo: `color.superficie` + `color.texto`. Hover: superficie inactiva. Sin `color.marca`.
- Radio del host: `espacio.2` (8 px; el shell legacy usaba `rounded-lg`, no `radio.control`).
- Tipografía de opción: 10 px, peso 500, caja oración.
- Semántica: selección exclusiva vía `value` / `onChange`. Si el consumidor navega (p. ej. Ventas → sala), lo hace en el callback; el componente no conoce el router.
- No es Button, Tab, Chip ni el segmented de track zinc (`bg-zinc-100`).
- Sin `className` de shell: geometría solo por CSS.

**Cuándo usarlo**: toggles de 2–N opciones de sección.

**Cuándo NO usarlo**: tabs underline, chips, segmented zinc (Inventario/Mapeo/Ledger), TimeFilter, CartaLangPicker, selectores de dominio (clima, SVG, listbox).

**Estado**: existe. Piloto: `WasteClient`, `recipes/[id]` (×2), `SubNavVentas`. Gate de huella legacy.

### Cifra de KPI (`KpiStat`)

**Propósito**: cifra protagonista de un dashboard (T1).

**Anatomía**: valor + etiqueta. El valor lo aporta el consumidor (p. ej. `PremiumCountUp`).

**Estado**: existe. `src/components/ui/KpiStat.tsx`. Tono `neutral` / `positive` / `negative` / `info`. Label a `tipo.minimo` (11 px); nunca 5–7 px. No cubre la tira densa del calendario mensual (P3 / Labor): esa anatomía es de dominio.

### Aviso

**Propósito**: comunicar el resultado de una acción o una condición del sistema.

**Variantes**: positivo, negativo, advertencia, informativo, crítico.

**Reglas**:
- El positivo desaparece solo; el negativo permanece hasta que se atiende.
- No tapa el dato necesario para el paso siguiente.
- No expone detalle técnico.

**Estado**: parcial. Existe la biblioteca de avisos flotantes (toasts) y el aviso embebido `Notice` (`src/components/ui/Notice.tsx`; variantes `positive` / `negative` / `warning` / `info` / `critical`).

---

## 2. Componentes de sistema

Piezas transversales con comportamiento propio y contrato estricto. **Estas sí existen.**

### Modal

**Propósito**: abrir una capa de trabajo o de confirmación sobre la pantalla actual.

**Anatomía**: capa de oscurecimiento, panel con cabecera fija, cuerpo desplazable, pie fijo de acciones (`footer`).

**Variantes**: `compact`, `standard`, `work`, `day`, `amplify`. Catálogo y anchos en [PATRONES P2](PATRONES.md#p2--modal).

**Reglas**:
- Respeta el área segura del dispositivo y usa el alto visible real, nunca el teórico.
- Atenúa y desactiva las barras fijas de la aplicación mientras está abierto.
- Cabecera fija (`estructura.cabecera-modal` = 36px) y pie no se desplazan; el pie no se encoge. El contenido de cabecera (título, iconos, acciones) se adapta tipográficamente; no se trunca el título por la altura. Botones de cabecera (chrome) independientes de Button, cuadrados al alto de la cabecera. La cabecera de trabajo es superficie, no franja de marca. Los overlays de **elección y menú de acceso** usan `scheme="dark"` (envolvente bajo, tinta invertida). Formularios y recuentos siguen `scheme="work"` (blanco).
- **Inset horizontal único de cabecera:** `espacio.4` (16 px, ref. Albaranes). Título, subtítulo y texto de cabecera empiezan en el mismo punto. El chrome de la derecha no reserva un hueco simétrico a la izquierda. `headerCompact` y `headerTitleAlign` no cambian ese inicio.
- **Título y subtítulo van en la misma fila.** El título lleva la jerarquía principal (peso 500). El subtítulo es menor y de peso medio, nunca negrita pesada. El shell centra ambos por el trazo (cap), no por el em: no flotan uno respecto al otro. Si el texto no cabe, se recorta en esa fila; la cabecera no crece por encima de 36 px.
- **Separación Header → Body:** exactamente 12 px (`espacio.3` / `estructura.modal-cuerpo-inicio`) como `padding-top` del Body. No es padding completo del Body. El consumidor no decide ni elimina esa distancia (`pt-0` en hijos no la anula).
- Radio único del panel: `radio.superficie` (16 px). El consumidor no puede sobrescribirlo con `className`.
- **`className` del panel** solo admite composición externa (flex, overflow, tipografía de tono…). `pickModalPanelClassName` descarta max-width/max-height, padding, margin, radio, sombra, fondo y z-index. Ancho y alto los fija la variante / tokens del shell. Deuda de consumidores que aún pasan tokens de shell: allowlist `LEGACY_MODAL_PANEL_CLASSNAME_ALLOWLIST` (el runtime ya filtra).
- **Inset del Body:** el shell aplica `padding-inline` + `padding-top` contractuales. Un hijo raíz con `p-4`/`px-6`/… (≥ `espacio.4`) **duplica** el inset. Gate de regresión: `findModalRootPaddingClassNames` + allowlist `LEGACY_MODAL_ROOT_PADDING_ALLOWLIST`. No se compensa con CSS inverso.
- **Footer:** acciones con `<Button>` oficial (texto, sin iconos). Los botones del pie se igualan al ancho del mayor: el shell envuelve el contenido en `footer-actions` (grid `1fr`, sin JS). Un único `<Button>` no cambia. Un componente de pie con layout propio (`CashCountFooter`, total a la izquierda) no se iguala por el shell; iguala sus propios botones. Gate: ningún `<button>` nativo nuevo en `footer=`; deuda en `LEGACY_MODAL_FOOTER_NATIVE_BUTTON_ALLOWLIST` (7 rutas).
- **`zIndexClass`:** deprecated; allowlist vacía — uso nuevo falla test. Preferir `layer`.
- **`backdropClassName`:** deprecated salvo excepciones documentadas (`LEGACY_MODAL_BACKDROP_CLASSNAME_ALLOWLIST`: lightbox de carta). El backdrop lo posee la capa ([ADR-0008](../4-decisiones/ADR-0008-modal-backdrop-capas.md)).
- **Nesting:** máximo una superficie derivada sobre el modal base ([ADR-0007](../4-decisiones/ADR-0007-modal-superficie-derivada.md)). Backdrop por capa sin blur acumulado ([ADR-0008](../4-decisiones/ADR-0008-modal-backdrop-capas.md)).
- **Subordinación del panel cubierto:** si hay `derived`/`system` encima, el panel que no es cima recibe `data-subordinate` (blur + opacity + `pointer-events-none` en el host). Sin portal extra ni z-index manual ([ADR-0009](../4-decisiones/ADR-0009-modal-subordinacion.md)).
- **Navegación padre→hijo ≠ layer ≠ z-index ≠ pila de Escape.** <!-- af: AF-MODAL-NAV-NO-ES-LAYER --> Relación explícita: `parentInstance` + `instance`. No se infiere por cima de pila ni por layer. Un Modal puede tener padre y ser `base`; un `derived` no implica ←. `system` no es padre de navegación.
- **Historial interno por `surfaceId`**, junto a `registerModalSurface` y separado de las capas. `instance` es identidad semántica; varias aperturas simultáneas de la misma instance no comparten id interno. El consumidor sigue dueño de `open`.
- **Raíz** (sin padre vivo): no hay ←. X, Escape y backdrop cierran toda la cadena. **Hijo** (padre vivo): ← a la izquierda; X a la derecha, Escape y backdrop hacen pop (el padre vuelve activo). Encima, Escape cierra primero `system`.
- `onBack` permanece para usos que no son esta navegación. No es el historial padre→hijo.
- Cero scroll horizontal en Modal, Header, Body, Footer y tablas internas.
- Cerrar con cambios sin guardar pide confirmación. El consumidor usa `layer="system"`, no un segundo modal de tarea.
- Las confirmaciones de acción (eliminar, reiniciar, salir de un flujo) usan `compact` + `layer="system"` + footer Button (`secondary` cancelar + `destructive` o `primary`). Composición: `src/components/ui/ConfirmModal.tsx`. No hay variante `confirm`.
- **Declara identidad estable** (`data-component="Modal"`, `data-variant`, `data-instance`, `data-parent-instance`, `data-layer`). `data-instance` es el id de negocio; la prop `instance` lo emite. `data-parent-instance` es la identidad semántica del padre de navegación, no una capa. `usageId` es un alias de implementación para telemetría, no una vía para overlays propios.
- **Portal, Escape, bloqueo de desplazamiento y backdrop los posee este componente.** El consumidor no monta otro `createPortal` de overlay, no pinta `fixed inset-0` de modal, no elige z-index numérico y no inventa un fondo.
- Si el contrato no cubre el comportamiento pedido, se para y se pregunta. No se abre un overlay paralelo.

**Excepción**: `ConsumptionBottomSheet` — hoja inferior de consumo; comparte portal/capas/Escape/scroll; no es Modal centrado ni vía libre de overlays nuevos.

**Código**: `src/components/ui/modal.tsx`, `src/components/ui/ConfirmModal.tsx`, `src/components/ui/ConsumptionBottomSheet.tsx`, `src/lib/design-system/modal-*.ts`.

**Estado**: contrato oficial + enforcement de capas, historial, filtro de `className` del panel, gates de footer/`zIndexClass`/`backdropClassName`/padding raíz. Consumidores en allowlists temporales pendientes de migración (Block 1). Overlays paralelos legacy: `LEGACY_PARALLEL_OVERLAY_ALLOWLIST` (cerrada). El contrato puede evolucionar; el cambio pasa por este documento, las ADR si la decisión es estructural, y después el código.

### Estructura de pantalla de detalle (`PageScreen`)

**Propósito**: dar a toda pantalla de gestión el mismo cromo sobre el envolvente, el mismo papel de trabajo, el mismo ancho máximo y el mismo comportamiento de desplazamiento. Es la plantilla T2/T3/T4. Lo decide [ADR-0010](../4-decisiones/ADR-0010-jerarquia-visual-canonica.md).

**Código**: `src/components/dashboard/DashboardDetailLayout.tsx` (exporta `PageScreen` y el alias `DashboardDetailLayout`).

**Reglas**:
- Título y subtítulo son obligatorios en espíritu; el subtítulo explica el alcance, no felicita. El subtítulo puede omitirse en calendarios densos (Labor, Reservas).
- El ancho máximo se elige entre valores predefinidos (`maxWidthClass`); no se escribe un radio nuevo.
- El periodo (P7) vive en la cabecera. `rightSlot` guarda acciones de alcance, no un segundo «Filtrar». En Cierres, Calendario/Tabla va a la izquierda de esa fila (`periodStartSlot`); el mes y las flechas siguen centrados.
- Buscador, CAT / PROV y segmented de vista van en `toolbarSlot`, fuera del papel. Si el buscador ya no se ve, al scrollear hacia arriba flota arriba (`data-pin`) con el cristal del tab bar. En el toolbar y en `period-start`, PetroleumSegmented: activa relleno blanco; el resto, transparente y tinta invertida.
- KPI, gráfico de contexto y acciones rápidas (Entrada/Salida/Arqueo) van en `leadSlot`, fuera del papel.
- Identidad: `data-component="PageScreen"`, `data-template` = `list` | `detail` | `form`, `data-work` = `calendar` | `table` | `catalog` | `form`. Cromo: `data-element="chrome"` / `header` / `toolbar` / `period-start` / `lead`.
- Catálogo y formulario van en `Surface` `page`. Calendario y tabla no llevan esa ficha: PageScreen deja Surface transparente. El calendario (P3) y la tabla conservan su pieza blanca con el canto de widget (hairline blanca + sombra), no un borde zinc. El consumidor no pinta `bg-white rounded-2xl shadow-2xl` ni `bg-[#36606F]` de cabecera de página.
- Las acciones de cabecera (`rightSlot`) sobre el envolvente: `Button` en tinta invertida, **sin relleno ni marco**. Excepción: el CTA `reservas-nueva` lleva relleno blanco, como la pestaña activa. El chrome de recarga nativo blanco (Albaranes) sigue siendo chrome, no Button.
- Cabecera: misma altura que el Modal (`estructura.cabecera-modal`). El título, el subtítulo y los iconos se reducen en proporción. No se recortan ni se abrevian con puntos. Tinta: `color.texto.invertido`.
- Orden de la cabecera: flecha atrás (si se muestra), identidad opcional (`titleLeading`, p. ej. avatar), título, resto. La flecha puede ejecutar `onBack` en lugar de navegar.
- En smartphone el ancho de la plantilla es el del dispositivo menos un margen (`espacio.2`) a **ambos** lados, donde se ve el fondo. El contenido no puede empujar la tarjeta contra un borde. La altura de la tarjeta sigue al contenido.
- En smartphone el calendario mensual es más estrecho que la plantilla (`espacio.2` de diferencia).

**Estado**: existe. Migrados: Labor, Albaranes, Reservas, Propinas, Carta, inventario, Recetas, Ingredientes, Ventas, Tesorería, Asistencia, Perfil, Insights, Precios desde albarán, catálogo de actividades e Importación. T1 (dashboard mosaico) no usa PageScreen: es otra anatomía.

### Barra superior de la aplicación (`Navbar`)

**Propósito**: chrome fijo de la app (logo, saludo, campanas). No es la cabecera de una pantalla.

**Código**: `src/components/Navbar.tsx`.

**Reglas**:
- Alto visible: `tactil.minimo` (48 px + área segura). Logo e iconos a esa proporción.
- Offset del contenido: `estructura.cabecera` (56 px + área segura). Los 8 px de diferencia son separación vacía (envolvente).
- El saludo («Hola, …») va en caja oración, a `tipo.minimo`. No es cabecera: no lleva mayúsculas. El nombre se reduce para caber; no se abrevia con puntos.
- Campanas de reservas y notificaciones van a la derecha. Sin botones IA ni PG.
- Chrome back ≠ Button. Táctil 48 px.

### Marco de calendario mensual (`MonthCalendarFrame`)

**Propósito**: pintar el cromo P3 de Cierres (cabecera roja de días y tarjeta blanca al 97 %). En PageScreen `work=calendar` esa tarjeta se ve sobre el envolvente con el canto de widget. PageScreen no pone otra ficha alrededor. En el mosaico Staff (`flush`) la semana va al ancho del hueco. El contenido de cada celda lo pone el dominio.

**Código**: `src/components/time/MonthCalendarFrame.tsx`.

**Reglas**:
- Lo usan Labor, Reservas, Horario, Actividades, Consumo, Cierres y Asistencia (el mosaico Staff y el modal de una semana en horas extras montan la misma pieza).
- Semana vacía: el alto de Cierres. Si el contenido no cabe, la fila crece.
- En Asistencia, cada semana de una persona lleva un pie (Horas / Pendientes / Extras / Importe). La plantilla no.
- En el mosaico Staff el marco va a ancho completo (`flush`), sin franja, sobre el petróleo. Papel blanco y cabecera roja de días. No es cristal.
- Horas extras (página) y MiniMonthCalendar no lo usan.

**Estado**: existe.

### Navegación inferior

**Propósito**: navegación principal en la aplicación instalada.

**Anatomía**: tab bar de iPhone. Isla flotante, pista 49 pt (icono 25 pt + etiqueta 10 pt). Por defecto, mismo cristal frosted que los widgets HomeScreen (`--chrome-glass-*`). Si debajo hay papel claro (`data-over="light"`), pasa al cristal del envolvente para que no desaparezca. Iconos blancos. Inactivo al 55 % blanco; activo, blanco y semibold. El icono va siempre en trazo, sin relleno. Al scrollear hacia abajo, primero se ocultan los nombres (`data-mode="compact"`); si se sigue, se oculta (`data-hidden`). Al scrollear hacia arriba vuelve.

**Identidad**: `data-component="TabBar"`. Ítem: `data-element="item"` + `data-active`.

**Reglas**: en [PATRONES P8](PATRONES.md#p8--navegación-inferior).

**Estado**: existe. `StaffBottomNav` monta este cromo. La duplicación de montaje por rol es deuda registrada.

**Código**: `src/components/StaffBottomNav.tsx`.

### Barra superior

**Propósito**: identidad, notificaciones y acceso al perfil.

**Reglas**:
- Alto visible: `tactil.minimo` más área segura. El contenido reserva `estructura.cabecera`; la diferencia es hueco vacío.
- Se oculta al scrollear hacia abajo y vuelve al scrollear hacia arriba, también al fondo de la página.
- Se atenúa con modal abierto.
- Los avisadores de notificación muestran cantidad, no solo presencia.

**Estado**: existe.

### Indicador de espera

**Propósito**: comunicar que algo está en curso.

**Reglas**: atenuación cíclica, nunca a pantalla completa por un dato secundario. Preferir el armazón de contenido antes que el indicador.

**Estado**: existe.

### Reloj y cronómetro de jornada

**Propósito**: mostrar la hora actual y el tiempo trabajado en curso.

**Reglas**:
- El cronómetro cuenta desde el fichaje de entrada real, no desde que se abrió la pantalla.
- Ambos se actualizan sin provocar redibujado de la pantalla que los contiene.
- La hora es la del negocio.

**Estado**: existen como dos piezas.

### Cifra animada

**Propósito**: dar peso perceptivo a una cifra protagonista al aparecer.

**Reglas**:
- Solo en cifras protagonistas de tarjeta. Nunca en tablas ni en listas.
- La animación no retrasa la lectura: el valor final se alcanza en menos de un segundo.
- Se respeta la preferencia de movimiento reducido.

**Estado**: existe.

### Celda que se ajusta

**Propósito**: encajar texto en un espacio fijo reduciendo su tamaño antes que truncarlo.

**Reglas**: **nunca corta una cifra**. Tiene un tamaño mínimo por debajo del cual deja de reducir y el contenedor debe crecer o el diseño está mal.

**Estado**: existe. Es la pieza que hace posible la densidad del calendario mensual.

### Avatar

**Propósito**: identificar a una persona.

**Reglas**: sustituto con iniciales cuando no hay imagen. Nunca un hueco roto. Forma circular siempre.

**Estado**: existe.

### Visor con acercamiento y ampliación de imagen

**Propósito**: leer un documento o una imagen en detalle.

**Reglas**: superficie propia, no imagen grande en el flujo. Salida siempre visible. Gesto acompañado de control.

**Estado**: existen como dos piezas.

### Recarga por gesto

**Propósito**: refrescar una lista tirando hacia abajo.

**Reglas**: es un atajo, no el único mecanismo. Un panel en vivo se actualiza solo.

**Estado**: existe.

### Ampliación de recuento y calculadora rápida

**Propósito**: apoyar el recuento de efectivo y el cálculo puntual sin salir de la tarea.

**Reglas**: cifras grandes, legibles a distancia de brazo, con teclado de tamaño de dedo.

**Estado**: existen.

---

## 3. Componentes de dominio

Cada capacidad tiene sus piezas propias: cierre de caja, albaranes, carta, cocina, propinas, recetas, reservas, pabellón, horarios, consumo, tesorería, encargos, analítica.

**Frontera**: una pieza de dominio puede usar componentes base y de sistema; **nunca al revés**. Un componente de sistema que conozca una regla de negocio está mal ubicado.

Su contrato lo fija la [especificación de su capacidad](../1-producto/capacidades/). Este documento solo gobierna que respeten los tokens, los patrones y las leyes de experiencia.

### Atajo de dashboard (`DashboardShortcut`)

**Propósito**: acceso táctil a una capacidad desde los dashboards (rejilla de iconos).

**Anatomía**: host transparente → iconBox (misma forma redondeada para todos) → asset; text como pieza hermana **debajo**, nunca dentro del icono. Badge y `children` métricos son accesorios de instancia, no variantes.

```text
host (transparente)
 ├── iconWrap
 │   ├── iconBox  (forma única; con relleno, el fondo lleva el mismo radio)
 │   │   └── asset (PNG, Lucide o cifra, entero)
 │   └── rim      (hilo de la misma silueta, hermano del recuadro)
 └── text         (nombre, fuera del icono)
```

**Relleno del icono** (`data-plate`, no es variante estructural):
- Todos los recuadros miden lo mismo y usan el mismo `radio.superficie`.
- La imagen se ve **entera** cuando va sobre placa (`object-fit: contain`). Sin relleno, llena el recorte del sistema.
- `bleed` — el gráfico es el icono (Recetas, Consumo, Asistencia). El color llega al borde del archivo; el dibujo lleva aire. El recorte no acerca el gráfico.
- `fill` — el gráfico no puede ser la forma; un fondo opaco la completa (Caja, objeto 3D, Lucide, cifra).
- El hilo es el mismo canto para `fill` y `bleed`. No es el aro de Entrada/Salida.
Si no se declara: `bleed` cuando hay `img`; `fill` si no.

**Variantes** (cerradas, estructurales): `icon-text`, `icon-card-text-outside` (**default**), `separated`, `icon-only`, `text-only`. Se resuelven a propiedades independientes de composición; no existe el enum legacy `composition`.

**Identidad**: `data-component="DashboardShortcut"`, `data-variant`, `data-instance` (id de negocio, p. ej. `asistencia`). El label visible no forma parte de la identidad. `data-studio-target` (`bg` / `asset` / `text`) se conserva para compatibilidad con Marbella Studio.

**Estado**: existe. Consumidores: rejilla Master, Staff y Admin. El mosaico pinta el atajo sobre el petróleo: el nombre usa `color.texto.invertido`. El atajo vive en `HomeScreen`; no define la rejilla.

**Código**: `src/components/dashboards/DashboardShortcut.tsx`.

### Inicio (`HomeScreen`)

**Propósito**: una sola disposición de pantalla de inicio para Staff, Admin y Master. Recrea el Springboard del iPhone.

**Anatomía**: 4 columnas × 6 filas. La pista es el squircle del icono. El nombre (atajo o widget) vive en el hueco entre filas, no dentro de la pista. Un 2×2 iguala dos iconos + el gap del medio.

| Tamaño | Huecos | Equivalente iOS |
|---|---|---|
| `icon` | 1×1 | app |
| `small` | 2×2 | widget pequeño |
| `medium` | 4×2 | widget mediano |
| `large` | 4×4 | widget grande |
| `wide` | 4×1 | una fila entera |
| `half` | 2×1 | media fila |
| `panel` | 3×2 | widget de tres columnas (H. extras en Admin) |
| `tile` | 1×1 | widget de una celda (Cambio 1/2 en Admin) |

El widget no elige un ancho libre: entra en la misma retícula. Las tres homes usan el mismo lienzo, el mismo hueco y el mismo aire. No hay 7 u 8 columnas en escritorio. `label` en el slot pinta el nombre bajo el hueco. Sin `label`, el widget mide lo mismo que icono + nombre. Entre filas, después de los nombres, hay el mismo aire que entre columnas. El hueco del widget **es material de sistema** (cristal que toma el wallpaper; claro u oscuro según el fondo; el contenido vive en el vidrio). En oscuro la fuente del contenido es blanca: no zinc, no gris, no marca. Un solo canto: hairline del cristal, no el hilo de 2 px del icono. El canto del icono (`data-element="rim"`) sigue en `DashboardShortcut`. El pie de la semana Staff en el mosaico baja el peso (600, no 900) para que PENDIENTES se lea. Admin monta `OpsHomeScreen` (Ventas, Caja inicial, H. extras 3×2 con Plantilla y Albaranes a la derecha, Cambio 1/2 + Recetas/Asistencia, M obra/Stock/Ingredientes/Cambio). Master monta Ventas y sus atajos (C INICIAL; H. extras, Cambio 1/2 como widget de cristal). Staff monta Semana, Entrada y Horarios sobre la misma `HomeScreen`.

**Identidad**: `data-component="HomeScreen"`. Cada celda: `data-element="slot"` + `data-slot`.

**Estado**: existe. T1 es esta rejilla, no un `max-w-6xl` distinto por rol.

**Código**: `src/components/dashboards/HomeScreen.tsx`.

### Rejilla de catálogo y de accesos (`CatalogGrid` / `AccessMenuGrid`)

**Propósito**: elegir un ítem por icono + nombre, en página (recetas, ingredientes) o en modal (Info, Documentos, Manuales, Caja, Stock).

**Anatomía**: rejilla de celdas cuadradas (imagen + pie de una fila). Sin tarjeta. `AccessMenuGrid` es la misma celda con **mínimo 3 columnas**; más solo si el consumidor lo pide. Recetas e ingredientes van a 3. Proveedores no usan esta celda: montan `SupplierPickerGrid` (`DashboardShortcut`, 4 columnas, nombre fuera del squircle).

**Estado**: existe. No es primitiva del sistema.

**Código**: `src/components/catalog/CatalogTile.tsx`.

---

## 4. Reglas del sistema

1. **Antes de crear un componente, se busca.** El producto tiene piezas casi duplicadas porque este paso se ha omitido repetidamente.
2. **Un componente de sistema no conoce el negocio.** Si necesita saber qué es una semana o un albarán, es de dominio.
3. **Los valores vienen de [TOKENS](TOKENS.md).** Un valor literal dentro de un componente es un defecto.
4. **Las variantes son cerradas.** Se eligen de una lista; no se abren pasando estilos desde fuera.
5. **Nada de proliferación de interruptores.** Un componente con cinco parámetros booleanos son treinta y dos estados que nadie ha probado. Se resuelve componiendo o creando una variante explícita.
6. **Toda pieza pulsable cumple el mínimo táctil** y toda zona de acción es indeformable.
7. **Un componente que se usa en una sola pantalla no es del sistema.** Vive junto a su pantalla hasta que aparezca el segundo uso.
8. **Si el inventario no cubre la necesidad, se para.** Inventar una pieza de sistema, una variante nueva o un overlay paralelo exige confirmación explícita. Una composición local de una sola pantalla sigue siendo local (punto 7) y no se declara de sistema.

---

## 5. Estado real del sistema

La jerarquía visual canónica está decidida ([ADR-0010](../4-decisiones/ADR-0010-jerarquia-visual-canonica.md)): tokens → primitivas → plantillas de pantalla → pantallas de negocio. **No se reabren** Modal, Button, PetroleumSegmented, DocumentListRow ni ADR-0007/0008/0009.

Hoy existen: Button, Modal, Surface, Field, SearchField, EmptyState, Notice, KpiStat, PageScreen, DocumentListRow, PetroleumSegmented, DashboardShortcut, HomeScreen. La insignia de estado sigue sin pieza (D27 chips). En Caja/Tesorería, `QuickCalculatorModal` y `DenominationZoomModal` permanecen legacy a propósito: el contrato no admite un tercer nivel sobre `base → derived`.

Consecuencias observables:
- Las pantallas principales de gestión (Labor, Albaranes, Reservas, Propinas, Carta, Recetas, Ingredientes, Ventas, Tesorería, Asistencia, Perfil, Sala) usan `PageScreen`.
- Sala LIVE usa PageScreen como Ventas: SubNav en toolbar, mesas en pieza de trabajo. Prohibido `rounded-[2.5rem]` e italic de título.
- El resto de pantallas y los literales `#36606F` / `rounded-xl` fuera de esas piezas son [D28](../5-estado/DEUDA.md): deuda de migración, no permiso para clonar cabeceras.
- La navegación inferior sigue implementada dos veces.
- T1 (mosaico Staff/Admin/Master) no es PageScreen: es `HomeScreen` (4×6) con `DashboardShortcut` y widgets en huecos.

Este documento es el contrato al que debe converger el código.

---

## 6. Tabla de decisión visual

Una familia = una implementación + el mínimo de variantes justificadas. «No me gusta cómo queda» no es variante.

| Familia | Referencia elegida | Variantes permitidas | Qué hacer con el resto |
|---|---|---|---|
| Button | Contrato vigente | `primary` / `secondary` / `tertiary` / `destructive`; layout `hug`/`fill` | Seguir D27; no quinta variante |
| Modal | Contrato vigente; contenido de detalle = Labor día | `compact` / `standard` / `work` / `day` / `amplify`; capas `base`/`derived`/`system` | No reabrir ADR-0007/8/9 |
| Cabecera/pie Modal | Shell Modal | `headerTone` (compat; no pinta petróleo) | Chrome ≠ Button |
| Surface | PageScreen + Labor card | `page` / `block` | Clones `bg-white rounded-2xl shadow-*` migran; `RecipeCard` huérfano no es referencia |
| Field | Filtro Albaranes (`min-h-12 rounded-xl`) | Una sola densidad de formulario | Steppers de denominación: D27 |
| SearchField | Lupa + input compacto, 32 px / 12 px | Una sola densidad | No es Field. CAT/PROV flotan al lado, sin tarjeta |
| Selector | PetroleumSegmented | `comfortable` / `compact` | Zinc, TimeFilter, CartaLangPicker, celdas de calendario: fuera |
| Tabs | TabBar pabellón (underline) | Anatomía de sección, no radiogroup | No mezclar con PetroleumSegmented |
| Filas | DocumentListRow (solo documentos) | Ninguna genérica | D27: no ListRow universal |
| Tabla operativa (T8) | Propinas + ledger `thead` | Composición: `table` + `tabular-nums`; en PageScreen tabla el `thead` es cabecera de bloque (11 px, 500, versales), no petróleo | No componente Table con 40 props |
| Insignia | PavilionMatchingBadge (anatomía) | Aún local por vocabulario de dominio | No chip factory |
| EmptyState | EXPERIENCIA §7 | `none` / `mismatch` / `error` | Migrar strings «No hay…» en pantallas tocadas |
| Notice | OrphanedSupplierAlert + tokens semánticos | 5 variantes | Toasts (sonner) siguen para feedback de acción |
| PageScreen | DashboardDetailLayout | `list` / `detail` / `form`; `compactHeader`; `fillViewport` | Prohibido `rounded-[2.5rem]` e italic de título |
| Navegación | Navbar + StaffBottomNav | Por rol | Duplicación: deuda previa, no se toca hoy |
| KPI | DashboardVentas + KpiStat | Tonos semánticos | Tira Labor 4 cols: dominio calendario |
| Loading | LoadingSpinner | tamaños | Sin pantalla completa por dato secundario |
| Color / radio / sombra | TOKENS | `elevacion.pagina` para PageScreen | Literales restantes = D28 |

---

## 7. Plantillas de pantalla (T1–T8)

No son ocho componentes gigantes. Son composiciones. Lo decide [ADR-0010](../4-decisiones/ADR-0010-jerarquia-visual-canonica.md). El término es **plantilla de pantalla**, no «plantilla» (equipo).

| Id | Nombre | Materialización | Anatomía |
|---|---|---|---|
| T1 | Dashboard mosaico | HomeScreen + DashboardShortcut + widgets en huecos. **No** PageScreen | 4×6, pista = squircle, widget 2×2 / 4×2 / 4×4 / 4×1 / 2×1 / 3×2 |
| T2 | Listado | `PageScreen` `template="list"` | cabecera, filtros (`rightSlot` o cuerpo), lista/tabla, empty, acciones |
| T3 | Detalle | `PageScreen` `template="detail"` | cabecera, información, secciones, acciones |
| T4 | Formulario | `PageScreen` `template="form"` + Field + footer Button | cabecera, campos, grupos, validación, pie |
| T5 | Modal | `Modal` contrato; densidad de cuerpo = Labor día | header / body / footer / `espacio.3` Header→Body |
| T6 | Modal derivado | `Modal` `layer="derived"` + ADR-0009 | subordinación, header, body, footer, `parentInstance` |
| T7 | Selector | PetroleumSegmented | opciones, selected, disabled vía CSS, feedback de foco |
| T8 | Tabla operativa | Composición (no componente) | filas uniformes, `tabular-nums` a la derecha, sin scroll X en Modal; en PageScreen tabla el `thead` es cabecera de bloque, no petróleo |

Una pantalla nueva de gestión usa T2/T3/T4. Una pantalla nueva de mosaico usa T1. Un overlay usa T5/T6. Si la anatomía no cabe, se pregunta; no se clona una cabecera de marca.
