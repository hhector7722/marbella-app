---
documento: EXPERIENCIA
clase: constitucional
estado: vigente
capa: diseno
normativo: true
precedencia: 60
responsable: propiedad del producto
revisado: 2026-08-16
caducidad: 12 meses
supersede: .cursor/rules/BAR-LA-MARBELLA-AI-OPERATING-PROTOCOL.mdc (reglas táctiles y de seguridad de layout), .cursor/rules/modals.mdc (como origen de norma)
---

# EXPERIENCIA — Leyes de interacción

Las leyes que gobiernan cómo se comporta Marbella ante una persona. Son medibles y comprobables: una pantalla las cumple o no las cumple.

Derivan de [PRINCIPIOS](../1-producto/PRINCIPIOS.md). Los valores concretos que citan viven en [TOKENS](TOKENS.md); aquí se enuncia la ley, allí está el número.

---

## 1. Táctil

**El objetivo mínimo de pulsación es de 48 píxeles de alto.** Sin excepciones en elementos que se usan durante el servicio.

- 44 píxeles se acepta solo en elementos secundarios de pantallas de escritorio, y es un compromiso, no una alternativa.
- La separación entre dos objetivos pulsables adyacentes nunca es cero. Dos acciones contiguas con consecuencias distintas necesitan separación visible.
- Un objetivo pulsable pequeño rodeado de área inactiva es un error: el área pulsable se extiende hasta el borde de su contenedor.
- El texto de un campo de entrada tiene un tamaño que no provoque zoom automático en el móvil.

**Las zonas de interacción no colapsan nunca.** Las botoneras inferiores, los controles de cantidad y las barras de acción mantienen su tamaño con independencia de cuánto crezca el contenido. Es la ley que más veces se ha incumplido en el producto: un contenedor elástico que se come la botonera deja a la persona sin poder terminar la tarea.

**Ningún gesto es la única vía.** Deslizar, arrastrar o pulsar largo pueden ser atajos, nunca el único camino a una acción. Toda acción disponible por gesto tiene también un control visible.

---

## 2. Densidad

La densidad se adapta al contexto físico, no al tamaño de la pantalla:

- **Durante el servicio** (fichaje, cocina, sala, cobro): densidad baja. Pocos elementos, grandes, con la acción principal inequívoca.
- **En revisión** (registros, albaranes, precios, movimientos): densidad alta. Muchas filas comparables de un vistazo, porque el trabajo consiste en comparar.
- **En análisis**: densidad media, con espacio para leer una cifra sin confundirla con la vecina.

**Una pantalla de trabajo cabe en un viewport.** Si la tarea principal exige desplazarse para verse completa, la pantalla está mal compuesta. El calendario mensual y los modales de día son el caso canónico: se resuelven repartiendo el alto disponible, no permitiendo que crezcan.

---

## 3. Jerarquía de acción

En cada pantalla hay **una** acción principal, visualmente inconfundible y siempre alcanzable con el pulgar.

- Las acciones secundarias son visibles pero subordinadas.
- Las acciones destructivas nunca comparten aspecto con las constructivas, y nunca están adyacentes a ellas.
- Una acción destructiva irreversible pide confirmación. Una reversible, no: pide menos confirmaciones y ofrece deshacer.
- Cero es una cantidad válida. Un control de cantidad no desaparece al llegar a cero.

---

## 4. Retroalimentación

**Toda acción produce una respuesta perceptible en menos de cien milisegundos**, aunque su resultado tarde más. La respuesta inmediata puede ser un cambio de estado del propio control; el resultado llega después.

- Una acción en curso deshabilita su control. Pulsar dos veces nunca produce dos efectos.
- El éxito se comunica y desaparece. El error se comunica y permanece hasta que se atiende.
- Ninguna confirmación tapa el dato que la persona necesita para decidir el siguiente paso.
- Una acción con consecuencia sobre dinero u horas dice **qué** cambió, no solo que cambió.

---

## 5. Espera

Cuatro reglas, en orden de preferencia:

1. **Aparece antes la estructura que el dato.** El armazón de la pantalla se muestra de inmediato y los datos llegan a sus huecos.
2. **Una sección lenta no bloquea la pantalla.** Cada bloque espera por su cuenta.
3. **El placeholder de carga tiene la forma del contenido que va a llegar.** Nada de bloques grises genéricos que provoquen salto al rellenarse.
4. **Una espera de más de cinco segundos se explica.** Y ofrece una salida.

Prohibido: la pantalla en blanco mientras se carga, el indicador de carga a pantalla completa por un dato secundario, y el salto de contenido al terminar de cargar.

---

## 6. Error

**Un error se muestra siempre. Un dato vital ausente se grita.**

