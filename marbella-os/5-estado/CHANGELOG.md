---
documento: CHANGELOG
clase: inmutable
estado: vigente
capa: estado
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: no aplica
supersede: PROJECT_STATUS.md (función de historial)
---

# CHANGELOG

Historial cronológico de Marbella. **Append-only**: se añade arriba y nunca se edita ni se reordena lo anterior.

Este documento responde a «¿qué cambió y cuándo?». Para «¿cómo está el producto hoy?» está [ESTADO](ESTADO.md). Separar esas dos preguntas es la corrección estructural de mayor impacto de toda la arquitectura documental: antes compartían un fichero de 1.288 líneas donde la segunda era irrespondible.

## Qué se anota aquí

- Capacidades que nacen, cambian de comportamiento visible o se retiran.
- Reglas de negocio que cambian.
- Decisiones estructurales, con enlace a su ADR.
- Deuda pagada y deuda aceptada.
- Cambios de terminología de uso frecuente.
- Cambios en el propio corpus documental.

## Qué no se anota

- Correcciones de defectos sin consecuencia visible.
- Refactorizaciones internas sin cambio de comportamiento.
- Detalle de implementación. Eso está en git.

## Formato

Una entrada por cambio, agrupadas por fecha descendente. Cada entrada: qué cambió, para quién y con qué consecuencia. Una o dos frases. Si necesita más, necesita un ADR o una especificación, y aquí solo va el enlace.

## 2026-08-15

- **Contrato oficial de Modal del Design System.** Se evoluciona `ui/modal.tsx` con variantes tipadas (`compact`/`standard`/`work`/`day`/`amplify`), slot Footer fijo, capas semánticas, identidad `data-*` y excepción `ConsumptionBottomSheet`. Nesting limitado a una superficie derivada ([ADR-0007](../4-decisiones/ADR-0007-modal-superficie-derivada.md)). Consumidores (Albaranes, etc.) aún no migrados.
- **Nace el piloto de Design System de pantalla.** Tokens mínimos adoptados en CSS/Tailwind y primer componente oficial `DashboardShortcut`, usado por la rejilla Master. Staff/Admin aún no migrados. Studio sin capas nuevas; el componente emite identidad estable (`data-component` / `data-variant` / `data-instance`) para lectura futura.

## 2026-08-13

- **Evidence en albaranes filtra candidatas OCR por línea.** Sin provenance, el modal solo lista filas del documento razonablemente similares a la línea seleccionada (reutiliza `nameSimilarity` del matcher con umbral de UI `0.4`); con provenance, solo la fila vinculada. Ya no se vuelcan AGUA/APEROL al abrir FRANKFURT.
- **Líneas de albarán en móvil van en una sola fila horizontal.** En smartphone se oculta el nombre OCR del proveedor y se mantienen visibles cantidad, precio e importe alineados; el escritorio conserva la composición previa.
- **Evidence en albaranes permite revisión manual de provenance.** Si una línea no tiene vínculo documental, el modal carga el OCR existente y deja confirmar la fila OCR sin tocar el mapeo de producto ni los valores operativos.

## 2026-08-10

- **Se integra la IA Diseñadora (Copiloto Creativo) en la arquitectura de Marbella Design Studio.** Convivencia entre diseño manual y asistido por IA para todas las superficies (modales, formularios, tablas, KPIs, dashboards, etc.) con selección inicial "¿Cómo quieres empezar?", generación múltiple de variantes editables y panel de chat conversacional para refinamiento continuo sin destruir variantes previas.
- **Nace Design Academy en Marbella Design Studio.** Un espacio interactivo exclusivo de aprendizaje e inspiración de patrones de producto líderes (Linear, Stripe, Vercel, Apple, Notion), con experimentación en tiempo real de densidad/contraste, estudio comparativo de decisiones de diseño y botón de translación de filosofía a Marbella OS.

---

## 2026-08-08

- **Marbella Studio se convierte en un editor visual interactivo estilo Figma/Framer/Penpot.** Se elimina la edición de JSON/JSX para ofrecer interacción directa sobre el lienzo con selección de componentes, insignias de tipo, barra flotante de acciones rápidas (mover, duplicar, eliminar), panel izquierdo de capas e inserción, y panel derecho de inspector visual de propiedades no-code.

---

## 2026-07-30

