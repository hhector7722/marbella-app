---
documento: README
clase: vivo
estado: vigente
capa: raiz
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 3 meses
supersede: context/LLM_PROMPT.md (como índice del proyecto)
---

# Marbella OS

Corpus documental oficial de Bar La Marbella. Fuente única de verdad para producto, experiencia, interfaz, lenguaje visual, diseño, arquitectura e implementación.

**Si buscas la verdad sobre algo, está aquí o no está.** El código dice qué existe hoy; este corpus dice qué debe ser.

Antes de leer cualquier otra cosa: [CANON.md](CANON.md) explica cómo funciona esta documentación y qué autoridad tiene cada documento. [GLOSARIO.md](GLOSARIO.md) fija el significado de cada término.

---

## Por dónde empezar

| Si eres… | Lee en este orden |
|---|---|
| Nuevo en el proyecto | [CANON](CANON.md) → [GLOSARIO](GLOSARIO.md) → [VISION](1-producto/VISION.md) → [MAPA-DE-CAPACIDADES](1-producto/MAPA-DE-CAPACIDADES.md) → [ESTADO](5-estado/ESTADO.md) |
| Vas a diseñar una pantalla | [PRINCIPIOS](1-producto/PRINCIPIOS.md) → [EXPERIENCIA](2-diseno/EXPERIENCIA.md) → [TOKENS](2-diseno/TOKENS.md) → [PATRONES](2-diseno/PATRONES.md) → [SISTEMA-DE-COMPONENTES](2-diseno/SISTEMA-DE-COMPONENTES.md) |
| Vas a escribir código de interfaz | [FRONTEND](3-ingenieria/FRONTEND.md) → [SISTEMA-DE-COMPONENTES](2-diseno/SISTEMA-DE-COMPONENTES.md) → [TOKENS](2-diseno/TOKENS.md) |
| Vas a tocar reglas de negocio | [GLOSARIO](GLOSARIO.md) → [ADR vigentes](4-decisiones/README.md) → el documento de [dominio](3-ingenieria/dominio/) correspondiente |
| Vas a tocar datos o integraciones | [ARQUITECTURA](3-ingenieria/ARQUITECTURA.md) → [MODELO-DE-DATOS](3-ingenieria/MODELO-DE-DATOS.md) → [SEGURIDAD](3-ingenieria/SEGURIDAD.md) → [integraciones](3-ingenieria/integraciones/README.md) |
| Necesitas saber cómo está el proyecto | [ESTADO](5-estado/ESTADO.md) → [DEUDA](5-estado/DEUDA.md) → [ROADMAP](5-estado/ROADMAP.md) |
| Eres un agente de IA | [CANON §12](CANON.md#12-reglas-para-agentes-de-ia) |

## Qué leer según lo que vas a tocar

La tabla anterior es un itinerario de entrada. Esta responde a otra pregunta: ya sabes qué vas a cambiar y necesitas saber **qué lo gobierna**. Nadie tiene que leer el corpus entero para tocar una pantalla.

Es la fuente única de esta correspondencia. La regla de agente de `.cursor/rules/` no la copia: la deriva a `marbella-os/.generated/`.

| Vas a tocar | Lee |
|---|---|
| Cualquier cosa, para situarte | [ARQUITECTURA](3-ingenieria/ARQUITECTURA.md) |
| Cualquier cosa, para saber cómo está | [ESTADO](5-estado/ESTADO.md), [DEUDA](5-estado/DEUDA.md) |
| Una pantalla o un componente | [EXPERIENCIA](2-diseno/EXPERIENCIA.md), [TOKENS](2-diseno/TOKENS.md), [PATRONES](2-diseno/PATRONES.md), [SISTEMA-DE-COMPONENTES](2-diseno/SISTEMA-DE-COMPONENTES.md) |
| Código de interfaz | [FRONTEND](3-ingenieria/FRONTEND.md) |
| Textos, etiquetas, formatos numéricos | [CONTENIDO-Y-TONO](2-diseno/CONTENIDO-Y-TONO.md) |
| Un documento impreso | [DOCUMENTOS-IMPRESOS](2-diseno/DOCUMENTOS-IMPRESOS.md) |
| Datos: leer, escribir, migrar | [MODELO-DE-DATOS](3-ingenieria/MODELO-DE-DATOS.md) |
| Permisos, políticas de acceso, secretos, archivos | [SEGURIDAD](3-ingenieria/SEGURIDAD.md) |
| Roles o quién puede hacer qué | [ACTORES-Y-ROLES](1-producto/ACTORES-Y-ROLES.md) |
| Pruebas o verificación de un cambio | [CALIDAD](3-ingenieria/CALIDAD.md) |
| Una fórmula de negocio | [dominio/](3-ingenieria/dominio/README.md), [4-decisiones/](4-decisiones/README.md) |
| Horas, nóminas o coste laboral | [ADR-0001](4-decisiones/ADR-0001-hours-engine-productor-unico.md), [COSTE-LABORAL](3-ingenieria/dominio/COSTE-LABORAL.md), [JORNADA-FIJA](3-ingenieria/dominio/JORNADA-FIJA.md) |
| Precios de ingredientes o albaranes | [PRECIOS-Y-COMPRAS](3-ingenieria/dominio/PRECIOS-Y-COMPRAS.md) |
| Un sistema externo | [integraciones/](3-ingenieria/integraciones/README.md) |
| Un despliegue o una tarea programada | [operacion/](3-ingenieria/operacion/README.md) |
| La propia documentación | [CANON](CANON.md) |

Dos comprobaciones que no dependen de la materia: que la dirección que vas a proponer no esté ya descartada en [VISION](1-producto/VISION.md), y que, ante dos soluciones válidas, arbitre [PRINCIPIOS](1-producto/PRINCIPIOS.md), que además fija el orden de prioridad.

---

## 1. Producto — qué es Marbella y para quién

| Documento | Clase | Estado | Gobierna |
|---|---|---|---|
| [VISION](1-producto/VISION.md) | constitucional | vigente | Por qué existe el producto y qué no va a ser |
| [PRINCIPIOS](1-producto/PRINCIPIOS.md) | constitucional | vigente | Criterios que arbitran cuando hay varias soluciones válidas |
| [ACTORES-Y-ROLES](1-producto/ACTORES-Y-ROLES.md) | vivo | vigente | Quién usa el producto, con qué permisos y en qué contexto |
| [MAPA-DE-CAPACIDADES](1-producto/MAPA-DE-CAPACIDADES.md) | vivo | vigente | Catálogo de dominios funcionales y su estado |
| [RECORRIDOS](1-producto/RECORRIDOS.md) | vivo | vigente | Recorridos críticos que cruzan capacidades |
| [capacidades/](1-producto/capacidades/) | vivo | parcial | Una especificación funcional por capacidad, bajo demanda |

## 2. Diseño — cómo se percibe y cómo se comporta

| Documento | Clase | Estado | Gobierna |
|---|---|---|---|
| [EXPERIENCIA](2-diseno/EXPERIENCIA.md) | constitucional | vigente | Leyes de interacción: táctil, densidad, feedback, error, espera |
| [LENGUAJE-VISUAL](2-diseno/LENGUAJE-VISUAL.md) | constitucional | vigente | Identidad: color, tipografía, retícula, forma, iconografía |
| [TOKENS](2-diseno/TOKENS.md) | vivo | vigente | Contrato de valores visuales. Origen único de todo color y medida |
| [PATRONES](2-diseno/PATRONES.md) | vivo | vigente | Composiciones recurrentes por encima del componente |
| [SISTEMA-DE-COMPONENTES](2-diseno/SISTEMA-DE-COMPONENTES.md) | vivo | vigente | Contrato de cada componente: propósito, anatomía, estados |
| [CONTENIDO-Y-TONO](2-diseno/CONTENIDO-Y-TONO.md) | vivo | vigente | Microcopy, formatos, reglas de visualización de valores |
| [DOCUMENTOS-IMPRESOS](2-diseno/DOCUMENTOS-IMPRESOS.md) | vivo | vigente | El PDF como superficie de primera clase |

## 3. Ingeniería — cómo está construido

Índice de la capa: [3-ingenieria/README.md](3-ingenieria/README.md).

| Documento | Clase | Estado | Gobierna |
|---|---|---|---|
| [ARQUITECTURA](3-ingenieria/ARQUITECTURA.md) | vivo | vigente | Piezas, capas y circulación de un dato de origen a pantalla |
| [MODELO-DE-DATOS](3-ingenieria/MODELO-DE-DATOS.md) | vivo | vigente | Entidades y **autoridad de cada magnitud** |
| [SEGURIDAD](3-ingenieria/SEGURIDAD.md) | vivo | vigente | Identidad, autorización, políticas de acceso, secretos, archivos |
| [CALIDAD](3-ingenieria/CALIDAD.md) | vivo | vigente | Qué se prueba, qué se comprueba a mano y qué no existe |
| [FRONTEND](3-ingenieria/FRONTEND.md) | vivo | vigente | Reglas de construcción de la interfaz |
| [dominio/](3-ingenieria/dominio/README.md) | vivo | vigente | Fórmulas de negocio: coste laboral, jornada fija, precios y compras |
| [contratos/](3-ingenieria/contratos/README.md) | inmutable | vigente | Contratos formales versionados entre partes del sistema |
| [integraciones/](3-ingenieria/integraciones/README.md) | vivo | vigente | Una por sistema externo: punto de venta y nóminas |
| [operacion/](3-ingenieria/operacion/README.md) | vivo | vigente | Despliegues, tareas programadas y recuperación |

La revisión que produjo estos cuatro documentos encontró **cuatro agujeros de acceso** y **tres huecos en el andamiaje de pruebas**, registrados como [D19 a D26](5-estado/DEUDA.md). Los cuatro de acceso se reparan con una migración cada uno.

## 4. Decisiones — por qué es así

Registro de decisiones de arquitectura. Inmutables, numeración global, secuencial y sin huecos.

**La lista está en [4-decisiones/README.md](4-decisiones/README.md)**, junto con las reglas de cuándo se escribe una decisión y las **cuatro decisiones tomadas y no registradas**, que están vigentes en el código sin que nadie pueda saber por qué se tomaron. Aquí no se repite: mantener la misma tabla en dos sitios ya la desincronizó una vez.

## 5. Estado — dónde estamos

| Documento | Clase | Estado | Gobierna |
|---|---|---|---|
| [ESTADO](5-estado/ESTADO.md) | vivo | vigente | Fotografía del presente. Qué está vivo, a medias, roto o tolerado |
| [ROADMAP](5-estado/ROADMAP.md) | vivo | vigente | Qué viene y por qué |
| [CHANGELOG](5-estado/CHANGELOG.md) | inmutable | vigente | Historial cronológico |
| [DEUDA](5-estado/DEUDA.md) | vivo | vigente | Compromisos asumidos a sabiendas, con coste y disparador |

## 6. Investigación — qué exploramos

| Ubicación | Contenido |
|---|---|
| [6-investigacion/](6-investigacion/README.md) | Índice de la capa y reglas |
| [6-investigacion/rfc/](6-investigacion/rfc/README.md) | Propuestas abiertas a discusión. Ninguna ahora mismo |
| [6-investigacion/spikes/](6-investigacion/spikes/README.md) | Siete análisis y auditorías con fecha. **No normativos** |
| [6-investigacion/archivo/](6-investigacion/archivo/README.md) | Corpus histórico congelado, incluido el antiguo estado del proyecto. **No normativo** |

---

## Documentación que vive fuera de Marbella OS

Por decisión explícita de [CANON §11](CANON.md#11-qué-no-entra-en-marbella-os):

- [supabase/migrations/](../supabase/migrations/README_MIGRACIONES.md) — Documentación de las migraciones, co-localizada con ellas. Enlazada desde [operacion/](3-ingenieria/operacion/README.md).
- [integrations/](../integrations/README.md) — Código que se ejecuta fuera de la aplicación: extractor del punto de venta, pasarela y scripts de correo. Su documentación sí está aquí, en [integraciones/](3-ingenieria/integraciones/README.md).
- [reference/legacy-bdp/](../reference/legacy-bdp/README.md) — Esquemas y ejemplos del sistema heredado. Material de consulta congelado, no documentación de Marbella.
- `sql/diagnostics/` — Consultas de verificación puntual. No son migraciones ni norma.
- `assets/` — Material comercial y activos que consume la aplicación.
- [.cursor/rules/](../.cursor/rules/) — Reglas ejecutables para agentes. **Derivan** de Marbella OS y no pueden introducir norma propia.
- `marbella-os/.generated/` — Artefactos derivados. Nunca se editan a mano y no son fuente de nada.
- [INDEXACION.md](../INDEXACION.md) — Manifiesto que declara qué directorios del repositorio son conocimiento y cuáles ruido. Léelo antes de indexar nada.

---

## Convenciones rápidas

- Un hecho vive en un solo documento. Los demás enlazan.
- Solo `estado: vigente` autoriza a citar un documento como verdad.
- Un análisis con fecha nunca es norma.
- Un cambio de comportamiento visible toca su documento o declara por qué no.
- Los colores y las medidas salen de [TOKENS](2-diseno/TOKENS.md), nunca del componente.

El detalle de cada regla está en [CANON.md](CANON.md).
