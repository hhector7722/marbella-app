---
name: Auditor Horas Nóminas
description: Cálculos precisos de saldos, horas extras y bolsa de horas según tipo de empleado
---

# Auditor Horas Nóminas

Esta habilidad es la **única responsable** de calcular los saldos de tiempo, horas extras y deudas de horas entre la empresa y el empleado. Debe ser matemáticamente perfecta y manejar la lógica condicional de "Bolsa de Horas" según el tipo de empleado.

## 🎯 Propósito

Automatizar el cálculo exacto de:
- **Horas trabajadas vs. Horas contratadas** (por día, semana, mes)
- **Horas extras** (solo para empleados que NO acumulan)
- **Saldo de Bolsa de Horas** (para empleados que SÍ acumulan)
- **Balance global** (carry-over entre semanas/meses)

## 📊 Fuentes de Verdad (Legacy)

### AppSheet (Sistema Antiguo)
- **Empleados.csv:**
  - `AcumulaHoras` (TRUE/FALSE): Flag crítico que determina el comportamiento
  - `HorasBanco`: Saldo histórico acumulado
  - `HorasContrato`: Horas semanales/mensuales del contrato

- **ResumenHoras (Script):**
  - Cálculo semanal de `BalanceHorasSemana`
  - Lógica de incremento/decremento para forzar recálculo de fórmulas

### Nuevo Sistema (Next.js + Supabase)
- **Tabla `employees`:**
  - `acumula_horas` (BOOLEAN)
  - `horas_contrato` (DECIMAL)
  - `saldo_bolsa_horas` (DECIMAL) - **Nueva columna propuesta**

- **Tabla `time_logs`:**
  - `employee_id`, `clock_in`, `clock_out`
  - **IRON RULE:** 1 shift per day (índice único)

- **Tabla `weekly_balances`:**
  - `employee_id`, `week_start`, `target_hours`, `worked_hours`, `balance_delta`

---

## 🚦 LA REGLA DEL TIPO DE EMPLEADO (El Semáforo)

### CASO A: `acumula_horas = TRUE` (Bolsa de Horas)

**Comportamiento:**
- Si el empleado hace **42 horas** y su contrato es de **40 horas**:
  - ❌ **NO** se marcan 2 horas extras para pago inmediato
  - ✅ **SE SUMAN** +2 horas a su `saldo_bolsa_horas` (Deuda de la empresa al empleado)

**Ejemplo:**
```typescript
// Empleado: Pere Boladeres (HorasContrato: 28h/semana, AcumulaHoras: TRUE)
// Semana actual: 30 horas trabajadas
// Saldo anterior: -5 horas (debía a la empresa)

const horasContratadas = 28;
const horasTrabajadas = 30;
const saldoAnterior = -5;

const balanceSemana = horasTrabajadas - horasContratadas; // +2
const nuevoSaldo = saldoAnterior + balanceSemana; // -5 + 2 = -3

// Resultado:
// - Horas Extras Pagables: 0
// - Nuevo Saldo Bolsa: -3h (aún debe 3 horas a la empresa)
```

### CASO B: `acumula_horas = FALSE` (Pago de Extras)

**Comportamiento:**
- Si el empleado hace **42 horas** y su contrato es de **40 horas**:
  - ✅ **SE GENERAN** 2 horas extras para pago en la nómina del mes
  - ❌ Su `saldo_bolsa_horas` se mantiene en **0** (no acumula)

**Ejemplo:**
```typescript
// Empleado: Juan (HorasContrato: 40h/semana, AcumulaHoras: FALSE)
// Semana actual: 42 horas trabajadas

const horasContratadas = 40;
const horasTrabajadas = 42;

const horasExtras = Math.max(0, horasTrabajadas - horasContratadas); // 2
const saldoBolsa = 0; // Siempre 0 para estos empleados

// Resultado:
// - Horas Extras Pagables: 2h (se pagan en nómina)
// - Saldo Bolsa: 0h (no acumula)
```

---

## 🔄 LA REGLA DEL ARRASTRE (Carry-Over)

### Cierre Semanal (Domingo 23:59)

Al cerrar una semana, el saldo final (`balance_delta`) debe actualizarse en el saldo global del empleado:

