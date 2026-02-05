---
name: Gestor Stock Costes
description: Cálculos financieros precisos de márgenes, mermas y costes operativos en hostelería
---

# Gestor Stock Costes

Esta habilidad te guía en cálculos financieros para gestión de stock y costes en hostelería, priorizando **exactitud matemática** y **diferenciación correcta** entre Precio de Compra y Coste de Plato.

## 🎯 Propósito

Asegurar que todos los cálculos financieros sean:
- **Precisos:** Sin errores de coma flotante en decimales de euro
- **Consistentes:** Uso estricto de funciones de `lib/utils.ts`
- **Correctos:** Diferenciación clara entre conceptos (Precio Compra ≠ Coste Plato)
- **Validados:** Márgenes y porcentajes siempre en rangos lógicos
- **Auditables:** Cálculos trazables y documentados

## ⚠️ REGLAS INQUEBRANTABLES

> [!CAUTION]
> Estas reglas son **ABSOLUTAS** en código que maneje dinero, márgenes o costes.

### 1. 💶 Redondeo OBLIGATORIO para Euros

**REGLA:** Todo cálculo monetario debe redondearse a **2 decimales** exactos.

```typescript
// ❌ PROHIBIDO: Decimales sin redondear
const total = 10.1 + 0.2;  // 10.299999999999999 ❌
const precio = cantidad * precioUnitario;  // Puede tener 10 decimales ❌

// ✅ OBLIGATORIO: Redondear a 2 decimales
const total = roundMoney(10.1 + 0.2);  // 10.30 ✅
const precio = roundMoney(cantidad * precioUnitario);  // 15.25 ✅

// Función obligatoria (de lib/utils.ts o crear si no existe)
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
```

**¿Por qué?**
```typescript
// Problema de JavaScript/TypeScript
console.log(0.1 + 0.2);  // 0.30000000000000004
console.log(10.1 + 0.2); // 10.299999999999999

// Con redondeo correcto
console.log(roundMoney(0.1 + 0.2));  // 0.30
console.log(roundMoney(10.1 + 0.2)); // 10.30
```

### 2. 📊 Usar SOLO Funciones de lib/utils.ts

**REGLA:** Para cálculos financieros, usa **SIEMPRE** las funciones existentes, nunca reinventes.

```typescript
// ❌ PROHIBIDO: Calcular manualmente
const foodCost = (totalCost / salePrice) * 100;  // ¿Y si salePrice es 0?
const margin = salePrice - cost;  // Sin redondeo

// ✅ OBLIGATORIO: Usar funciones de lib/utils.ts
import { 
  calculateFood Cost,
  calculateNetMargin,
  calculateGrossMargin,
  formatCurrency
} from '@/lib/utils';

const foodCostPercent = calculateFoodCost(totalCost, salePrice);
const netMargin = calculateNetMargin(salePrice, totalCost);
const grossMarginPercent = calculateGrossMargin(salePrice, totalCost);
```

**Funciones disponibles en `lib/utils.ts`:**

```typescript
// 1. Food Cost Percentage
calculateFoodCost(totalCost: number, salePrice:number): number
// Retorna: (totalCost / salePrice) * 100
// Protección: Si salePrice === 0, retorna 0

// 2. Net Margin (Margen Neto en €)
calculateNetMargin(salePrice: number, totalCost: number): number
// Retorna: salePrice - totalCost

// 3. Gross Margin Percentage (Margen Bruto %)
calculateGrossMargin(salePrice: number, totalCost: number): number
// Retorna: ((salePrice - totalCost) / salePrice) * 100
// Protección: Si salePrice === 0, retorna 0

// 4. Format Currency
formatCurrency(amount: number): string
// Retorna: "10,50 €" (formato español)

// 5. Format Percentage
formatPercentage(value: number, decimals?: number): string
// Retorna: "35.50%" (2 decimales por defecto)
```

### 3. 🏷️ Diferenciar Precio de Compra vs Coste de Plato

**REGLA:** Entiende la diferencia y nómbralos correctamente.