- **Las reglas de CANON que una máquina puede comprobar las comprueba una máquina.** `npm run validate:corpus` verifica catorce invariantes del corpus y falla el cambio que los rompa: se ejecuta en el hook local, que se activa una vez por clon con `npm run hooks:install`, y en integración continua. En `main`, un documento vivo que supere su caducidad **bloquea**; en una rama solo avisa, para no frenar un cambio por un documento ajeno.
- **Se declara qué parte del repositorio es conocimiento.** [`INDEXACION.md`](../../INDEXACION.md) clasifica todo directorio con markdown como corpus, derivado, satélite o ruido. Existía un motivo medido: de los 1.395 ficheros markdown del repositorio, 1.325 son copias de skills de terceros que instalan treinta herramientas de agente. Un directorio nuevo sin clasificar falla la validación.
- **Un hecho se puede citar sin copiarlo.** [ADR-0003](../4-decisiones/ADR-0003-identidad-de-afirmacion.md) formaliza los identificadores estables de afirmación, generalizando la notación que `ADR-0001` ya usaba para sus treinta y cinco invariantes de dominio. El registro está en `.generated/AFIRMACIONES.md`, y el más citado del corpus resulta ser `INV-D01`, el determinismo de la proyección, con diez citas.
- **Un documento puede declarar en qué se apoya.** [ADR-0004](../4-decisiones/ADR-0004-grafo-de-dependencias.md) añade el campo opcional `depende_de` y publica el grafo invertido en `.generated/GRAFO.md`, que responde a la pregunta que surge al cambiar algo: qué hay que revisar. La subordinación de `contratos/PROYECCION-v1` a `ADR-0001`, que solo estaba escrita en prosa, pasa a ser comprobable.
- **Se detecta la norma que vive fuera del corpus.** La validación avisa cuando una regla de herramienta de agente no cita ningún documento de Marbella OS, y cuando un documento lleva más de noventa días sin salir de `propuesto`. La primera ejecución encontró dos reglas que fijan comportamiento obligatorio de modales y de documentos imprimibles sin que eso esté escrito en ninguna parte del corpus: queda registrado en [DEUDA](DEUDA.md) como `D27`.
- **La regla del dueño único deja de ser invisible.** `npm run report:overlap` compara el vocabulario de los párrafos de documentos normativos y lista los que más se parecen. No bloquea nada: parecerse no es afirmar lo mismo. Su primera ejecución encontró que la tabla de decisiones vivía duplicada en dos índices, y se ha resuelto dejándola en uno solo.

---

## 2026-07-29

