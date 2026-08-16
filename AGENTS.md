# Marbella App — Instrucciones para agentes de IA

Este proyecto tiene un corpus documental normativo: **Marbella OS** (`marbella-os/`).
Es la fuente única de verdad. Este fichero **deriva** de ese corpus y **no puede
introducir norma propia**. Si algo de aquí contradice un documento de Marbella OS,
gana el documento.

## Protocolo obligatorio

Antes de modificar cualquier fichero de este proyecto, lee y sigue el protocolo
operativo en `marbella-os/3-ingenieria/PROTOCOLO-AGENTES.md`. Define el ciclo de
vida completo de una tarea: desde la recepción hasta el cierre.

## Punto de entrada

Lee siempre en este orden:

1. `marbella-os/README.md` — índice del corpus.
2. `marbella-os/CANON.md` — cómo funciona la documentación y qué autoridad tiene.
3. `marbella-os/GLOSARIO.md` — significado exacto de cada término.
4. `marbella-os/3-ingenieria/PROTOCOLO-AGENTES.md` — el protocolo que gobierna tu trabajo.

## Carga de contexto según la tarea

No leas todo el corpus. Lee lo que gobierna lo que vas a tocar.

La tabla está en `marbella-os/.generated/CARGA-DE-CONTEXTO.md`.
Se genera desde el corpus y `npm run validate:corpus` comprueba que no se ha
quedado atrás.

Otros derivados útiles:

- `marbella-os/.generated/AFIRMACIONES.md` — hechos citables. Antes de escribir
  un hecho que sospeches que ya existe, búscalo aquí.
- `marbella-os/.generated/GRAFO.md` — qué documentos revisar cuando cambia otro.
- `marbella-os/.generated/OBSOLESCENCIA.md` — cuándo caduca cada documento vivo.
- `marbella-os/.generated/PRECEDENCIA.json` — autoridad de cada documento,
  consumible por máquina.

## Frontera del repositorio

Lee `INDEXACION.md` antes de indexar o buscar en el repositorio. El 95% de los
ficheros markdown son copias de skills de terceros y no hablan de este producto.

## Normas de aplicación inmediata

Resumen operativo de lo que más se incumple. Cada línea es una cita, no una norma
nueva; el documento citado manda.

- **Táctil mínimo de 48 px** en todo elemento interactivo → `EXPERIENCIA.md`.
- **Cero se muestra como espacio en blanco** en lectura, nunca en formularios →
  `CONTENIDO-Y-TONO.md`.
- **Las zonas de interacción no colapsan** → `FRONTEND.md`.
- **Prohibido `new Date('YYYY-MM-DD')`** para fechas locales → `FRONTEND.md`.
- **Colores y medidas salen de los tokens**, nunca del componente → `TOKENS.md`.
- **Una magnitud, un productor.** Ninguna pantalla recalcula lo que ya calcula un
  motor → `PRINCIPIOS.md §3`.
- **No inventes nombres de tabla ni de columna.** El acceso a datos no tiene tipos
  → `MODELO-DE-DATOS.md`.
- **Nunca concedas permisos a `anon`** sin decisión explícita → `SEGURIDAD.md`.
- **Nunca supongas reglas de horas extra por convenio genérico** → `ADR-0001`.
- **Antes de crear UI, se busca** la pieza en `SISTEMA-DE-COMPONENTES.md`. Si existe, se reutiliza. → `SISTEMA-DE-COMPONENTES.md` §4.
- **Prohibido un sistema paralelo** de overlay, portal, backdrop, z-index, Escape o scroll-lock cuando existe pieza de sistema. → `SISTEMA-DE-COMPONENTES.md` §2 Modal, `ADR-0007`.
- **Si el inventario no cubre la necesidad, se para y se pregunta.** No se inventa pieza ni variante de sistema. → `PROTOCOLO-AGENTES.md` Fase ④, `SISTEMA-DE-COMPONENTES.md` §4.8.

## Validación

- Si modificas documentos de Marbella OS: ejecuta `npm run validate:corpus`.
- El pre-commit lo hace automáticamente si tocas el corpus.
- La integración en `main` lo hace con severidad máxima.

## Idioma

Responde siempre en español.