```typescript
// ===================================================
// CONCEPTOS DIFERENCIADOS
// ===================================================

// 1. PRECIO DE COMPRA (Purchase Price)
// → Lo que pagas al proveedor por el ingrediente
// → Columna: ingredients.current_price
// → Ejemplo: 5.50€/kg de tomate

type Ingredient = {
  id: string;
  name: string;
  current_price: number;  // ← PRECIO DE COMPRA
  purchase_unit: string;  // "kg", "litro", "unidad"
  waste_percentage: number;  // Merma (0-100)
};

// 2. COSTE DE PLATO (Dish Cost)
// → Suma de costes de TODOS los ingredientes de la receta
// → Calculado dinámicamente
// → Ejemplo: 2.35€ (suma de tomate + lechuga + aceite...)

type RecipeCost = {
  recipe_id: string;
  total_cost: number;  // ← COSTE DE PLATO
  ingredient_cost: number;  // Sin packaging
  packaging_cost: number;  // Solo packaging
};

// 3. PRECIO DE VENTA (Sale Price / PVP)
// → Lo que cobra al cliente final
// → Columna: recipes.sale_price
// → Ejemplo: 8.50€ (precio en carta)

type Recipe = {
  id: string;
  name: string;
  sale_price: number;  // ← PRECIO DE VENTA (PVP)
};

// ===================================================
// FÓRMULAS CORRECTAS
// ===================================================

// Food Cost % = (Coste Plato / Precio Venta) * 100
const foodCostPercent = calculateFoodCost(totalCost, salePrice);

// Margen Neto = Precio Venta - Coste Plato
const netMargin = calculateNetMargin(salePrice, totalCost);

// Margen Bruto % = ((Precio Venta - Coste Plato) / Precio Venta) * 100
const grossMarginPercent = calculateGrossMargin(salePrice, totalCost);
```

**Ejemplo Completo:**

```typescript
// Ingrediente: Tomate
const tomate: Ingredient = {
  id: 'uuid-tomate',
  name: 'Tomate',
  current_price: 2.50,  // ← Precio Compra: 2.50€/kg
  purchase_unit: 'kg',
  waste_percentage: 10,  // 10% de merma
};

// Receta: Ensalada
// Usa 200g de tomate (tras merma)
const cantidadNeta = 0.200;  // 200g = 0.2kg
const cantidadBruta = cantidadNeta / (1 - tomate.waste_percentage / 100);  // 0.222kg

const costeTomateEnReceta = roundMoney(cantidadBruta * tomate.current_price);
// = 0.222 * 2.50 = 0.56€

// Coste Total de la Ensalada (todos los ingredientes)
const costeTotalPlato = 2.35;  // ← COSTE DE PLATO

// Precio de Venta
const precioVenta = 8.50;  // ← PVP en carta

// Cálculos correctos
const foodCost = calculateFoodCost(costeTotalPlato, precioVenta);
// = (2.35 / 8.50) * 100 = 27.65%

const margenNeto = calculateNetMargin(precioVenta, costeTotalPlato);
// = 8.50 - 2.35 = 6.15€

const margenBruto = calculateGrossMargin(precioVenta, costeTotalPlato);
// = ((8.50 - 2.35) / 8.50) * 100 = 72.35%
```

### 4. 📉 Validar Márgenes y Porcentajes

**REGLA:** Los márgenes/porcentajes deben estar en rangos lógicos.

