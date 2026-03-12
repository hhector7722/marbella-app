---
name: Migrador Legacy AppSheet
description: Traducción fiel de fórmulas y lógica del sistema legacy (AppSheet/Excel) al nuevo esquema Supabase.
---

# Migrador Legacy AppSheet 📜

## 🎯 Propósito

Traducir la **intención** de las fórmulas y reglas de negocio del sistema antiguo (AppSheet, Excel, CSV con lógica) al código y esquema del proyecto Bar La Marbella. La prioridad es **exactitud matemática y semántica** sobre limpieza de código.

## ⚠️ REGLAS INQUEBRANTABLES

### 1. Prioridad: Exactitud > Estética

- Replicar el **comportamiento** de la fórmula legacy, no solo la sintaxis.
- Si una fórmula antigua redondea en un paso concreto, el nuevo código debe redondear en el mismo paso.
- No "mejorar" la lógica sin confirmar que el resultado numérico coincide en casos de prueba.

### 2. Fuente de verdad: `context/`

- **Leer primero** los ficheros en la carpeta `context/` cuando existan (CSV, TXT, capturas, descripciones de fórmulas).
- Si `context/` está vacío o no contiene el archivo relevante, **no inventar** datos ni fórmulas; preguntar al usuario o indicar que faltan fuentes.
- Documentar en comentarios de código de dónde procede cada regla (ej. `// Legacy: Empleados.csv AcumulaHoras + ResumenHoras`).

### 3. Relación con Importador Legacy

- **Migrador:** traduce *lógica y fórmulas* (cálculos de horas, márgenes, resúmenes, validaciones).
- **Importador (`importador-legacy-marbella`):** importación *masiva* de datos (ETL de Excel/CSV a tablas). Para cargar datos en bulk, usar o coordinar con esa habilidad.

### 4. Casos típicos

- Fórmulas de **horas/nóminas** (ResumenHoras, AcumulaHoras, HorasBanco): alinear con la habilidad `auditor-horas-nominas` y el esquema `time_logs`, `weekly_snapshots`, `profiles`.
- Fórmulas de **costes o márgenes**: alinear con `gestor-stock-costes` y `lib/utils.ts`.
- Fechas y zonas horarias: no usar `new Date('YYYY-MM-DD')` para fechas locales; construir con `new Date(y, m - 1, d)` o usar utilidades del proyecto para evitar timezone shifts.

## ✅ Checklist de Ejecución

- [ ] ¿Existen en `context/` los archivos o descripciones necesarios?
- [ ] ¿Se ha replicado la intención de la fórmula, no solo la sintaxis?
- [ ] ¿Los resultados numéricos coinciden en casos de prueba con el legacy (si hay datos de ejemplo)?
- [ ] ¿Se ha documentado el origen de la regla en comentarios o en PROJECT_STATUS si es una decisión relevante?

## 🚨 Advertencias

- **Error:** Reescribir la lógica "más limpia" y cambiar el resultado.
  - **Solución:** Mantener pasos y redondeos equivalentes al legacy; refactorizar solo después de validar.
- **Error:** Asumir formato de fechas o decimales (coma vs punto) sin comprobar el origen.
  - **Solución:** Leer `context/` y usar utilidades de parsing del proyecto (p. ej. `parseLocalSafe`, `roundMoney`).
