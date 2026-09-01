---
documento: DEUDA
clase: vivo
estado: vigente
capa: estado
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-08-26
caducidad: 3 meses
supersede: —
---

# DEUDA — Compromisos asumidos a sabiendas

Deuda **consciente**: cada entrada dice qué se aceptó, qué cuesta mantenerlo y qué dispara su pago. Lo que no está aquí y está mal no es deuda, es un defecto sin registrar.

Este conocimiento estaba enterrado en informes de auditoría que nadie actualizaba. Aquí vive con dueño y disparador.

Cada entrada se verificó contra el código el 29 de julio de 2026. Los hallazgos de auditorías anteriores que ya no existen **no se han copiado**.

Las entradas **D17 a D26 salieron de la revisión de ingeniería** de ese mismo día, al escribir [ARQUITECTURA](../3-ingenieria/ARQUITECTURA.md), [MODELO-DE-DATOS](../3-ingenieria/MODELO-DE-DATOS.md), [SEGURIDAD](../3-ingenieria/SEGURIDAD.md) y [CALIDAD](../3-ingenieria/CALIDAD.md). Cuatro de ellas —D23 a D26— son agujeros de acceso reparables en una migración cada uno.

**Prioridad**: `alta` bloquea trabajo futuro o puede causar un incidente · `media` encarece cada cambio · `baja` molesta.

---

## D1 · No hay tokens de diseño centralizados

**Prioridad: alta.** El tema del motor de estilos estaba vacío. El color de marca aparece repetido literalmente casi novecientas veces, y conviven dos escalas de grises distintas con cientos de usos cada una.

**Pago parcial (2026-08-16):** el piloto `DashboardShortcut` adoptó un subconjunto mínimo vía CSS variables y Tailwind (`superficie`, `borde`, `texto.fuerte`, radios, elevación, táctil, `espacio.1/2`). El contrato Modal adoptó además `color.marca`, `espacio.3/4`, `elevacion.modal`, `estructura.alto-modal` (como `--modal-max-height`) y capas `--z-modal-*`. El contrato Button adoptó `color.marca.intenso`, `color.negativo`, `color.negativo.fondo`, `color.superficie.inactiva` y `color.texto.invertido`. El resto del catálogo y la adopción global de marca en pantallas legacy siguen pendientes.

**Pago parcial (2026-08-19):** Button `primary` adopta `color.positivo` (`--color-positivo`). `color.marca.intenso` deja de pintar el hover de `primary`; el petróleo permanece en Modal, Button tertiary y chrome.

**Coste residual**: un cambio de color de marca sigue siendo un cambio en cientos de ficheros fuera del Design System.

**Disparador de pago**: continuar la adopción token a token al construir cada componente base. Contrato en [TOKENS](../2-diseno/TOKENS.md).

---

## D2 · No hay componentes base

**Prioridad: alta.** No existe botón, campo, tarjeta, insignia ni estado vacío de sistema. Cada pantalla los reconstruye.

**Pago parcial (2026-08-16):** existe `DashboardShortcut` (Master), el **contrato oficial de Modal** (Albaranes, Caja/Tesorería, Perfil/documentos RRHH, Propinas, Pedidos/Proveedores y Consumo personal) y el **contrato oficial de Button** (footers y CTAs de esos flujos, más comandos de condiciones laborales). Se retiró `ActionButton`. Siguen pendientes: resto de overlays de la allowlist, botones fuera de esos flujos, y el resto de base (campo, tarjeta, vacío…). `AvatarCropModal` y `StaffSelectionModal` quedan fuera de oleadas previas a propósito. En Caja, Propinas y Pedidos quedan residuales compartidos `QuickCalculatorModal` / `DenominationZoomModal` (Pedidos solo usa la calculadora).

**Pago parcial (2026-08-18):** Staff/Admin adoptan `DashboardShortcut` en los 8 atajos cuadrados. Pasan a `Modal` la confirmación de fichaje, los wrappers de compra multiorigen, el selector de fecha de ventas y el detalle de semana OT (`base` → historial `derived`). Quedan bloqueados por [ADR-0007](../4-decisiones/ADR-0007-modal-superficie-derivada.md) la cadena Info → Manuales → TPV/Horno → Media. Fuera de oleada: tarjeta Horarios, `StaffScheduleModal`, `AttendanceDetailModal`, vídeo de fichaje, tooltip de ventas y `QuickCalculatorModal`.