```typescript
// ✅ Validaciones OBLIGATORIAS

export function validateFoodCost(foodCostPercent: number): {
  valid: boolean;
  level: 'excelente' | 'bueno' | 'aceptable' | 'alto' | 'crítico';
  warning?: string;
} {
  // Food Cost debe estar entre 0% y 100%
  if (foodCostPercent < 0 || foodCostPercent > 100) {
    return {
      valid: false,
      level: 'crítico',
      warning: `❌ Food Cost ${foodCostPercent.toFixed(1)}% fuera de rango (0-100%)`
    };
  }

  // Rangos de la industria (hostelería)
  if (foodCostPercent <= 28) {
    return { valid: true, level: 'excelente' };
  } else if (foodCostPercent <= 32) {
    return { valid: true, level: 'bueno' };
  } else if (foodCostPercent <= 35) {
    return { valid: true, level: 'aceptable' };
  } else if (foodCostPercent <= 40) {
    return {
      valid: true,
      level: 'alto',
      warning: `⚠️ Food Cost ${foodCostPercent.toFixed(1)}% es alto. Considerar ajuste de precio o receta.`
    };
  } else {
    return {
      valid: true,
      level: 'crítico',
      warning: `🚨 Food Cost ${foodCostPercent.toFixed(1)}% es crítico. No es rentable.`
    };
  }
}

export function validateGrossMargin(marginPercent: number): {
  valid: boolean;
  warning?: string;
} {
  // Margen bruto debe ser positivo
  if (marginPercent < 0) {
    return {
      valid: false,
      warning: `❌ Margen negativo (${marginPercent.toFixed(1)}%). Estás perdiendo dinero.`
    };
  }

  // Margen muy bajo
  if (marginPercent < 50) {
    return {
      valid: true,
      warning: `⚠️ Margen bajo (${marginPercent.toFixed(1)}%). Revisar costes o precio.`
    };
  }

  return { valid: true };
}
```

### 5. 📦 Calcular Merma (Waste) Correctamente

**REGLA:** La merma se aplica para calcular cantidad bruta desde cantidad neta.

```typescript
/**
 * Calcula cantidad bruta necesaria considerando merma
 * 
 * @param cantidadNeta - Cantidad que realmente usas en el plato (kg, L, unid)
 * @param wastePercentage - % de merma (0-100)
 * @returns Cantidad bruta a comprar
 * 
 * Ejemplo: Necesitas 200g netos, merma 10%
 * → Debes comprar 222g brutos
 */
export function calculateGrossQuantity(
  cantidadNeta: number,
  wastePercentage: number
): number {
  if (wastePercentage < 0 || wastePercentage >= 100) {
    throw new Error(`Merma inválida: ${wastePercentage}%. Debe estar entre 0-100.`);
  }

  if (wastePercentage === 0) {
    return cantidadNeta;
  }

  // Fórmula: Cantidad Bruta = Cantidad Neta / (1 - Merma%)
  return cantidadNeta / (1 - wastePercentage / 100);
}

/**
 * Calcula coste de ingrediente en receta (considerando merma)
 */
export function calculateIngredientCost(
  cantidadNeta: number,
  precioCompra: number,
  wastePercentage: number
): number {
  const cantidadBruta = calculateGrossQuantity(cantidadNeta, wastePercentage);
  const coste = cantidadBruta * precioCompra;
  return roundMoney(coste);
}

// Ejemplo de uso
const costeTomate = calculateIngredientCost(
  0.200,  // 200g netos
  2.50,   // 2.50€/kg
  10      // 10% merma
);
// = (0.2 / 0.9) * 2.50 = 0.222 * 2.50 = 0.56€
```

## 📋 Checklist de Cálculos Financieros

Antes de implementar lógica de costes, verifica:

### Precisión
- [ ] Todos los valores monetarios usan `roundMoney()` a 2 decimales
- [ ] Porcentajes se redondean a 2 decimales con `toFixed(2)`
- [ ] No hay operaciones aritméticas directas sin redondeo final

### Funciones
- [ ] Usas `calculateFoodCost()` de lib/utils.ts
- [ ] Usas `calculateNetMargin()` de lib/utils.ts
- [ ] Usas `calculateGrossMargin()` de lib/utils.ts
- [ ] Usas `formatCurrency()` para mostrar precios
- [ ] Usas `formatPercentage()` para mostrar porcentajes

### Conceptos
- [ ] Diferencias Precio de Compra (ingredients.current_price) del Coste de Plato (sum de ingredientes)
- [ ] Calculas merma correctamente (cantidad bruta desde neta)
- [ ] Validas rangos de Food Cost (idealmente 28-35%)
- [ ] Validas que márgenes sean positivos

### Seguridad
- [ ] Proteges divisiones por cero (if salePrice === 0)
- [ ] Validas que porcentajes estén en 0-100%
- [ ] Manejas casos null/undefined en precios

