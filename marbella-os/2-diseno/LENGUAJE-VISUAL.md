---
documento: LENGUAJE-VISUAL
clase: constitucional
estado: vigente
capa: diseno
normativo: true
precedencia: 60
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 12 meses
supersede: —
---

# LENGUAJE VISUAL — Identidad de Marbella

Cómo se ve Marbella y por qué. Este documento fija la intención; [TOKENS](TOKENS.md) fija los valores. Un valor sin intención documentada es una arbitrariedad que nadie podrá defender en la siguiente discusión.

---

## 1. Carácter

Marbella se ve como una **herramienta profesional de hostelería, limpia y sin ruido**. La referencia es el instrumental de una cocina bien organizada: superficies claras, poca decoración, contraste alto, todo con su sitio.

Tres rasgos definen el carácter:

- **Claridad sobre densidad decorativa.** El fondo no compite con el dato. Ninguna superficie de trabajo lleva ornamento.
- **Contenido sobre contenedor.** La cifra manda; la tarjeta que la contiene desaparece perceptivamente.
- **Serenidad con acentos.** El producto es tranquilo casi todo el tiempo, para que cuando algo se ponga rojo signifique de verdad algo.

Lo que Marbella no es visualmente: no es un panel de control corporativo lleno de gráficas, no es una aplicación de consumo con animaciones, y no es un producto de marca fuerte. La marca aparece en la portada de un documento impreso, no en cada pantalla.

---

## 2. Color

### Estructura de la paleta

Cuatro papeles, y solo cuatro:

- **Marca** — el azul petróleo. Identifica al producto y marca la acción principal. Es el único color con carga de identidad.
- **Envolvente** — el azul de fondo de la aplicación, con degradado sutil, más claro arriba y más oscuro abajo. Es el lienzo sobre el que flotan las superficies de trabajo. No lleva contenido nunca.
- **Neutros** — la escala de grises fríos. Sostiene el 90% del producto: superficies, texto, bordes, separadores.
- **Semánticos** — verde, rojo, ámbar y azul informativo. **Solo se usan cuando significan algo**: positivo, negativo, advertencia, información. Un verde decorativo destruye el significado del verde real.

### Reglas de color

- **El color nunca es la única portadora del significado.** Todo estado comunicado por color lleva también texto, icono o posición. No es una concesión: hay personas que no distinguen verde de rojo y hay pantallas que se ven a plena luz.
- **El fondo envolvente y las superficies de trabajo no se mezclan.** El contenido vive en superficies claras sobre el envolvente, nunca directamente sobre él.
- **La saturación se reserva.** Superficie clara, texto oscuro, un solo acento saturado por pantalla.
- **El rojo cuesta dinero.** Se usa para descuadres, deudas, pérdidas y errores. Nunca para «eliminar» como decoración.
- **Máximo un 10% de superficie de marca en un documento impreso.** Regla heredada del manual de documentos impresos y extendida por coherencia a las pantallas de análisis.

### Modo oscuro

No existe y no es una omisión. El producto se usa en interiores con luz artificial y su prioridad es el contraste máximo sobre superficie clara. La configuración técnica lo contempla por defecto de herramienta, pero **no hay diseño de modo oscuro y no debe inferirse uno**. Si algún día se decide, será por ADR.

### Conflicto declarado

El azul de marca de la aplicación y el azul de marca de los documentos impresos **no son el mismo color**. Es una divergencia real entre superficies, heredada de que el sistema de documentos impresos se definió antes y por separado. Hasta que se resuelva por decisión explícita, cada superficie usa su valor y [TOKENS](TOKENS.md) los declara por separado. Está registrado en [DEUDA](../5-estado/DEUDA.md).

---

## 3. Tipografía

**Una familia para todo el producto**: una tipografía sin serifa, neutra y de altura de x generosa, legible en pantalla pequeña y con luz mala.

Dos excepciones, ambas justificadas:

- **Pantalla de cocina**: número de mesa con una tipografía condensada de gran tamaño, pensada para leerse a tres metros de distancia. Es una decisión funcional, no estética.
- **Documentos impresos**: la familia del manual impreso, con su propia escala en puntos. Ver [DOCUMENTOS-IMPRESOS](DOCUMENTOS-IMPRESOS.md).

Reglas tipográficas:

- **La jerarquía se construye con peso y tamaño, no con color.** El texto atenuado es información secundaria, no un nivel de título.
- **Las cifras son tabulares donde se comparan.** En una columna de importes, los dígitos alinean.
- **Lo que hay que entender no baja de `tipo.minimo` (11 px):** cifras, nombres, acciones, etiquetas de dato. Una cifra más pequeña es un dato falso.
- **Una anotación puede ser más pequeña.** `tipo.anotacion` (8 px) es para notas y cromo que no es el dato. El calendario mensual denso puede usarlo. Por debajo de 8 px, no.
- **Las mayúsculas solo van en cabeceras** (título de pantalla, de modal o de tarjeta). No en botones, saludos, «Ver más» ni etiquetas de dato. Las siglas (IA, TPV, PDF) se escriben como siglas, no como énfasis.
- **El texto se ajusta al contenedor reduciéndose, nunca cortándose a mitad de una cifra.** Una cifra truncada es un dato falso.

---

## 4. Retícula y espacio

- **La unidad de espaciado es la escala de cuatro píxeles** en pantalla y de ocho puntos en documentos impresos. Toda separación es un múltiplo de la unidad; no hay valores intermedios «porque queda mejor».
- **La composición dominante es la rejilla de tarjetas**: bloques independientes, cada uno con un propósito, alineados en una rejilla que se reordena en una columna en móvil.
- **El ancho de lectura está acotado.** Un párrafo o una tabla no se estiran indefinidamente en escritorio; se centran con un ancho máximo.
- **El respiro es asimétrico y deliberado**: más espacio alrededor de las zonas de acción, menos entre elementos que se comparan.

---

## 5. Forma

- **Las esquinas son redondeadas, con dos radios principales**: uno para controles y bloques de contenido, otro mayor para superficies contenedoras y modales. Un tercer radio, circular, para avatares e indicadores.
- **El radio no se mezcla dentro de un mismo bloque.** Un bloque redondeado no contiene un elemento de esquina viva.
- **La elevación es sutil y significa profundidad, no importancia.** Una sombra mínima para separar la superficie de trabajo del fondo; una sombra amplia solo para lo que flota de verdad, como un modal.
- **Los bordes son de un píxel y de gris muy claro.** Sostienen la estructura sin dibujarla.
- **No se usan sombras internas ni relieves** salvo en el control de cantidad, donde el hundido comunica pulsabilidad.

---

## 6. Iconografía

- **Una sola familia de iconos**, de trazo, con grosor uniforme.
- El icono **acompaña** al texto; no lo sustituye salvo en controles universalmente conocidos como cerrar, buscar o volver.
- No hay iconos decorativos. Un icono que no aporta significado se elimina.
- El icono no cambia de familia entre pantallas. Dos iconos distintos para la misma acción es un defecto.

---

## 7. Fotografía e imagen

- **La fotografía solo aparece en superficies de cliente**: carta, ficha de plato, documentos comerciales impresos. En las pantallas de gestión no hay imágenes decorativas.
- Toda imagen subida se normaliza a un formato y tamaño coherentes en el momento de la carga. El producto no confía en que la fuente venga bien.
- Una imagen ausente tiene un sustituto neutro definido, nunca un hueco roto ni un icono de error del navegador.
- La ampliación de imagen es una superficie propia con gesto de acercamiento, no una imagen grande dentro del flujo.

---

## 8. Movimiento

El movimiento en Marbella es **breve, funcional y raro**.

- Solo se anima para explicar una relación: algo que entra, algo que sale, algo que cambia de estado.
- Ninguna animación retrasa el acceso a un dato.
- La animación de espera es una atenuación cíclica, no un giro llamativo.
- No hay animaciones de entrada en carga de página. La pantalla aparece; no se presenta.
- Se respeta la preferencia del sistema de reducir movimiento.

---

## 9. Excepciones vigentes

Este documento gobierna todo el producto salvo dos superficies con lenguaje propio declarado:

- **Pantalla de cocina** — contraste y tamaño extremos, tipografía condensada, color como señal de urgencia. Su contexto es a tres metros y con prisa; las reglas de densidad general no aplican.
- **Documentos impresos** — sistema formal propio, con su paleta, escala y retícula. Ver [DOCUMENTOS-IMPRESOS](DOCUMENTOS-IMPRESOS.md).

Cualquier otra excepción es deuda visual y se registra en [DEUDA](../5-estado/DEUDA.md). Hoy existe al menos una no justificada: una tipografía distinta introducida en la superficie pública de reporte de actividades.