- **La rejilla de asistencia de plantilla pasa a lectura tipográfica.** En `/staff/history`, cuando el responsable ve los fichajes de todo el equipo, cada registro se lee como iniciales en negro seguidas del tramo horario: sin círculos de color, sin tarjetas con marco ni relleno para los tipos especiales, y con la hora sin minutos ni cero inicial (`08:30` se lee `8`). El tipo se comunica solo con color y palabra: entrada en verde y salida en roja para lo regular, todo en rojo si falta el registro, y **Festivo**, **Enfermo**, **Baja** o **Personal** escritos completos en lugar de las letras `F`, `E`, `B` y `P`.
- **Se crea Marbella OS**, el corpus documental oficial, en `marbella-os/`. Sustituye a la documentación dispersa de `docs/` y `context/` y establece la fuente única de verdad para producto, diseño e implementación. Su constitución está en [CANON](../CANON.md).
- **Se congela el historial anterior.** Las 1.288 líneas de `PROJECT_STATUS.md` se archivan como corpus histórico no normativo. Desde esta fecha, el historial se escribe aquí y el estado en [ESTADO](ESTADO.md).
- **Se promueve la decisión del dominio de horas a [ADR-0001](../4-decisiones/ADR-0001-hours-engine-productor-unico.md)**, con numeración global y separando explícitamente la inmutabilidad de su texto de la vigencia de su decisión.
- **Se declaran como norma de producto las reglas que vivían únicamente en la configuración de las herramientas de desarrollo**: mínimo táctil, indeformabilidad de las zonas de acción, inmunidad de zona horaria, prohibición de fallos silenciosos y regla del valor vacío. Ahora están en [PRINCIPIOS](../1-producto/PRINCIPIOS.md), [EXPERIENCIA](../2-diseno/EXPERIENCIA.md) y [CONTENIDO-Y-TONO](../2-diseno/CONTENIDO-Y-TONO.md).
- **Se publica el contrato de tokens visuales** en [TOKENS](../2-diseno/TOKENS.md), normalizando los valores que el producto ya usa. Es el paso previo indispensable para tener componentes base.
- **Se registra la deuda del producto con dueño y disparador** en [DEUDA](DEUDA.md), extraída de informes de auditoría que nadie mantenía. De los cinco hallazgos «críticos» del informe de mapeo con la realidad, cuatro ya no existían en el código: quedan documentados como prueba de que un informe con fecha no es norma.
- **El código de integración deja de ser documentación.** El extractor del punto de venta, la pasarela y los tres scripts de correo estaban versionados como archivos de texto dentro de `context/`. Ahora son código en [`integrations/`](../../integrations/README.md), con su documentación en [3-ingenieria/integraciones](../3-ingenieria/integraciones/README.md).
- **Se corrige el estado del [contrato de proyección](../3-ingenieria/contratos/PROYECCION-v1.md)**, que seguía marcado como propuesto cuando su escritor llevaba dos días siendo el único productor en producción. Es el motivo de que el front-matter con estado y fecha de revisión sea obligatorio.
- **Se desconecta la maquinaria del documento de estado antiguo**: el gancho de Cursor, el gancho de confirmación y el guion que copiaba el historial a un documento de contexto para modelos. Ese mecanismo duplicaba cientos de líneas por diseño. La regla de las herramientas de IA ahora **deriva** de Marbella OS y no puede introducir norma propia.
- **Se sanea el repositorio.** Se expulsan diecinueve guiones de depuración desechables, seis artefactos generados, dos activos sueltos, el material de referencia del sistema ajeno —a [`reference/legacy-bdp/`](../../reference/legacy-bdp/README.md)— y **1.100 archivos de documentación de terceros duplicada** en veintinueve carpetas, una por herramienta de IA. La copia canónica es `.agents/skills`, declarada en el manifiesto de instalación.
- **Se completa la capa de ingeniería** con [ARQUITECTURA](../3-ingenieria/ARQUITECTURA.md), [MODELO-DE-DATOS](../3-ingenieria/MODELO-DE-DATOS.md), [SEGURIDAD](../3-ingenieria/SEGURIDAD.md) y [CALIDAD](../3-ingenieria/CALIDAD.md), verificados contra el código y las 290 migraciones. Con ellos, Marbella OS cubre las seis capas y deja de ser solo documentación de producto y diseño.
- **Se eliminan dos puntos de acceso de depuración sin autenticar**, `api/test-db` y `api/test-db2`, alcanzables en producción porque las rutas de máquina no pasan por el guardián. El segundo usaba la clave de servicio, que ignora todas las políticas de acceso.
- **Se descubren cuatro agujeros de acceso abiertos**, registrados como [D23](DEUDA.md#d23--las-tareas-programadas-fallan-abiertas) a [D26](DEUDA.md#d26--contenedor-de-fotos-de-caja-público): tres tablas con escritura anónima desde abril, cinco funciones que exponen la facturación sin sesión, el contenedor de fotos de recuentos de caja marcado como público, y las tareas programadas que solo comprueban su secreto si la variable existe. Ninguno lo detectó nada automático; aparecieron leyendo migraciones, que es exactamente el argumento de [CALIDAD](../3-ingenieria/CALIDAD.md).
- **Se corrige [D11](DEUDA.md#d11--una-tabla-con-políticas-que-leen-el-rol-del-identificador-de-sesión) a la baja.** No son cinco tablas dependientes del identificador de sesión, es una, y existe un disparador que sincroniza el rol: el fallo real es un desfase hasta que la sesión se renueva, no un bloqueo total. Se registró con más gravedad de la que tenía y se rebaja tras verificarlo.
- **Se descubre que los tipos de la base de datos no se usan.** Hay dos definiciones del esquema en el repositorio y ninguna se importa en ningún fichero: todo el acceso a datos es sin comprobación de tipos. Registrado como [D19](DEUDA.md#d19--los-tipos-de-la-base-de-datos-no-se-usan). Se elimina además un `types_db.ts` vacío en la raíz.
- **Se fija la autoridad de las condiciones laborales.** Las tablas con vigencia temporal mandan sobre las columnas equivalentes del perfil, porque leerlas del perfil para calcular una semana pasada devuelve un resultado plausible y equivocado. Registrado como [D20](DEUDA.md#d20--condiciones-laborales-duplicadas-entre-el-perfil-y-las-tablas-con-vigencia).

---

## Antes de 2026-07-29

El historial anterior a esta fecha está congelado en [6-investigacion/archivo/2026-07-29-project-status-historico.md](../6-investigacion/archivo/2026-07-29-project-status-historico.md).

**Es material histórico y no es normativo.** Contiene 628 entradas entre marzo de 2026 y julio de 2026, con detalle de implementación, decisiones ya superadas y afirmaciones que el código ha invalidado. Se consulta para entender por qué algo es como es, nunca para saber cómo debe ser.