## 🎯 Patrones Comunes

### Patrón 1: Calcular Coste Total de Receta

```typescript
type RecipeIngredient = {
  ingredient_id: string;
  quantity_net: number;  // Cantidad neta (lo que va al plato)
  unit: string;
};

type Ingredient = {
  id: string;
  name: string;
  current_price: number;  // Precio por unidad de compra
  waste_percentage: number;
};

export function calculateRecipeTotalCost(
  recipeIngredients: RecipeIngredient[],
  ingredients: Ingredient[]
): {
  totalCost: number;
  breakdown: Array<{
    name: string;
    quantityNet: number;
    quantityGross: number;
    unitCost: number;
  }>;
} {
  const ingredientMap = new Map(ingredients.map(i => [i.id, i]));
  let totalCost = 0;
  const breakdown = [];

  for (const ri of recipeIngredients) {
    const ingredient = ingredientMap.get(ri.ingredient_id);
    if (!ingredient) continue;

    // Calcular cantidad bruta (con merma)
    const quantityGross = calculateGrossQuantity(
      ri.quantity_net,
      ingredient.waste_percentage
    );

    // Coste de este ingrediente en la receta
    const unitCost = roundMoney(quantityGross * ingredient.current_price);
    totalCost += unitCost;

    breakdown.push({
      name: ingredient.name,
      quantityNet: ri.quantity_net,
      quantityGross,
      unitCost
    });
  }

  return {
    totalCost: roundMoney(totalCost),
    breakdown
  };
}
```

### Patrón 2: Simulador de Precios

```typescript
export function simulatePriceScenarios(
  totalCost: number,
  currentSalePrice: number
): Array<{
  salePrice: number;
  foodCost: number;
  netMargin: number;
  grossMargin: number;
  level: string;
}> {
  const scenarios = [];

  // Probar diferentes precios (desde coste + 50% hasta + 400%)
  for (let multiplier = 1.5; multiplier <= 4; multiplier += 0.5) {
    const salePrice = roundMoney(totalCost * multiplier);
    const foodCost = calculateFoodCost(totalCost, salePrice);
    const netMargin = calculateNetMargin(salePrice, totalCost);
    const grossMargin = calculateGrossMargin(salePrice, totalCost);
    const { level } = validateFoodCost(foodCost);

    scenarios.push({
      salePrice,
      foodCost: Number(foodCost.toFixed(2)),
      netMargin: roundMoney(netMargin),
      grossMargin: Number(grossMargin.toFixed(2)),
      level
    });
  }

  return scenarios;
}

// Uso
const scenarios = simulatePriceScenarios(2.35, 8.50);
/*
[
  { salePrice: 3.53, foodCost: 66.57, netMargin: 1.18, grossMargin: 33.43, level: 'crítico' },
  { salePrice: 4.70, foodCost: 50.00, netMargin: 2.35, grossMargin: 50.00, level: 'alto' },
  { salePrice: 5.88, foodCost: 40.00, netMargin: 3.53, grossMargin: 60.00, level: 'alto' },
  { salePrice: 7.05, foodCost: 33.33, netMargin: 4.70, grossMargin: 66.67, level: 'bueno' },
  { salePrice: 8.23, foodCost: 28.57, netMargin: 5.88, grossMargin: 71.43, level: 'excelente' },
  { salePrice: 9.40, foodCost: 25.00, netMargin: 7.05, grossMargin: 75.00, level: 'excelente' }
]
*/
```

### Patrón 3: Actualización de Precios con Impacto

