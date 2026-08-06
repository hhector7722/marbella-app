---
documento: ADR-0006
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-08-06
depende_de: CANON
supersede: —
---

# ADR-0006 · Pipeline de Nóminas y Dashboard Labor

## Contexto

La arquitectura del sistema de nóminas (Pipeline de Nóminas) procesa los resúmenes oficiales procedentes de la gestoría y alimenta al Dashboard Labor de Marbella OS. Originalmente, existía una confusión estructural entre el concepto de "Liquidación" (fila en el PDF de la gestoría) y "Trabajador" (entidad en la base de datos). 

El parser y el validador del dominio (`INV-03`) presuponían la regla 1 Trabajador = 1 Liquidación. Esto provocaba que resúmenes mensuales perfectamente válidos (donde un trabajador recibía una doble liquidación por finiquito, paga extra o múltiples contratos) fuesen rechazados por el validador, rompiendo la cadena de importación (especialmente en los meses de junio y julio).

Adicionalmente, los nombres en los resúmenes de la gestoría no siempre coincidían con la identidad interna en Marbella OS, lo que introducía ruido e impedía emparejar costes a usuarios reales sin crear lógica heurística inestable.

## Decisión

El sistema adopta un diseño explícito de separación entre los "Hechos Contables" (liquidaciones oficiales) y su representación funcional ("Trabajador agregado") en el read model. Se consolidan las siguientes decisiones arquitectónicas:

### 1. `employee_payroll_facts` representa liquidaciones, no trabajadores

Cada registro en la tabla `employee_payroll_facts` corresponde a una liquidación oficial, no a una persona de forma biunívoca en ese periodo.
- Un trabajador puede tener varias liquidaciones en un mismo periodo.
- Es el comportamiento esperado y representa situaciones reales de nómina (finiquitos, múltiples contratos, regularizaciones, pagas extraordinarias).
- **Nunca debe asumirse:** 1 trabajador = 1 fila.

### 2. Modificación de la regla `INV-03`

Se modifica la validación `INV-03` del Snapshot.
- **Antes:** Comprobaba rígidamente si el número de filas extraídas (`settlements.length`) era igual al campo `TOTAL TRABAJADORES` del PDF. Esto era incorrecto.
- **Ahora:** La regla `INV-03` agrupa e identifica los "trabajadores únicos" presentes en las liquidaciones, utilizando el `employeeCode` (o como fallback, el `employeeName` normalizado). 
- **Por qué funciona:** Sigue detectando errores reales (si se pierde la extracción de una persona por un fallo del OCR), pero ahora tolera que existan `N` liquidaciones válidas para `X` trabajadores únicos. No rechaza PDFs válidos que contienen realidades contables.

### 3. Introducción del campo `payroll_name`

Se introduce el campo oficial `profiles.payroll_name` para resolver las discrepancias de identidad.
- **No es un alias cualquiera:** Es estrictamente el nombre oficial de la gestoría cuando discrepa de cómo conocemos al trabajador en Marbella OS (ej. variaciones ortográficas, apellidos compuestos).
- **Orden de resolución en `PayrollEmployeeNormalizer`:**
  1. Identidad explícita: Se busca coincidencia exacta con `payroll_name`.
  2. Algoritmo estándar (DNI, nombre + apellidos normalizados).
  3. Si no encaja, el trabajador marca un error o se ignora dependiendo de la estrictez.

### 4. El Dashboard Labor representa trabajadores, nunca liquidaciones

El Dashboard debe responder a la pregunta "cuánto cuesta este trabajador", independientemente de en cuántos recibos se haya troceado su pago.

El flujo unidireccional de lectura (Read Model) queda estandarizado así:
1. `employee_payroll_facts` contiene las liquidaciones.
2. `PayrollFactRepository.getMonthlyCompanyCostConsolidated()` consulta la base de datos y **agrega** matemáticamente todas las liquidaciones de un trabajador para un mes concreto, reduciéndolas a un solo importe.
3. `PayrollAllocationService` divide este coste consolidado mensual entre los días reales de contrato vigentes.
4. `LaborCostDayReadModelProjector` (el proyector de UI) emite una única entidad (una sola fila en pantalla) para cada trabajador.

El Dashboard Labor únicamente muestra un trabajador, sin exponer a la interfaz el número de liquidaciones en las que se descompuso su nómina.

### 5. Invariantes del Sistema

Para prevenir futuras regresiones, se establecen como inquebrantables los siguientes invariantes:
1. **`employee_payroll_facts` almacena hechos contables**: No se pueden fusionar filas en esta tabla; cada fila refleja un bloque del PDF original.
2. **`payroll_monthly_totals` almacena el total oficial del mes**.
3. **El Dashboard Labor trabaja únicamente con costes consolidados**, delegando la agregación a la capa de persistencia/lectura.
4. **La cuadratura es obligatoria:** La suma total de `employee_payroll_facts.total_company_cost` siempre debe cuadrar matemáticamente con `payroll_monthly_totals.total_company_cost`.
5. **El parser es de sólo lectura:** Nunca modifica los importes oficiales. Se limita a reflejar lo que dice el documento de la gestoría.
6. **El sistema conserva la historia:** Todas las liquidaciones originales quedan grabadas de forma inmutable, vinculadas al hash de su PDF de origen.

## Alternativas descartadas

- **Mantener 1 fila por trabajador en Base de Datos (Fusionando en escritura):** Descartado. Si fusionábamos las liquidaciones al guardar en la base de datos, destruíamos el detalle de cada liquidación individual (ej. si una era por despido y otra era ordinaria). Viola el principio de "Hecho inmutable".
- **Mantener tabla extra de alias `payroll_employee_aliases`:** Descartado. Se propuso una tabla paralela, pero aumentaba la deuda técnica (mantener un CRUD de aliases). La identidad de nómina es un atributo del trabajador, por lo que pertenece a su tabla `profiles`.
- **Añadir el desglose de liquidaciones a la UI del Dashboard:** Descartado. El Dashboard Labor es una herramienta operativa de márgenes (coste total / ventas), no una herramienta de auditoría de RRHH para visualizar finiquitos frente a pagos ordinarios.

## Consecuencias aceptadas

- El read model diario hace una agregación on-the-fly (`reduce`) del coste mensual. Aceptamos este coste computacional menor frente a la alternativa de perder granularidad.
- El mantenimiento de los discrepantes queda atado al campo `payroll_name`, requiriendo intervención manual si la gestoría cambia de repente el nombre a otro distinto de nuevo.