```typescript
// Función de cierre semanal
async function cerrarSemana(employeeId: string, weekStart: Date) {
  const weekBalance = await getWeeklyBalance(employeeId, weekStart);
  const employee = await getEmployee(employeeId);
  
  if (employee.acumula_horas) {
    // CASO A: Acumula en Bolsa
    const nuevoSaldo = employee.saldo_bolsa_horas + weekBalance.balance_delta;
    
    await updateEmployee(employeeId, {
      saldo_bolsa_horas: nuevoSaldo
    });
    
    console.log(`✓ Semana cerrada: ${weekBalance.balance_delta}h → Saldo global: ${nuevoSaldo}h`);
  } else {
    // CASO B: No acumula (solo registrar extras para pago)
    const horasExtras = Math.max(0, weekBalance.balance_delta);
    
    await registrarHorasExtras(employeeId, horasExtras, weekStart);
    
    console.log(`✓ Semana cerrada: ${horasExtras}h extras registradas para pago`);
  }
}
```

**Ejemplo de Arrastre:**
```
Semana 1: Trabajó 38h de 40h → Balance: -2h → Saldo: -2h
Semana 2: Trabajó 42h de 40h → Balance: +2h → Saldo: -2 + 2 = 0h
Semana 3: Trabajó 45h de 40h → Balance: +5h → Saldo: 0 + 5 = +5h
```

---

## 🔢 PRECISIÓN DECIMAL (Cero Errores)

### Reglas de Redondeo

1. **Trabajar SIEMPRE con minutos o decimales exactos:**
   ```typescript
   // ✅ CORRECTO: Usar minutos primero
   const minutosReales = Math.round((clockOut - clockIn) / (1000 * 60));
   const horasDecimales = minutosReales / 60; // 510 min → 8.5h
   
   // ❌ INCORRECTO: Redondear antes del cálculo
   const horas = Math.round((clockOut - clockIn) / (1000 * 60 * 60)); // 8h (pierde 30min)
   ```

2. **Redondear SOLO en el resultado final:**
   ```typescript
   // Ejemplo: 8h 27min
   const minutosReales = 507;
   const horasExactas = minutosReales / 60; // 8.45h
   
   // Para visualización:
   const horasRedondeadas = Math.round(horasExactas * 100) / 100; // 8.45h
   
   // Para cálculos financieros (cuartos de hora):
   const horasCuartos = Math.round(horasExactas * 4) / 4; // 8.5h
   ```

3. **Alertas de posibles errores:**
   ```typescript
   // Shift > 12h (posible olvido de clock-out)
   if (horasTrabajadas > 12) {
     throw new Error(`⚠️ ALERTA: Shift de ${horasTrabajadas}h excede 12h. Verificar fichaje.`);
   }
   
   // Shift < 1h (posible error de entrada/salida)
   if (horasTrabajadas < 1 && clockOut !== null) {
     console.warn(`⚠️ Aviso: Shift de ${horasTrabajadas}h es inusualmente corto.`);
   }
   ```

---

## 💾 IMPLEMENTACIÓN TÉCNICA (Supabase)

### Schema Propuesto:

```sql
-- Añadir columna de saldo global a employees
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS saldo_bolsa_horas DECIMAL(6, 2) DEFAULT 0.0;

-- Índice para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_employees_acumula_horas 
ON employees(acumula_horas) 
WHERE acumula_horas = TRUE;

-- Vista materializada para balance mensual
CREATE MATERIALIZED VIEW IF NOT EXISTS monthly_payroll_summary AS
SELECT 
  e.id AS employee_id,
  e.nombre,
  e.acumula_horas,
  e.saldo_bolsa_horas,
  DATE_TRUNC('month', tl.clock_in) AS mes,
  SUM(EXTRACT(EPOCH FROM (tl.clock_out - tl.clock_in)) / 3600) AS total_horas_trabajadas,
  e.horas_contrato * 4.33 AS horas_mensuales_contrato, -- Promedio 4.33 semanas/mes
  CASE 
    WHEN e.acumula_horas THEN 0 -- No genera extras
    ELSE GREATEST(0, SUM(EXTRACT(EPOCH FROM (tl.clock_out - tl.clock_in)) / 3600) - (e.horas_contrato * 4.33))
  END AS horas_extras_pagables
FROM employees e
LEFT JOIN time_logs tl ON e.id = tl.employee_id
WHERE tl.clock_out IS NOT NULL
GROUP BY e.id, e.nombre, e.acumula_horas, e.saldo_bolsa_horas, DATE_TRUNC('month', tl.clock_in);
```

### Server Action Crítico: `calcularBalanceSemanal`

