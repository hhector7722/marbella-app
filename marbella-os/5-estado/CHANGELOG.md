---
documento: CHANGELOG
clase: inmutable
estado: vigente
capa: estado
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-08-27
caducidad: no aplica
supersede: PROJECT_STATUS.md (función de historial)
---

# CHANGELOG

Historial cronológico de Marbella. **Append-only**: se añade arriba y nunca se edita ni se reordena lo anterior.

Este documento responde a «¿qué cambió y cuándo?». Para «¿cómo está el producto hoy?» está [ESTADO](ESTADO.md). Separar esas dos preguntas es la corrección estructural de mayor impacto de toda la arquitectura documental: antes compartían un fichero de 1.288 líneas donde la segunda era irrespondible.

## Qué se anota aquí

- Capacidades que nacen, cambian de comportamiento visible o se retiran.
- Reglas de negocio que cambian.
- Decisiones estructurales, con enlace a su ADR.
- Deuda pagada y deuda aceptada.
- Cambios de terminología de uso frecuente.
- Cambios en el propio corpus documental.

## Qué no se anota

- Correcciones de defectos sin consecuencia visible.
- Refactorizaciones internas sin cambio de comportamiento.
- Detalle de implementación. Eso está en git.

## Formato

Una entrada por cambio, agrupadas por fecha descendente. Cada entrada: qué cambió, para quién y con qué consecuencia. Una o dos frases. Si necesita más, necesita un ADR o una especificación, y aquí solo va el enlace.

## 2026-08-27

- **La ficha de receta deja de cortar nombres y de cargar la cabecera.** Las flechas flotan, sin tarjeta; Eliminar vive en el pie de editar nombre e imagen; las raciones solo se leen junto al costo total si hay más de una; en el teléfono el precio, el FC, la base y el margen van en una fila; Recomendado y Simulador comparten línea; se añade un ingrediente desde la propia tabla.

- **Albaranes: el filtro va en la cabecera y ESCANEAR, junto al buscador.** El panel de filtrar es compacto y muestra las fechas que realmente se aplican. La lista ya no se corta en silencio a 45 días: al final, Ver más carga 20 albaranes más, del más reciente al más antiguo.

- **Una receta abre la misma ficha desde Staff y desde Admin.** Ya no hay un modal distinto para personal: pulsar una receta entra en la ficha. La categoría flota como CAT; las flechas son el botón de icono; borrar pide el mismo panel de confirmación.

- **La ficha de un ingrediente usa los mismos campos que el resto.** Nombre, categoría, merma, unidades, stock y proveedores entran por el campo de sistema; ya no se desbordan en una sola fila. Borrar pide confirmación en el mismo panel que un proveedor. Las flechas anterior/siguiente son el botón de icono, no un círculo suelto.

- **El catálogo se lee en tres columnas; el filtro ya no es una tarjeta.** Recetas e ingredientes pasan a 3 columnas; proveedores (página y pedido) siguen en 4, con la misma celda. Todos los buscadores miden la misma altura. CAT y PROV flotan sobre el fondo, sin mini-card y sin punto.

- **El buscador, el calendario de ventas y los formularios pintan igual.** Buscar es la misma lupa; elegir un día en ventas es el mismo mini-calendario; las tablas de inventario, pedido, encargo y propinas llevan la cabecera de sistema; si no hay nada se dice igual; confirmar ya no se estira; y nombre, fechas y teléfono de proveedor, carta y condiciones van en el mismo campo.

- **Una barra de cantidad, un calendario de día y el mismo vacío en todas partes.** Menos / número / más es la misma pieza; confirmar ya no se estira a todo el ancho; horas extras del Admin coincide con la pantalla; las tablas de receta, mapeo, encargo e import llevan la cabecera de sistema; elegir un día en ventana es el mismo mini-calendario; si no hay nada se dice igual; y el día de uso, web, apunte y encargo vive en la cabecera.

## 2026-08-26

- **Todos los recuentos de efectivo pintan igual.** Propinas, entradas, retiradas, arqueos, cierre, cambio, compra y el desglose de un movimiento: total abajo, Cancelar y Guardar en el pie. La fecha, cuando toca, va en la cabecera. Las cajas de cantidad se estrechan un poco para que las columnas respiren.

