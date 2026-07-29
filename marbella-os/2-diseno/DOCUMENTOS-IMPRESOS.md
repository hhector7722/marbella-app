---
documento: DOCUMENTOS-IMPRESOS
clase: vivo
estado: vigente
capa: diseno
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 12 meses
supersede: docs/design-system/README.md
---

# DOCUMENTOS IMPRESOS

El documento impreso es una **superficie de primera clase** de Marbella, no una exportación accidental. Una hoja de jornada que firma una persona, un encargo que va a cocina o una factura que ve un cliente tienen tanto peso como una pantalla, y a veces más: la pantalla se corrige, el papel ya está firmado.

Esta es la única superficie de Marbella con **sistema de diseño formal ya escrito**: el manual de identidad para informes y cuadros de mando, versión 2.0. Su manual completo es el activo [Marbella-PDF-Design-System-v2.0.pdf](activos/Marbella-PDF-Design-System-v2.0.pdf), y este documento es su norma vigente y su índice.

---

## 1. Por qué tiene sistema propio

El papel no comparte casi nada con la pantalla: no hay interacción, no hay desplazamiento, no hay estados, la unidad de medida es tipográfica y no de píxel, el color se imprime y la página tiene un límite físico.

Por eso los documentos impresos tienen su propia paleta, escala y retícula, declaradas por separado en [TOKENS](TOKENS.md) con el sufijo de superficie impresa. Compartir nombres semánticos y no compartir valores es deliberado.

---

## 2. Fundamentos

- **Página A4 vertical**, en unidad tipográfica de punto.
- **Márgenes**: 36 puntos laterales, 32 verticales.
- **Retícula de 12 columnas** con medianil de 16 puntos. El ancho máximo de texto es de 8 columnas: un párrafo no cruza la página entera.
- **Ritmo vertical de 8 puntos.** Toda posición y toda separación es múltiplo de 8.
- **Filete de 0,5 puntos** para separar cabecera y pie del cuerpo.
- **Escala tipográfica** en cinco niveles: portada, sección, subtítulo de bloque, cuerpo y pie. Una familia sin serifa; en ejecución se usa la familia estándar del formato hasta que se incruste la propia.
- **El azul de marca ocupa como máximo el 10% de la superficie de una página.** Es la regla más característica del manual: el documento es blanco con acentos, no un folleto corporativo.
- **Logotipo con tamaño mínimo** declarado. Por debajo no se reproduce, se omite.

---

## 3. Anatomía de un documento

Todo documento impreso de Marbella tiene la misma estructura:

- **Cabecera** con identidad y título del documento, presente en todas las páginas.
- **Cuerpo** compuesto por bloques: portada de sección, títulos de bloque, tarjetas de indicador, tablas y avisos.
- **Pie** con datos de la empresa y numeración de página, presente en todas las páginas.

Los datos fiscales que aparecen en el pie son los de la razón social y están centralizados en un único lugar del código. **Nunca se escriben a mano en un documento.**

---

## 4. Bloques disponibles

El sistema tiene un conjunto cerrado de bloques. Un documento nuevo se compone con ellos; si necesita un bloque que no existe, se añade al sistema, no al documento.

- **Portada de sección** — separador mayor con título, para informes de varias secciones.
- **Título y subtítulo de bloque** — jerarquía dentro de una sección.
- **Tarjeta de indicador** — una cifra con su etiqueta. Se agrupan en filas de tarjetas.
- **Tabla** — estilo único con cabecera diferenciada, filas alternas y cifras alineadas a la derecha.
- **Aviso** — bloque de tinta suave en las cuatro variantes semánticas: informativo, positivo, advertencia y error.

---

## 5. Formato de valores

Los documentos impresos comparten las reglas de [CONTENIDO-Y-TONO §4](CONTENIDO-Y-TONO.md#4-números), con dos particularidades:

- El importe y el número se formatean con funciones propias del sistema impreso, para garantizar el mismo resultado en todos los documentos.
- **La regla del valor vacío no se aplica en documentos impresos.** Un cero en papel se imprime como cero: el documento se firma, se archiva y se audita, y un hueco en blanco sería ambiguo. Es una excepción declarada, no un olvido.

---

## 6. Catálogo de documentos y estado

| Documento | Superficie | Estado |
|---|---|---|
| Hoja de jornada, plantilla y simulación | Interna | Migrado al sistema |
| Encargo y factura de encargo | Cliente | Migrado al sistema |
| Pedido a proveedor | Proveedor | **Estilo heredado confirmado** |

**El pedido a proveedor no se migra.** Se evaluó y se rechazó por decisión explícita: su formato heredado funciona en la relación con los proveedores y cambiarlo tenía coste sin beneficio. Es una excepción con dueño y fecha, no deuda.

**Todo documento impreso nuevo usa el sistema, sin excepción.** No se admiten documentos nuevos con estilo propio.

---

## 7. Reglas de construcción

1. Todo documento se crea con el constructor del sistema, que aplica cabecera, pie y numeración a todas las páginas.
2. **No se mezcla el azul de pantalla con el azul de documento impreso.** Un documento con el azul de la aplicación es un defecto.
3. Las posiciones se ajustan al ritmo vertical mediante la función del sistema, no a ojo.
4. Un documento se revisa impreso en papel, no solo en pantalla. El contraste y el tamaño mínimo se juzgan en el medio final.
5. El sistema tiene una versión declarada. Un cambio de fundamentos incrementa la versión y se registra en [CHANGELOG](../5-estado/CHANGELOG.md).

Existe una previsualización del kit ejecutable como herramienta de desarrollo; su invocación concreta vive en la documentación de operación, no aquí.

---

## 8. Relación con la pantalla

- **El documento impreso no es la pantalla exportada.** Se diseña como documento: tiene portada, jerarquía de secciones y paginación.
- Los datos que muestra proceden de las mismas fuentes que la pantalla. Si una cifra difiere entre el papel y la pantalla, es un defecto grave: viola el principio de un único productor.
- La terminología es la del [GLOSARIO](../GLOSARIO.md), con el tono de superficie de cliente cuando el destinatario es externo.

---

## 9. Deuda declarada

- **La familia tipográfica propia no está incrustada.** Se usa la familia estándar del formato, con la consecuencia de que el documento impreso no comparte tipografía con la pantalla.
- **El azul de marca difiere entre pantalla y papel**, según [LENGUAJE-VISUAL §2](LENGUAJE-VISUAL.md#2-color).

Ambas están registradas en [DEUDA](../5-estado/DEUDA.md).
