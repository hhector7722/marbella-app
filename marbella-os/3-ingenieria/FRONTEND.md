---
documento: FRONTEND
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-08-25
caducidad: 6 meses
supersede: .cursor/rules/BAR-LA-MARBELLA-AI-OPERATING-PROTOCOL.mdc (reglas de estilo y de seguridad de layout)
---

# FRONTEND — Reglas de construcción

Cómo se construye la interfaz de Marbella. Este documento gobierna el **cómo técnico**; el qué visual está en [2-diseno](../2-diseno/) y no se repite aquí.

Es un documento vivo: describe las reglas vigentes y declara con honestidad dónde el código todavía no las cumple.

---

## 1. Contexto técnico

Aplicación web instalable, con enrutado por directorios y componentes de servidor. Base de datos y autenticación gestionadas como servicio, con acceso desde servidor y desde cliente.

Escala actual: 588 ficheros de código en la aplicación, 58 pantallas, 4 estructuras de página, 27 manejadores de ruta, 40 módulos de acciones de servidor, 227 ficheros marcados como cliente y 26 ficheros de prueba.

**El dato relevante de esa lista es el 227.** Casi la mitad del código es cliente, lo que indica que la frontera entre servidor y cliente no se está aprovechando. Es la deuda estructural principal del frontend.

---

## 2. Servidor y cliente

**Regla: cliente solo cuando hace falta.** Un componente es cliente si necesita estado local, efectos, acceso al navegador o manejadores de eventos. Todo lo demás es servidor.