- **Siguiente de cerrar caja deja de ser pastilla.** El avance del cierre (y Ver resumen del arqueo) es el mismo botón compacto a la derecha, no una barra verde a todo el ancho.

- **El periodo va en la cabecera, con el mismo filtro a la derecha.** Flechas y fecha en la franja petróleo; el icono de filtro no se convierte en una cruz. Tablas y calendarios empiezan más arriba. Los botones dejan de parecer pastilla. La tabla de ventas cabe entera, más compacta, sin scroll horizontal.

- **El catálogo respira y el pie cabe en una línea.** Recetas, Ingredientes y Proveedores separan más las celdas. Las fotos de proveedor bajan al tamaño de las otras dos. Nombre y precio van en una sola fila.

- **PageScreen deja el mismo aire a ambos lados en el teléfono.** La tarjeta usa casi todo el ancho y el fondo se ve a izquierda y derecha; el contenido ya no se pega al borde derecho.

- **Recetas, Ingredientes y Proveedores pintan el mismo catálogo.** Cuatro columnas, sin tarjeta: foto y pie forman un cuadrado; la foto se encoge y el nombre o el precio se leen enteros.

- **Pantallas de gestión más bajas y más anchas en el móvil.** La franja de título mide lo mismo que la de una ventana. En el teléfono la tarjeta usa casi todo el ancho, deja ver un poco de fondo a los lados y se acaba donde acaba el contenido. El calendario cabe un poco más estrecho que esa tarjeta. Los botones de la franja van sin marco; el relleno de todos los botones abraza el texto o el icono.

- **Filtros de lista usan el mismo panel.** Categoría en Recetas y Proveedores, proveedor en Ingredientes y el modo al crear un ingrediente dejan el desplegable suelto. Pedido nuevo no tenía ese selector.

- **Un solo mapeo TPV.** Vincular artículos del terminal con recetas se hace en Recetas TPV. La pantalla antigua de administración lleva ahí.

- **Enviar un encargo usa el mismo aviso.** El aviso al enviar por enlace y los botones Guardar/Enviar del pie usan el panel y el botón del sistema.

