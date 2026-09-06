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

## 2026-09-06

- **Perfil: «Datos personales» se ve en modo lectura.** El modal deja de abrir el formulario de edición para quien tiene permiso: todos lo ven como ficha de solo lectura, también el manager `hhector7722@gmail.com` al entrar. Solo él tiene el botón de edición en la zona derecha de la cabecera, que cambia al modo edición con Cancelar y Guardar en el pie.
- **Perfil: la ficha personal se rediseña como ficha física.** Cabecera petróleo con foto, nombre y referencia del documento; secciones Identificación, Contacto, Domicilio y Documento a dos columnas con separadores finos. El contenido se compacta para reducir el scroll. [TOKENS](../2-diseno/TOKENS.md), [SISTEMA-DE-COMPONENTES](../2-diseno/SISTEMA-DE-COMPONENTES.md).
- **Master: H. extras pasa a llamarse «H extras» y el mes respira.** La etiqueta del atajo del mosaico se escribe sin punto («H extras»), y el nombre del mes baja del borde del hueco con un margen de 4 px para no pegarse al inicio del icono.
- **Master: el icono de H extras es un calendario completo del mes.** El hueco del mosaico muestra la fila de días (L M X J V S D) y los números del mes repartidos por semanas; a la derecha de cada semana, un indicador de abono (verde con tic = semana pagada, rojo con cruz = pendiente) y el importe de las horas extra. Son 9 columnas y 5–6 filas de semana según el mes, con tipografía muy reducida para caber en el hueco.

## 2026-09-05

