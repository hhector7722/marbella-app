---
documento: ADR-0004
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

# ADR-0004 · Grafo de dependencias entre documentos

## Contexto

`CANON §9` obliga a que un cambio de comportamiento actualice el documento que lo gobierna o declare por qué no procede. La regla presupone que quien cambia algo sabe **qué documentos quedan afectados**. Con cincuenta y seis documentos eso todavía se puede sostener leyendo; con doscientos, no.

El corpus ya tiene dependencias reales y no las declara en ningún sitio comprobable. La más clara está escrita en prosa dentro de `contratos/PROYECCION-v1`:

> Este contrato es **subordinado** a ADR-HE-SSOT-001. Si hubiera conflicto, **prevalece el ADR**. Este documento **no** modifica el ADR; solo lo operacionaliza.

Ese contrato cita además treinta y cinco invariantes de `ADR-0001`. Si mañana un `ADR-0005` sustituyera a `ADR-0001`, nada avisaría de que hay un contrato vigente que se apoya en él. La única forma de descubrirlo sería que alguien recordase la relación, y `CANON §13` ya clasifica «una norma que solo vive en la cabeza de alguien» como señal de degradación.

`precedencia` no resuelve esto. Responde a quién gana en un conflicto, no a quién se rompe cuando algo cambia. Son dos preguntas distintas y hoy solo hay respuesta para la primera.

## Decisión

Se añade al front-matter un campo **opcional** que declara de qué otros documentos depende:

```yaml
depende_de: CANON, ADR-0002
```

Los destinos se nombran por su campo `documento`, no por su ruta, para que mover un fichero no rompa el grafo. `npm run validate:corpus` comprueba que ese campo es único en el corpus, porque es la clave con la que unos documentos nombran a otros.

### Qué significa una dependencia

**`A depende_de B` quiere decir: si B cambia, A hay que revisarlo.** Es una relación de impacto, no de autoridad. Un ADR puede depender de un contrato sin dejar de prevalecer sobre él.

### Qué se comprueba

El validador falla si una dependencia apunta a un documento que no existe, a uno que no está `vigente`, o —cuando quien declara es normativo— a uno que no lo es. Apoyar una norma en material que el propio corpus declara no vinculante invierte la autoridad, y esa inversión sí es detectable.

También falla ante un ciclo. Un ciclo significa que ningún documento del grupo puede revisarse primero porque cada uno espera al otro; la respuesta correcta no es romper una arista cualquiera, sino decidir cuál de los dos es dueño del hecho compartido, que es `CANON §5`.

### Derivado

`.generated/GRAFO.md` publica el grafo **invertido**: para cada documento, quién se apoya en él. Las aristas se declaran en una dirección y se leen en la otra a propósito. Quien escribe un documento sabe en qué se apoya; quien va a cambiarlo necesita saber a quién arrastra.

### Alcance

**Adopción incremental.** El campo es opcional y no se exige retroactivamente. Se declara cuando la dependencia es explícita, no cuando es imaginable: casi todo documento del corpus «depende» de `GLOSARIO` en algún sentido, y declararlo produciría un grafo denso que no ayuda a decidir nada.

Esta decisión añade el campo a tres documentos: los dos que se están escribiendo ahora y `contratos/PROYECCION-v1`, cuya subordinación a `ADR-0001` ya está escrita en su propio texto.

## Alternativas descartadas

**Derivar el grafo de los enlaces markdown que ya existen.** No costaría ningún campo nuevo: los enlaces están puestos. Se descarta porque un enlace no distingue apoyarse de mencionar. Los índices de capa enlazan a todos sus documentos por navegación, `README` enlaza a casi todo el corpus, y el resultado sería un grafo casi completo en el que todo depende de todo. Un grafo que no discrimina no sirve para decidir qué revisar, y su falta de señal sería invisible: parecería informativo.

**Declarar la relación inversa, `afecta_a`.** Se leería directamente sin invertir nada. Se descarta porque obliga a editar el documento equivocado: al escribir un contrato nuevo que se apoya en un ADR habría que modificar el ADR, y los ADR son inmutables. La dirección elegida permite que un documento nuevo declare sus apoyos sin tocar nada anterior.

**Tipar la relación —`operacionaliza`, `refina`, `implementa`.** Más expresivo. Se descarta por ahora porque exige acertar el vocabulario antes de tener datos: con tres aristas no hay forma de saber qué tipos harían falta. Añadir un tipo más adelante es barato; retirar un vocabulario mal elegido que ya se usa en cien documentos, no.

**No hacer nada y confiar en `supersede` y en la revisión.** Es lo que hay hoy. Funciona mientras el corpus quepa en la memoria de quien lo mantiene, y falla exactamente cuando deja de caber, que es el escenario para el que se está construyendo todo esto.

## Consecuencias aceptadas

**Un grafo incompleto puede dar falsa tranquilidad.** Que un documento no aparezca como dependencia de nadie no significa que nadie dependa de él: significa que nadie lo ha declarado. El derivado lo dice expresamente, y esa advertencia no se puede quitar mientras la adopción sea incremental.

**Se toca el front-matter de un documento inmutable.** `contratos/PROYECCION-v1` recibe el campo sin que cambie una sola línea de su texto. Se apoya en el precedente que ya fijó [ADR-0002](ADR-0002-metadatos-operables-y-validador.md): el front-matter no es el contenido del documento, y modificarlo no altera ninguna decisión ni ningún contrato.

**El campo `documento` pasa a ser una clave.** Hasta ahora era descriptivo y podía repetirse sin consecuencias. A partir de aquí es único y comprobado, porque es lo que se nombra al declarar una dependencia.