**Pago parcial (2026-08-19):** el escandallo de mapeo TPV (`IngredientEscandalloModal`) adopta `Modal` `standard`/`base`. Quedan fuera Staff detail de `/recipes`, `ImageLightbox`, el `window.confirm` de quitar ingrediente y los popovers de receta/departamento.

**Pago parcial (2026-08-19, Horarios/Labor/Historial):** detalle de día de `/dashboard/labor`, detalle de semana de `/dashboard/overtime` (historial `derived`), selector de mes de `/staff/history`, `DaySummaryModal` + crear fichaje `derived`, y footers de los dos modales de exportación. Quedan fuera `StaffScheduleModal`, `ScheduleDayEditor`, `AttendanceDetailModal` y el overlay de `WeekCard`. `QuickCalculatorModal` permanece residual. Sin cambio de contrato.

**Pago parcial (2026-08-19):** el contrato Button declara anatomía binaria (texto XOR icono). Los usos existentes de icono+texto quedan en allowlist de las pruebas; no se migran en este cambio.

**Pago (2026-08-19):** oleada de consumidores Button. Se retiró `icon` de todos los Button con texto visible (consumo, pedidos, propinas, condiciones laborales, proveedores, revisión de actividades). Las pruebas exigen cero combinaciones icono+texto. Icon-only con `aria-label` sigue permitido fuera del footer de Modal.

**Pago parcial (2026-08-20, Block 0 enforcement):** Button lanza en desarrollo/test ante anatomía inválida (`assertButtonAnatomy`). Modal: filtro allow-list de `className` del panel; gates de regresión para footer nativo, padding raíz del body, `zIndexClass` (allowlist vacía) y `backdropClassName` (solo lightbox). Allowlists en `src/lib/design-system/modal-consumer-allowlists.ts` y overlays en `overlay-parallel-allowlist.ts`. Sin migración masiva de pantallas.

**Pago parcial (2026-08-20, Block 1B/1C Button consumers):** CTAs de negocio claros migrados a `Button` (~155). Gate de regresión: cero CTAs claros nativos (`button-native-business-scan`). Block 1C: «Vista plantilla» en `StaffSelectionModal` pasa a `Button`; el grid de avatares, filas `text-left`, tabs/chips, composer de chat, steppers ±, badges 18px, celdas de escandallo y «Ver foto» se mantienen como controles especializados — ver D27.

**Pago parcial (2026-08-26, overlays):** `ImageLightbox` (recetas, fotos de cierre), `AvatarCropModal` y el selector de categorías de Reporte adoptan `Modal`. Salen de la allowlist de overlay paralelo. Quedan: calculadora, vídeo de fichaje, spinner de horarios, KDS, playground y pantallas de error/carga.

**Pago (2026-08-31, exportar):** los menús de compartir de Cierres, Ventas, Tesorería y Asistencia pasan a `Modal`. Dejan el desplegable recortado y el listener de captura que desmontaba el panel antes del clic.

**Pago (2026-08-26, filtros de lista):** los desplegables de categoría (Recetas, Proveedores), proveedor (Ingredientes) y modo de creación de ingrediente pasan a `Modal`. Ingredientes sale de la allowlist de overlay paralelo.

**Pago (2026-08-26, confirms):** los `window.confirm` de gestión (Pedido Nuevo, proveedores, albaranes, encargos, Insights, mapeo TPV, condiciones laborales y playground) pasan a `Modal` `compact`/`system` vía composición `ConfirmModal`. Sin variante nueva.

**Pago (2026-08-26, mapeo TPV único):** `/admin/mapeo` redirige a `/dashboard/recetas-tpv`. Se retiran `MapeoClient` y sus actions. Una sola pantalla de mapeo.

**Pago (2026-08-26, envío de encargo):** el aviso de enviar pedido por enlace y los CTAs Guardar/Enviar del pie de carta de encargo pasan a `ConfirmModal` + `Button`. La carta pública sigue con anatomía propia.

