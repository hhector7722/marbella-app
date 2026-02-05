# Gestor Stock Costes - README

## 📦 Contenido de la Habilidad

Esta habilidad se especializa en cálculos financieros precisos para stock y costes operativos en hostelería.

### **SKILL.md** (Archivo Principal)
Guía completa de cálculos financieros con:
- **5 Reglas Inquebrantables** (redondeo euros, solo lib/utils.ts, Precio Compra vs Coste Plato, validación márgenes, merma correcta)
- Diferenciación clara de conceptos financieros
- 3 patrones comunes (coste receta, simulador precios, impacto actualización)
- 4 errores comunes y soluciones
- Referencias a funciones existentes en lib/utils.ts

## 💶 Reglas Inquebrantables

### 1. Redondeo OBLIGATORIO
Todo cálculo monetario a **2 decimales** para evitar errores de coma flotante.

### 2. Solo lib/utils.ts
Usa SIEMPRE `calculateFoodCost()`, `calculateNetMargin()`, `calculateGrossMargin()` de lib/utils.ts.

### 3. Precio Compra ≠ Coste Plato
- **Precio Compra:** Lo que pagas al proveedor (`ingredients.current_price`)
- **Coste Plato:** Suma de todos los ingredientes de la receta

### 4. Validar Márgenes
Food Cost debe estar idealmente entre 28-35%. Anything >40% es problemático.

### 5. Merma Correcta
`Cantidad Bruta = Cantidad Neta / (1 - Merma%)`

## 🚀 Cómo Usar Esta Habilidad

### Escenario 1: Calcular Coste de Receta

```
"Usa la habilidad Gestor Stock Costes para calcular  
el coste total de la receta Ensalada considerando mermas"
```

El AI:
- Calculará cantidad bruta desde neta con merma
- Aplicará precio de compra a cantidad bruta
- Sumará todos los ingredientes
- Redondeará a 2 decimales
- Calculará Food Cost %

### Escenario 2: Analizar Rentabilidad

```
"Usa la habilidad Gestor Stock Costes para validar 
si un Food Cost de 38% es aceptable"
```

El AI:
- Validará el porcentaje (38% es "alto")
- Sugerirá reducir a 28-35%
- Proporcionará opciones: subir precio o reducir coste

### Escenario 3: Simular Precios

```
"Usa la habilidad Gestor Stock Costes para encontrar 
el precio de venta óptimo dado un coste de 3.50€"
```

El AI generará tabla de escenarios:
| PVP | Food Cost % | Margen € | Evaluación |
|-----|-------------|----------|------------|
| 5.25€ | 66.7% | 1.75€ | Crítico |
| 10.00€ | 35.0% | 6.50€ | Aceptable |
| 12.00€ | 29.2% | 8.50€ | Excelente |

## ✅ Checklist Rápido

Al trabajar con cálculos financieros:

**Precisión:**
- [ ] Usas `roundMoney()` para todos los euros
- [ ] Redondeas porcentajes a 2 decimales (`.toFixed(2)`)
- [ ] No haces operaciones aritméticas sin redondeo final

**Funciones:**
- [ ] Importas de `@/lib/utils` (no calculas manualmente)
- [ ] `calculateFoodCost(coste, precio)` para %
- [ ] `calculateNetMargin(precio, coste)` para margen €
- [ ] `calculateGrossMargin(precio, coste)` para margen %

**Conceptos:**
- [ ] Diferencias Precio Compra del Coste Plato
- [ ] Aplicas merma correctamente  
- [ ] Validas Food Cost (ideal 28-35%)
- [ ] Verificas márgenes positivos

## 📊 Conceptos Clave

### Precio de Compra
```typescript
const ingrediente = {
  name: 'Tomate',
  current_price: 2.50,  // ← 2.50€/kg (al proveedor)
  purchase_unit: 'kg'
};
```

### Coste de Plato
```typescript
const receta = {
  name: 'Ensalada',
  ingredientes: [
    { name: 'Tomate', coste: 0.56 },
    { name: 'Lechuga', coste: 0.40 },
    { name: 'Aceite', coste: 0.15 }
  ],
  total_cost: 1.11  // ← Coste Plato (suma ingredientes)
};
```

### Fórmulas
```typescript
// Food Cost %
const foodCost = calculateFoodCost(1.11, 8.50);  // 13.06%

// Margen Neto (€)
const margenNeto = calculateNetMargin(8.50, 1.11);  // 7.39€

// Margen Bruto (%)
const margenBruto = calculateGrossMargin(8.50, 1.11);  // 86.94%
```

## 🔥 Errores Comunes

### ❌ Error 1: No Redondear
```typescript
const total = 10.1 + 0.2;  // 10.299999999999999
```

### ❌ Error 2: Confundir Conceptos
```typescript
// MAL: Usar precio unitario como coste de plato
const foodCost = calculateFoodCost(ingredient.current_price, recipe.sale_price);
```

### ❌ Error 3: Ignorar Merma
```typescript
// MAL: No aplicar merma
const coste = cantidad * precio;
```

## 📖 Referencias

### Archivos del Proyecto
- [lib/utils.ts](file:///c:/Users/hhect/EscandallsMaster/lib/utils.ts) - Funciones financieras
- [app/recipes/[id]/page.tsx](file:///c:/Users/hhect/EscandallsMaster/app/recipes/[id]/page.tsx) - Ejemplo uso real
- [database/schema.sql](file:///c:/Users/hhect/EscandallsMaster/database/schema.sql) - Vista recipe_financials

### Funciones Disponibles
```typescript
// lib/utils.ts
calculateFoodCost(totalCost, salePrice): number
calculateNetMargin(salePrice, totalCost): number
calculateGrossMargin(salePrice, totalCost): number
formatCurrency(amount): string
formatPercentage(value, decimals?): string
```

---

**Estado:** ✅ Lista para usar  
**Ubicación:** [.agent/skills/gestor-stock-costes/](file:///c:/Users/hhect/EscandallsMaster/.agent/skills/gestor-stock-costes/)  
**Próximo paso:** Invocar cuando calcules costes, márgenes o analices rentabilidad
