---
documento: CONTENIDO-Y-TONO
clase: vivo
estado: vigente
capa: diseno
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 6 meses
supersede: .cursor/rules/BAR-LA-MARBELLA-AI-OPERATING-PROTOCOL.mdc (regla Zero-Display)
---

# CONTENIDO Y TONO

Cómo habla Marbella y cómo presenta sus valores. El texto de una interfaz es parte del diseño: una etiqueta ambigua produce el mismo daño que un botón mal colocado.

Los términos y sus significados están en [GLOSARIO](../GLOSARIO.md). Este documento gobierna cómo se escriben y cómo se muestran, no qué significan.

---

## 1. Tono

**Directo, breve y sin adorno.** El interlocutor está trabajando y tiene prisa.

- Se habla de tú, en presente y en voz activa.
- Se dice lo que hay que hacer, no se pide permiso: «Guardar», no «¿Deseas guardar?».
- Ninguna exclamación. Nada de felicitaciones por completar una tarea rutinaria.
- Ni humor ni disculpas. Un error no dice «lo sentimos», dice qué ha pasado.
- Cero jerga técnica. Nunca aparecen nombres de tablas, columnas, códigos de error ni identificadores internos.
- Cero jerga de gestión. No se habla de indicadores ni de métricas; se habla de horas, de euros y de personas.

Ejemplos de la diferencia:

| No | Sí |
|---|---|
| «¡Fichaje registrado con éxito!» | «Entrada registrada · 09:14» |
| «Ha ocurrido un error inesperado» | «No se ha podido guardar. Revisa la conexión y vuelve a intentarlo» |
| «No hay datos disponibles» | «Todavía no hay albaranes de este mes» |
| «Error 23505: duplicate key» | «Este albarán ya estaba registrado» |

---

## 2. Etiquetas

- **Una etiqueta nombra su contenido, no su acción.** «Horas de la semana», no «Ver horas».
- Se usa el término del [GLOSARIO](../GLOSARIO.md), no un sinónimo. Si el término oficial suena mal en la interfaz, el problema es del término y se corrige en el glosario.
- Las etiquetas de columna son sustantivos, cortos y sin artículo.
- Las etiquetas en mayúsculas se reservan para cabeceras de una o dos palabras.
- Los días de la semana se abrevian a tres letras con acento cuando corresponde: LUN, MAR, MIÉ, JUE, VIE, SÁB, DOM.

---

## 3. Regla del valor vacío

**En vistas de lectura, un valor igual a cero se muestra como un espacio en blanco.**

Es una norma de producto, no un detalle de formato, y se aplica a horas, importes, cantidades y contadores. El motivo es de legibilidad operativa: una rejilla mensual con cuarenta ceros impide ver los cinco valores que importan.

Alcance y límites:

- Se aplica en **vistas de lectura**: rejillas, tablas de revisión, resúmenes, calendarios.
- **No se aplica en formularios.** Un campo con cero muestra cero, porque cero es un dato introducido.
- **No se aplica cuando cero significa algo.** Un descuadre de cero euros es información valiosa y se muestra como cero.
- Un valor muy pequeño en valor absoluto se trata como cero a efectos de presentación, para no mostrar residuos de coma flotante.

