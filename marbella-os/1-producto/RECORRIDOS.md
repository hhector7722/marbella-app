---
documento: RECORRIDOS
clase: vivo
estado: vigente
capa: producto
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 6 meses
supersede: —
---

# RECORRIDOS CRÍTICOS

Los recorridos son secuencias que una persona real completa para lograr un objetivo, cruzando varias capacidades. **Son exactamente lo que se rompe en un rediseño**, porque cada capacidad se revisa por separado y nadie comprueba la costura entre ellas.

Este documento es la lista de verificación obligatoria de cualquier cambio estructural: un cambio que rompa un recorrido de esta lista no entra, por bien resuelto que esté en su pantalla.

Cada recorrido declara: quién lo hace, en qué condiciones, qué capacidades cruza, cuál es su invariante y dónde se rompe.

---

## R1 · Fichar

**Quién**: persona en turno. **Cuándo**: al llegar y al irse. **Frecuencia**: varias veces al día, cada día, por cada persona.

Es el recorrido más ejecutado del producto y el más corto. Su coste unitario multiplica por todo el equipo y todos los días del año.

1. Abrir la aplicación instalada.
2. Aterrizar en el panel de equipo, con el estado propio visible sin buscarlo.
3. Pulsar entrada o salida.
4. Ver confirmación inequívoca del estado nuevo.

**Cruza**: asistencia y jornada.

**Invariante**: el fichaje se registra o falla con aviso. Nunca queda en un estado intermedio, y nunca se pierde por cerrar la aplicación.

**Se rompe si**: hay más de un toque entre abrir y fichar; el estado actual no se ve de un vistazo; la confirmación no distingue «registrado» de «enviando»; la pantalla exige red para mostrar el estado propio.

---

## R2 · Abrir el día

**Quién**: responsable de operación. **Cuándo**: al empezar el servicio.

1. Comprobar quién está fichado y quién debería estar.
2. Revisar el horario del día y las ausencias.
3. Comprobar la caja de cambio disponible.
4. Revisar lo que hay programado: eventos, encargos, actividades del pabellón.

**Cruza**: asistencia y jornada → caja y tesorería → eventos y encargos → pabellón y actividades.

**Invariante**: las cuatro respuestas se obtienen sin abandonar el flujo de apertura y sin volver a introducir ningún dato.

**Se rompe si**: hay que visitar cuatro secciones sin relación entre ellas; el día mostrado no es el mismo en todas (por interpretación de fecha); una sección lenta bloquea las demás.

---

## R3 · Servir y enviar a cocina

**Quién**: persona en turno de sala y de cocina. **Cuándo**: continuamente durante el servicio.

1. La comanda se toma en el terminal de venta.
2. El puente detecta el cambio y calcula lo nuevo respecto al estado anterior.
3. Lo nuevo aparece en la pantalla de cocina agrupado en una tanda.
4. Cocina marca el avance y cierra la comanda.
5. El radar de sala refleja el estado de la mesa.

**Cruza**: venta y sala → cocina.

**Invariante**: nada enviado desaparece y nada se duplica. Una modificación en el terminal produce exactamente una consecuencia en cocina.

**Se rompe si**: el cálculo de la diferencia falla y reenvía líneas ya servidas; la pantalla de cocina depende de un refresco manual; un documento que no es venta genera comanda; el corte del día natural parte el servicio en dos.

---

## R4 · Recibir mercancía

**Quién**: responsable de operación o persona con responsabilidad de recepción. **Cuándo**: cada entrega, a menudo en plena hora punta.

1. Fotografiar o cargar el albarán.
2. El sistema lo interpreta y propone líneas.
3. Revisar y corregir; los artículos ya conocidos vienen resueltos.
4. Confirmar; el stock se actualiza y los precios se propagan a los ingredientes que no estén bloqueados.
5. Si algún precio ha subido de forma relevante, verlo en ese momento.

**Cruza**: compras y albaranes → inventario → recetas y escandallos.

**Invariante**: confirmar un albarán actualiza stock y precio de forma atómica y trazable. Una corrección posterior es un movimiento nuevo, nunca una edición silenciosa.

**Se rompe si**: hay que volver a mapear artículos ya mapeados antes; el precio se propaga sin avisar de una subida; la unidad de compra y la de receta se confunden; un albarán aplicado dos veces duplica stock.

---

## R5 · Cerrar caja

**Quién**: responsable de operación. **Cuándo**: al final de cada día, cansado y con prisa por marcharse.

1. Contar el efectivo por denominación.
2. El sistema muestra el esperado a partir de ventas, tarjeta, pendiente y cobros.
3. Ver el descuadre, si existe.
4. Registrar el cierre y los movimientos de tesorería que correspondan.
5. El cierre queda en el histórico y alimenta el análisis.

**Cruza**: caja y tesorería → venta y sala → análisis de negocio.

