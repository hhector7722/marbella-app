---
documento: ESTADO
clase: vivo
estado: vigente
capa: estado
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-09-02
caducidad: 1 mes
supersede: PROJECT_STATUS.md §ESTADO GENERAL
---

# ESTADO — Fotografía del 2 de septiembre de 2026

Dónde está Marbella hoy. **Este documento se reescribe, no se acumula**: el historial vive en [CHANGELOG](CHANGELOG.md) y en git.

Techo duro: 200 líneas. Si no cabe, es que se está usando como changelog.

---

## Resumen en tres frases

El producto está en producción y sostiene la operación diaria del negocio. El dominio de horas sigue en movimiento. La interfaz de gestión tiene jerarquía visual canónica ([ADR-0010](../4-decisiones/ADR-0010-jerarquia-visual-canonica.md)) aplicada a las pantallas piloto (Labor, Albaranes, Carta, Reservas, Propinas, Caja, Staff, Eventos, Inventario, Recetas, Sala). Modal y Button no se reabren. Quedan literales en [D28](DEUDA.md).

---

## Funciona y se usa a diario

- **Fichaje y asistencia.** Fichaje, historial propio, vista de equipo y edición por día. La semana de una persona es la misma en Asistencia, mosaico Staff y horas extras, con el cromo de Cierres y un pie semanal. En el mosaico Staff flota sobre el petróleo, sin cabecera. La vista de plantilla comparte el cromo y no el pie.
- **Venta y sala.** Radar de sala en vivo y análisis de ventas. Los documentos que no son venta se excluyen correctamente de ventas, pendientes y cierre.
- **Cocina.** Pantalla de cocina con tandas, color por tiempo de espera y cierre manual.
- **Caja y tesorería.** Cierre diario con recuento por denominación, historial de cierres (resumen del mes y de ayer sobre el calendario), movimientos, arqueo, cambio entre cajas y libro mayor con saldo acumulado.
- **Compras y albaranes.** Captura de albarán, interpretación automática, mapeo aprendido, aplicación a stock, rectificación y control de precios. Incluye compras no inventariables como gasto sin stock.
- **Recetas y escandallos.** Recetas, ingredientes, coste por ración y mapeo con los artículos del terminal de venta.
- **Carta.** Carta pública, carta interna y editor.
- **Eventos y encargos.** Eventos, formulario público, encargo por enlace con token y documento impreso.
- **Propinas, reservas, actividades del pabellón, perfil y documentos.**
- **Analítica de uso.** Uso de la aplicación, analítica web e instalación, para el maestro.
- **Documentos impresos.** Sistema formal versión 2.0, con hoja de jornada y encargos migrados.

## En movimiento

- **Dominio de horas.** El motor de cálculo es desde hace poco el único productor de las magnitudes de liquidación, con arrastre encadenado real entre semanas. La proyección persistida ya no calcula. Agosto no genera deuda de asistencia en semanas staff cuyo lunes cae en ese mes ([HORAS](../3-ingenieria/dominio/HORAS.md)). La transición dejó una deuda declarada: parte de las lecturas todavía ejecutan el motor en carga en lugar de leer la proyección, lo cual está previsto en la decisión que lo gobierna como paso intermedio.
- **Coste laboral.** El coste ordinario procede del resumen mensual de la gestoría. El productor mensual está endurecido con versionado de intérprete y registro de importaciones; parte del diseño documentado todavía no está implementado.
- **Pabellón.** Importación e interpretación automática de la programación, con revisión humana. En estabilización.
- **Análisis de negocio.** Indicadores en evolución.
- **Jerarquía visual.** Contrato vigente (ADR-0010). Migración de literales en pantallas no prioritarias: [D28](DEUDA.md).

## Frágil

