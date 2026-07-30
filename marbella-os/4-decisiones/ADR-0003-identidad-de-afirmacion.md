---
documento: ADR-0003
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-07-30
depende_de: CANON, ADR-0002
supersede: —
---

# ADR-0003 · Identidad de afirmación

## Contexto

`CANON §5` exige que cada hecho viva en un solo documento y que los demás enlacen. [ADR-0002](ADR-0002-metadatos-operables-y-validador.md) la calificó como «la regla más valiosa del corpus» y aceptó no poder comprobarla, porque detectar que dos documentos afirman lo mismo exige entender lo que dicen.

El diagnóstico era correcto pero incompleto. El obstáculo no es solo la comprensión semántica: es que **la unidad más pequeña que se puede enlazar es el fichero**. Cuando `PROYECCION-v1` necesita apoyarse en una de las treinta y cinco reglas de `ADR-0001`, enlazar al documento entero obliga al lector a buscar cuál. Copiar el párrafo es más cómodo, y por eso la duplicación aparece: no por descuido, sino porque enlazar sale más caro que copiar.

**El corpus ya resolvió este problema por su cuenta, en un solo sitio.** `ADR-0001 §4` numera sus invariantes de dominio con identificadores estables —`INV-C01` a `INV-C10`, `INV-L01` a `INV-L05`, `INV-P01` a `INV-P07`, `INV-$01` a `INV-$04`, `INV-D01`, `INV-J01` a `INV-J08`— y el resto del corpus los cita en lugar de reproducirlos. `INV-D01`, el determinismo de la proyección, se cita desde diez puntos distintos sin que su texto esté escrito dos veces.

Esa práctica funciona, nadie la decidió y nada la protege. Hoy es posible declarar dos veces el mismo identificador, citar uno que no existe o crearlo en un documento que no autoriza nada, y el corpus no se entera.

## Decisión

Se formaliza la identidad de afirmación como parte del contrato documental, y se comprueba.

### Qué es un identificador de afirmación

Una etiqueta estable que nombra **un hecho concreto dentro de un documento**, para poder citarlo sin reproducirlo. Dos familias, ambas ya en uso:

| Familia | Forma | Para qué |
|---|---|---|
| `INV-` | `INV-C01`, `INV-$04` | Invariantes de dominio, numerados por área. Es la notación existente en `ADR-0001` |
| `AF-` | `AF-DUENO-UNICO` | Afirmaciones normativas del resto del corpus |

Los identificadores de `AF-` son **semánticos, no correlativos**, por dos motivos. Una numeración global obliga a coordinar quién reserva el siguiente número, y dos ramas de trabajo en paralelo colisionan. Y sobre todo: un identificador se lee dentro de una frase, y `AF-DUENO-UNICO` transmite algo aunque quien lo lea no llegue a abrir el documento de origen. Un número correlativo no transmite nada.

### Cómo se declara

Dos formas, las dos ya presentes en el corpus:

```markdown
| INV-C02 | `carryIn(W+1) = carryOut(W)` |

Cada hecho vive en exactamente un documento. <!-- af: AF-DUENO-UNICO -->
```

La primera es una fila de tabla cuya primera celda es el identificador, tal y como está escrito `ADR-0001 §4`. La segunda es una marca al final de la frase, invisible al leer el documento renderizado y visible en el texto que consume un sistema de recuperación.

### Cómo se cita

Escribiendo el identificador. No hace falta enlace: el registro derivado dice dónde vive cada uno.

### Qué se comprueba

`npm run validate:corpus` falla si un identificador no tiene la forma acordada, si se declara dos veces, si lo declara un documento con `normativo: false`, o si un documento normativo cita uno que nadie declara.

Los rangos y las familias que el corpus escribe en prosa —«INV-C03–C09», «INV-C / INV-L / INV-P»— no se interpretan como citas: el comprobador exige el identificador completo.

### Alcance

**La adopción es incremental y bajo demanda.** No se anotan los cuarenta documentos normativos, ni se exige identificador a ninguna afirmación existente. La regla es una sola: **cuando un documento necesite un hecho que ya está escrito en otro, ese hecho recibe identificador y se cita**. Un identificador que nadie usa es trabajo administrativo sin destinatario.

Esta decisión no toca ningún documento inmutable. Los treinta y cinco invariantes de `ADR-0001` quedan reconocidos tal y como están escritos.

## Alternativas descartadas

**Enlazar a secciones con anclas de encabezado.** Markdown ya permite `documento.md#seccion`, y no requiere decidir nada. Se descarta porque el ancla la genera el texto del encabezado: reformular un título rompe todos los enlaces que apuntaban a él, en silencio y sin que ninguna comprobación lo note. Un identificador explícito sobrevive a la reescritura del texto que lo rodea, que es exactamente lo que se le pide a una identidad.

**Numeración global correlativa.** Más ordenada de leer en un índice. Se descarta por la coordinación que impone —dos ramas paralelas reservan el mismo número— y porque desperdicia la única oportunidad de que la cita signifique algo por sí misma.

**Trocear los documentos hasta que cada fichero contenga un solo hecho.** Resolvería la granularidad sin metadatos nuevos: si el fichero es el hecho, enlazar al fichero es citar el hecho. Se descarta porque destruye el documento como unidad de lectura. `ADR-0001` explica una decisión de arquitectura en cuatrocientas líneas que se leen seguidas; convertirlo en treinta y cinco ficheros lo haría ilegible para una persona y multiplicaría el número de documentos por un factor que `CANON §13` señala como degradación.

**Esperar a que un modelo detecte la duplicación semántica.** Es tentador y sería más cómodo: ningún metadato, ninguna disciplina. Se descarta como mecanismo principal porque un juicio no determinista no puede ser la puerta que decide si un cambio entra, y porque no resuelve el problema de origen: aunque el modelo detecte la copia, quien escribía seguía sin tener a dónde enlazar.

## Consecuencias aceptadas

**Un identificador es un compromiso.** Una vez citado desde otro documento, cambiarlo rompe las citas. El comprobador las detecta, así que el coste es visible y acotado, pero existe: elegir el nombre exige pensarlo una vez.

**El prefijo queda reservado.** Escribir `AF-` o `INV-` seguido de un nombre en mayúsculas dentro de un documento normativo se interpreta como cita y falla si no existe. Es el precio de detectar citas sin exigir una sintaxis de enlace más pesada.

**No detecta la duplicación, la hace evitable.** Que exista `AF-DUENO-UNICO` no impide que alguien reescriba la frase en otro documento. Lo que consigue es que enlazar sea tan barato como copiar, y que el hecho tenga un dueño nombrable. La detección léxica de solapamiento se aborda aparte, como informe y no como puerta.

**El registro derivado añade un fichero que mantener.** `.generated/AFIRMACIONES.md` se regenera y se compara byte a byte, con el mismo mecanismo que ya protege al resto de derivados. No es mantenimiento manual.
