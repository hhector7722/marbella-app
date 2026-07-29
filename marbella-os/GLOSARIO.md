---
documento: GLOSARIO
clase: vivo
estado: vigente
capa: raiz
responsable: propiedad del producto
revisado: 2026-07-29
caducidad: 6 meses
supersede: —
---

# GLOSARIO — Vocabulario canónico de Marbella

Un término, un significado. Este documento es la dependencia raíz del corpus: ninguna especificación puede ser precisa si dos documentos llaman igual a cosas distintas, o distinto a la misma cosa.

Cuando un término tiene un nombre en la interfaz y otro en la base de datos, aquí se declaran ambos y cuál manda en cada contexto. Los conflictos vivos están marcados con **⚠ conflicto** y son deuda de vocabulario, no ambigüedad aceptada.

Reglas de uso:

- El término **canónico** es el que se usa en documentación y en interfaz.
- El identificador técnico se cita solo cuando se habla de datos o de código.
- Añadir un término nuevo al producto obliga a añadirlo aquí antes de usarlo en cualquier otro documento.

---

## 1. Identidad

| Término | Significado |
|---|---|
| **Marbella** | El producto. Nombre corto usado en interfaz y documentación. |
| **Bar La Marbella** | Nombre comercial del negocio. |
| **Fogo Torrat S.L.** | Razón social. CIF B-09761628. Av. Litoral 86, 08005 Barcelona. Aparece en documentos impresos, nunca en interfaz. |
| **Marbella OS** | El corpus documental oficial. No es un componente de software. |

---

## 2. Personas y acceso

| Término | Significado | Identificador técnico |
|---|---|---|
| **Perfil** | Registro de una persona en el sistema, con su rol y sus condiciones laborales. | `profiles` |
| **Rol** | Nivel de acceso de un perfil. Ver `1-producto/ACTORES-Y-ROLES.md` para la matriz completa. | `profiles.role` |
| **Master** | Acceso total, incluida la analítica de uso. **No es un rol de base de datos**: se determina por correo electrónico. | `isMasterDashboardUser(email)` |
| **Plantilla** | El conjunto de personas visibles en las vistas operativas del equipo. ⚠ conflicto: también se llama «plantilla» al documento impreso de jornada. En documentación, «plantilla» es siempre el equipo; el documento se llama **hoja de jornada**. | `profiles.visible_in_plantilla` |
| **Baja** | Fin de la relación laboral de un perfil. Una fecha de baja igual a la de alta indica dato erróneo, no baja real. | `profiles.end_date` |

---

## 3. Tiempo y jornada

| Término | Significado | Identificador técnico |
|---|---|---|
| **Fichaje** | Registro de entrada o salida de una persona. Unidad atómica de la asistencia. | `time_logs` |
| **Semana Marbella** | Semana de negocio, de lunes a domingo. Toda magnitud semanal se ancla al lunes. | `week_start`, `week_end` |
| **Horas ordinarias** | Horas trabajadas dentro de la jornada contratada. | `weekly_snapshots.ordinary_hours` |
| **Horas extras** | Horas trabajadas por encima de la jornada contratada, una vez aplicado el arrastre. | `weekly_snapshots.extra_hours` |
| **Jornada contratada** | Horas semanales pactadas en el tramo de contrato vigente esa semana. | `contracted_hours_snapshot` |
| **Tramo de contrato** | Periodo con condiciones laborales constantes. Editar un tramo no crea tramos nuevos; se puede abrir una vigencia nueva desde una fecha. | `hours_contract_terms` |
| **Jornada fija** | Política por la que una persona computa su jornada completa con independencia de sus fichajes, y sus fichajes generan solo extras. Aplicada hoy a un único usuario. | — |
| **Bolsa de horas** | Saldo de horas acumuladas a favor o en contra de una persona, que se arrastra de una semana a la siguiente. Término canónico. | `balance_hours`, `final_balance` |
| **Arrastre** | El acto de trasladar el saldo de bolsa de una semana a la siguiente. Sinónimo interno en código: *carry*. En documentación se dice **arrastre**. | `computeCarry` |
| **Deuda de horas** | Bolsa negativa. La persona debe horas. Cuando la bolsa de salida es negativa, extras e importe son cero por invariante. | — |
| **Modo bolsa** | Las horas extras de la semana se acumulan en la bolsa en lugar de pagarse. | `prefer_stock_hours`, `prefer_stock_hours_override` |
| **Modo pago** | Las horas extras de la semana se pagan. Es el modo contrario al de bolsa. ⚠ conflicto: el sistema legacy llamaba a este concepto `AcumulaHoras` con la polaridad invertida; ese nombre no debe usarse. | — |
| **Semana pagada** | Semana cuyas extras ya se han abonado. Marca administrativa, no calculada. | `weekly_snapshots.is_paid` |
| **Liquidación semanal** | Resultado del cálculo de una semana para una persona: horas, extras, bolsa de entrada y salida, e importe. | `liquidateWeek` |

---

## 4. Motores y capas de cálculo

Vocabulario congelado por [ADR-0001](4-decisiones/ADR-0001-hours-engine-productor-unico.md). Ningún documento puede redefinir estos términos.

