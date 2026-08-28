---
documento: PATRONES
clase: vivo
estado: vigente
capa: diseno
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-08-26
caducidad: 6 meses
supersede: docs/PLAN_ASISTENCIA_UNIFICADA.md
---

# PATRONES — Composiciones recurrentes

Un patrón es una composición por encima del componente: resuelve un problema que se repite en varias pantallas y fija cómo se resuelve, para que la misma tarea se haga siempre igual.

Los componentes que los materializan están en [SISTEMA-DE-COMPONENTES](SISTEMA-DE-COMPONENTES.md). Los valores, en [TOKENS](TOKENS.md). Las leyes que todos deben cumplir, en [EXPERIENCIA](EXPERIENCIA.md).

**Regla transversal de todos los patrones: una tarea, una estética.** Cambiar de filtro, de modo o de nivel de detalle dentro de la misma tarea no cambia el aspecto. La persona debe percibir que sigue en el mismo sitio. Esta regla se fijó al unificar la vista de asistencia y se generaliza aquí.

---

## P1 · Rejilla de tarjetas

La composición por defecto de cualquier pantalla de resumen.

**Anatomía**: bloques independientes sobre el envolvente, cada uno con una responsabilidad única, alineados en rejilla y reordenados a una columna en móvil.

**Reglas**:
- Cada tarjeta responde a **una** pregunta. Dos preguntas son dos tarjetas.
- La cifra protagonista domina la tarjeta; la etiqueta es secundaria.
- Una tarjeta pulsable lo declara visualmente y lleva a la vista de detalle de su dato.
- El orden de las tarjetas refleja la frecuencia de consulta, no la afinidad temática.

**Cuándo no**: cuando la tarea es comparar muchas filas. Entonces es P5.

---

## P2 · Modal

