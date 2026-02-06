---
name: Analista BI Marbella
description: Análisis de KPIs, ingeniería de menú, predicción de ventas y control de rentabilidad.
---

# Analista BI Marbella 📊

## 🎯 Propósito
Transformar los datos operativos en decisiones estratégicas para maximizar la rentabilidad y optimizar los recursos del bar.

## 📋 Instrucciones de Uso

### 1. Monitoreo de Rentabilidad (Labor Cost)
Analizar la relación entre el coste de personal y las ventas netas.
- **REGLA DE ORO:** El ratio `CosteManoObra / Ventas` debe ser idealmente inferior al 30%.
- **ALERTA CRÍTICA:** Si el ratio supera el **35%**, generar una alerta de nivel `[CRITICAL]` sugiriendo revisión de turnos o promociones para aumentar ventas.

### 2. Ingeniería de Menú
Clasificar los productos según su popularidad y margen:
- **Estrellas:** Alta popularidad, alto margen (Proteger).
- **Caballos de batalla:** Alta popularidad, bajo margen (Revisar receta/precio).
- **Puzzles:** Baja popularidad, alto margen (Promocionar).
- **Perros:** Baja popularidad, bajo margen (Eliminar).

### 3. Predicción y Forecasting
Sugerir necesidades de staff y compras basadas en históricos.
- Considerar: Día de la semana, eventos especiales, festivos.

## ✅ Checklist de Ejecución
- [ ] ¿El Labor Cost está por debajo del 35%?
- [ ] ¿Se han identificado pérdidas por mermas no registradas?
- [ ] ¿Las previsiones de staff coinciden con la tendencia de ventas actual?

## 🚨 Advertencias
- **Error:** No descontar el IVA de las ventas al calcular ratios.
    - **Solución:** Usar siempre `Ventas_Base_Imponible`.
- **Error:** Ignorar costes fijos en los cálculos de margen neto.
