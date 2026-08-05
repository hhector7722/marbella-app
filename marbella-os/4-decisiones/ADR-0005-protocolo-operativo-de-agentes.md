---
documento: ADR-0005
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-08-05
depende_de: CANON, ADR-0002
supersede: —
---

# ADR-0005 · Protocolo operativo de agentes

## Contexto

`CANON §12` establece diez reglas para el trabajo de agentes de IA sobre el repositorio. `ADR-0002` observó que "el corpus codifica su gobierno en prosa y confía su cumplimiento a la disciplina", diagnosticando correctamente por qué un agente que empieza de cero cada vez y consume fragmentos acaba ignorando las normas de producto.

`ADR-0002` resolvió la parte estática del problema (metadatos operables y un validador que falla si la documentación miente), pero no la dinámica: el flujo de trabajo del propio agente. Hoy, un agente recibe una tarea y procede inmediatamente a modificar código, evaluando las reglas del corpus —si acaso— de forma retrospectiva o casual. El resultado comprobado es que las decisiones de arquitectura se erosionan incrementalmente porque el agente no comprende el dominio antes de tocarlo.

## Decisión

Se establece el **Protocolo Operativo de Agentes de IA**, un documento normativo vivo en la capa de ingeniería (`PROTOCOLO-AGENTES.md`) que operacionaliza las reglas de `CANON §12`.

El protocolo impone que **el conocimiento precede a la acción**: define un ciclo de vida con fases obligatorias (orientación, comprensión, verificación previa) que deben completarse *antes* de proponer o ejecutar cualquier modificación de código. Además, clasifica las restricciones del corpus en condiciones de bloqueo (duro, blando, informativo) que el agente debe respetar y, de ser necesario, escalar al usuario.

Para garantizar el descubrimiento automático por parte de distintas herramientas de IA, se crean **puntos de entrada agnósticos y específicos en la raíz del repositorio** (e.g., `AGENTS.md`, `CLAUDE.md`).

## Alternativas descartadas

**Ampliar `CANON §12`.** Incorporar todo el flujo operativo directamente en el CANON haría el documento fundacional demasiado largo y prescriptivo en asuntos de herramientas. Un documento vivo separado en la capa de ingeniería permite iterar sobre las responsabilidades del agente sin tener que revisar la constitución documental del proyecto.

**Crear una skill específica en `.agents/skills/`.** Ataría la norma a las herramientas que soportan ese formato concreto de skills (Gemini, Antigravity) y la ocultaría al resto (Cursor, Claude, Copilot). El protocolo aplica a cualquier ente no humano que toque el repositorio.

**Ficheros de instrucciones distribuidos por herramienta.** Mantener las mismas instrucciones copiadas en `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, etc. Se descarta por ser una violación directa de `AF-DUENO-UNICO`. Los puntos de entrada derivan del protocolo, enlazan hacia él y **no** introducen ni repiten normas propias.

## Consecuencias aceptadas

**Dependencia de la adopción externa.** El corpus no puede obligar a un agente a leer `AGENTS.md` si su implementación no lo soporta. El mecanismo de defensa definitivo sigue siendo `validate:corpus` (que el agente debe pasar si tocó documentación), pero la orientación y comprensión tempranas requieren la cooperación de la herramienta de IA.

**Mantenimiento de los puntos de entrada.** Se añaden ficheros de configuración fuera de `marbella-os/` (excluidos del corpus por `CANON §11`) que deben mantenerse coherentes con el documento normativo interno, minimizando su contenido a meros "punteros" para mitigar el riesgo de desincronización.
