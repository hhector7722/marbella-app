---
documento: ADR-0002
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-07-29
supersede: —
---

# ADR-0002 · Metadatos operables y validador del corpus

## Contexto

Marbella OS se escribió para ser leído por personas y por modelos. `CANON §12` lo declara expresamente. La revisión del corpus desde la perspectiva de un sistema de recuperación encontró que esa segunda mitad del objetivo no se cumple, y que el motivo no está en el texto sino en el soporte.

Tres hechos medidos sobre el corpus el 2026-07-29:

**El material no normativo no se declara como tal dentro del texto.** Los once documentos de `6-investigacion/spikes/` y `6-investigacion/archivo/` no tienen front-matter, en incumplimiento directo de `CANON §4`. Su condición de no-norma está escrita siete veces en documentos vecinos —los tres índices de la capa, `CANON §3`, `CANON §8`, `ESTADO` y la regla de agente— y ninguna vez dentro de los propios documentos. Un lector humano ve la carpeta; un sistema de recuperación recibe un fragmento de texto sin carpeta. Estos once documentos suman el 54 % del volumen del corpus.

**El campo que decide la autoridad no discrimina.** `CANON §4` designa `estado: vigente` como «la única palabra que autoriza a citarlo como verdad». Los cuarenta y dos documentos que declaran el campo dicen `vigente`. Filtrar por él no excluye nada, porque los documentos que debería excluir son precisamente los que no lo tienen.

**Ninguna regla de CANON está comprobada.** `CANON §13` enumera cuatro señales de degradación del corpus. Las cuatro son detectables por una máquina y ninguna se detecta. En el momento de esta decisión, dos ya están activas: hay hechos duplicados entre `ADR-0001` y `contratos/PROYECCION-v1`, y hay norma que solo vive en configuración de herramienta, en una copia desincronizada de la regla de agente que ordena leer dos directorios eliminados. El propio `CANON §13` predijo este resultado: «Si las reglas 5, 9 y 10 no se cumplen, el corpus volverá exactamente al estado anterior, solo mejor ordenado al principio».

El patrón común a los tres es el mismo: **el corpus codifica su gobierno en prosa y confía su cumplimiento a la disciplina**. Funciona con un lector que retiene contexto entre sesiones. No funciona con un agente que empieza de cero cada vez y consume fragmentos.

## Decisión

Se amplía el front-matter obligatorio de `CANON §4` con dos campos, y se crea un validador ejecutable que comprueba el cumplimiento de las reglas de `CANON`.

### Campos nuevos

**`normativo: true | false`.** Declara si el documento autoriza decisiones. Es obligatorio en todos los documentos del corpus, incluidos los congelados. Es independiente de `clase` y de `estado`, y esa independencia es el motivo de que exista: `clase: inmutable` agrupa hoy a los ADR, a los contratos versionados, al changelog y a los análisis fechados, que tienen rangos de autoridad radicalmente distintos.

**`precedencia: N`.** Entero que proyecta el orden de prevalencia de `CANON §6` a un valor comparable sin razonar:

```
100  CANON
 80  ADR vigente
 60  constitucional
 40  contrato versionado
 20  vivo
  0  no normativo
```

La norma sigue viviendo en `CANON §6`. El campo es su proyección operable, no su sustituto. El validador comprueba que el valor declarado es coherente con `clase`, `capa` y `estado`, de modo que el campo no puede afirmar una autoridad que la norma no le concede.

### Validador

Se crea `scripts/validate-marbella-os.ts`, ejecutable con `npm run validate:corpus`, que comprueba las reglas de `CANON` que son verificables por máquina y falla con código de salida distinto de cero.

La comprobación de integridad de enlaces se aplica **solo a documentos normativos**. Los documentos congelados tienen enlaces que no resuelven por diseño, tal y como declaran `6-investigacion/archivo/README.md` y `6-investigacion/spikes/README.md`: corregirlos exigiría editar material inmutable, y un documento histórico corregido deja de ser histórico. Exigirles integridad referencial contradiría `CANON §3`.

### Alcance