**Invariante**: un descuadre siempre se muestra y nunca se ajusta automáticamente. El cierre es inmutable una vez registrado; corregirlo produce un movimiento nuevo con su motivo.

**Se rompe si**: el esperado se calcula con documentos que no son venta; el pendiente arrastra deuda ya cobrada; el recuento se pierde al interrumpirse el flujo; la pantalla acepta cerrar sin contar.

---

## R6 · Cerrar la semana de horas

**Quién**: responsable de operación y responsable del negocio. **Cuándo**: semanalmente. **Consecuencia**: afecta a lo que cobran las personas.

1. Revisar los fichajes de la semana y corregir los errores.
2. Ver, por persona, horas ordinarias, extras, bolsa de entrada y bolsa de salida.
3. Decidir por persona si las extras se pagan o se acumulan en bolsa.
4. Marcar la semana como pagada cuando se abone.
5. La bolsa se arrastra a la semana siguiente.

**Cruza**: asistencia y jornada → coste laboral y nóminas.

**Invariante**: el cálculo procede de un único productor y el resultado persistido es idéntico al que produciría recalcularlo. Con bolsa de salida negativa, extras e importe son cero.

**Se rompe si**: dos pantallas muestran cifras distintas para la misma semana; corregir un fichaje antiguo no propaga el arrastre a las semanas siguientes; la interfaz recalcula por su cuenta en lugar de leer; una marca administrativa se pierde al regenerar.

---

## R7 · Cerrar el mes de coste

**Quién**: responsable del negocio. **Cuándo**: mensualmente, al recibir el resumen de la gestoría.

1. Llega el resumen mensual de nóminas por correo.
2. Se interpreta y se contrasta con lo que el sistema esperaba.
3. El coste ordinario del mes queda disponible, prorrateado por día.
4. El coste laboral diario combina coste ordinario y coste extra.
5. Se compara con las ventas del periodo.

**Cruza**: coste laboral y nóminas → asistencia y jornada → análisis de negocio.

**Invariante**: el coste ordinario tiene un único origen, el resumen de la gestoría. No se estima nunca a partir de una tarifa inventada.

**Se rompe si**: se importa dos veces el mismo resumen; una versión nueva del formato pasa desapercibida; el coste se prorratea sobre días sin actividad; el porcentaje sobre ventas mezcla periodos distintos.

---

## R8 · Preparar un evento

**Quién**: responsable de operación y cliente. **Cuándo**: por evento, con días o semanas de antelación.

1. Se crea el evento con su fecha.
2. Se comparte el enlace público o el enlace con token.
3. El cliente completa su encargo sin sesión.
4. El responsable revisa y cierra el encargo.
5. Se imprime el documento de encargo para cocina y sala.
6. El día del evento aparece en la apertura del día.

**Cruza**: eventos y encargos → documentos impresos → asistencia y jornada (apertura del día).

**Invariante**: lo que el cliente ve, lo que el equipo prepara y lo que se imprime son el mismo encargo. Sin discrepancias entre superficies.

**Se rompe si**: el enlace caduca sin avisar; el cliente modifica un encargo ya cerrado; el documento impreso no refleja la última versión; la fecha del evento se desplaza un día.

---

## R9 · Consultar la carta como cliente

**Quién**: cliente. **Cuándo**: en cualquier momento, desde su móvil, con conexión desconocida.

1. Abrir el enlace.
2. Ver la oferta.
3. Abrir la ficha de un plato.

**Cruza**: carta.

**Invariante**: funciona sin sesión, sin instalación y sin exponer ningún dato interno. Es la única superficie donde el producto se juega la imagen del negocio.

**Se rompe si**: exige sesión; tarda; la ficha de plato se corta en la aplicación instalada; aparece terminología interna.

---

## R10 · Instalar y empezar a usar

**Quién**: persona nueva en el equipo. **Cuándo**: una vez, el primer día.

1. Recibir la invitación y establecer la contraseña.
2. Instalar la aplicación.
3. Entrar y aterrizar en el panel que le corresponde por rol.
4. Fichar por primera vez sin que nadie se lo explique.

**Cruza**: perfil y documentos → asistencia y jornada → analítica de uso (instalación).

**Invariante**: nadie necesita formación para fichar. El destino de entrada depende del rol y nunca es una pantalla vacía.

**Se rompe si**: la recuperación de contraseña colisiona con el guardián de rutas; el rol no se resuelve y la persona queda en blanco; la aplicación instalada abre en una ruta que no es su panel.

---

## Uso obligatorio

Antes de dar por terminado un cambio que afecte a navegación, permisos, cálculo semanal, integración con el terminal de venta, formato de fecha o estructura de pantalla, se recorren estos diez recorridos y se declara qué pasa en cada uno.

Un recorrido nuevo se añade aquí cuando se detecta que una secuencia real cruza capacidades y nadie la estaba comprobando. Los recorridos no se retiran salvo que la capacidad desaparezca.