- **Propinas e Insights usan el mismo periodo.** Flechas y etiqueta visibles; pulsar el mes abre el selector. Sale el icono «Filtrar» de Propinas y los chips Sem/Mes/Día de Insights. [PATRONES P7](../2-diseno/PATRONES.md#p7--filtro-temporal).

- **Confirmaciones nativas pasan a Modal.** Eliminar proveedor, albarán, match, encargo, tramo laboral, ingrediente de receta, estética del playground, reiniciar borrador de pedido y abrir receta desde Insights usan el mismo panel compacto que Cerrar sesión. El diálogo nativo del navegador sale de esas pantallas.

- **Foto, recorte y categorías de reporte pasan a Modal.** Ampliar una imagen (recetas, cierres), recortar el avatar y elegir categorías en Reporte usan el mismo panel que el resto de la app. La calculadora y el vídeo de fichaje siguen aparte.

- **Un solo control de periodo.** Labor, Horario, Actividades, Reservas, Consumo, Horas extras, Asistencia, Cierres, Ventas, Tesorería y Libro Mayor usan el mismo `← periodo →`. Se retira el icono «Filtrar» duplicado: pulsar el mes abre el selector. Propinas e Insights siguen con picker propio. [PATRONES P7](../2-diseno/PATRONES.md#p7--filtro-temporal).

- **Tarjeta semanal de una persona, una sola.** El mosaico Staff y el modal de horas extras pintan la misma semana que Asistencia de un trabajador (LUN–DOM, celdas, pie Horas / Pendiente / Extras / Importe). La vista de plantilla (todos los trabajadores) sigue aparte: iniciales y fichajes, sin pie de resumen. [PATRONES P6](../2-diseno/PATRONES.md#p6--tarjeta-semanal).

- **Tablas, barras de sección y overlays se juntan al sistema.** Las tablas operativas (Ventas, Tesorería, Libro Mayor, Cierres, Catálogo, Propinas) pintan el `thead` con una sola identidad. Las barras de bloque interiores (Recetas, Insights, contrato, consumo) usan la misma cabecera de sección. El overlay de recetas staff pasa a Modal. Botones de confirmar/filtro dejan el petróleo escrito a mano. Sin ADR nueva.

- **Resto de gestión entra por PageScreen.** Proveedores, Pedido nuevo, Libro Mayor, Uso de la app, Analítica web, importación de fichajes, Mapeo TPV, Revisión de actividades, Editar horario, importador de recetas, Condiciones laborales, Reporte, Propinas staff y Encargo dejan de clonar cabecera. Un cambio en el sistema las pinta juntas. Sin ADR nueva.

- **Oleada PageScreen de gestión.** Recetas, Ingredientes, Ventas, Tesorería, Asistencia, Perfil, detalle de receta, Insights, Precios desde albarán, catálogo de actividades e Importación entran por `PageScreen`. Recetas e Ingredientes muestran 4 ítems por fila. Asistencia conserva tarjetas semanales (P6), no el calendario P3. Sin ADR nueva.

- **Horas extras recupera el mini-calendario.** `/dashboard/overtime` deja la rejilla mensual P3 y vuelve a días en círculos + filas de semana (importe y pagado). Sigue en PageScreen. No es un calendario mensual.

- **Calendarios mensuales del mismo tipo, dentro de PageScreen.** Horario, Actividades, Horas extras, Consumo staff y Cierres entran por `PageScreen`. Labor y Consumo dejan las tarjetas de día sueltas: todos los calendarios mensuales de gestión usan la misma rejilla continua (P3). Horas extras deja el mini-calendario y muestra el mes completo. Sin ADR nueva.

## 2026-08-25

- **Sala LIVE deja de clonar cabecera.** `/dashboard/sala` y el radar de mesas abandonan `rounded-[2.5rem]`, italic y petróleo escrito a mano: `Surface` `page`/`block` y `EmptyState`. No es PageScreen (no es listado/detalle/formulario). Sin ADR nueva ni primitivas extra.

- **Homogenización visual visible (ADR-0010).** Labor, Albaranes, Carta, Reservas, Propinas, Caja, Staff, Eventos, Inventario y Recetas pasan a cabeceras, superficies, campos, avisos y botones del sistema. Horas extras del mosaico Admin conserva púrpura de dominio. Sin ADR nueva ni primitivas extra.

- **ADR-0010 — jerarquía visual canónica.** Las pantallas de gestión se construyen con primitivas y plantillas de pantalla, no clonando cabeceras. Nacen `Surface`, `Field`, `EmptyState`, `Notice`, `KpiStat` y `PageScreen`. Migrados Labor, Albaranes, Reservas, Propinas, Carta y el mosaico de Caja/Staff/Ventas. El resto de literales queda en [D28](DEUDA.md). [ADR-0010](../4-decisiones/ADR-0010-jerarquia-visual-canonica.md).

## 2026-08-20

- **ADR-0009 — subordinación visual del panel Modal cubierto.** Cuando hay `derived`/`system` encima, el panel base se atenúa (blur, opacity, `pointer-events-none`) sin portal ni z-index extra. Sustituye la lectura de nitidez del inferior en ADR-0008; ADR-0008 no se edita (backdrop por capa intacto). [ADR-0009](../4-decisiones/ADR-0009-modal-subordinacion.md).

## 2026-08-19

- **Button: cero icono+texto en consumidores.** Los Button con etiqueta visible ya no llevan `icon`. El contrato no cambia. Icon-only con `aria-label` sigue fuera del footer de Modal.
- **Modal `work`/`day` pasa a `max-w-6xl` (1152px).** El catálogo P2 ensancha esas dos variantes; compact, standard y amplify no cambian. Sin migrar consumidores ni tocar backdrop, capas o chrome.
- **Button: anatomía texto XOR icono.** Un Button con texto visible no lleva icono; un Button icon-only no lleva texto. No existe la combinación. Sin variante nueva ni cambio de API. Los usos actuales de icono+texto no se migran; el contrato y las pruebas los tratan como inválidos.
- **Navegación padre→hijo en Modal.** Historial explícito (`instance` + `parentInstance`), separado de layers y de la pila de Escape. Raíz: X/Escape/backdrop cierran la cadena. Hijo: ← y X/Escape/backdrop hacen pop. Cadenas conectadas: DaySummary→crear fichaje, detalle de semana→historial trabajador, detalle de propina→desglose, ficha de proveedor→edición. Sin ADR nueva: no cambia el tope de nesting de [ADR-0007](../4-decisiones/ADR-0007-modal-superficie-derivada.md).
- **Button primary = verde de confirmación.** La variante `primary` pinta con `color.positivo` (`#059669`), no con petróleo. `secondary` / `tertiary` / `destructive` no cambian de papel. Sin variante `confirmar` nueva. Los Button ya migrados heredan el contrato.
- **Corrección óptica cabecera Modal.** Título y subtítulo de la misma fila se centran por el trazo (cap), no por el em. Sin cambio de alto 36 px, inset, variantes ni layers.
- **Corrección visual TipOverride.** El modal de usuario de Propinas deja el Avatar fuera de la cabecera de 36 px y alinea el body con el inset de Albaranes (`p-4`, sin fondo gris de segunda superficie). Footer y capa `base` sin cambio.
- **Corrección visual Propinas (página y bote).** En `/propinas` la cabecera deja de partirse en móvil, los `+` de bote ya no inflan las tarjetas y la tabla gana cuerpo legible sin rediseño. El modal de entrada de dinero usa cabecera y footer oficiales; `CashDenominationForm` en `tipPool` aporta solo el desglose. Caja (`variant` por defecto) no cambia de cromo.
- **Oleada parcial Horarios / Labor / Historial.** El detalle de día de coste laboral, el detalle de semana de horas extras, el selector de mes del historial y `DaySummaryModal` (con crear fichaje `derived`) adoptan `Modal`. Los footers de exportación de historial usan `Button`. Quedan fuera `StaffScheduleModal`, `ScheduleDayEditor`, `AttendanceDetailModal`, el overlay de `WeekCard` y `QuickCalculatorModal` (residual). Sin cambio de contrato Modal/Button ni ADR.
- **Button: fondo compacto 28 px y radio propio.** El área táctil sigue en 48 px, transparente. El fondo visual compacto pasa a 28 px (12 px de tipo + `espacio.2` arriba y abajo). El radio contractual es 8 px (`espacio.2`), menor que la mitad del alto visual, para no producir píldora. `radio.superficie` (16 px) permanece en Modal. Icon-only sigue en 48×48.
- **Button: fondo compacto 36 px, no cápsula.** El área táctil sigue en 48 px. El fondo visual compacto pasa a 36 px (12 px de tipo + `espacio.3` arriba y abajo), por encima del doble de `radio.superficie`, para que 16 px produzca esquinas y no píldora. Icon-only sigue en 48×48.
- **Button: radio de superficie, no píldora.** El contrato usa `radio.superficie` (16 px), el mismo que Modal. Los footers de Modal migrados quedan en texto, sin `icon`. La prop `icon` y el icon-only siguen fuera de ese pie.
- **Oleada Ingredientes/Recetas (Fase B parcial): mapeo TPV.** El escandallo de `MappingClient` adopta `Modal` `standard`/`base`. Quedan fuera Staff detail de la lista de recetas, `ImageLightbox`, `window.confirm` y los popovers de receta/departamento.

## 2026-08-18

- **Oleada Staff/Admin (parcial) de Design System.** Los 8 atajos cuadrados adoptan `DashboardShortcut`. La confirmación de fichaje, la compra multiorigen Staff/Admin, el selector de fecha de ventas y el detalle de semana de horas extras adoptan `Modal`. El historial de trabajador se apila como `derived` sobre ese detalle. Quedan fuera la cadena Info/Manuales (bloqueo ADR-0007), `StaffScheduleModal`, `AttendanceDetailModal`, la tarjeta Horarios y el vídeo de fichaje.

## 2026-08-17

- **Modal: inset único de cabecera y subtítulo en la misma fila.** El título empieza siempre a 16 px (`espacio.4`, ref. Albaranes). Se retira el hueco simétrico de 36 px a la izquierda. Título y subtítulo van en una sola fila; el subtítulo deja la negrita pesada. La cabecera no crece de 36 px.
- **Button: fondo visual ajustado al contenido.** El área táctil sigue en 48 px. El relleno horizontal pasa a `espacio.2`. `hug` usa `fit-content`. Icon-only conserva 48×48 visual. Sin variante nueva.
- **Oleada 6 de Modal/Button: Consumo personal.** El fichaje de consumo y el orden de productos adoptan `ConsumptionBottomSheet`; el detalle de día usa `Modal` `standard`/`base`. La ración Entero/Medio queda inline en el sheet. CTAs de pie y error usan `Button`. `StaffSelectionModal` y `TimeFilterModal` siguen residuales compartidos.
- **Oleada 5 de Modal/Button: Pedidos / Proveedores.** Resumen, selector de proveedor, zoom de producto, éxito de pedido (con confirmación de envío derivada) y ficha/alta/edición de proveedor adoptan `Modal` con variante/capa/instancia. CTAs de tramitar, continuar, éxito y CRUD de proveedor usan `Button`. `QuickCalculatorModal` sigue residual compartido. El popup de categoría y el `window.confirm` de Pedido Nuevo no se tocan.
- **Oleada 4 de Modal/Button: Propinas.** Shell de bote, ajuste/sanción, confirmación de reparto y modales staff adoptan `Modal` con variante/capa/instancia; CTAs de confirmación y footers usan `Button`. `QuickCalculatorModal` y `DenominationZoomModal` siguen residuales compartidos (como en Caja). `TimeFilterModal`, `StaffSelectionModal` y `CashDenominationForm` no se tocan.

## 2026-08-16

- **Oleada 3 de Modal/Button: Perfil y documentos RRHH.** Los modales de datos personales, bancarios, contacto, menú documentos, nóminas, contrato, comunicados y PDF de empresa adoptan variante/capa/instancia y pierden overrides de radio y ancho. Cambio de contraseña y confirmación de logout pasan al `Modal` oficial con Button en footer. Condiciones laborales adoptan Button en Cancelar/Guardar/Eliminar. Fuera de oleada: `AvatarCropModal` y `StaffSelectionModal`. Se eliminan tres huérfanos sin consumidores.
- **Modal: separación contractual Header → Body.** El Body del Modal lleva `padding-top` de 12 px (`espacio.3`, ref. detalle Albaranes). No es inset completo; el consumidor no puede eliminarlo. Los wrappers con `p-4`/`p-3` quedan con aire acumulado hasta una limpieza posterior.
- **Modal: cabecera 36px y radio bloqueado.** `estructura.cabecera-modal` pasa de 72 a 36 px (norma global). El radio del panel queda fijado a `radio.superficie` (16 px); `className` no puede sobrescribirlo. Chrome de cabecera se adapta al alto sin crecer la barra. Backdrop/capas/nesting sin cambio de decisión.
- **Button: hug por defecto, táctil 48.** El ancho por defecto es hug-content con padding `espacio.3`; la altura mínima sigue en `tactil.minimo` (48 px). Se retiran `layout="fill"` de footers piloto salvo jerarquía explícita en canje single-box y avance de cierre de caja. Sin variantes nuevas.
- **Nace el contrato oficial de Button.** Variantes cerradas `primary` / `secondary` / `tertiary` / `destructive`, layout `hug`/`fill`, táctil 48 px y radio de control. El aspecto lo bloquea CSS por identidad; `ActionButton` se retira. Piloto: footers de Modal en Albaranes y Caja/Tesorería. No se migran dashboards, Navbar ni chrome de Modal.
- **Oleada 2 de Modal: Caja/Tesorería adopta el contrato oficial.** Cierre, cambio, arqueo, operaciones de caja, detalle de movimiento, libro mayor y edición de caja usan `Modal` con variante/capa/instancia; no se ensancha `max-w-2xl` a `work`. `QuickCalculatorModal` y `DenominationZoomModal` siguen legacy porque el nesting se queda en `base → derived`. No se tocan overlays de Staff/Admin ajenos a caja.
- **La gobernanza del Design System se engancha a la cadena de agentes que ya existía.** `AGENTS.md` y las reglas Cursor apuntan al inventario; la carga de contexto distingue pantalla y overlay; `modals.mdc` deja de legislar valores. Se paga la deuda de reglas de agente que legislaban sin citar el corpus. Modal, Studio y consumidores no cambian de producto.
- **Se alinea el catálogo vivo de Modal con ADR-0008.** PATRONES P2 declara `work`/`day` = `max-w-5xl`. El spike de contrato deja de citarse como fuente; sigue en investigación.

## 2026-08-15

- **Migración de Albaranes al contrato oficial de Modal.** Detalle, Evidence, LineEdit, LineMapping, proveedor, wizard, filtro y visor de imagen usan `Modal` con variantes/capas/instancias oficiales; se eliminan portales y z-index ad hoc del flujo. El carousel multi-hoja conserva `overflow-x` gestual documentado como tensión residual (no es scroll de tabla).
- **Ampliación visual del contrato Modal.** Cabecera fija 72px, anchos `work`/`day` = `max-w-5xl`, max-height 68dvh (ref. Albaranes), centrado viewport, cero scroll horizontal en shell, backdrop base `blur(8px) saturate(65%)` + `rgba(0,0,0,0.32)` y capas elevadas solo oscurecen ([ADR-0008](../4-decisiones/ADR-0008-modal-backdrop-capas.md)). Sin migrar consumidores.
- **Contrato oficial de Modal del Design System.** Se evoluciona `ui/modal.tsx` con variantes tipadas (`compact`/`standard`/`work`/`day`/`amplify`), slot Footer fijo, capas semánticas, identidad `data-*` y excepción `ConsumptionBottomSheet`. Nesting limitado a una superficie derivada ([ADR-0007](../4-decisiones/ADR-0007-modal-superficie-derivada.md)). Consumidores (Albaranes, etc.) aún no migrados.
- **Nace el piloto de Design System de pantalla.** Tokens mínimos adoptados en CSS/Tailwind y primer componente oficial `DashboardShortcut`, usado por la rejilla Master. Staff/Admin aún no migrados. Studio sin capas nuevas; el componente emite identidad estable (`data-component` / `data-variant` / `data-instance`) para lectura futura.

## 2026-08-13

- **Evidence en albaranes filtra candidatas OCR por línea.** Sin provenance, el modal solo lista filas del documento razonablemente similares a la línea seleccionada (reutiliza `nameSimilarity` del matcher con umbral de UI `0.4`); con provenance, solo la fila vinculada. Ya no se vuelcan AGUA/APEROL al abrir FRANKFURT.
- **Líneas de albarán en móvil van en una sola fila horizontal.** En smartphone se oculta el nombre OCR del proveedor y se mantienen visibles cantidad, precio e importe alineados; el escritorio conserva la composición previa.
- **Evidence en albaranes permite revisión manual de provenance.** Si una línea no tiene vínculo documental, el modal carga el OCR existente y deja confirmar la fila OCR sin tocar el mapeo de producto ni los valores operativos.

## 2026-08-10

- **Se integra la IA Diseñadora (Copiloto Creativo) en la arquitectura de Marbella Design Studio.** Convivencia entre diseño manual y asistido por IA para todas las superficies (modales, formularios, tablas, KPIs, dashboards, etc.) con selección inicial "¿Cómo quieres empezar?", generación múltiple de variantes editables y panel de chat conversacional para refinamiento continuo sin destruir variantes previas.
- **Nace Design Academy en Marbella Design Studio.** Un espacio interactivo exclusivo de aprendizaje e inspiración de patrones de producto líderes (Linear, Stripe, Vercel, Apple, Notion), con experimentación en tiempo real de densidad/contraste, estudio comparativo de decisiones de diseño y botón de translación de filosofía a Marbella OS.

---

## 2026-08-08

- **Marbella Studio se convierte en un editor visual interactivo estilo Figma/Framer/Penpot.** Se elimina la edición de JSON/JSX para ofrecer interacción directa sobre el lienzo con selección de componentes, insignias de tipo, barra flotante de acciones rápidas (mover, duplicar, eliminar), panel izquierdo de capas e inserción, y panel derecho de inspector visual de propiedades no-code.

---

## 2026-07-30

- **Las reglas de CANON que una máquina puede comprobar las comprueba una máquina.** `npm run validate:corpus` verifica catorce invariantes del corpus y falla el cambio que los rompa: se ejecuta en el hook local, que se activa una vez por clon con `npm run hooks:install`, y en integración continua. En `main`, un documento vivo que supere su caducidad **bloquea**; en una rama solo avisa, para no frenar un cambio por un documento ajeno.
- **Se declara qué parte del repositorio es conocimiento.** [`INDEXACION.md`](../../INDEXACION.md) clasifica todo directorio con markdown como corpus, derivado, satélite o ruido. Existía un motivo medido: de los 1.395 ficheros markdown del repositorio, 1.325 son copias de skills de terceros que instalan treinta herramientas de agente. Un directorio nuevo sin clasificar falla la validación.
- **Un hecho se puede citar sin copiarlo.** [ADR-0003](../4-decisiones/ADR-0003-identidad-de-afirmacion.md) formaliza los identificadores estables de afirmación, generalizando la notación que `ADR-0001` ya usaba para sus treinta y cinco invariantes de dominio. El registro está en `.generated/AFIRMACIONES.md`, y el más citado del corpus resulta ser `INV-D01`, el determinismo de la proyección, con diez citas.
- **Un documento puede declarar en qué se apoya.** [ADR-0004](../4-decisiones/ADR-0004-grafo-de-dependencias.md) añade el campo opcional `depende_de` y publica el grafo invertido en `.generated/GRAFO.md`, que responde a la pregunta que surge al cambiar algo: qué hay que revisar. La subordinación de `contratos/PROYECCION-v1` a `ADR-0001`, que solo estaba escrita en prosa, pasa a ser comprobable.
- **Se detecta la norma que vive fuera del corpus.** La validación avisa cuando una regla de herramienta de agente no cita ningún documento de Marbella OS, y cuando un documento lleva más de noventa días sin salir de `propuesto`. La primera ejecución encontró dos reglas que fijan comportamiento obligatorio de modales y de documentos imprimibles sin que eso esté escrito en ninguna parte del corpus: queda registrado en [DEUDA](DEUDA.md) como `D27`.
- **La regla del dueño único deja de ser invisible.** `npm run report:overlap` compara el vocabulario de los párrafos de documentos normativos y lista los que más se parecen. No bloquea nada: parecerse no es afirmar lo mismo. Su primera ejecución encontró que la tabla de decisiones vivía duplicada en dos índices, y se ha resuelto dejándola en uno solo.

---

## 2026-07-29

- **La rejilla de asistencia de plantilla pasa a lectura tipográfica.** En `/staff/history`, cuando el responsable ve los fichajes de todo el equipo, cada registro se lee como iniciales en negro seguidas del tramo horario: sin círculos de color, sin tarjetas con marco ni relleno para los tipos especiales, y con la hora sin minutos ni cero inicial (`08:30` se lee `8`). El tipo se comunica solo con color y palabra: entrada en verde y salida en roja para lo regular, todo en rojo si falta el registro, y **Festivo**, **Enfermo**, **Baja** o **Personal** escritos completos en lugar de las letras `F`, `E`, `B` y `P`.
- **Se crea Marbella OS**, el corpus documental oficial, en `marbella-os/`. Sustituye a la documentación dispersa de `docs/` y `context/` y establece la fuente única de verdad para producto, diseño e implementación. Su constitución está en [CANON](../CANON.md).
- **Se congela el historial anterior.** Las 1.288 líneas de `PROJECT_STATUS.md` se archivan como corpus histórico no normativo. Desde esta fecha, el historial se escribe aquí y el estado en [ESTADO](ESTADO.md).
- **Se promueve la decisión del dominio de horas a [ADR-0001](../4-decisiones/ADR-0001-hours-engine-productor-unico.md)**, con numeración global y separando explícitamente la inmutabilidad de su texto de la vigencia de su decisión.
- **Se declaran como norma de producto las reglas que vivían únicamente en la configuración de las herramientas de desarrollo**: mínimo táctil, indeformabilidad de las zonas de acción, inmunidad de zona horaria, prohibición de fallos silenciosos y regla del valor vacío. Ahora están en [PRINCIPIOS](../1-producto/PRINCIPIOS.md), [EXPERIENCIA](../2-diseno/EXPERIENCIA.md) y [CONTENIDO-Y-TONO](../2-diseno/CONTENIDO-Y-TONO.md).
- **Se publica el contrato de tokens visuales** en [TOKENS](../2-diseno/TOKENS.md), normalizando los valores que el producto ya usa. Es el paso previo indispensable para tener componentes base.
- **Se registra la deuda del producto con dueño y disparador** en [DEUDA](DEUDA.md), extraída de informes de auditoría que nadie mantenía. De los cinco hallazgos «críticos» del informe de mapeo con la realidad, cuatro ya no existían en el código: quedan documentados como prueba de que un informe con fecha no es norma.
- **El código de integración deja de ser documentación.** El extractor del punto de venta, la pasarela y los tres scripts de correo estaban versionados como archivos de texto dentro de `context/`. Ahora son código en [`integrations/`](../../integrations/README.md), con su documentación en [3-ingenieria/integraciones](../3-ingenieria/integraciones/README.md).
- **Se corrige el estado del [contrato de proyección](../3-ingenieria/contratos/PROYECCION-v1.md)**, que seguía marcado como propuesto cuando su escritor llevaba dos días siendo el único productor en producción. Es el motivo de que el front-matter con estado y fecha de revisión sea obligatorio.
- **Se desconecta la maquinaria del documento de estado antiguo**: el gancho de Cursor, el gancho de confirmación y el guion que copiaba el historial a un documento de contexto para modelos. Ese mecanismo duplicaba cientos de líneas por diseño. La regla de las herramientas de IA ahora **deriva** de Marbella OS y no puede introducir norma propia.
- **Se sanea el repositorio.** Se expulsan diecinueve guiones de depuración desechables, seis artefactos generados, dos activos sueltos, el material de referencia del sistema ajeno —a [`reference/legacy-bdp/`](../../reference/legacy-bdp/README.md)— y **1.100 archivos de documentación de terceros duplicada** en veintinueve carpetas, una por herramienta de IA. La copia canónica es `.agents/skills`, declarada en el manifiesto de instalación.
- **Se completa la capa de ingeniería** con [ARQUITECTURA](../3-ingenieria/ARQUITECTURA.md), [MODELO-DE-DATOS](../3-ingenieria/MODELO-DE-DATOS.md), [SEGURIDAD](../3-ingenieria/SEGURIDAD.md) y [CALIDAD](../3-ingenieria/CALIDAD.md), verificados contra el código y las 290 migraciones. Con ellos, Marbella OS cubre las seis capas y deja de ser solo documentación de producto y diseño.
- **Se eliminan dos puntos de acceso de depuración sin autenticar**, `api/test-db` y `api/test-db2`, alcanzables en producción porque las rutas de máquina no pasan por el guardián. El segundo usaba la clave de servicio, que ignora todas las políticas de acceso.
- **Se descubren cuatro agujeros de acceso abiertos**, registrados como [D23](DEUDA.md#d23--las-tareas-programadas-fallan-abiertas) a [D26](DEUDA.md#d26--contenedor-de-fotos-de-caja-público): tres tablas con escritura anónima desde abril, cinco funciones que exponen la facturación sin sesión, el contenedor de fotos de recuentos de caja marcado como público, y las tareas programadas que solo comprueban su secreto si la variable existe. Ninguno lo detectó nada automático; aparecieron leyendo migraciones, que es exactamente el argumento de [CALIDAD](../3-ingenieria/CALIDAD.md).
- **Se corrige [D11](DEUDA.md#d11--una-tabla-con-políticas-que-leen-el-rol-del-identificador-de-sesión) a la baja.** No son cinco tablas dependientes del identificador de sesión, es una, y existe un disparador que sincroniza el rol: el fallo real es un desfase hasta que la sesión se renueva, no un bloqueo total. Se registró con más gravedad de la que tenía y se rebaja tras verificarlo.
- **Se descubre que los tipos de la base de datos no se usan.** Hay dos definiciones del esquema en el repositorio y ninguna se importa en ningún fichero: todo el acceso a datos es sin comprobación de tipos. Registrado como [D19](DEUDA.md#d19--los-tipos-de-la-base-de-datos-no-se-usan). Se elimina además un `types_db.ts` vacío en la raíz.
- **Se fija la autoridad de las condiciones laborales.** Las tablas con vigencia temporal mandan sobre las columnas equivalentes del perfil, porque leerlas del perfil para calcular una semana pasada devuelve un resultado plausible y equivocado. Registrado como [D20](DEUDA.md#d20--condiciones-laborales-duplicadas-entre-el-perfil-y-las-tablas-con-vigencia).

---

## Antes de 2026-07-29

El historial anterior a esta fecha está congelado en [6-investigacion/archivo/2026-07-29-project-status-historico.md](../6-investigacion/archivo/2026-07-29-project-status-historico.md).

**Es material histórico y no es normativo.** Contiene 628 entradas entre marzo de 2026 y julio de 2026, con detalle de implementación, decisiones ya superadas y afirmaciones que el código ha invalidado. Se consulta para entender por qué algo es como es, nunca para saber cómo debe ser.