| Término | Significado |
|---|---|
| **Hours Engine** | Único productor de las magnitudes de liquidación de horas. Función pura. |
| **Cost Engine** | Único productor del valor económico de las horas extras. |
| **Proyección persistida** | La fila semanal que almacena el resultado del Hours Engine. **No calcula nada.** Nombre canónico completo: proyección persistida de liquidación semanal. Identificador: `weekly_snapshots`. |
| **Writer** | El único componente autorizado a escribir la proyección. |
| **Read Model** | Capa que lee la proyección y la convierte en datos de presentación, sin reinterpretar negocio. |
| **DTO de pintura** | Estructura final que consume la interfaz. La interfaz pinta; no interpreta. |
| **Hecho** | Dato de entrada no calculado: fichajes, tramos de contrato, marcas administrativas. |
| **Override** | Hecho administrativo que sustituye un valor por decisión humana. Es entrada del cálculo, nunca resultado. |
| **Shadow** | Mecanismo de comparación entre dos productores para detectar divergencias. Instrumento de validación, no fuente de verdad. |

---

## 5. Dinero del personal

| Término | Significado | Identificador técnico |
|---|---|---|
| **Coste laboral** | Lo que cuesta el personal a la empresa. Se compone de coste ordinario y coste extra. | — |
| **Coste ordinario** | Parte del coste procedente de la nómina, prorrateada por días. | `payroll_monthly_totals` |
| **Coste extra** | Valor económico de las horas extras, producido por el Cost Engine. | `weekly_snapshots.total_cost` |
| **Nómina** | Documento individual de retribución de una persona. | `nominas`, `employee_documents` |
| **Resumen de nóminas** | Documento mensual de la gestoría con el coste total de empresa. Fuente de verdad del coste ordinario. | `payroll_monthly_totals` |
| **Propina** | Importe repartible entre el personal. | — |
| **Bote** | Agrupación de propinas de un periodo, a repartir. | `tip_pools` |
| **Sanción** | Deducción aplicada al reparto de propinas de una persona. | — |
| **Consumo personal** | Producto consumido por el personal, imputado a su cuenta. | — |

---

## 6. Venta y sala

| Término | Significado | Identificador técnico |
|---|---|---|
| **TPV** | Terminal de punto de venta. El sistema donde se cobra. | — |
| **BDP** | Base de datos del TPV, sobre SQL Server, ajena a Marbella. Sistema origen de la venta. | — |
| **Puente** | Proceso que extrae datos de BDP en el equipo del TPV y los envía a Marbella. | — |
| **Pasarela** | Proceso que recibe lo que envía el puente y lo escribe en la base de datos de Marbella. | — |
| **Ticket** | Documento de venta cerrado. | — |
| **Comanda** | Petición de artículos asociada a una mesa, previa al ticket. | — |
| **COMPROBANTE** | Documento que emite el TPV y **no es una venta**. Debe excluirse en todo cálculo de ventas y de pendientes. | `Numero_Documento = 'COMPROBANTE'` |
| **Mesa** | Punto de consumo en sala, con estado y ticket abierto. | `estado_sala` |
| **Radar de sala** | Vista en tiempo real de las mesas abiertas. | — |
| **KDS** | Pantalla de cocina. Del inglés *kitchen display system*; se mantiene la sigla por uso establecido. | `kds_orders`, `kds_order_lines` |
| **Tanda** | Agrupación de líneas enviadas a cocina en un mismo momento para un ticket. | — |
| **Delta** | Diferencia entre el estado anterior y el actual de un ticket, que genera las líneas nuevas para cocina. | `fncalcdelta` |

---

## 7. Caja y tesorería

| Término | Significado | Identificador técnico |
|---|---|---|
| **Cierre de caja** | Proceso diario de cuadre del efectivo y los cobros. | `cash_closings` |
| **Esperado** | Efectivo que debería haber según ventas, tarjeta y pendiente. | — |
| **Descuadre** | Diferencia entre el efectivo contado y el esperado. | — |
| **Pendiente** | Importe de tickets no cobrados todavía. | — |
| **Cobros** | Importes cobrados de deuda anterior. | — |
| **Caja de cambio** | Cajón con efectivo destinado a dar cambio. | `cash_boxes` |
| **Arqueo** | Recuento del efectivo de una caja. | — |
| **Cambio** | Traslado de efectivo entre dos cajas. Genera dos apuntes cruzados. | `treasury_log`, tipo `EXCHANGE` |
| **Tesorería** | Registro de todos los movimientos de efectivo. | `treasury_log` |
| **Libro mayor** | Registro contable manual del responsable, con saldo acumulado. | `manager_ledger` |
| **Desglose** | Recuento por denominación de billetes y monedas. | — |

---

## 8. Compras e inventario

