# Indexación del repositorio

Qué parte de este repositorio es conocimiento y qué parte es ruido.

Existe porque de los **1.395 ficheros `.md`** que hay fuera de `node_modules`, **1.325 son copias de skills de terceros** repartidas en treinta directorios de herramientas de agente. Un indexador que recorra el repositorio sin este manifiesto construye un índice en el que el 95 % del material no habla de este producto. La consecuencia práctica es que una búsqueda sobre «cómo se calculan las horas extra» devuelve documentación de React antes que el dominio de nóminas.

**Esto no es documentación del producto y no entra en Marbella OS.** Es configuración de la frontera del repositorio, y por eso vive en la raíz: [CANON §11](marbella-os/CANON.md) excluye del corpus la configuración de herramienta.

## Clasificación

Toda ruta de primer nivel que contenga ficheros `.md` está en una de estas cuatro categorías. `npm run validate:corpus` falla si aparece una que no lo esté, para que un directorio nuevo no entre al índice sin que nadie lo haya decidido.

```yaml
# Fuente única de verdad. Se indexa entero.
corpus:
  - marbella-os/

# Artefactos derivados del corpus. Se indexan, nunca se citan como origen.
derivados:
  - marbella-os/.generated/

# Documentación real de este producto que vive fuera del corpus por decisión
# de CANON §11: está co-localizada con lo que documenta.
satelites:
  - supabase/
  - integrations/
  - reference/
  - sql/

# Ni se indexa ni se cita. Configuración del repositorio, documentación de
# terceros, copias espejo entre herramientas de agente y salidas de compilación.
excluir:
  - imports/
  - node_modules/
  - .next/
  - .github/
  - .agents/
  - skills/
  - .adal/
  - .augment/
  - .bob/
  - .claude/
  - .codebuddy/
  - .commandcode/
  - .continue/
  - .cortex/
  - .crush/
  - .factory/
  - .goose/
  - .iflow/
  - .junie/
  - .kilocode/
  - .kiro/
  - .kode/
  - .mcpjam/
  - .mux/
  - .neovate/
  - .openhands/
  - .pi/
  - .pochi/
  - .qoder/
  - .qwen/
  - .roo/
  - .trae/
  - .vibe/
  - .windsurf/
  - .zencoder/
```

## Qué puede citarse como norma

Estar indexado y ser citable no son lo mismo. Un documento **solo autoriza una decisión** si cumple las dos condiciones a la vez:

```
normativo: true    y    estado: vigente
```

Ambas viajan en el front-matter de cada documento, no en su ruta, precisamente para que sobrevivan al troceado. Un fragmento recuperado sin su carpeta sigue sabiendo si es norma.

De ahí se derivan tres consecuencias que un indexador debe respetar:

- **Los satélites no son normativos.** Documentan un artefacto concreto, no establecen reglas de producto. Ante discrepancia con el corpus, gana el corpus.
- **`marbella-os/6-investigacion/` se indexa pero no se cita.** Es buscable porque contiene la única traza de decisiones que nunca se registraron formalmente; no es citable porque un análisis con fecha nunca fue norma ([CANON §8](marbella-os/CANON.md)).
- **Los derivados no son origen.** Si `.generated/` contradice al corpus, el derivado está desactualizado y hay que regenerarlo, no creerlo.

El orden completo de prevalencia está en [CANON §6](marbella-os/CANON.md), proyectado a un entero comparable en el campo `precedencia` de cada documento y publicado en [`.generated/CARGA-DE-CONTEXTO.md`](marbella-os/.generated/CARGA-DE-CONTEXTO.md).

## Por qué no se borran los espejos

Los treinta directorios de herramientas son copias que cada agente instala por su cuenta. Borrarlos rompería esas herramientas y volverían a aparecer en la siguiente instalación. Excluirlos declarativamente cuesta una línea y sobrevive a que mañana haya treinta y uno.