- **Inventario.** Funciona, pero el rastro de movimientos y las correcciones tienen puntos débiles conocidos.
- **Consumo personal.** Depende de conversiones de unidad que no siempre están definidas.
- **Copiloto.** Operativo, con dependencia de un único proveedor de visión y sin contrato documentado.
- **Cálculo del efectivo esperado.** Correcto en el caso general; hay casos en que el dato del terminal y el recuento no concuerdan y el descuadre resultante no es explicativo.

## Legacy tolerado

Cosas que no se van a arreglar por ahora, con decisión consciente:

- **Documento de pedido a proveedor en estilo heredado.** Se evaluó migrarlo y se rechazó. No es deuda.
- **Identificadores internos sin relación con su significado**, como el tipo de día que se muestra como «Enfermo». Se conservan por compatibilidad con datos históricos.
- **Compilador de producción forzado al anterior** por inestabilidad del exportador nuevo.
- **Código de integración del terminal de venta desplegado por copia manual.** Ver [DEUDA](DEUDA.md).

---

## Qué manda durante la transición documental

Marbella OS está recién creado y convive con el corpus anterior. Para evitar dos fuentes de verdad:

| Materia | Manda | Hasta |
|---|---|---|
| Producto, experiencia, diseño, tokens, componentes | `marbella-os/` | Permanente |
| Reglas de negocio de horas | [ADR-0001](../4-decisiones/ADR-0001-hours-engine-productor-unico.md) | Permanente |
| Contrato de la proyección semanal | [contrato de proyección v1](../3-ingenieria/contratos/PROYECCION-v1.md) | Permanente |
| Historial de cambios anterior a hoy | archivo congelado de `PROJECT_STATUS.md` | Permanente, no normativo |
| Historial de cambios desde hoy | [CHANGELOG](CHANGELOG.md) | Permanente |

**Todo lo que esté en `6-investigacion/archivo/` o `6-investigacion/spikes/` no es normativo**, con independencia de lo que afirme su texto.

La capa de ingeniería está completa desde el 2026-07-29: arquitectura, modelo de datos, seguridad, calidad, dominio, contratos, integraciones y operación. Solo quedan por escribir las **especificaciones de capacidad**, y se escriben bajo demanda al intervenir en cada una.

---

## Prueba de que los informes caducan

Al preparar [DEUDA](DEUDA.md) se verificaron uno a uno los hallazgos «críticos» del informe de mapeo con la realidad. **Cuatro de los cinco ya no existen**: la tabla y las columnas inexistentes que se citaban, la consulta con el campo de nombre erróneo y el punto de acceso de herramientas de copiloto han desaparecido del código.

El informe seguía en la raíz del repositorio, sin fecha de caducidad y con aspecto de norma vigente. Es la justificación empírica de la regla de [CANON §8](../CANON.md#8-ciclo-de-vida): **un análisis con fecha nunca es norma.**

---

## Cifras de contexto

Sirven para dimensionar, no para presumir:

- 588 ficheros de código en la aplicación, 58 pantallas.
- 227 ficheros marcados como cliente. **Es la cifra que hay que bajar.**
- 40 módulos de acciones de servidor y 27 manejadores de ruta.
- 26 ficheros de prueba, concentrados en el motor de horas, el sistema de comparación, el intérprete de nóminas y el Design System. Cero pruebas de interfaz.
- ~20 componentes transversales (Button, Modal, Surface, Field, EmptyState, Notice, KpiStat, PageScreen, DocumentListRow, PetroleumSegmented, DashboardShortcut…). La insignia de estado sigue sin pieza.
- Tokens de pantalla adoptados en esas primitivas. Los literales de marca restantes son [D28](DEUDA.md), no ausencia de contrato.

---

## Cómo se actualiza este documento

- Se reescribe cuando cambia el estado, no cuando pasa algo. Un cambio concreto va a [CHANGELOG](CHANGELOG.md).
- Si supera las 200 líneas, sobra contenido: casi siempre historial disfrazado.
- Si supera su caducidad sin revisión, deja de ser fiable y el índice lo marca como sospechoso.