Esta decisión cubre la capa de metadatos y su verificación. **No** cubre dos cosas que la misma revisión identificó y que requerirán decisión propia: los identificadores estables por afirmación normativa, y el grafo de dependencias tipado entre documentos. El validador se diseña para poder absorber ambos sin rehacerse.

## Alternativas descartadas

**Dejar el gobierno en prosa y reforzar la disciplina.** Es lo que se hizo al crear el corpus y es lo que falló en menos de una semana, con el propio `CANON` prediciendo el fallo. Una regla que depende de que todo el que escriba la recuerde tiene una tasa de cumplimiento que decae con el número de autores, y el número de autores de este corpus va a crecer con agentes, no con personas.

**Resolver la autoridad en la capa de indexación en lugar de en el documento.** Es decir, mantener el corpus como está y hacer que el sistema de recuperación aplique las reglas al indexar. Se descarta por dos motivos. Primero, ata el corpus a una implementación concreta de recuperación, cuando el objetivo declarado es que siga siendo válido dentro de diez años y con herramientas que hoy no existen. Segundo, no protege contra el fragmento que llega por otra vía: una búsqueda de texto, un índice desactualizado o el contexto que otro agente arrastra. La marca tiene que viajar con el texto.

**Deducir la autoridad de la ruta del fichero.** Todo lo que esté bajo `6-investigacion/` es no normativo, y basta con eso. Se descarta porque la ruta no sobrevive al troceado: el fragmento que llega a la ventana de contexto es texto, no una ruta. Además ya se ha comprobado empíricamente que un índice puede devolver rutas de ficheros eliminados.

**Ampliar `estado` con más valores en lugar de añadir `normativo`.** Sería más económico, pero mezcla dos ejes independientes. Un ADR `superado` es inmutable y no normativo; un spike es inmutable y nunca fue normativo; un borrador es vivo y todavía no es normativo. Un solo campo tendría que codificar dos dimensiones y volvería a exigir razonamiento para interpretarse, que es justo lo que se quiere evitar.

**Borrar el archivo histórico para eliminar el ruido de golpe.** Resolvería el 33 % del volumen de un plumazo, y git conserva el contenido. Se descarta porque `6-investigacion/archivo/README.md` justifica su conservación con un argumento que sigue siendo válido: contiene la única traza de decisiones que nunca se registraron formalmente. El ruido se elimina excluyéndolo de la indexación, que consigue el mismo efecto sin destruir la única fuente de esas decisiones.

## Consecuencias aceptadas

**Todos los documentos hay que tocarlos.** Cincuenta y tres ficheros reciben dos campos nuevos. Es un cambio mecánico y de una sola vez, pero es un cambio en documentos constitucionales e inmutables, incluido `CANON`. Se acepta porque el front-matter no es el contenido del documento: modificarlo no altera ninguna decisión ni ninguna norma. El texto de los ADR y de los contratos no se toca.

**El corpus adquiere una dependencia ejecutable.** Hasta ahora Marbella OS era texto puro y podía leerse sin nada instalado. A partir de ahora hay un script que debe pasar. `CANON §11` prohíbe el código dentro del corpus, y por eso el validador vive en `scripts/`, fuera de `marbella-os/`, igual que las migraciones viven en `supabase/`. El corpus sigue siendo texto; lo que se añade es una herramienta que lo comprueba desde fuera.

**Habrá que mantener dos campos más.** Cada documento nuevo tiene dos campos más que rellenar. El coste es real y es la razón de que sean dos y no ocho: se eligieron los dos que resuelven fallos críticos observados, y se dejó fuera todo lo que resolvía fallos hipotéticos.

**El validador se convierte en una puerta.** Un cambio que rompa una regla de `CANON` dejará de poder integrarse. Eso es el objetivo, y también significa que un validador mal calibrado bloquea trabajo legítimo. Se mitiga distinguiendo error de aviso: la caducidad excedida avisa, la falta de front-matter falla.

**No resuelve la duplicación de hechos.** `CANON §5` es la regla más valiosa del corpus y sigue sin poder comprobarse automáticamente, porque detectar que dos documentos afirman lo mismo exige entender lo que dicen. Esta decisión no lo intenta. La detección de duplicados necesitará identificadores estables por afirmación, que es materia de otra decisión.