| Término | Significado | Identificador técnico |
|---|---|---|
| **Proveedor** | Empresa que suministra mercancía. | `suppliers` |
| **Albarán** | Documento de entrega de mercancía. Es el documento que se escanea. | `purchase_invoices` |
| **Línea de albarán** | Artículo concreto de un albarán, con cantidad y precio. | — |
| **Mapeo** | Correspondencia aprendida entre el artículo de un proveedor y un ingrediente de Marbella. | `supplier_item_mappings` |
| **Ingrediente** | Materia prima con precio y unidades. | `ingredients` |
| **Precio actual** | Precio de compra vigente de un ingrediente. Fuente de verdad del coste de materia prima. | `ingredients.current_price` |
| **Precio por unidad de compra** | Modo de precio en el que el importe se refiere a la unidad en que se compra. | `per_purchase_unit` |
| **Precio por paquete** | Modo de precio en el que el importe se refiere al paquete completo. | `per_pack` |
| **Precio bloqueado** | Marca que impide que un albarán sobrescriba el precio de un ingrediente. | `price_locked` |
| **Pedido** | Solicitud de mercancía a un proveedor. ⚠ conflicto: «pedido» designa también el encargo de un cliente en el dominio de eventos. En documentación, distinguir **pedido a proveedor** y **encargo de cliente**. | `purchase_orders` |
| **Movimiento** | Cambio en el stock de un ingrediente. | — |
| **Ajuste** | Movimiento de corrección manual del stock. | tipo `ADJUSTMENT` |
| **Merma** | Producto perdido, caducado o inutilizable. | — |
| **Rectificación** | Corrección de una línea de albarán ya aplicada al stock. | — |

---

## 9. Cocina y carta

| Término | Significado | Identificador técnico |
|---|---|---|
| **Receta** | Elaboración con sus ingredientes y cantidades. | `recipes`, `recipe_ingredients` |
| **Escandallo** | Cálculo del coste de una receta a partir del precio de sus ingredientes. | — |
| **Ración** | Unidad de servicio de una receta. | — |
| **PVP** | Precio de venta al público. Nunca se confunde con el coste. | — |
| **PAV** | Precio con el que se compara el PVP en el análisis de rentabilidad. | — |
| **Carta** | La oferta publicada al cliente. Superficie pública, sin sesión. | — |
| **Plato Marbella** | La ficha de plato en la carta pública, con su presentación propia. | — |

---

## 10. Eventos y encargos

| Término | Significado | Identificador técnico |
|---|---|---|
| **Evento** | Celebración o servicio concertado con fecha. | `events` |
| **Reserva** | Compromiso de un cliente para un evento. | — |
| **Encargo** | Petición concreta de producto asociada a un evento. Se documenta y se imprime. | — |
| **Pedido por enlace** | Formulario que un cliente rellena sin sesión, autenticado por un token en la dirección. | `/pedido/[token]` |
| **Pabellón** | Instalación deportiva cuya programación se importa desde documentos externos. | — |
| **Actividad** | Uso programado del pabellón. | `activity_occurrences` |
| **Ocurrencia** | Instancia concreta de una actividad en una fecha y hora. | — |

---

## 11. Producto y sistema

| Término | Significado |
|---|---|
| **Capacidad** | Dominio funcional del producto, con actores, reglas y pantallas propias. Unidad de organización de `1-producto/`. |
| **Recorrido** | Secuencia de acciones que una persona real completa para lograr un objetivo, normalmente cruzando varias capacidades. |
| **Superficie** | Medio por el que el producto se manifiesta: aplicación instalada, navegador, documento impreso, pantalla de cocina. |
| **Token de diseño** | Valor visual con nombre semántico, definido en `2-diseno/TOKENS.md`. El único origen legítimo de un color, un radio, una sombra o un espaciado. |
| **Copiloto** | Asistente conversacional del producto, con permisos propios por rol. |
| **Uso** | Telemetría interna de actividad de las personas del equipo dentro del producto. |
| **Regla de valor vacío** | En vistas de lectura, un valor igual a cero se muestra en blanco, no como «0». Norma de producto, definida en `2-diseno/CONTENIDO-Y-TONO.md`. Nombre anterior: *Zero-Display*. |

---

## 12. Deuda de vocabulario

Conflictos abiertos que deben resolverse. Cada uno tiene su entrada en `5-estado/DEUDA.md`.

- **«Plantilla»** significa a la vez el equipo de personas y el documento impreso de jornada. Resolución propuesta: reservar «plantilla» para el equipo y usar «hoja de jornada» para el documento.
- **«Pedido»** designa el pedido a proveedor y el encargo de cliente. Resolución propuesta: nombrar siempre el complemento.
- **`prefer_stock_hours` frente a modo bolsa**: el identificador técnico no dice lo que significa, y el nombre legacy `AcumulaHoras` tenía polaridad inversa. Mientras el identificador no se renombre, la documentación usa siempre «modo bolsa» y «modo pago».
- **`role` no está enumerado en la base de datos.** El código usa `admin`, `manager`, `staff`, `supervisor` y `user`, y la columna admite cualquier cadena. Hasta que exista una enumeración, la matriz de `1-producto/ACTORES-Y-ROLES.md` es la única definición fiable.
- **`weekend` como tipo de fichaje se muestra como «Enfermo»** en la interfaz. El identificador y el concepto no tienen relación; el valor en base de datos se conserva por compatibilidad.