El patrón más usado del producto. Sus leyes están en [EXPERIENCIA §8](EXPERIENCIA.md#8-modales); aquí sus variantes.

**Anatomía**: capa de oscurecimiento, panel con cabecera fija, cuerpo desplazable y pie fijo con las acciones.

**Variantes** (API tipada del contrato):
- **`compact`** — confirmaciones y formularios cortos (`max-w-sm`). Default histórico.
- **`standard`** — formularios estándar (`max-w-md`).
- **`work`** — trabajo real en panel ancho (`max-w-6xl` / 1152px, alto útil preferente). Valor alineado a [ADR-0008](../4-decisiones/ADR-0008-modal-backdrop-capas.md).
- **`day`** — trabajo sobre una fecha concreta (`max-w-6xl` / 1152px; ver P4).
- **`amplify`** — imagen o dato ampliado (`max-w-2xl`).

**Reglas**:
- La cabecera dice de qué es el modal, no qué debe hacer la persona. Altura fija (`estructura.cabecera-modal`); inset horizontal único (`estructura.modal-cabecera-inset`); título y subtítulo en la misma fila, centrados por el trazo; iconos sin marco/fondo por defecto. Radio único del panel (`radio.superficie`). Separación Header → Body fija (`espacio.3`).
- El pie de acciones no se desplaza y no se encoge nunca (slot `footer` del componente). No fuerza botones a ancho completo.
- Un modal no abre otro modal de tarea. Solo se admite **una superficie derivada** auxiliar ([ADR-0007](../4-decisiones/ADR-0007-modal-superficie-derivada.md)); el backdrop no acumula blur ([ADR-0008](../4-decisiones/ADR-0008-modal-backdrop-capas.md)); el panel cubierto se subordina visualmente ([ADR-0009](../4-decisiones/ADR-0009-modal-subordinacion.md)).
- La navegación padre→hijo no es nesting de capas ni z-index (`AF-MODAL-NAV-NO-ES-LAYER`). Contrato en [Modal](SISTEMA-DE-COMPONENTES.md#modal).
- Al abrirse, las barras fijas de la aplicación se atenúan y dejan de responder al toque.
- Sin scroll horizontal. Centrado respecto al viewport visible.
- Un menú de accesos a otras páginas o submodales no es una lista. Es la misma rejilla de icono + nombre que el catálogo (Info, Documentos, Manuales, Caja, Stock). Mínimo 3 columnas; más solo si el consumidor lo pide.
- El componente que materializa este patrón es el [Modal de sistema](SISTEMA-DE-COMPONENTES.md#modal). Las leyes de interacción, incluido el viewport estrecho, están en [EXPERIENCIA §8](EXPERIENCIA.md#8-modales).

---

## P3 · Calendario mensual

Patrón de navegación temporal para todo lo que se organiza por fechas: horarios, actividades, cierres, reservas, consumo, coste, asistencia.

**Anatomía**: cabecera con mes y navegación, rejilla continua de siete columnas, cabecera de días idéntica, celdas de día con indicadores compactos, y una franja de indicadores del mes cuando el dominio lo pide.

**Reglas**:
- **Semana vacía: el tamaño de Cierres.** La celda mide 68 / 76 / 84 px. Si el contenido de esa semana no cabe, la fila crece. En móvil el mes se desplaza.
- En móvil se navega también por gesto lateral, con la navegación visible además del gesto.
- El día se construye en tiempo local del negocio. Un desplazamiento de zona horaria en este patrón produce un error de un día completo en toda la vista.
- Pulsar un día abre P4.
- **Un solo cromo.** Labor, Reservas, Horario, Actividades, Consumo, Cierres y Asistencia muestran el mismo tipo de calendario. Cambia el contenido de la celda, no la rejilla. El cromo (franja, tarjeta, cabecera de días) es el de Cierres. Asistencia de una persona añade un pie semanal (P6). Horas extras no es P3: es mini-calendario de días + filas de semana. En el mosaico Admin cada fila es Semana n e importe; las fechas las dice el mini-calendario, no un rango escrito. El selector de un día (ventas, filtro de periodo, editor de horario) es MiniMonthCalendar, no P3.

---

## P4 · Modal de día

El detalle y la edición de una fecha concreta, dentro del calendario o de la vista semanal.

**Anatomía**: cabecera con la fecha y navegación al día anterior y siguiente; cuerpo con las filas del día; pie con las acciones.

**Reglas**:
- Las filas de hora reparten el alto disponible en partes iguales; no se desplazan si caben.
- La navegación entre días no cierra el modal.
- Sale con dos anchos: amplio para trabajo con tabla, estrecho para consulta puntual.
- Al editar, el modal no cambia de estética respecto a la consulta.

---

## P5 · Tabla densa

Para revisar y comparar: registros, albaranes, precios, movimientos, líneas de un documento.

**Anatomía**: cabecera fija, filas de altura uniforme, columnas de ancho estable, y acciones por fila al final.

**Reglas**:
- **Las cifras alinean a la derecha con dígitos tabulares.** Comparar es el motivo de existir de este patrón.
- La cabecera permanece visible al desplazar.
- El ancho de columna no se recalcula al filtrar: la tabla no debe «bailar».
- Una celda que no cabe reduce su texto antes que truncarlo, y **nunca corta una cifra**.
- En móvil, la tabla se convierte en lista de fichas; no se desplaza horizontalmente.
- La acción destructiva de una fila no es adyacente a la acción de apertura.

---

## P6 · Tarjeta semanal

El patrón propio del dominio de horas: una semana de negocio como unidad, **dentro del cromo P3**.

**Anatomía**: el marco de Cierres (`MonthCalendarFrame`: cabecera de días y rejilla de siete columnas). Cada semana de una persona añade un pie de resumen: horas, pendientes, extras e importe. La vista de plantilla omite el pie.

**Reglas**:
- La cabecera de días es la de P3, una sola vez por calendario. No se pinta otra LUN–DOM en cada semana.
- **La semana de una persona es una.** Asistencia de un trabajador, el mosaico Staff y el historial al pulsar un trabajador en horas extras pintan la misma pieza: cromo P3, celdas de día y pie Horas / Pendientes / Extras / Importe.
- En el mosaico Staff la semana flota sobre el petróleo, al ancho del hueco, sin cabecera de bloque.
- **La vista de plantilla (todos los trabajadores) comparte el cromo y no el pie.** Iniciales y fichajes por día. No se unifica el contenido de celda con el de una persona.
- Las celdas miden lo mismo que P3 en una semana vacía (68 / 76 / 84 px) y crecen si el contenido no cabe.
- El pie de resumen mantiene su altura aunque no tenga contenido, para no romper el ritmo vertical.
- Los controles de decisión de la semana (modo bolsa o pago, contrato, aplicar) viven en el pie, no en un modo aparte.

---

## P7 · Filtro temporal

Toda vista con dimensión temporal usa el mismo control, en el mismo sitio y con el mismo comportamiento.

**Reglas**:
- El control es uno: flechas y periodo visible **en la cabecera** de PageScreen, cuando la pantalla navega fechas.
- El periodo activo se ve siempre, sin abrir nada.
- A la derecha de la cabecera hay **siempre el mismo** icono de filtro. Abre el selector. No se convierte en una cruz al cambiar de fecha.
- Las flechas cambian al periodo anterior y siguiente.
- Pulsar el periodo también puede abrir el selector.
- Las acciones de alcance (trabajador, exportar) conviven con el filtro en `rightSlot`.
- El periodo se conserva al navegar a un detalle y volver.
- Cambiar de periodo no reinicia los demás filtros.

Una sola pieza: `PeriodNav` en `periodSlot`. El icono de filtro es `PeriodFilterButton`. El selector es `TimeFilterModal` cuando la vista admite más de un tipo de periodo.

---

## P8 · Navegación inferior

La navegación principal en la aplicación instalada.

**Reglas**:
- Cinco destinos como máximo. El sexto obliga a repensar la información, no a añadir un botón.
- Los destinos dependen del rol y cada rol tiene su conjunto propio.
- Ocupa el alto reservado más el área segura inferior, y **nunca se encoge**.
- El destino activo se distingue por color y peso, no solo por color.
- Se atenúa y deja de responder cuando hay un modal abierto.

---

## P9 · Captura y revisión

Patrón para todo lo que entra al sistema desde un documento externo interpretado automáticamente: albaranes, resúmenes de nóminas, programación del pabellón.

**Anatomía**: captura → interpretación → propuesta editable → confirmación → resultado trazable.

**Reglas**:
- **Ninguna interpretación automática se aplica sin revisión humana.** Es una regla de producto, no una limitación técnica.
- Lo ya conocido llega resuelto; la persona corrige solo lo nuevo.
- Lo que se corrige una vez se recuerda: la corrección se convierte en conocimiento.
- La confirmación dice **qué** va a cambiar antes de cambiarlo.
- Aplicar dos veces el mismo documento no duplica su efecto.

---

## P10 · Barra de cantidad

Para añadir y quitar unidades: pedidos, encargos, inventario, consumo.

**Reglas**:
- Los controles de menos y más tienen tamaño de dedo y **nunca colapsan**, aunque la lista crezca.
- Cero es un valor válido y visible; el control no desaparece al llegar a cero.
- La cantidad se puede teclear además de pulsar.
- La lista deja hueco suficiente al final para que el último elemento se vea completo con su barra por encima de las barras fijas.

---

## P11 · Panel en vivo

Para datos que cambian sin que la persona actúe: sala y cocina.

**Reglas**:
- Se actualiza solo. Si hay botón de recargar, es un respaldo, no el mecanismo.
- **Declara cuándo se actualizó por última vez.** Un panel en vivo detenido que no lo dice está mintiendo.
- Un elemento nuevo entra sin desplazar lo que la persona está mirando.
- El tiempo transcurrido se codifica por color con umbrales definidos, acompañado siempre del valor.

---

## P12 · Detalle de dato

Cuando se pulsa una cifra, se llega a lo que la compone.

**Reglas**:
- Toda cifra agregada de dinero u horas es navegable hasta sus componentes.
- El detalle muestra los hechos de origen, no un recálculo.
- El camino de vuelta conserva el periodo y los filtros de origen.

Este patrón es la manifestación visual del principio de un único productor: si una cifra no se puede descomponer, no se puede auditar.

---

## P13 · Pantalla de gestión

La composición por defecto de listado, detalle y formulario de gestión. No es el mosaico de atajos (T1) ni un Modal.

**Anatomía**: cabecera petróleo, superficie de trabajo (`Surface` `page`), cuerpo, pie opcional. Materialización: `PageScreen`. Lo decide [ADR-0010](../4-decisiones/ADR-0010-jerarquia-visual-canonica.md).

**Reglas**:
- Una pantalla nueva de gestión usa esta composición. No se clona una cabecera petróleo.
- El periodo (P7) vive **en la cabecera** (`periodSlot`). El icono de filtro es siempre el mismo, a la derecha. Las acciones de alcance (trabajador, exportar) también van en `rightSlot`.
- El cuerpo empieza pegado al contenido: no se deja un hueco vacío entre la cabecera y la tabla o el calendario.
- `Button` en la cabecera se pinta invertido, sin relleno ni marco. No es una quinta variante de Button.
- Labor, Reservas, Horario, Actividades, Consumo, Cierres y Asistencia montan el calendario mensual (P3) **dentro** de esta plantilla; no sustituyen la cabecera. La rejilla es una. Asistencia añade el pie semanal (P6). Horas extras también entra por PageScreen, pero su interior es vista semanal (mini-calendario + filas), no P3.
- Recetas e Ingredientes montan la rejilla de catálogo a **3 columnas**; Proveedores (página y el modal de Pedido) a **4**. Cada celda es un cuadrado (imagen + pie), sin tarjeta, con aire entre celdas. La imagen se reduce al mismo tamaño; el pie es una sola fila. El disparador **CAT** / **PROV** flota sobre el fondo, sin mini-card y sin punto.

**Cuándo no**: mosaico Admin/Staff (T1), Sala LIVE, pantalla de cocina, carta de cliente, overlay (P2).

---

## P14 · Recuento monetario

Contar billetes y monedas: propinas, entradas y salidas, arqueo, cierre, cambio entre cajas, compra, desglose de un movimiento.

**Anatomía**: Modal, rejilla de denominaciones, total en el pie, **Cancelar** y **Guardar**. Fecha en la cabecera cuando el recuento tiene fecha.

**Reglas**:
- Toda pantalla que cuente efectivo usa esta composición. No se inventa otra rejilla ni otro pie.
- El total vive **abajo**, a la izquierda del pie. Cancelar y Guardar a la derecha. No hay pastilla a todo el ancho.
- La caja `- valor +` es más estrecha que la columna, para que las columnas respiren. El número de dígitos visibles no cambia.
- La fecha, si hace falta, va en la cabecera, no en el cuerpo.
- Un botón propio de la función (Atrás, Ver resumen, Siguiente, Esperado) cabe en el pie; no sustituye el esqueleto.

**Cuándo no**: inventario de caja en solo lectura, zoom de una denominación, calculadora.

---

## Cómo se añade un patrón

Un patrón entra aquí cuando la misma composición aparece en tres pantallas o cuando resolverla mal en una rompe un [recorrido crítico](../1-producto/RECORRIDOS.md). Antes de eso es una pantalla, no un patrón.

Un patrón se retira cuando deja de usarse en todas las pantallas y su retirada se anota en [CHANGELOG](../5-estado/CHANGELOG.md).