```typescript
// app/actions/time-tracking/calcular-balance.ts
"use server";

import { createClient } from "@/lib/supabase/server";

export async function calcularBalanceSemanal(
  employeeId: string,
  weekStart: Date
) {
  const supabase = await createClient();
  
  // 1. Obtener empleado
  const { data: employee, error: empError } = await supabase
    .from("employees")
    .select("horas_contrato, acumula_horas, saldo_bolsa_horas")
    .eq("id", employeeId)
    .single();
  
  if (empError || !employee) {
    throw new Error("Empleado no encontrado");
  }
  
  // 2. Calcular horas trabajadas en la semana
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  
  const { data: logs, error: logsError } = await supabase
    .from("time_logs")
    .select("clock_in, clock_out")
    .eq("employee_id", employeeId)
    .gte("clock_in", weekStart.toISOString())
    .lt("clock_in", weekEnd.toISOString())
    .not("clock_out", "is", null);
  
  if (logsError) throw logsError;
  
  // 3. Calcular minutos reales (precisión)
  const minutosReales = logs.reduce((total, log) => {
    const inicio = new Date(log.clock_in).getTime();
    const fin = new Date(log.clock_out!).getTime();
    return total + Math.round((fin - inicio) / (1000 * 60));
  }, 0);
  
  const horasTrabajadas = minutosReales / 60;
  const horasContratadas = employee.horas_contrato;
  const balanceDelta = horasTrabajadas - horasContratadas;
  
  // 4. Aplicar lógica según tipo de empleado
  let horasExtras = 0;
  let nuevoSaldo = employee.saldo_bolsa_horas;
  
  if (employee.acumula_horas) {
    // CASO A: Acumular en bolsa
    nuevoSaldo += balanceDelta;
  } else {
    // CASO B: Generar extras para pago
    horasExtras = Math.max(0, balanceDelta);
  }
  
  // 5. Guardar en weekly_balances
  const { error: insertError } = await supabase
    .from("weekly_balances")
    .upsert({
      employee_id: employeeId,
      week_start: weekStart.toISOString().split("T")[0],
      target_hours: horasContratadas,
      worked_hours: Math.round(horasTrabajadas * 100) / 100,
      balance_delta: Math.round(balanceDelta * 100) / 100,
    });
  
  if (insertError) throw insertError;
  
  // 6. Actualizar saldo global (solo si acumula)
  if (employee.acumula_horas) {
    await supabase
      .from("employees")
      .update({ saldo_bolsa_horas: Math.round(nuevoSaldo * 100) / 100 })
      .eq("id", employeeId);
  }
  
  return {
    horasTrabajadas,
    horasContratadas,
    balanceDelta,
    horasExtras,
    nuevoSaldo: employee.acumula_horas ? nuevoSaldo : 0,
  };
}
```

---

## ✅ Checklist de Ejecución

Cuando uses esta habilidad, asegúrate de:

- [ ] **Verificar `acumula_horas`** ANTES de cualquier cálculo
- [ ] Trabajar con **minutos primero**, luego convertir a horas decimales
- [ ] Redondear **solo al guardar en DB** (2 decimales)
- [ ] Validar que **no existe más de 1 shift por día** (Iron Rule)
- [ ] Alertar si un shift dura **> 12h** (posible error)
- [ ] Actualizar `saldo_bolsa_horas` **solo si `acumula_horas = TRUE`**
- [ ] Registrar horas extras **solo si `acumula_horas = FALSE`**
- [ ] Implementar carry-over al cerrar el período (día/semana/mes)

---

## 🧪 Test Cases (Casos de Prueba)

### Test 1: Empleado que Acumula (CASO A)

**Input:**
```typescript
const empleado = {
  nombre: "Pere Boladeres",
  horas_contrato: 28,
  acumula_horas: true,
  saldo_bolsa_horas: -5, // Debe 5h a la empresa
};

const semana = {
  horasTrabajadas: 30,
};
```

**Expected Output:**
```typescript
{
  balanceDelta: 2, // 30 - 28
  horasExtras: 0, // No genera extras
  nuevoSaldo: -3, // -5 + 2
}
```

### Test 2: Empleado que NO Acumula (CASO B)

**Input:**
```typescript
const empleado = {
  nombre: "Juan Jesus Alvez",
  horas_contrato: 40,
  acumula_horas: false,
  saldo_bolsa_horas: 0,
};

const semana = {
  horasTrabajadas: 42,
};
```

**Expected Output:**
```typescript
{
  balanceDelta: 2, // 42 - 40
  horasExtras: 2, // Se pagan en nómina
  nuevoSaldo: 0, // Siempre 0 para estos empleados
}
```

### Test 3: Precisión Decimal

**Input:**
```typescript
const shift = {
  clock_in: new Date("2025-11-01T08:00:00Z"),
  clock_out: new Date("2025-11-01T16:27:00Z"), // 8h 27min
};
```