- Un fallo de escritura se comunica en el sitio donde la persona actuó, no en una esquina.
- Un fallo de lectura de un dato vital bloquea la pantalla con un mensaje claro, no la deja pintada con ceros. **Un cero falso es peor que un error visible**, porque induce a decidir mal.
- Un error nunca se registra solo en la consola: en producción nadie mira la consola.
- El mensaje dice qué ha pasado y qué puede hacer la persona. No expone detalle técnico ni identificadores internos.
- Un error recuperable ofrece reintentar sin perder lo introducido.

**Nada de lo que una persona ha escrito se pierde por un error.** Ni por navegar, ni por interrupción, ni por fallo de red.

---

## 7. Vacío

Un estado vacío nunca es una pantalla en blanco. Distingue tres situaciones, porque para la persona son distintas:

- **No hay nada todavía** — explica qué aparecerá aquí y ofrece la acción para crear lo primero.
- **No hay nada que coincida** — explica qué filtro lo está impidiendo y ofrece quitarlo.
- **No se ha podido cargar** — es un error, y se comporta como un error.

Confundir «no hay datos» con «no he podido leer los datos» es un defecto grave: es exactamente el fallo silencioso que prohíbe el principio 2.

---

## 8. Modales

El modal es el patrón de interacción más usado del producto y por eso tiene ley propia. Su anatomía y variantes están en [PATRONES](PATRONES.md); aquí están sus leyes:

- Un modal tiene un título que dice de qué es y una salida siempre visible.
- **El modal respeta el área segura del dispositivo.** Nunca queda cortado por la muesca, la barra de inicio o el teclado, ni en navegador ni en aplicación instalada.
- El contenido del modal se desplaza; su cabecera y su pie no. La cabecera tiene **altura fija** (`estructura.cabecera-modal`); el contenido de cabecera se adapta sin hacer crecer la barra. El inicio horizontal del título es único (`estructura.modal-cabecera-inset`). Título y subtítulo comparten la misma fila. Entre cabecera y primer contenido del Body hay **12 px** contractuales (`espacio.3`); no los decide el consumidor.
- Mientras hay un modal abierto, las barras fijas de la aplicación se atenúan y dejan de responder. No puede haber dos capas compitiendo por el mismo toque.
- **No se anidan modales de forma arbitraria.** Como máximo se permite **una superficie derivada** sobre el modal principal de la misma tarea ([ADR-0007](../4-decisiones/ADR-0007-modal-superficie-derivada.md)). Un tercer overlay de negocio vía segunda `derived` está prohibido; confirmaciones de sistema usan `layer="system"`. No se resuelve con z-index manual.
- El backdrop pertenece a la capa Modal: base con blur/saturate acotados; capas superiores solo oscurecen ([ADR-0008](../4-decisiones/ADR-0008-modal-backdrop-capas.md)). Prohibido acumular blur.
- Ningún modal introduce scroll horizontal. El Body puede desplazarse en vertical.
- **En el viewport estrecho (~375 px) el modal permanece centrado.** No se convierte en hoja inferior. La única hoja inferior autorizada es la excepción de consumo en [SISTEMA-DE-COMPONENTES](SISTEMA-DE-COMPONENTES.md#modal).
- Cerrar un modal con datos introducidos sin guardar pide confirmación. El consumidor lo resuelve con una superficie `layer="system"`, no con un segundo modal de tarea.

---

## 9. Aplicación instalada

Marbella se usa mayoritariamente como aplicación instalada, y eso cambia las reglas:

- La aplicación abre en el panel que corresponde al rol, nunca en una pantalla neutra.
- El área segura superior e inferior se respeta en todas las pantallas.
- La altura visible se calcula con la medida que refleja el área realmente visible, no la teórica. Es la causa histórica de modales cortados en la aplicación.
- Las listas táctiles terminan con un hueco al final que permite ver el último elemento completo por encima de las barras fijas.
- Nada depende de que exista una barra de navegación del navegador.

---

## 10. Red irregular

- Consultar el estado propio no debería exigir red. Actuar, sí.
- Una acción lanzada sin red falla con aviso y conserva lo introducido. No se encola en silencio.
- Los datos en vivo (sala, cocina) declaran cuándo se actualizaron por última vez. Un dato en vivo que dejó de actualizarse y no lo dice es un dato falso.

---

## 11. Cómo se comprueba

Una pantalla cumple este documento si supera estas preguntas:

- ¿Se puede completar la tarea con un dedo, de pie, en menos de treinta segundos?
- ¿Cabe la tarea principal en un viewport?
- ¿Hay una sola acción principal y se alcanza con el pulgar?
- ¿Toda acción responde de inmediato?
- ¿Un fallo de carga produce un error visible en lugar de ceros?
- ¿Los tres estados vacíos están distinguidos?
- ¿Sobrevive a la aplicación instalada, con muesca y con teclado abierto?
- ¿Sobrevive a que la lista tenga cero elementos y a que tenga mil?

Un «no» es un defecto y se registra como tal, no como una preferencia estética.