**Coste residual**: deriva visual continua fuera de los pilotos; overlays legacy con z-index ad hoc hasta migrar. En Caja/Tesorería quedan deliberadamente legacy `QuickCalculatorModal` y `DenominationZoomModal` por el techo `base → derived` ([ADR-0007](../4-decisiones/ADR-0007-modal-superficie-derivada.md)). En Propinas, la calculadora anidada en ajuste de propina y en el form de bote sigue el mismo residual. En Pedidos, la calculadora del resumen queda fuera a propósito. El zoom de `OrderProductCard` usa `hideHeader` porque la tarjeta trae su propio cromo. En Consumo personal, `StaffSelectionModal` queda residual compartido; la ración Entero/Medio es inline en `ConsumptionBottomSheet`. En Staff/Admin, la cadena Info/Manuales no cabe en una sola `derived`; el vídeo de fichaje y el spinner de `StaffScheduleModal` siguen en allowlist. En overtime, `QuickCalculatorModal` permanece residual.

**Disparador de pago**: continuar tras D1 parcial. Contrato en [SISTEMA-DE-COMPONENTES](../2-diseno/SISTEMA-DE-COMPONENTES.md).

---

## D3 · Mitad del código innecesariamente en el cliente

**Prioridad: alta.** 227 de 586 ficheros están marcados como cliente, un 39 %. La frontera se ha ido marcando en la pantalla completa en lugar de en la pieza interactiva.

**Coste**: descarga y ejecución en el navegador de código que podría resolverse en el servidor, con impacto directo en el arranque del producto en móviles de gama media.

**Disparador de pago**: cada pantalla que se toque baja su frontera. No se plantea una migración masiva.

---

## D4 · Pantallas por encima del límite de complejidad

**Prioridad: alta.** Hay pantallas y módulos de acciones de casi 3.000 y 2.400 líneas. Los más grandes coinciden con las zonas que concentran los defectos.

**Coste**: cada cambio en esos ficheros es arriesgado y no revisable con garantías.