**Expected Output:**
```typescript
{
  minutosReales: 507,
  horasExactas: 8.45,
  horasRedondeadas: 8.45, // 2 decimales
}
```

### Test 4: Alerta de Shift Largo

**Input:**
```typescript
const shift = {
  clock_in: new Date("2025-11-01T08:00:00Z"),
  clock_out: new Date("2025-11-02T10:00:00Z"), // 26 horas (olvido)
};
```

**Expected Output:**
```typescript
// Debe lanzar error:
throw new Error("⚠️ ALERTA: Shift de 26h excede 12h. Verificar fichaje.");
```

### Test 5: Carry-Over Multi-Semana

**Input:**
```typescript
const empleado = {
  nombre: "Hector Sanchez",
  horas_contrato: 40,
  acumula_horas: true,
  saldo_bolsa_horas: 0,
};

const semanas = [
  { num: 1, horasTrabajadas: 38 }, // -2
  { num: 2, horasTrabajadas: 42 }, // +2
  { num: 3, horasTrabajadas: 45 }, // +5
];
```

**Expected Output (After Week 3):**
```typescript
{
  saldoSemana1: -2,
  saldoSemana2: 0, // -2 + 2
  saldoSemana3: 5, // 0 + 5
  totalHorasExtras: 0, // No genera extras (acumula)
}
```

---

## 🚨 Errores Comunes y Soluciones

### Error 1: Redondear antes de acumular

**Problema:**
```typescript
// ❌ INCORRECTO
const horas1 = Math.round(8.4); // 8
const horas2 = Math.round(8.6); // 9
const total = horas1 + horas2; // 17 (debería ser 17.0)
```

**Solución:**
```typescript
// ✅ CORRECTO
const horas1 = 8.4;
const horas2 = 8.6;
const total = horas1 + horas2; // 17.0
const totalRedondeado = Math.round(total * 100) / 100; // 17.0
```

### Error 2: No verificar `acumula_horas`

**Problema:**
```typescript
// ❌ INCORRECTO: Siempre genera extras
const horasExtras = horasTrabajadas - horasContrato;
```

**Solución:**
```typescript
// ✅ CORRECTO: Condicional según tipo de empleado
const horasExtras = empleado.acumula_horas 
  ? 0 
  : Math.max(0, horasTrabajadas - horasContrato);
```

### Error 3: Olvidar el carry-over

**Problema:**
```typescript
// ❌ INCORRECTO: Resetear el saldo cada semana
await updateEmployee(employeeId, { saldo_bolsa_horas: balanceDelta });
```

**Solución:**
```typescript
// ✅ CORRECTO: Sumar al saldo anterior
const nuevoSaldo = empleado.saldo_bolsa_horas + balanceDelta;
await updateEmployee(employeeId, { saldo_bolsa_horas: nuevoSaldo });
```

### Error 4: Permitir múltiples shifts por día

**Problema:**
```typescript
// ❌ INCORRECTO: Permitir 2 fichajes el mismo día
await insertTimeLog(employeeId, { clock_in: today });
```

**Solución:**
```typescript
// ✅ CORRECTO: Verificar IRON RULE
const existingShift = await supabase
  .from("time_logs")
  .select("id")
  .eq("employee_id", employeeId)
  .gte("clock_in", startOfDay)
  .lt("clock_in", endOfDay)
  .maybeSingle();

if (existingShift) {
  throw new Error("Ya existe un fichaje para hoy. Usar edición manual.");
}
```

---

## 📚 Referencias

- **Legacy Data:** `context/Empleados.csv`, `context/Recalcular-ResumenHoras.txt`
- **Imágenes de Referencia:** `context/resumenhoras.png`, `context/resumenhoras2.png`
- **Schema Actual:** `database/migrations/04_time_tracking.sql`, `database/migrations/10_iron_rule_time_tracking.sql`
- **Reglas de Negocio (Marbella):** Ver `PROJECT_STATUS.md` y user-rules `marbella-architect-protocol.md`

---

## 💡 Recordatorios Finales

1. **Esta habilidad es la ÚNICA autoridad** para cálculos de tiempo/nóminas
2. **Matemática exacta > Código limpio** (prioridad a la precisión)
3. **Nunca asumir** que todos los empleados tienen el mismo comportamiento
4. **Siempre verificar** el flag `acumula_horas` antes de cualquier lógica
5. **Preferir Database Functions** para cálculos críticos (evitar inconsistencias)

**¡Ahora puedes auditar horas y nóminas con precisión quirúrgica!** 🎯