Distinción crítica: **«vacío» significa cero, nunca «no lo sé»**. Un dato que no se ha podido leer no se muestra en blanco; produce un error visible según [EXPERIENCIA §6](EXPERIENCIA.md#6-error). Confundir ambos es el fallo silencioso que prohíbe el principio 2.

---

## 4. Números

### Horas

- Se muestran en incrementos de media hora: solo enteros o mitades.
- El redondeo de presentación es: hasta veinte minutos hacia abajo, hasta cincuenta minutos a la media, por encima a la hora siguiente.
- **Este redondeo es solo de presentación.** Aplicarlo antes de un cálculo es un defecto: el principio 4 exige precisión completa hasta el último paso.
- Las horas negativas llevan signo y significan deuda de horas.
- Nunca se muestran horas con formato de reloj cuando son una duración. Una duración es «7,5», no «07:30».

### Dinero

- Dos decimales y el símbolo del euro detrás de la cifra, con espacio.
- Separador de miles y decimal en formato español: punto para miles, coma para decimales.
- Los importes negativos llevan signo y color negativo, además del signo.
- En columnas comparables, los importes alinean a la derecha con dígitos tabulares.
- Un importe nunca se abrevia con «k» o «M». Se muestra completo o no se muestra.

### Porcentajes

- Un decimal como máximo.
- Siempre acompañados de las magnitudes que los originan, accesibles al pulsar. Un porcentaje sin numerador y denominador no es auditable.

### Cantidades

- Con su unidad, sin abreviaturas inventadas.
- Las conversiones entre unidad de compra y unidad de receta se muestran explícitamente, nunca se dan por supuestas.

---

## 5. Fechas y horas

- Fecha larga: día, mes en palabra y año. Mes y año en la cabecera del calendario.
- Fecha corta en tablas densas: día y mes abreviado.
- Hora: veinticuatro horas, dos dígitos.
- **Todas las fechas y horas se muestran en el tiempo local del negocio.** Europa/Madrid.
- Un rango se escribe con guion y sin repetir el mes cuando coincide.
- Una fecha relativa («hace 5 min») solo se usa en paneles en vivo, donde el tiempo transcurrido es el dato.

### Dos reglas técnicas con consecuencia visible

**Las fechas se construyen componente a componente, en tiempo local.** Interpretar una fecha en formato de año, mes y día como instante universal desplaza el día en la zona local y provoca que una jornada aparezca en la semana equivocada. Es un error de un día completo, silencioso y difícil de detectar.

**Todo dato horario procedente de un sistema externo se normaliza antes de usarse.** Los sellos de tiempo del terminal de venta y de los sistemas heredados llegan con formatos mixtos, con marcas de separación y de zona. Extraer trozos de esa cadena con operaciones de texto produce horas y días falsos. La normalización es responsabilidad de la integración, y su contrato está en [3-ingenieria/integraciones](../3-ingenieria/integraciones/).

---

## 6. Vocabulario de estados

Cada capacidad tiene un vocabulario cerrado de estados. No se inventan etiquetas nuevas en la pantalla.

### Tipos de día en asistencia

| Etiqueta en interfaz | Inicial | Significado |
|---|---|---|
| Regular | — | Jornada normal |
| Festivo | F | Día festivo |
| Enfermo | E | Ausencia por enfermedad |
| Baja | B | Ausencia prolongada |
| Personal | P | Ausencia por asunto propio |
| No registrado | NR | Debía haber jornada y no hay fichaje |

**La etiqueta es la verdad para la persona; el identificador interno no lo es.** El identificador almacenado para «Enfermo» no tiene relación semántica con enfermedad: se conserva por compatibilidad con datos históricos. Está declarado como deuda de vocabulario en [GLOSARIO §12](../GLOSARIO.md#12-deuda-de-vocabulario).

Ningún documento ni pantalla debe mostrar el identificador interno en lugar de la etiqueta.

---

## 7. Mensajes

### De error

Estructura: qué ha pasado, y qué puede hacer la persona. En ese orden y en dos frases como máximo.

- Sin código, sin nombre de tabla, sin traza.
- Sin culpabilizar: «Falta la fecha», no «Has olvidado la fecha».
- Si el error no es recuperable por la persona, se dice a quién avisar.

### De confirmación

- Solo cuando la acción es destructiva e irreversible.
- Dice **qué** se va a perder, concretamente: «Se eliminarán las 12 líneas del albarán».
- El botón de confirmación nombra la acción, no dice «Aceptar».

### De resultado

- Dice qué cambió, con el dato: «Precio actualizado · 2,40 € → 2,65 €».
- El resultado positivo desaparece solo. El negativo permanece.

---

## 8. Superficies de cliente

La carta, los formularios públicos y los documentos impresos hablan al cliente, y las reglas cambian:

- Se usa el tratamiento de cortesía y un tono más neutro.
- Cero terminología interna: nada de escandallos, ni raciones de coste, ni identificadores.
- Los nombres de plato se muestran exactamente como se han escrito para el cliente, sin normalizar mayúsculas.
- Un error en una superficie pública nunca menciona el sistema; ofrece un contacto.

---

## 9. Cómo se cambia una etiqueta

Cambiar una etiqueta visible es un cambio de producto:

1. Si el término está en el [GLOSARIO](../GLOSARIO.md), se cambia allí primero.
2. Se comprueba si el término aparece en documentos impresos, para no crear divergencia entre superficies.
3. Se anota en [CHANGELOG](../5-estado/CHANGELOG.md) si el término era de uso frecuente: el equipo lleva años llamándolo de una forma.