- **Master: Cajas Cambio como dos en uno.** El widget del mosaico deja de ser una celda que abría un selector: ahora se divide en dos mini iconos, como Caja Inicial — Cambio 1 arriba y Cambio 2 abajo, cada uno con su importe sobre verde y abriendo directamente el arqueo de su caja. El modal intermedio de elección desaparece.
- **Plat Marbella: configurador visual de plato.** La ficha del menú deja de explicar el plato con el gráfico circular: ahora el cliente construye un plato de porcelana dividido en tres zonas (entrant arriba, principal y guarnició abajo) y cada elección aparece físicamente en su zona al seleccionarla. Indicador de progreso, paso automático entre tramos, resumen final con las tres elecciones y la posibilidad de editar cada una sin perder las demás. En el pedido por evento, completar el plato permite añadirlo al demanat como conjunto.
- **Perfil: «Datos personales» es una ficha de empleado.** El modal muestra nombre completo, NIF/NIE/Pasaporte, afiliación a la S.S., nacionalidad, fecha de nacimiento, domicilio, teléfono y correo, además de las imágenes del documento (delantera y trasera, cuando existen) tomadas de `/public/personal/`. Los campos nuevos viven en `profiles` y se introducen a mano. [GLOSARIO](../GLOSARIO.md), [DEUDA D29](DEUDA.md#d29--documentos-de-identidad-en-la-carpeta-pública).
- **Master: asistencia del día navegable.** El widget del mosaico ya no es la semana de plantilla, sino los fichajes de un día de todos los trabajadores. Ocupa una columna por dos filas (1×2) en la fila 2, columna 4, con la fecha en la franja roja («Miércoles 3 de septiembre», en una sola fila) y bajo ella el nombre, la entrada y la salida de cada uno. Si el día en curso no tiene fichajes arranca en el último día con registros; las flechas de la franja navegan entre días (sin pasar de hoy) y un marcador bajo la lista indica que se puede navegar. La franja abre el resumen de fichajes y un registro abre el detalle del trabajador. El horario sube una fila (filas 2–3, columnas 1–3) y Caja Inicial y H. extras bajan a la fila 4, columnas 3–4. El resumen semanal de `/staff/history` y el del mosaico Staff no cambian.

## 2026-09-04

- **Master: resumen de asistencia más limpio.** En el widget del mosaico, las horas de entrada y salida bajan un punto y se separan con «-» en lugar de «/»; desaparecen las líneas horizontales que separaban los registros de cada trabajador.
- **Horario: resumen del día en cuatro columnas.** El modal de día del widget de horario muestra el resumen del evento en cuatro columnas simétricas a lo ancho del modal —Evento, Horario, Pax y Categoria— con el valor encima de la etiqueta y ambos centrados. El resumen siempre aparece arriba; debajo va la tabla o «Sin turno».
- **Horario: solo el manager ve la tabla completa.** En el modal de día, únicamente el manager `hhector7722@gmail.com` ve la tabla con todos los trabajadores si hay al menos un turno publicado; el resto ve solo su propio turno y «Sin turno» si no tiene.
- **Horario: el modo edición repite el resumen de cuatro columnas.** El editor de día usa la misma fila Evento / Horario / Pax / Categoria con el valor encima de la etiqueta; el horario junta inicio y final en una celda (verde - rojo).
- **Horario: nota en una sola fila y centrada.** El pie del modal de día centra «Añadir nota»/«Editar nota» en todo el ancho. Una nota existente se muestra en una sola fila dentro de una card cuyo ancho se adapta al contenido, hasta el límite del ancho del modal sin cortarla.
- **Compra: confirmación y resumen en un solo paso.** El aviso «Albarán registrado correctamente» sale del paso del escáner y aparece con el resumen de la compra, justo encima del botón que la guarda. El escáner ya no parece el final del proceso.
- **Compra: pie del escáner con «Añadir hoja».** Tras fotografiar el albarán, las acciones viven solo en el pie: Atrás, Añadir hoja y Siguiente. Desaparece «Guardar»: «Siguiente» guarda el albarán y avanza al resumen en el mismo paso. [P14](../2-diseno/PATRONES.md#p14--recuento-monetario).
- **Compra: destino del cambio como cajas.** El destino del cambio se elige con las mismas cards que el desglose monetario, no con un desplegable.
- **Compra: cards del desglose a la altura del contenido.** Las cards de caja («inicial», «cambio 1»…) abrazan su contenido; el área de toque sigue midiendo 48 px ([SISTEMA-DE-COMPONENTES §Botón](../2-diseno/SISTEMA-DE-COMPONENTES.md#botón)).

## 2026-09-03

- **Horario: detalle del evento en tres columnas.** En el widget de horario de `/staff/dashboard` y `/master/dashboard`, la fila de la card de sáb/dom que muestra el horario del evento, los participantes y la categoría reparte el ancho de la card en tres columnas simétricas, con cada dato centrado en su columna.
- **Asistencia de plantilla: primer nombre en lugar de iniciales.** En `/staff/history` y en el widget de `/master/dashboard`, cuando el responsable ve los fichajes de todo el equipo, cada registro muestra el primer nombre del empleado en vez de las iniciales, a un tamaño menor y sin negrita para que el tramo horario siga siendo lo que manda. [PATRONES P6](../2-diseno/PATRONES.md#p6--tarjeta-semanal).
- **Navtab inferior: ya no se oculta sin gesto.** La barra de navegación desaparecía al entrar en las páginas de inicio sin scrollear: la restauración de scroll, los cambios de layout y los scrolls de contenedores internos se contaban como gesto del usuario. Ahora el cromo solo responde a un scroll continuo hacia abajo sobre la página; vuelve al subir o al llegar arriba. [P8](../2-diseno/PATRONES.md#p8--navegación-inferior).
- **Notificaciones: Pere sale y entra Fernando.** Los avisos de nueva reserva y de pedido cliente (campana y push) dejan de avisar a Pere y pasan a avisar a Fernando. Destinatarios: alba, hernan, fernando, hector.
- **Horarios: los accesos de Master y Admin navegan a `/horario`.** El atajo de `/master/dashboard` y el ítem del modal «Otros» de `/dashboard` ya no abren el `StaffScheduleModal` embebido; conducen a la página de calendario, como la navtab inferior. Se retira el `StaffScheduleModal` de los dashboards Master/Admin y de la barra inferior.

## 2026-09-02

- **Cierres: cards de resumen rediseñadas.** La card del mes añade la cabecera «Mensual» y compacta la rejilla con las etiquetas pegadas al valor. La card «Resumen de ayer» pasa a llamarse «Último cierre» y muestra el cierre más reciente realizado, sea de hoy, de ayer o de hace un mes; se separa la cabecera de las dos filas de métricas.
- **Pies de acción: botones del mismo ancho.** Los botones que conviven en el pie de un Modal (o en el pie P14 de caja) se igualan al ancho del mayor, sean 2 o más, sin JS. El grupo se encoge al contenido; no ocupa el pie entero. [SISTEMA-DE-COMPONENTES §Button](../2-diseno/SISTEMA-DE-COMPONENTES.md#botón), [P2](../2-diseno/PATRONES.md#p2--modal).
- **Cierres: agosto no cuenta en el rendimiento.** Venta neta, rendimiento y ventas del resumen del mes quedan siempre alineados en la misma fila, con la etiqueta pegada al valor. El rendimiento —tanto el del resumen como el de cada día— omite agosto (mes cerrado): la comparación salta al periodo anterior.
- **Cierres: resumen de ayer en tres filas.** La cabecera queda como estaba; las métricas pasan a dos filas (ventas, venta neta, tarjeta, efectivo / pendiente pago, cobros pendientes, diferencia), distribuidas homogéneamente a lo ancho de su fila y con separación entre cabecera y primera fila de métricas.
- **Cabecera de Modal work: tinta oscura.** Los iconos y fechas de cabecera dejan el `text-white` de la era petróleo; heredan o usan zinc sobre superficie. Defensa CSS igual que en Surface. Los menús `scheme="dark"` no cambian.
- **TabBar reactiva al papel claro.** Por defecto usa el cristal de los widgets del mosaico. Si debajo hay superficie clara (`data-over="light"`), pasa al cristal del envolvente para que iconos y etiquetas se lean. [P8](../2-diseno/PATRONES.md#p8--navegación-inferior).
- **Staff propinas: cards como sáb/dom del horario.** En `/staff/propinas` dejan el blanco; usan el relleno secundario del mosaico y tinta acorde. El modal de detalle no cambia.
- **Horario: el modal de día deja el petróleo.** Cabecera de superficie, chrome en zinc y tabla sin `#36606F`; misma pieza en `/horario` y el mosaico Staff.
- **Staff: «Añadir nota» solo en el modal de día.** Sale del widget de horario; aparece en el pie de `PavilionDayModal` y abre el horario de ese día.
- **Staff: sáb/dom del widget abren el modal de día de Horario.** Misma pieza y estética que Actividades en `/horario` (`PavilionDayModal`). El valor de Evento usa el mismo tamaño de tipo que la etiqueta.
- **Cierres: resumen en dos cards, sin gráfica.** Sale la evolución diaria. Quedan el resumen del mes filtrado y el de ayer (clima, tickets, ticket medio y desglose de cobros), al ancho del calendario.
- **Agosto no genera deuda de asistencia.** En semanas staff cuyo lunes cae en agosto, el balance semanal no baja de cero (vacaciones), incluida la última semana que desborda a septiembre. Las extras por encima del contrato siguen contando. Regla en [dominio/HORAS](../3-ingenieria/dominio/HORAS.md).
- **Staff: Evento del widget de horario sale de `/horario`.** El mosaico ya no lee `shifts.activity`; usa las mismas actividades de pabellón que la vista Actividades de Horario (hora, nombre, pax, categorías).

## 2026-09-01

- **Un solo filtro de fecha.** Pulsar el mes o el icono de calendario abre el mismo `TimeFilterModal`. Sale el selector de mes petróleo de Asistencia y los pickers muertos de Ventas/Cierres. [PATRONES P7](../2-diseno/PATRONES.md#p7--filtro-temporal).

## 2026-08-31

- **Excel y PDF vuelven a descargar.** En Cierres, Ventas, Tesorería y Asistencia el menú de compartir es un Modal: el desplegable de la cabecera no recibía el toque.

- **Calendario y tabla llevan el canto de widget.** Sin borde zinc; hairline blanca y sombra como en el mosaico.

- **Ventas: cabecera de tabla como el resto de la app.** 11 px, peso 500, versales. Cuerpo sin mono.

- **Sala LIVE entra por PageScreen.** Misma plantilla y SubNav que Ventas; las mesas son la pieza de trabajo.

- **Cierres: Calendario/Tabla a la izquierda; el mes al centro.** Si el rendimiento es 0 %, no se pinta cifra.

- **Reservas: el disparador es «+ reserva», un Button.** Relleno blanco sobre el envolvente.

- **Calendario y tabla conservan su pieza blanca.** Se quita solo la ficha de PageScreen. El interior sigue blanco, con radio y sombra.

- **Cabecera y buscador vuelven al subir.** La barra superior reaparece al scrollear hacia arriba en cualquier punto. El buscador flota como el tab bar, con el mismo cristal.

- **Pestañas de vista: activa blanca, el resto al aire.** En Cierres y Ventas la pestaña elegida lleva relleno blanco; las demás muestran el envolvente y tinta invertida.

- **El cromo de scroll se esconde por pasos.** La cabecera fija se oculta al bajar. El tab bar pierde primero los nombres y luego desaparece. El buscador de PageScreen se clava arriba al volver a subir.

- **PageScreen: solo el protagonista va en blanco.** Calendario, tabla o catálogo viven en la ficha. KPI, buscador, segmented y acciones rápidas flotan en el envolvente.

- **El catálogo vuelve al papel.** Recetas, ingredientes y proveedores son área de trabajo: la rejilla de productos va en la ficha blanca. El cromo (cabecera y buscador) sigue flotando.

- **PageScreen: el catálogo no lleva ficha.** Recetas, ingredientes y proveedores se sientan en el envolvente; el blanco queda para tabla, calendario y formulario.

- **PageScreen: el cromo flota; el papel es el trabajo.** Cabecera, fechas y buscador van sobre el envolvente. La tarjeta blanca empieza en la tabla, el calendario o el catálogo.

- **Proveedores: un solo selector, con el icono de inicio.** Detalle, pedido y albarán pintan el mismo squircle y el nombre fuera. Ya no es la celda de catálogo.

- **Proveedores: el selector de pedido y el detalle usan el pack nuevo.** Ganan los logos de `/icons/prov` sobre una URL vieja de la base.

- **El sello Pagado no pisa el importe.** En el pie del resumen semanal es una columna más; Horas, Pendientes, Extras e Importe se reparte el hueco que queda.

- **Plantilla: «Ver todos» no cambia de lista.** En Admin y Master sigue la misma rejilla; el interruptor de visibilidad va pequeño en la esquina derecha de cada persona.

## 2026-08-30

- **Asistencia: la raya entre semanas se apaga en los extremos.** Roja al centro, gris como el resto de líneas al llegar a los lados.

- **Asistencia: raya roja entre semanas.** Fina, del color de L–D, entre el pie de una y el inicio de la siguiente.

- **El resumen de persona vuelve al del mosaico Staff.** Historial, mosaico y horas extras pintan esa misma semana compacta (L–D roja, pie 25 px). En asistencia las semanas se apilan con una sola franja y el radio abajo solo en la última.

- **Un solo resumen semanal.** Historial, mosaico Staff y el modal de horas extras pintan el mismo WeekSummary con los mismos datos. En asistencia las semanas se apilan: una sola franja L–D y el radio abajo solo en la última.

- **Plantilla y asistencia: «Ver todos» es el último usuario.** En el selector de `/staff/history` y en Plantilla de Admin/Master va al final de la lista. Al activarse sigue el último y pasa a «Ver activos».

- **Asistencia: sin icono de calendario ni Enviar al compartir.** El mes va sin «de» (agosto 2026) y las flechas quedan centradas en el ancho de la página.

- **Admin: en H. extras, semana e indicador se acercan al calendario.** El importe queda más a la derecha.

- **Admin: el mosaico cambia de orden.** H. extras lleva Plantilla y Albaranes a la derecha. Debajo: Cambio 1, Cambio 2, Recetas, Asistencia. Abajo: M obra, Stock, Ingredientes, Cambio.

- **Staff: H y Ex del mosaico bajan un punto.** Etiquetas y cifras, a 7 px.

- **Staff: el resumen semanal es papel blanco y franja roja.** El mosaico ya no lo pinta como cristal. El pie sube a 10 / 8 px y se queda en 25 px.

- **Staff: el resumen semanal es blanco y rojo, no cristal.** El pie sube un punto (cifras 9 px, etiquetas 7 px) y se queda en 25 px para no recortar Ex.

- **Staff: vuelve la fila Ex de cada día.** El pie del mosaico baja otra vez a 25 px para no recortarla.

- **Staff: el resumen semanal sigue en cristal.** Solo vuelve la franja L–D roja con letras blancas. No es una placa de papel.

- **Staff: el resumen semanal del mosaico vuelve a blanco y rojo.** Papel blanco y cabecera L–D roja. El resto (H/Ex abajo, tamaños, pie legible) se mantiene.

- **Staff: el pie del mosaico se lee.** Cifras y «Semana N» a 11 px; Horas / Pendientes / Extras / Importe a 8 px. H y Ex de cada día, a 8 px.

- **Staff: el pie del mosaico es barra de widget, no tabla.** Las cifras (10 px, 600) mandan; Horas / Pendientes / Extras / Importe van regulares y sin tracking. «Semana N» recula.

- **Staff: L–D del mosaico deja el rojo.** Van en tinta del cristal, sin filetes de columna. El número del día pasa a regular.

- **Staff: entrada y salida del mosaico un poco más grandes; la salida baja un punto.**

- **Staff: H y Ex del resumen semanal van al fondo de la celda, sin negrita.** Relojes siguen arriba; las cifras de H y Ex pasan a regular.

- **Staff: entrada y salida del mosaico usan la misma fuente que H y Ex.** La salida se acerca un poco a la entrada.

- **Master: Cambio 1, Cambio 2 y H. extras son widgets de cristal.** Como en Admin. Si H. extras no tiene importe, muestra un tic.

- **H. extras llega al nombre de Cambio 2.** Sin etiqueta propia, el cristal baja hasta ese pie; no se corta en el recuadro.

- **H. extras sube a las filas 3–4.** Cambio 1 y 2 van a su derecha, como widget de cristal, no como icono blanco.

- **Cambio 1 y 2 del mosaico Admin son iconos.** Solo el importe; pulsar abre el arqueo. A la derecha del calendario: Cambio e Ingredientes.

- **H. extras ya no recorta el importe.** El calendario deja hueco; el valor queda a la derecha, entero.

- **H. extras llena el hueco.** Las filas se reparte la altura; el día es un círculo. Más aire bajo el mes que entre semanas.

- **H. extras compacta las filas del calendario.** Más aire bajo el mes. Semana e importe, en regular.

- **Admin: Recetas, Asistencia, Plantilla y Albaranes en la fila 3.** H. extras baja a las filas 4–5. Las dos cajas de cambio van juntas en la última fila.

- **H. extras: Semana al tamaño del importe; el valor, a la derecha.** Un poco más de aire bajo la fecha.

- **H. extras del mosaico Admin es 3×2.** Recetas y Albaranes van a la derecha. El calendario y las semanas se compactan a la izquierda.

- **Ventas centra los KPIs si no hay ventas.** Con importe, se quedan abajo.

- **Caja inicial: Compra, Arqueo, card, Salida, Entrada.**

- **H. extras apaga los días de otro mes y añade L M X J V S D.** El calendario se compacta para esa fila.

- **El resumen de la semana Staff pierde mayúsculas; la línea de encima es más fina.**

- **Caja inicial centra el bloque y alinea la diferencia con los conceptos.**

- **La card de Caja inicial tiene la misma altura que los botones.**

- **La card de Caja inicial se ajusta al importe.** Más baja, alineada otra vez con los botones.

- **Caja inicial pierde Movimientos.** La card se alinea con los botones; la diferencia, con los conceptos.

- **Ventas del mosaico marca 7 h y 23 h.** Solo si hay gráfica. Los conceptos suben un poco del canto.

- **Ventas del mosaico: línea fina, sin gráfica vacía, KPIs abajo.** Sin tabla de tickets. La cabecera vuelve a su sitio.

- **Caja inicial y cambio recuperan el disco; el icono va en trazo.** Entrada, salida, compra, arqueo y cambiar conservan el círculo de color; el pictograma es contorno.

- **El gráfico de Ventas va encima de las cifras.** Siempre visible en el mosaico. Conceptos y valores a 11/8 px, regulares, para que quepan en el hueco.

- **Ventas del mosaico baja de peso; caja flota en trazo.** Cifras y conceptos regulares y más pequeños, con aire para el gráfico. Entrada, salida, compra, arqueo y cambiar van en contorno sobre el cristal, no en disco relleno.

- **El tab bar vuelve a ser cristal.** El envolvente va a media tinta con blur: se ve el fondo y sobre el papel no desaparece.

- **El tab bar se lee sobre el papel.** La cápsula se sienta en el envolvente, no solo en cristal blanco: sobre las PageScreens blancas no desaparece.

- **Las cabeceras de PageScreen ya no arrastran texto blanco.** Acciones, iconos y el selector de horario usan tinta de trabajo sobre el papel.

## 2026-08-29

- **Los modales de elección van en oscuro.** Proveedor, plantilla, Stock, Info, Manuales, Caja y Documentos usan el envolvente. Los de trabajo (caja, formularios, fichaje) siguen blancos.

- **Cabeceras sin negrita; selectores de sección sin petróleo.** Títulos, fechas e iconos de cabecera van en peso 500/regular. PetroleumSegmented deja de pintar marca: borde y selected neutros.

- **Las cabeceras de página y de modal dejan el petróleo.** Misma superficie que el trabajo, tinta oscura, hilo de borde. El periodo y los botones de cabecera también. La marca se queda en botones y controles, no en la franja.

- **La barra inferior se oculta al hacer scroll hacia abajo.** Vuelve al subir o al llegar arriba del todo.

- **El icono activo de la barra inferior va en trazo, sin relleno.** Blanco y semibold; la pastilla del destino se mantiene.

- **La barra inferior es el tab bar de iPhone.** Fija, 49 pt, cristal del cromo, icono 25 pt y nombre 10 pt. Sin mayúsculas, sin sombra, sin agrandar el activo.

- **Horas extras cabe en el mosaico; caja usa el hueco.** El calendario no se corta abajo. Entrada/Salida/Cambio/Arqueo crecen. Ventas y Cierres del dashboard bajan a 8 px.

- **Carta llega al canto; Stock ya no lleva placa blanca; Uso app usa su PNG.** Ventas y Cierres del mosaico bajan un punto de tipo. El resumen de la semana no va en negrita.

- **El resumen de la semana Staff se lee en el mosaico.** Semibold y tracking abierto: `font-black` a 5 px convertía PENDIENTES en una mancha. History no cambia.

- **En el mosaico oscuro la fuente de los widgets es blanca.** Nada de zinc, gris ni marca sobre el cristal. El canto sigue siendo la hairline, no el hilo del icono.

- **Todos los widgets usan el cristal de Caja cambio 2.** Blanco al 16 % + blur, sobre el marino de abajo — no un color mezclado.

- **Todos los widgets del mosaico usan el cristal de Caja cambio 2.** Marino de abajo, el mismo arriba y abajo: ya no se tiñen del azul claro del cielo.

- **El cristal del mosaico deja ver el marino.** Menos leche blanca: los de arriba ya no se encenizan sobre el azul abierto.

- **El envolvente es marino con degradado, no una losa.** Azul más abierto arriba; los widgets del mosaico son cristal claro (blanco translúcido + blur), no una placa oscura.

- **El envolvente es marino de medianoche.** Más cerrado (`#0E1A2C`), como las apps de banca oscura; el trabajo sigue en superficie clara.

- **El envolvente es azul marino.** Oscuro (`#1B2A44`), sin el violeta ni el cielo anterior.

- **El envolvente es petróleo con sombra violeta.** Oscuro y poco saturado (`#241E36`), no el morado de Trincadores ni el cielo anterior.

- **El envolvente es el morado de Trincadores.** `#2E1260`, más abierto arriba (`#5030A8`) y más cerrado abajo. La marca de pantalla no cambia.

- **El envolvente tira a azul-violeta.** Sigue siendo petróleo oscuro (`#2C3A58`), no el cielo anterior.

- **El lienzo es petróleo oscuro.** Un solo envolvente (`#2A4A56`) con degradado en todas las páginas. Las superficies de trabajo siguen claras.

- **Los widgets del mosaico se comportan como en iOS.** Cristal que toma el wallpaper, claro u oscuro según el fondo, y el contenido encima del vidrio — no pastillas de papel.

- **La barra fija ya no lleva IA ni PG.** Reservas y notificaciones quedan a la derecha.

- **Los widgets del mosaico ya no imitan al icono.** El hueco es material (leche sobre el petróleo), no un papel blanco con hilo de 2 px. Los iconos conservan el canto.

- **La semana del mosaico Staff cabe en el hueco.** Misma tarjeta de hace dos días, más compacta: el número en la esquina y los relojes debajo, sin solaparse.

- **Tras el acceso, te quedas dentro.** Un fallo de Auth (límite de peticiones) ya no borra la sesión ni te devuelve al login.

- **La semana y tesorería no dicen «No autenticado» si la cookie sigue ahí.** No preguntan a Auth en cada carga.

- **Tras el acceso, la app ya no te devuelve al login.** Las acciones de servidor (ventas, semana, tesorería) dejan de recibir la pantalla de acceso en vez de su respuesta.

- **El canto del widget se ve.** Es un hilo de 2 px sobre la tarjeta, el mismo brillo que el icono. No una máscara que iOS se come.

- **El canto del icono se sienta sobre el gráfico.** Los PNG con aire transparente se acercan al recorte para no dejar petróleo bajo el hilo.

- **Los widgets del mosaico llevan el mismo canto que los iconos.** El hilo del recuadro no es solo del atajo.

- **Los iconos nuevos llenan el recorte, sin placa.** Plantilla, Info, Carta, Albaranes, Cierre, Reservas, Rentabilidad y Proveedores no van sobre fondo blanco.

- **H. extras, sin nombre, usa esa franja como altura.** El aire hasta Caja cambio es el mismo que entre filas, no un hueco extra.

- **En Admin, Caja cambio 2 queda debajo de 1.** Los cuatro iconos van a la derecha, en 2×2. H. extras sigue en 4×2, sin la franja vacía del nombre entre las dos filas.

- **Las tres pantallas de inicio conservan su inventario.** Staff, Admin y Master no ganan ni pierden widgets: solo cambia la disposición. Master sigue con C INICIAL, H. extras y Cambio 1/2 como iconos.

- **Admin y Master montan el mismo mosaico operativo.** Ventas, Caja inicial, H. extras y Caja cambio 1/2 son las mismas ranuras. Staff sigue con Semana, Entrada y Horarios, en la misma rejilla.

- **Un widget sin nombre usa también la franja del nombre.** Con `label` el texto va debajo; si no, el hueco es del widget.

- **La pista de inicio es el icono.** El nombre va en el hueco entre filas. Ventas y Caja inicial son 4×1; H. extras 4×2; Caja cambio 2×1; Horarios 2×2. H. extras, Caja cambio y Horarios ya no llevan cabecera de otro color: el nombre va debajo.

- **Las tres pantallas de inicio son la misma rejilla.** Staff, Admin y Master usan 4 columnas y huecos de icono. Un widget ocupa 2×2, 4×2 o 4×4; no un ancho libre.

## 2026-08-28

- **Asistencia llena el recuadro.** El calendario llega a sangre; JUL 17 se lee entero. La forma la pone el atajo.

- **Recetas, Consumo y Asistencia dejan la forma en el recuadro.** El archivo es el color a sangre y el dibujo con aire. El canto es el mismo hilo que C INICIAL.

- **Recetas, Consumo y Asistencia se alejan un poco.** El color sigue a sangre; el gráfico tiene más aire. C INICIAL lleva el mismo brillo en el canto.

- **Recetas, Consumo y Asistencia se recortan como C INICIAL.** Mismo canto sobre el color, sin marco vacío.

- **Recetas deja el marco vacío.** Como en iOS: el gráfico es el icono y la sombra lo sigue. Los de placa blanca no cambian.

- **Los atajos blancos recuperan las esquinas redondas.** El recuadro recorta el PNG; Ingredientes y Carta se leen como ChatGPT en iOS, Recetas como Spotify.

- **El canto del atajo deja el recuadro blanco.** En Caja mezcla el fondo. En Recetas se sienta sobre el rojo.

- **El canto del atajo toma el color del icono.** En Caja, del blanco. En Recetas, del gráfico.

- **Los atajos se ven enteros y más separados.** Misma medida y mismas esquinas. Sin recorte ni zoom. Recetas se adapta al recuadro; Caja lleva fondo.

- **Los atajos del mosaico separan el icono y el nombre.** Misma forma redondeada para todos. Recetas llena la forma; Caja y los de objeto van sobre un fondo.

- **Los botones de sistema dejan el doble aro.** Guardar y Eliminar se leen por el color. Cancelar y los menores, un hilo suave. El volumen y el pulso se quedan. Entrada y Salida del mosaico no cambian.

- **Los botones de sistema se pulsan como Entrada y Salida.** Contorno blanco, hilo negro suave y un poco de volumen en el color. El relleno sigue compacto. Entrada y Salida del mosaico Staff no cambian de tamaño.

- **La barra fija se queda a 48 px.** Ni los 56 de antes ni los 36; el hueco hasta el contenido son 8 px.

- **La barra fija de la app baja a 36 px.** El hueco hasta el contenido sigue en 56 px: esos 20 px quedan vacíos. Logo e iconos se reducen; el toque sigue en 48 px.

- **En Horas extras del mosaico, la fila ya no escribe el rango de fechas.** Quedan Semana n y el importe; las fechas las dice el mini-calendario.

- **El saludo de la barra de la app se lee como una frase.** «Hola, …» ya no va en mayúsculas. El nombre se reduce para caber, sin puntos.

- **El título de gestión se lee entero.** En la cabecera ya no se corta con puntos: se reduce para caber.

- **Las mayúsculas quedan en las cabeceras.** Botones, «Ver más» y etiquetas de dato van en caja oración. Las siglas se mantienen.

- **El negro de Entrada y Salida queda en un trazo suave.** Sigue por fuera del blanco, sin dibujar el botón.

- **El mosaico Master deja de romperse en el teléfono en local.** En HTTP, el identificador de ventas ya no exige `crypto.randomUUID`.

- **El negro fino de Entrada y Salida se ve.** Va pegado al blanco, 1 px. Al pulsar, el color casi no cambia.

- **Al pulsar Entrada o Salida, el relleno apenas se oscurece.** Lo justo para notarlo al tocar, no a la vista.

- **El fichaje recupera un negro de 1 px por fuera del blanco.** El volumen sigue en el relleno; sin base.

- **El volumen de Entrada y Salida va en el color.** Más claro arriba y más oscuro abajo; al pulsar, el relleno se aplana. Se retira el contorno negro.

- **Entrada y Salida del fichaje se pulsan.** Borde blanco, aro negro y una base de 2 px; al tocar, bajan.

- **En Tesorería, el resumen va arriba y se busca igual que en el resto.** Ingresos, gastos, saldo actual y diferencia en una fila; sin cifra, el nombre no se mueve. Debajo, el buscador a la izquierda y Entrada, Salida y Arqueo a la derecha.

- **Albaranes vuelve a mostrar la lista al abrir.** La carga ya no espera el cruce con el stock; un fallo de lectura se avisa y no se pinta como si no hubiera documentos.

- **Con el turno cerrado, las horas se leen.** Fondo claro, cifra con horas, minutos y segundos. Entrada y Salida llevan un contorno blanco.

- **En la semana de asistencia, la celda baja de alto.** Entrada y salida van con la fecha; H y Ex debajo, con el mismo aire. Las horas personales (P) solo se ven al abrir el día.

- **El fichaje del mosaico Staff es una sola fila sobre el petróleo.** Sin tarjeta blanca. Sin fichar, solo Entrada, más baja. En turno, el cronómetro a dos tercios y Salida a un tercio. Turno cerrado, el tiempo en gris, sin destacar.

- **Asistencia usa el mismo calendario que Cierres.** El mes, el mosaico Staff y el modal de una semana en horas extras pintan la misma rejilla. Cada semana de una persona lleva el pie de Horas, Pendientes, Extras e Importe. En el mosaico Staff la semana flota sobre el petróleo, a todo el ancho, sin cabecera.

- **En Horas extras del mosaico, el importe de cada semana se lee entero y a la derecha.** Ya no se recorta.

- **H. extras en el mosaico flota sobre la cabecera.** El título va sobre el petróleo, sin pastilla ni relleno propio.

- **Los menús de acceso del modal se leen como el de proveedores.** Icono y nombre en filas y columnas, nunca en lista. Info, Documentos, Manuales, Caja y Stock van iguales, con tres columnas de mínimo.

- **En Perfil, la cabecera va atrás, foto y nombre.** La foto es pequeña, a la medida del título. Las opciones se leen en tres columnas.

- **En Asistencia, compartir abre Exportar PDF o Enviar.** El PDF es el de lo que se ve ahora; Enviar lo pasa al envío del dispositivo. Plantilla pasa a un icono de persona; con alguien filtrado, sus iniciales y la cruz sobre el círculo.

- **Horas extras en el mosaico usa la misma cabecera que Ventas.** Petróleo y compacta; el Ver más queda pequeño.

- **El calendario mensual unificado se ve como Cierres.** Misma franja, misma tarjeta, misma cabecera de días. Semana vacía, ese alto; si hay más datos, la fila crece.

- **Los calendarios mensuales miden lo mismo que Cierres.** Semana vacía, ese alto; si hay más contenido, la fila crece. Coste laboral, Consumo, Horario, Actividades y Reservas dejan de ir cada uno a su tamaño.

- **Las pantallas de gestión dejan un aire entre la cabecera y el contenido.** Ligero, el mismo en todas.

- **Consumo personal se titula Consumo.** En la cabecera ya no dice Consumo staff.

- **En la ficha de receta, Simulador es el mismo botón que el resto.** El más de añadir ingrediente baja de tamaño. La primera columna de la tabla se llama Ingredientes.

## 2026-08-27

- **La tarjeta de gestión se acaba con el contenido.** En proveedores y el resto de pantallas unificadas ya no queda un hueco blanco al final: el aire bajo la tarjeta es el de los lados, como en la ventana de elegir proveedor.

- **Las listas de personas pintan igual.** Al abrir un día de consumo, de asistencia o de coste laboral, una semana de extras o el reparto de propinas, cada trabajador es la misma fila: inicial, nombre y dato. Arriba, un resumen discreto (Fijo · Extras · Ventas y el total), sin título duplicado ni cifra enorme.

- **Cuando no hay nada que mostrar, el aviso no grita.** Gris, más pequeño y en minúsculas.

- **Los buscadores bajan de protagonismo.** Miden 32 px, con letra de 12. CAT y PROV se alinean. En la ficha de receta la foto es más pequeña.

- **Los buscadores miden 40 px, no 48.** CAT y PROV se alinean a esa misma altura.

- **En la ficha de receta la categoría sale de la pantalla y entra al editar.** Precio, FC, base y margen llevan el nombre debajo y el euro detrás; pulsar el importe abre la edición. La tabla de ingredientes usa una sola cabecera, como Precio y Elaboración.

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