- **La frontera se empuja hacia abajo.** Se marca como cliente la pieza interactiva concreta, no la pantalla que la contiene. Marcar la pantalla entera arrastra su árbol completo al navegador.
- **Los datos se leen en el servidor** siempre que sea posible, y la pantalla llega con ellos.
- **Solo cruza la frontera lo que se usa.** Pasar un objeto completo cuando se pinta un campo carga la respuesta con datos que nadie lee.
- Las lecturas independientes se lanzan en paralelo. Una secuencia de esperas encadenadas es un defecto de rendimiento, no un estilo.
- Las secciones lentas se aíslan para que la estructura de la pantalla aparezca antes que sus datos, según [EXPERIENCIA §5](../2-diseno/EXPERIENCIA.md#5-espera).

## 3. Escritura de datos

**Las mutaciones se hacen con acciones de servidor.** Los manejadores de ruta se reservan para lo que necesita un punto de acceso propio: recepción desde sistemas externos, descargas, tareas programadas y llamadas desde el navegador que no encajan en el ciclo de una acción.

Reglas de toda acción de servidor:

1. **Verifica identidad y permiso por sí misma.** Una acción de servidor es un punto de acceso público: el guardián de rutas no la protege. Detalle en [SEGURIDAD](./SEGURIDAD.md).
2. **Valida su entrada** antes de usarla, y nunca confía en la forma de lo que recibe.
3. **Devuelve un resultado explícito**, con éxito o con error descrito. Nunca falla en silencio.
4. **No calcula negocio.** Llama al productor correspondiente. Una acción que reimplementa una regla crea un segundo productor y viola el principio 3.

## 4. Estado

Cuatro ubicaciones posibles, en orden de preferencia:

1. **Ninguna** — el valor se deriva de lo que ya hay. Es la opción correcta la mayoría de las veces.
2. **Local al componente** — estado de interacción: qué modal está abierto, qué campo tiene foco.
3. **Compartido por contexto** — cuando varias piezas de un mismo flujo necesitan el mismo estado. Se eleva a un proveedor.
4. **Global** — solo para estado verdaderamente transversal. Hoy hay exactamente uno, y esa cifra debería crecer muy despacio.

Reglas:

- **No se guarda en estado lo que se puede calcular al renderizar.** Un efecto que sincroniza un estado derivado con sus fuentes es un defecto.
- **Las actualizaciones que dependen del valor anterior usan la forma funcional.** Evita cierres obsoletos y estabiliza los manejadores.
- **Lo transitorio va en una referencia, no en estado.** Un valor que cambia decenas de veces por segundo y no se pinta no debe provocar redibujado.
- **La lógica de una interacción vive en su manejador**, no en un efecto que reacciona a un estado que el manejador acaba de cambiar.
- Los datos del navegador que se persisten van versionados y con el acceso protegido: puede fallar en navegación privada.

## 5. Composición

- **Antes de crear una pieza de interfaz, se busca** en [SISTEMA-DE-COMPONENTES](../2-diseno/SISTEMA-DE-COMPONENTES.md). Si existe, se reutiliza. Si la necesidad exige una pieza o variante de sistema nueva, se para y se pregunta.
- **Una pantalla de gestión nueva usa `PageScreen`** o declara por qué su anatomía es otra (mosaico T1, cocina, carta de cliente). Color, radio y sombra de sistema no se reescriben en el consumidor. Lo decide [ADR-0010](../4-decisiones/ADR-0010-jerarquia-visual-canonica.md).
- **Nunca se define un componente dentro de otro.** Provoca desmontaje y remontaje en cada renderizado, y es la causa habitual de que un campo pierda el foco al escribir.
- **Interruptores booleanos, los mínimos.** Cinco parámetros booleanos son treinta y dos estados que nadie ha probado. Se resuelve con variantes explícitas o componiendo hijos.
- **Se compone con hijos antes que con funciones de renderizado.**
- El estado se eleva a un proveedor cuando piezas fuera del árbol visual necesitan leerlo o actuar sobre él.

## 6. Estilos

- **Solo utilidades de clase.** No hay estilos en línea salvo para valores calculados en tiempo de ejecución, como una posición o una altura medida.
- **Las clases se combinan siempre con la utilidad de fusión del proyecto.** Concatenar cadenas de clases produce conflictos silenciosos donde gana la última declaración del fichero de estilos, no la última escrita.
- **Los valores salen de [TOKENS](../2-diseno/TOKENS.md).** Un valor literal es un defecto, aunque hoy sea la norma en el código. Tailwind local se reserva para layout y composición interna (`flex`, `gap`, `min-h-0`); no para redefinir el sistema.
- Las utilidades globales propias se reservan para lo que las clases no pueden expresar: el envolvente de la aplicación, las áreas seguras del dispositivo, y el reparto de altura del calendario y de los modales de día.
- **Nada de anulaciones con prioridad forzada en componentes nuevos.** Las que existen se concentran en el cálculo de altura del calendario en escritorio y son deuda contenida, no un patrón a imitar.

## 7. Seguridad de la composición

Dos reglas nacidas de fallos reales y repetidos:

**Las zonas de interacción no colapsan.** Los contenedores de botoneras y controles se marcan como no reducibles; el contenido elástico crece por encima de ellos. Sin esto, un contenido largo se come la barra de acciones y la tarea no se puede terminar.

**La altura se reparte, no se acumula.** En pantallas que deben caber en un viewport, los contenedores intermedios permiten reducirse por debajo de su contenido y las filas reparten el espacio disponible. Sin esto, el contenido dicta la altura y la pantalla desborda.

## 8. Tiempo y fechas

Es la fuente de errores silenciosos más costosa del producto y tiene reglas propias:

- **Una fecha local se construye componente a componente.** Interpretar una cadena de año, mes y día como instante universal desplaza el día.
- **Toda hora que se muestra se convierte explícitamente al tiempo local del negocio.**
- **Los sellos de tiempo de sistemas externos se normalizan en la integración**, nunca se trocean con operaciones de texto en la pantalla. Llegan con separadores y marcas de zona mezcladas, y extraer trozos produce horas falsas.
- La semana de negocio empieza el lunes, y su cálculo es responsabilidad de las utilidades de fecha, no de cada pantalla.

## 9. Acceso a datos desde cliente

- El cliente de base de datos del navegador se crea con la utilidad del proyecto, nunca directamente.
- **Ninguna consulta desde el cliente usa la negación de pertenencia a una lista.** Provoca fallos en la capa de acceso a datos. Se resuelve con desigualdades encadenadas o con una condición alternativa.
- Los datos en vivo se suscriben con cancelación garantizada al desmontar.
- **Una consulta que no devuelve datos vitales dispara aviso visible.** Prohibido salir de la función en silencio.

## 10. Rendimiento

- **Las importaciones son directas.** Los ficheros que reexportan bibliotecas enteras cargan miles de módulos innecesarios.
- Los componentes pesados que no se ven al entrar se cargan cuando se necesitan.
- Las listas largas evitan pintar lo que está fuera de la pantalla.
- **La animación se aplica al contenedor, no al elemento vectorial.**
- Se comparan tamaños antes de comparar contenidos, y se usan estructuras de acceso directo para búsquedas repetidas.

## 11. Errores

- Un fallo de escritura se comunica donde la persona actuó.
- **Un fallo de lectura de un dato vital bloquea con mensaje, no pinta ceros.**
- Ningún error se queda solo en la consola.
- El mensaje no expone identificadores internos ni códigos.

Norma completa en [EXPERIENCIA §6](../2-diseno/EXPERIENCIA.md#6-error).

## 12. Límites de complejidad

Umbrales que no son estéticos: por encima de ellos, el fichero deja de ser mantenible y de ser revisable.

- **Una pantalla por encima de 500 líneas se descompone.** Hoy hay pantallas de casi 3.000 líneas, y son las que concentran los defectos.
- **Un módulo de acciones por encima de 500 líneas se divide por capacidad.**
- Un componente con más de ocho parámetros necesita repensarse.
- Una función con más de tres niveles de anidamiento se extrae.

Los ficheros que hoy superan estos límites están inventariados en [DEUDA](../5-estado/DEUDA.md). **La regla no es retroactiva de golpe, pero sí es bloqueante para lo nuevo.**

---

## 13. Cómo se comprueba un cambio

- ¿Es cliente solo lo que necesita serlo?
- ¿Cruza la frontera solo lo que se pinta?
- ¿La acción de servidor verifica identidad y permiso?
- ¿Las clases se fusionan con la utilidad del proyecto?
- ¿Los valores visuales vienen de tokens?
- ¿Las zonas de acción son indeformables?
- ¿Las fechas se construyen en tiempo local?
- ¿Un fallo de lectura produce error visible?
- ¿El fichero se mantiene por debajo del límite de complejidad?