```typescript
export async function updateIngredientPrice(
  ingredientId: string,
  newPrice: number
): Promise<{
  success: boolean;
  affectedRecipes: Array<{
    recipeId: string;
    recipeName: string;
    oldCost: number;
    newCost: number;
    oldFoodCost: number;
    newFoodCost: number;
    impactPercent: number;
  }>;
}> {
  const supabase = getSupabaseClient();

  // 1. Actualizar precio del ingrediente
  const { error: updateError } = await supabase
    .from('ingredients')
    .update({ current_price: roundMoney(newPrice) })
    .eq('id', ingredientId);

  if (updateError) {
    return { success: false, affectedRecipes: [] };
  }

  // 2. Obtener recetas afectadas
  const { data: recipeIngredients } = await supabase
    .from('recipe_ingredients')
    .select(`
      recipe_id,
      quantity_gross,
      recipes (
        id,
        name,
        sale_price
      )
    `)
    .eq('ingredient_id', ingredientId);

  // 3. Calcular impacto en cada receta
  const affectedRecipes = recipeIngredients?.map(ri => {
    const recipe = ri.recipes;
    const oldCost = 0; // Calcular desde DB materializada
    const costDifference = roundMoney(ri.quantity_gross * newPrice);
    const newCost = roundMoney(oldCost + costDifference);

    const oldFoodCost = calculateFoodCost(oldCost, recipe.sale_price);
    const newFoodCost = calculateFoodCost(newCost, recipe.sale_price);
    const impactPercent = newFoodCost - oldFoodCost;

    return {
      recipeId: recipe.id,
      recipeName: recipe.name,
      oldCost: roundMoney(oldCost),
      newCost,
      oldFoodCost: Number(oldFoodCost.toFixed(2)),
      newFoodCost: Number(newFoodCost.toFixed(2)),
      impactPercent: Number(impactPercent.toFixed(2))
    };
  }) || [];

  return { success: true, affectedRecipes };
}
```

## 🚨 Errores Comunes

### Error 1: No Redondear Decimales de Euro

```typescript
// ❌ Error
const total = 10.1 + 0.2;  // 10.299999999999999

// ✅ Correcto
const total = roundMoney(10.1 + 0.2);  // 10.30
```

### Error 2: Confundir Precio Compra con Coste Plato

```typescript
// ❌ Error conceptual
const foodCost = calculateFoodCost(
  ingredient.current_price,  // ❌ Esto es precio de compra unitario, NO coste total del plato
  recipe.sale_price
);

// ✅ Correcto
const totalRecipeCost = calculateRecipeTotalCost(...);  // Suma todos los ingredientes
const foodCost = calculateFoodCost(
  totalRecipeCost,  // ✅ Coste completo del plato
  recipe.sale_price
);
```

### Error 3: No Validar División por Cero

```typescript
// ❌ Peligroso
const foodCost = (totalCost / salePrice) * 100;  // Si salePrice = 0 → Infinity

// ✅ Seguro (usa la función de utils)
const foodCost = calculateFoodCost(totalCost, salePrice);  // Retorna 0 si salePrice === 0
```

### Error 4: Olvidar Aplicar Merma

```typescript
// ❌ Error
const coste = cantidadNeta * precioCompra;  // No considera merma

// ✅ Correcto
const cantidadBruta = calculateGrossQuantity(cantidadNeta, wastePercentage);
const coste = roundMoney(cantidadBruta * precioCompra);
```

## 📚 Referencias del Proyecto

### Archivos Clave
- [lib/utils.ts](file:///c:/Users/hhect/EscandallsMaster/lib/utils.ts) - Funciones financieras base
- [types/recipe.ts](file:///c:/Users/hhect/EscandallsMaster/types/recipe.ts) - Tipos de recetas y costes
- [app/actions/recipes.ts](file:///c:/Users/hhect/EscandallsMaster/app/actions/recipes.ts) - Cálculo de food cost
- [database/schema.sql](file:///c:/Users/hhect/EscandallsMaster/database/schema.sql) - Vista materializada recipe_financials

### Funciones Existentes

```typescript
// De lib/utils.ts (líneas 31-49)
export function calculateFoodCost(totalCost: number, salePrice: number): number {
  if (salePrice === 0) return 0;
  return (totalCost / salePrice) * 100;
}

export function calculateNetMargin(salePrice: number, totalCost: number): number {
  return salePrice - totalCost;
}

export function calculateGrossMargin(salePrice: number, totalCost: number): number {
  if (salePrice === 0) return 0;
  return ((salePrice - totalCost) / salePrice) * 100;
}
```

---

**Recuerda:** Precision first. Always round money to 2 decimals. 💶
