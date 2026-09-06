---
documento: MAPA-DE-CAPACIDADES
clase: vivo
estado: vigente
capa: producto
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 3 meses
supersede: —
---

# MAPA DE CAPACIDADES

Catálogo de los dominios funcionales de Marbella. Es el índice funcional del producto: qué sabe hacer, para quién, con qué superficies y en qué estado.

Cómo leer el estado de una capacidad:

- **Consolidada** — funciona, se usa a diario y sus reglas son estables.
- **En movimiento** — funciona, pero sus reglas o su implementación están cambiando.
- **Frágil** — funciona con condiciones; tiene deuda conocida registrada en [DEUDA](../5-estado/DEUDA.md).
- **Tolerada** — se mantiene sin invertir en ella; candidata a retirarse.

La columna **Especificación** enlaza al documento de `capacidades/` cuando existe. Un hueco es honesto: [CANON §8](../CANON.md#8-ciclo-de-vida) prefiere un catálogo con huecos declarados a documentos vacíos. Las especificaciones se escriben cuando se va a intervenir en la capacidad.

---

## Núcleo operativo

Capacidades de las que depende que el negocio siga abierto. Su indisponibilidad para el servicio.

### Asistencia y jornada

Registrar quién trabaja, cuándo y cuánto. Es la capacidad más sensible del producto: alimenta el coste laboral y afecta directamente a la retribución de las personas.

- **Actores**: persona en turno, responsable de operación, responsable del negocio.
- **Superficies**: panel de equipo (fichaje), historial de horas propio, registros del equipo, calendario mensual, editor de día, hoja de jornada impresa.
- **Reglas propias**: semana de lunes a domingo; jornada fija para casos concretos; distinción entre horas ordinarias y extras; tipos de ausencia con etiquetas propias.
- **Estado**: en movimiento. Su motor de cálculo se rehízo por completo y su interfaz se está unificando.
- **Gobernada por**: [ADR-0001](../4-decisiones/ADR-0001-hours-engine-productor-unico.md), [contrato de proyección](../3-ingenieria/contratos/PROYECCION-v1.md).
- **Especificación**: pendiente.

### Caja y tesorería

Cuadrar el efectivo del día y trazar cada movimiento de dinero.

- **Actores**: responsable de operación, responsable del negocio.
- **Superficies**: cierre de caja, historial de cierres, último cierre en el mosaico del master, movimientos de tesorería, arqueo y cambio de cajas, libro mayor.
- **Reglas propias**: efectivo esperado a partir de ventas, tarjeta y pendiente; descuadre visible y nunca ajustado en silencio; el cambio entre cajas genera dos apuntes cruzados; recuento por denominación.
- **Estado**: consolidada, con un punto frágil conocido en el cálculo del esperado cuando los datos del papel y los del terminal no concuerdan.
- **Especificación**: pendiente.

### Venta y sala

Entender lo que se está vendiendo, en vivo y en histórico.

- **Actores**: responsable de operación, responsable del negocio.
- **Superficies**: radar de sala en tiempo real, ventas por ticket, por producto y por tramo horario.
- **Reglas propias**: el terminal de venta es el origen del dato y Marbella no lo modifica; los documentos que no son venta se excluyen de todo cálculo; el día de negocio no coincide con el día natural.
- **Estado**: consolidada.
- **Gobernada por**: [integración con el terminal de venta](../3-ingenieria/integraciones/BDP-TPV.md).
- **Especificación**: pendiente.

### Cocina

Mostrar a cocina qué hay que preparar, en orden y con urgencia visible.

- **Actores**: persona en turno (cocina).
- **Superficies**: pantalla de cocina.
- **Reglas propias**: solo el día en curso; agrupación en tandas por antigüedad; las cancelaciones se muestran, no se ocultan; el color indica tiempo de espera; el cierre de una comanda es manual.
- **Estado**: consolidada.
- **Gobernada por**: [integración con el terminal de venta](../3-ingenieria/integraciones/BDP-TPV.md).
- **Especificación**: pendiente.

---

## Gestión del negocio

### Coste laboral y nóminas

Saber lo que cuesta el personal, por día y por persona.

- **Actores**: responsable del negocio.
- **Superficies**: coste laboral diario, horas extras, documentos de nómina en el perfil.
- **Reglas propias**: el coste ordinario procede del resumen mensual de la gestoría, no de una tarifa estimada; el coste extra procede del motor de coste; sin fichaje no hay coste; el porcentaje sobre ventas es un indicador vigilado.
- **Estado**: en movimiento.
- **Gobernada por**: [dominio de coste laboral](../3-ingenieria/dominio/COSTE-LABORAL.md), [integración de nóminas](../3-ingenieria/integraciones/NOMINAS.md).
- **Especificación**: pendiente.

### Compras y albaranes

Recibir mercancía, saber lo que cuesta y detectar cuándo sube.

- **Actores**: responsable de operación, persona en turno con responsabilidad de recepción.
- **Superficies**: escáner de albarán, histórico de albaranes, precios de albarán, pedido a proveedor, proveedores.
- **Reglas propias**: el albarán es el documento de referencia; el artículo del proveedor se aprende una vez y se recuerda; el precio de un ingrediente se puede bloquear frente a actualizaciones; una subida relevante se avisa.
- **Estado**: consolidada.
- **Gobernada por**: [dominio de precios y compras](../3-ingenieria/dominio/PRECIOS-Y-COMPRAS.md).
- **Especificación**: pendiente.

### Inventario

Saber qué hay, qué se ha ido y por qué.

- **Actores**: responsable de operación.
- **Superficies**: inventario, historial de movimientos por ingrediente, mermas.
- **Reglas propias**: todo cambio de stock deja rastro con su origen; las correcciones son movimientos, no ediciones.
- **Estado**: frágil.
- **Especificación**: pendiente.

### Recetas y escandallos

Saber lo que cuesta lo que se sirve.

- **Actores**: responsable de operación, responsable del negocio.
- **Superficies**: recetas, detalle de receta, ingredientes, importación de recetas, mapeo con el terminal de venta.
- **Reglas propias**: el coste sale del precio actual del ingrediente; precio de venta y coste nunca se confunden; la ración es la unidad de comparación.
- **Estado**: consolidada.
- **Especificación**: pendiente.

---

## Cliente y eventos

### Carta

Publicar la oferta al cliente y consultarla en sala.

- **Actores**: cliente, persona en turno, responsable de operación.
- **Superficies**: carta pública sin sesión, carta interna, editor de carta.
- **Reglas propias**: es superficie pública y no expone dato interno alguno; la ficha de plato tiene presentación propia; las fotografías se normalizan al subirse.
- **Estado**: consolidada.
- **Especificación**: pendiente.

### Eventos, reservas y encargos

Concertar servicios con fecha y recoger lo que el cliente quiere.

- **Actores**: cliente, persona en turno, responsable de operación.
- **Superficies**: eventos, encargos, formulario público por evento, encargo por enlace con token, documento de encargo impreso.
- **Reglas propias**: el cliente completa su encargo sin sesión; el enlace con token es la credencial; el encargo se imprime como documento formal.
- **Estado**: consolidada.
- **Especificación**: pendiente.

### Pabellón y actividades

Conocer y revisar la programación de la instalación deportiva.

- **Actores**: persona en turno, responsable de operación.
- **Superficies**: actividades, gestión, revisión de lo importado, formulario público de reporte, calendario mensual.
- **Reglas propias**: la programación llega como documento externo y se interpreta automáticamente; toda interpretación automática pasa por revisión humana antes de ser operativa.
- **Estado**: en movimiento.
- **Especificación**: pendiente.

---

## Personas

### Propinas

Repartir lo que se ha ganado en común.

- **Actores**: persona en turno, responsable de operación.
- **Superficies**: propinas del equipo, propinas propias.
- **Reglas propias**: el reparto se agrupa por periodo; las deducciones son visibles y justificadas; la plantilla operativa determina quién participa.
- **Estado**: consolidada.
- **Especificación**: pendiente.

### Consumo personal

Imputar a cada persona lo que consume.

- **Actores**: persona en turno, responsable de operación.
- **Superficies**: consumo personal.
- **Reglas propias**: la cantidad consumida se convierte a unidad de compra para valorarla.
- **Estado**: frágil.
- **Especificación**: pendiente.

### Perfil y documentos

Dar a cada persona acceso a lo suyo.

- **Actores**: persona en turno, responsable de operación, master.
- **Superficies**: perfil, documentos (nóminas, contratos, comunicados, sanciones), condiciones de contrato.
- **Reglas propias**: cada persona ve solo sus documentos; las condiciones de contrato se versionan por tramos de vigencia y solo las edita el maestro; el maestro edita los datos personales de cualquier trabajador.
- **Estado**: consolidada.
- **Especificación**: pendiente.

---

## Conocimiento y gobierno

### Análisis de negocio

Convertir la operación en decisiones.

- **Actores**: responsable del negocio.
- **Superficies**: análisis e indicadores.
- **Reglas propias**: acceso restringido a los roles de gestión; ningún indicador se calcula en la pantalla.
- **Estado**: en movimiento.
- **Especificación**: pendiente.

### Analítica de uso

Saber cómo se usa el producto de verdad.

- **Actores**: master.
- **Superficies**: uso de la aplicación, analítica web, instalación de la aplicación.
- **Reglas propias**: acceso exclusivo del maestro; las vistas históricas incluyen personas inactivas porque excluirlas falsearía el pasado.
- **Estado**: consolidada.
- **Especificación**: pendiente.

### Copiloto

Responder preguntas del negocio en lenguaje natural, por texto o por voz.

- **Actores**: todos, con alcance limitado por rol.
- **Superficies**: chat y llamada de voz.
- **Reglas propias**: el copiloto respeta exactamente los permisos de quien pregunta; no inventa cuando no tiene el dato.
- **Estado**: frágil.
- **Especificación**: pendiente.

### Administración e importaciones

Traer al sistema lo que vive fuera.

- **Actores**: master, responsable de operación.
- **Superficies**: importaciones, mapeo de artículos del terminal, importación de recetas, importación de datos históricos.
- **Reglas propias**: una importación nunca sobrescribe en silencio; toda importación deja rastro de lo que hizo.
- **Estado**: tolerada.
- **Especificación**: pendiente.

---

## Cómo cambia este mapa

- Aparece una capacidad nueva → se añade aquí **antes** de construirla.
- Se retira una capacidad → se retira aquí y se anota en [CHANGELOG](../5-estado/CHANGELOG.md) por qué.
- Cambia el estado de una capacidad → se actualiza aquí, y si el motivo es un compromiso asumido, se registra en [DEUDA](../5-estado/DEUDA.md).

Una capacidad que no está en este mapa no existe como producto, aunque exista como código.