**Disparador de pago**: al intervenir en el fichero. El límite de [FRONTEND §12](../3-ingenieria/FRONTEND.md#12-límites-de-complejidad) es bloqueante para lo nuevo, no retroactivo de golpe.

---

## D5 · Motor de horas ejecutado en lectura

**Prioridad: media.** Parte de las lecturas ejecutan el motor de cálculo al cargar en lugar de leer la proyección persistida.

**Coste**: coste por carga proporcional al histórico de la persona, y riesgo de divergencia entre lo que se pinta y lo que está persistido.

**Disparador de pago**: el cambio previsto en [ADR-0001](../4-decisiones/ADR-0001-hours-engine-productor-unico.md), que ya lo declara deuda temporal y no arquitectura final.

---

## D6 · Código de producción desplegado por copia manual

**Prioridad: alta.** El puente del terminal de venta y la pasarela son software de producción, con más de 900 líneas entre ambos, cuyo despliegue consiste en pegar el fichero en su máquina y reiniciar.

**Coste**: no hay historial de despliegue, no hay reversión, y un cambio en la venta o en el cierre depende de un procedimiento manual sin verificación.

**Disparador de pago**: el próximo cambio funcional en el puente o en la pasarela. Su reubicación fuera de la documentación es el primer paso; su despliegue reproducible es el segundo.

---

## D7 · Dependencias huérfanas en el proyecto

**Prioridad: baja.** Cuatro paquetes de comunicación en tiempo real y un motor de reconocimiento óptico de caracteres están declarados como dependencias y no se importan en ningún fichero de la aplicación.

**Coste**: instalación más lenta, superficie de vulnerabilidades innecesaria, y confusión sobre qué tecnología se usa realmente. El único motor de visión en producción es un modelo externo llamado por interfaz directa.

**Disparador de pago**: la próxima revisión de dependencias. Es una tarde de trabajo.

---

## D8 · Ausencia de pruebas de interfaz

**Prioridad: media.** Las 26 pruebas existentes cubren motor de horas, comparación y análisis de nóminas. **No hay ninguna prueba de interfaz ni de recorrido.**

**Coste**: los [recorridos críticos](../1-producto/RECORRIDOS.md) se verifican a mano o no se verifican. Un cambio de navegación o de permisos puede romper el fichaje sin que nada avise.

**Disparador de pago**: antes de la primera intervención estructural en la interfaz. Empezando por los recorridos R1, R5 y R6.

---

## D9 · Autorización por correo electrónico para el acceso maestro

**Prioridad: media.** El acceso a las superficies de gobierno se decide comparando la dirección de correo, no un rol.

**Coste**: la norma vive en el código en lugar de en los datos, y no se puede conceder ni retirar sin desplegar. Se aceptó porque el usuario maestro puede no tener perfil, y su acceso no debe depender de que exista.

**Disparador de pago**: cuando haya más de un usuario maestro.

---

## D10 · Rol sin enumeración en la base de datos

**Prioridad: media.** La columna de rol admite cualquier cadena. Cinco valores están en uso y dos de ellos tienen exactamente el mismo alcance de permisos.

**Coste**: un valor mal escrito degrada silenciosamente a los permisos mínimos, y la matriz de acceso solo es fiable en [ACTORES-Y-ROLES](../1-producto/ACTORES-Y-ROLES.md), no en el esquema.

**Disparador de pago**: cuando se dé contenido propio al rol de supervisor.

---

## D11 · Una tabla con políticas que leen el rol del identificador de sesión

**Prioridad: media.** Corregida el 2026-07-29 tras revisión: **no son cinco tablas, es una.** Las cinco políticas de `manager_ledger` leen el rol desde el identificador de sesión en lugar de consultar el perfil, como hace el resto del sistema. Existe un disparador que copia el rol al identificador, así que no hay bloqueo total.

**Coste**: el identificador no cambia hasta que la sesión se renueva. Conceder o retirar el papel de responsable no surte efecto inmediato sobre esta tabla, y la causa no es evidente al depurarlo.

**Disparador de pago**: al tocar el libro del responsable. Sustituir la lectura del identificador por `is_manager_or_admin()`. Detalle en [SEGURIDAD §6](../3-ingenieria/SEGURIDAD.md#6-políticas-de-acceso-en-la-base-de-datos).

---

## D12 · El token de un encargo es la única credencial

**Prioridad: baja, aceptada.** Quien tiene el enlace de un encargo puede verlo y editarlo, sin sesión.

**Coste**: exposición de los datos de un encargo concreto si el enlace se reenvía. Se aceptó a cambio de cero fricción para el cliente, que es una prioridad explícita del producto.

**Disparador de pago**: si un encargo llegara a contener datos personales sensibles. Hoy no los contiene.

---

## D13 · Divergencia visual entre pantalla y documento impreso

**Prioridad: baja.** El azul de marca en pantalla y el de los documentos impresos son colores distintos, y la tipografía propia no está incrustada en los documentos.

**Coste**: el producto no se reconoce como el mismo en las dos superficies.

**Disparador de pago**: una decisión explícita de identidad. Requiere ADR porque afecta a un token constitucional.

---

## D14 · Navegación inferior implementada dos veces

**Prioridad: baja.** Existen dos implementaciones separadas de la navegación principal según el rol.

**Coste**: toda mejora de la navegación se hace dos veces, o se hace una y se olvida la otra.

**Disparador de pago**: al construir los componentes base de D2.

---

## D15 · Deuda de vocabulario

**Prioridad: media.** Cinco conflictos de términos están inventariados en [GLOSARIO §12](../GLOSARIO.md#12-deuda-de-vocabulario): «plantilla» con dos significados, «pedido» con dos significados, un identificador de flag con polaridad heredada invertida, el rol sin enumerar y un tipo de día cuyo identificador no guarda relación con su etiqueta.

**Coste**: cada conversación sobre estos temas empieza aclarando de qué se habla, y cada documento corre el riesgo de decir lo contrario de lo que quiere decir.

**Disparador de pago**: al especificar la capacidad afectada. El renombrado de identificadores es lo último, porque afecta a datos históricos.

---

## D16 · Código de integración sin pruebas ni verificación de despliegue

**Prioridad: media.** Las tres piezas que se ejecutan fuera de la aplicación —extractor del punto de venta, pasarela y scripts de correo— ya son código en [`integrations/`](../../integrations/README.md), pero **no tienen ninguna prueba** y su despliegue sigue siendo manual.

**Coste**: un cambio en el extractor solo se detecta cuando dejan de llegar ventas, y la única forma de saber qué versión está desplegada es abrir el archivo en la máquina de destino.

**Disparador de pago**: junto con [D6](#d6--código-de-producción-desplegado-por-copia-manual), porque sin despliegue reproducible una prueba no garantiza nada sobre lo que está corriendo.

---

## D17 · Modelos de datos duplicados sin retirar el anterior

**Prioridad: media.** Tres pares de tablas cubren el mismo terreno: ventas antiguas frente a tickets, nóminas frente a documentos de empleado, y consumo con dos rutas.

**Coste**: al leer un dato hay que averiguar primero qué tabla es la vigente. Una consulta contra la tabla equivocada devuelve datos plausibles y desactualizados.

**Disparador de pago**: al tocar el dominio afectado. La autoridad de cada par está fijada en [MODELO-DE-DATOS](../3-ingenieria/MODELO-DE-DATOS.md); retirar la tabla vieja es lo último, porque contiene histórico.

---

## D18 · Cuatro modelos de cocina conviviendo

**Prioridad: media.** El modelo vigente es el de sucesos más proyección. Siguen existiendo, con datos, el modelo de comandas anterior, el estado por ticket y los sucesos del comandero.

**Coste**: cualquier intervención en cocina empieza por averiguar en qué modelo se está. Es el dominio con mayor coste de comprensión por línea de código.

**Disparador de pago**: la próxima intervención funcional en cocina.

---

## D19 · Los tipos de la base de datos no se usan

**Prioridad: alta.** Hay dos definiciones del esquema en el repositorio —una generada con 72 tablas y una escrita a mano con 3— y **ningún fichero importa ninguna de las dos**. Todo el acceso a la base de datos es sin tipos.

**Coste**: un nombre de columna mal escrito no lo detecta el compilador, lo detecta el usuario. Con 72 tablas y 107 funciones, es la mayor fuente posible de defectos silenciosos. Además, al menos 15 tablas que existen no están en los tipos generados, así que regenerarlos hoy no basta.

**Disparador de pago**: cuanto antes. Es de las pocas deudas cuyo pago —regenerar y empezar a tipar los clientes— reduce defectos sin cambiar comportamiento. Verificado el 2026-07-29.

---

## D20 · Condiciones laborales duplicadas entre el perfil y las tablas con vigencia

**Prioridad: alta.** `profiles` conserva seis columnas —horas contratadas, salario fijo, modo de bolsa, coste mensual, precio de la hora extra y balance— que las tablas con vigencia temporal ya cubren.

**Coste**: leer una condición del perfil para calcular una semana pasada produce **un resultado plausible y equivocado**, porque aplica la condición de hoy a un período anterior. Es el error más difícil de detectar del sistema: no falla, miente.

**Disparador de pago**: al tocar cualquier lectura de condiciones laborales. La regla de autoridad está en [MODELO-DE-DATOS §2](../3-ingenieria/MODELO-DE-DATOS.md#personas-y-jornada--8-tablas).

---

## D21 · Reglas de negocio implementadas dos veces, en Postgres y en TypeScript

**Prioridad: media.** El coste de receta y las tarifas laborales existen como función de base de datos y como código del motor. Deben dar el mismo resultado y **nada lo comprueba**.

**Coste**: una corrección aplicada en un solo lado produce dos verdades. El síntoma es un importe distinto según la pantalla que lo muestre.

**Disparador de pago**: al corregir cualquiera de las dos implementaciones. El criterio de autoridad —manda el motor, porque tiene pruebas— está fijado en [MODELO-DE-DATOS §4](../3-ingenieria/MODELO-DE-DATOS.md#4-las-107-funciones).

---

## D22 · El andamiaje de pruebas deja pruebas sin ejecutar

**Prioridad: alta.** Los ficheros de prueba se enumeran a mano en trece guiones distintos y **no hay ninguno que los ejecute todos**. Tres pruebas escritas no las ejecuta nadie. Tampoco hay comprobación de tipos como paso propio ni integración continua.

**Coste**: una prueba que no se ejecuta da confianza sin darla. Y sin integración continua, el resto de las pruebas son opcionales de hecho.

**Disparador de pago**: inmediato. Un guion con descubrimiento automático más otro de comprobación de tipos son una tarde de trabajo. Detalle en [CALIDAD §3](../3-ingenieria/CALIDAD.md#3-tres-agujeros-en-el-propio-andamiaje).

---

## D23 · Las tareas programadas fallan abiertas

**Prioridad: alta.** Las tres rutas de tarea programada comprueban el secreto solo **si la variable está configurada**. Sin ella, quedan abiertas a cualquiera. Una de ellas recalcula los balances de toda la plantilla.

**Coste**: dependencia de una variable de entorno para que exista la autenticación. Los webhooks, en cambio, fallan cerrados.

**Disparador de pago**: inmediato. Es una condición invertida en tres ficheros.

---

## D24 · Tres tablas sin políticas y con escritura anónima

**Prioridad: alta, la más grave de esta lista.** `estado_sala`, `kds_orders` y `kds_order_lines` no tienen políticas de acceso y tienen lectura, inserción, modificación y borrado concedidos a quien no tiene sesión. La clave pública viaja en el navegador.

**Coste**: cualquiera puede leer la radiografía completa del local y escribir en las comandas de cocina. Abierto desde el 2026-04-08.

**Disparador de pago**: inmediato. La pasarela que alimenta esas tablas usa la clave de servicio, así que **retirar el permiso anónimo no rompe nada**. Verificado el 2026-07-29.

---

## D25 · Cinco funciones de venta ejecutables sin sesión

**Prioridad: alta.** `get_ticket_sales_summary`, `get_tickets_marbella_page`, `get_product_sales_ranking`, `get_daily_sales_chart` y `get_daily_sales_stats` son de tipo definidor —ignoran las políticas— y tienen ejecución concedida a quien no tiene sesión.

**Coste**: con la clave pública se obtiene la facturación del negocio y el listado de tickets.

**Disparador de pago**: inmediato. Es una migración que retira el permiso.

---

## D26 · Contenedor de fotos de caja público

**Prioridad: alta.** `box_images` está marcado como público: son fotografías de recuentos de dinero, con fecha. `ai_assets`, con audio de conversaciones, también es público, aunque se borra a los siete días.

**Coste**: exposición de material sensible a quien conozca o adivine la ruta del archivo.

**Disparador de pago**: inmediato. Es un cambio de una bandera más las políticas de lectura correspondientes.

---

## D27 · Controles interactivos que no son Button

**Prioridad: media.** Tras Block 1B/1C, ~680 `<button>` nativos restantes no son CTAs de negocio. Son patrones sin contrato de Design System (o con host local). Forzarlos a `Button` rompería anatomía (texto XOR icono), densidad o semántica.

| Patrón | Decisión 1C | Motivo | Disparador de pago |
|---|---|---|---|
| Grid de avatares (`StaffSelectionModal`) | Mantener | Opción de selector (avatar+nombre), no CTA | Contrato `SelectionOption` / listbox |
| Filas `w-full text-left` (resto) | Mantener | Selección / navegación / expansión fuera de documentos | Familia canónica por anatomía (no ListRow genérico) |
| Filas de documento (Nóminas / Comunicados / Contrato) | **Pagado parcial 2B** | Misma anatomía en 3 sitios | `DocumentListRow` oficial |
| Tabs / chips / filtros | **2D auditado; 2E pago parcial** | Segmented petróleo → `PetroleumSegmented`; resto local | Ver 2E; zinc/tabs/chips siguen locales |
| Menú icono + label (Staff) | **Auditado 2C — no crear aún** | Ver pago diferido 2C abajo | Segundo uso fuera de StaffDashboard o unificación local |
| Composer ChatMarbella (+/mic/teléfono) | Mantener | Chrome de composer; teléfono emerald y menú icono+texto no caben en Button | Composer chrome documentado |
| Quantity steppers ± | **Pago parcial 2026-08-27** | Recuento de efectivo sigue en `DenominationStepper`. El resto de menos / número / más usa `QuantityStepper`. | Denominaciones (siguen aparte, a propósito) |
| Barras de búsqueda compactas | **Pago parcial 2026-08-27** | `SearchField` (lupa + input). No es Field. | — |
| Badges 18px | Mantener | Presentación / dismiss compacto, no hit-area 48px de Button | Badge / dismiss chip |
| Celdas escandallo TPV | Mantener | Celda de tabla que abre detalle | Patrón celda interactiva |
| «Ver foto» sobre imagen | Mantener | Presentación interactiva (lightbox), no CTA | Media control / lightbox trigger |

**Pago parcial (2026-08-27) — QuantityStepper:** se creó `src/components/ui/QuantityStepper.tsx` y se cableó en inventario, merma, carta, tickets de cierre, encargo, pedido, consumo y carrito de evento. El recuento de efectivo sigue en `DenominationStepper` (anatomía distinta, a propósito).

**Pago parcial (2026-08-27) — SearchField:** se creó `src/components/ui/SearchField.tsx` (lupa + input compacto, 32 px / 12 px, no es Field) y se cableó en catálogos, inventario, merma, mapeo, carta, pedido, encargo, scanner y exportes.

**Auditoría Block 2A (2026-08-20) — SelectionOption / ListRow:** se inventariaron las variantes reales antes de crear componente. **Decisión: C (no crear ListRow/SelectionOption genéricos).**

**Pago parcial Block 2B (2026-08-20) — fila canónica de documento:** se fijó anatomía en [SISTEMA-DE-COMPONENTES](../2-diseno/SISTEMA-DE-COMPONENTES.md) y se creó `DocumentListRow` (`src/components/ui/DocumentListRow.tsx`). Migrados: `NominasModal`, `ComunicadosModal`, `ContratoModal`. Gate de huella legacy. No se creó ListRow genérico.

**Auditoría Block 2C (2026-08-20) — menú icono + label:** se inventariaron los candidatos reales. **Decisión: no crear componente de sistema.**

Dos anatomías distintas viven solo en `StaffDashboardView.tsx`:

1. *Menú modal 36+label* (Información + Manuales): `min-h-[56px]`, `p-4`, `rounded-2xl`, caja `40×40` / asset `36×36`, label `text-sm font-bold`, hover texto azul, `active:scale-95`. Semántica mixta (`button` / `Link` / `<a>`). Sin subtítulo ni trailing. ~5 ítems info + lista `STAFF_MANUAL_MENU`.
2. *Opciones de caja 48+label*: `min-h-12`, `py-1`, sin radio de fila, caja `48×48`, label `font-black uppercase`, hover opacity. Solo acciones (`button`). 4 ítems (Cambio/Compra/Cierre/Propinas).

No convergen entre sí. Las filas TPV/Horno (solo texto + borde) no pertenecen a esta familia. `DashboardShortcut` ya cubre atajos de cuadrícula, no menús de modal.

Bloqueo normativo: [SISTEMA-DE-COMPONENTES §4.7](../2-diseno/SISTEMA-DE-COMPONENTES.md) — un componente de una sola pantalla no es del sistema. No hay segundo consumidor fuera de Staff.

*SelectionOption* permanece sin componente (familias incompatibles).

*ListRow* genérico permanece sin componente.

**Coste residual**: duplicación local en Staff (className repetido); chrome «Compartir» de documento sigue nativo en `trailing`.

**Disparador de pago (menú icono+label):** aparece el mismo patrón 36+label (o el 48+label) en un segundo módulo/pantalla, o se decide helper local de Staff sin inventariarlo como sistema. No unificar las dos anatomías en un kitchen-sink. No convertir a Button (icono+texto prohibido en Button).

**Auditoría Block 2D (2026-08-20) — Tabs / Chips / Segmented:** inventario completo sin crear componente. **Ninguna familia A–E recomienda creación inmediata de pieza de sistema.**

Hallazgos clave:
- `TabBar` (`src/components/pavilion/TabBar.tsx`): existe, **cero imports** (código muerto o preparado). Mencionado en SISTEMA solo como «no es Button». Sin contrato, sin consumers, anatomía underline petróleo ≠ resto de tabs.
- *Segmented borde petróleo* (`inline-flex rounded-lg border border-[#36606F]`): 3 módulos (`SubNavVentas`, `WasteClient`, `recipes/[id]` ×2). Anatomía cercana pero densidades distintas (8px vs 10px; con/sin `min-h-48`) y semántica mixta (navegación de rutas en Ventas vs toggle de contenido). Unificar hoy exigiría variantes de densidad + polimorfismo de navegación → **no crear todavía**; disparador = cerrar anatomía canónica (altura, tipo, selected) y decidir si Ventas entra o queda fuera.
- *Segmented track zinc* (`bg-zinc-100` + pill blanca): `InventoryClient`; `ManagerLedgerView` (selected coloreado distinto). `MapeoClient` se retiró (2026-08-26). **No unificar** con el borde petróleo.
- *Tabs underline / FilterButton*: solo `MappingClient` (local). `QuickCalculatorModal` segmented en chrome de modal legacy (1 sitio).
- *Chips*: `PavilionVenueChip` (badge no interactivo); `FinancialKpiChip` (KPI/botón, no filtro); food-cost dismiss en recipes (filtro activo + X); `CartaLangPicker` (toggle texto `aria-pressed`, no chip). Familias distintas.
- *Selectores*: `ClosingWeatherPicker` (icon ring); `DashboardSwitcher` dots `role=tab`; `PlatoMarbellaPlateVisual` SVG tabs; listbox departamentos Mapping. Dominio/local.
- Pabellón día: toggle ACT/PDF en chrome de cabecera, **no** usa `TabBar`.

**Decisión 2D por familia:** Tabs navegación → no; Tabs contenido → no (heterogéneos); Chips → no; Segmented → candidato diferido (borde petróleo, ≥3 módulos) tras fijar anatomía; Selector → no.

**Pago parcial Block 2E (2026-08-20) — PetroleumSegmented:** se fijaron densidades `comfortable` (Waste, `tactil.minimo`) y `compact` (recipes ×2, SubNavVentas). Componente `src/components/ui/PetroleumSegmented.tsx` + gate de huella legacy. Semántica: radiogroup/radio; navegación de Ventas permanece en el callback del consumidor. Ventas pasa de `text-[8px]` a tipografía compact canónica (10 px). No se migró segmented zinc.

**Auditoría Block 2F (2026-08-20) — Segmented zinc:** se revisaron `InventoryClient`, `MapeoClient` y `ManagerLedgerView`. **Decisión: mantener local. No crear componente. No absorber en PetroleumSegmented.**

**Pago (2026-08-26):** `MapeoClient` ya no existe. El zinc vivo queda en Inventory, Ledger y `StaffCartaEditor`. No se crea pieza.

Comparación:
- *Inventory*: track `bg-zinc-100 p-1 rounded-xl min-h-48`; selected pill blanca + texto marca; unselected zinc-500 + hover bg; `font-black` uppercase; opciones `flex-1` sin badge.
- *Mapeo*: track similar + `shadow-inner p-1.5`; selected pill blanca + texto **zinc-900** (no marca); `font-semibold` sin uppercase; altura fija 38px; **badges de conteo** en cada opción (estructura distinta).
- *Ledger*: track zinc pero `rounded-2xl` + `grid` + `gap-2`; selected **asimétrico** (entrada = emerald fill; salida = pill blanca); semántica de tipo de apunte, no de vista. Familia distinta dentro del “zinc”.

También existe un track zinc cercano en `StaffCartaEditor` (Activos/Desactivados/Todos) fuera del trío pedido; no cambia la decisión.

Vs PetroleumSegmented: shell borde+fill marca ≠ track+pill. Son dos familias visuales (opción B/C). Unificar exigiría booleanos de badge, color de selected y selected semántico.

**Disparador de pago (segmented zinc):** solo si Inventory + StaffCarta convergen a una anatomía canónica sin badges de dominio ni selected asimétrico — entonces sí pieza propia, nunca variante de PetroleumSegmented. Ledger sigue fuera (selected asimétrico).

**Disparador de pago (resto D27):** inventariar la siguiente familia (p. ej. SelectionOption grid) en SISTEMA-DE-COMPONENTES antes de codificar.

---

## D28 · Literales visuales fuera de las primitivas canónicas

**Prioridad: media.** [ADR-0010](../4-decisiones/ADR-0010-jerarquia-visual-canonica.md) fijó cómo se construye una pantalla nueva. Las pantallas de gestión prioritarias ya entran por `PageScreen` / `Surface`. El resto del producto sigue con literales de marca, radio y sombra.

**Qué no es esta deuda:** `className` de layout (`flex`, `gap`, `min-h-0`, `overflow`) en consumidores. Eso es composición, no sistema.

**Qué queda, a propósito:**
- Literales `#36606F` / `rounded-*` / `shadow-*` en pantallas no migradas hoy.
- Segmented zinc, TimeFilter, CartaLangPicker, RecipeCard huérfano, insignia de estado: anatomías distintas o un solo consumidor ([D27](#d27--controles-interactivos-que-no-son-button)).
- Labels de 6–7 px en la tira del calendario mensual: excepción de `tipo.minimo` ya escrita en [TOKENS](../2-diseno/TOKENS.md).
- Navegación inferior duplicada por rol: deuda previa, no se toca en este ciclo.

**Disparador de pago:** al tocar una pantalla de gestión, entra por `PageScreen` o se declara por qué su anatomía es otra (T1, KDS, carta de cliente). No se clona una cabecera petróleo.

---

## Cómo se usa esta lista

- **Antes de empezar algo grande**, se comprueba si su disparador ya se cumplió.
- **Al aceptar un compromiso nuevo**, se añade aquí con coste y disparador. Un compromiso sin registrar deja de ser consciente en cuanto lo olvida quien lo tomó.
- **Al pagar una deuda**, se elimina la entrada y se anota en [CHANGELOG](CHANGELOG.md). No se deja tachada: este documento describe el presente.
- **Un defecto no es deuda.** Un defecto se arregla; la deuda se decide.
