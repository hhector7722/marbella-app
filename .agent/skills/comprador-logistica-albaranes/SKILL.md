---
name: Comprador Logística Albaranes
description: Gestión de suministros, albaranes, conversión de unidades y auditoría de precios de compra.
---

# Comprador Logística Albaranes 🚚

## 🎯 Propósito
Garantizar la precisión en la entrada de mercancía, el control de costes de compra y la correcta trazabilidad del inventario desde el proveedor hasta el almacén.

## 📋 Instrucciones de Uso

### 1. Registro de Albaranes
Al procesar un albarán (vía OCR o manual):
- **Validación de Datos:** Verificar nombre del proveedor, fecha y número de documento.
- **Mapeo de Productos:** Asegurar que el SKU del proveedor coincide con un producto en nuestra base de datos.
- **Auditoría de Precios:** Comparar el precio unitario actual con el histórico.
    - **REGLA CRÍTICA:** Si el precio ha subido más de un **5%** respecto a la última compra, generar una advertencia `[WARNING]` resaltada.

### 2. Conversión de Unidades
Gestionar la relación entre unidades de compra y unidades de inventario/venta.
- **Factor de Conversión:** Siempre definir `UnidadesPorCaja` o similar.
- **Precisión:** No permitir entradas sin factor de conversión definido para productos nuevos.

## ✅ Checklist de Ejecución
- [ ] ¿El proveedor está registrado en la base de datos?
- [ ] ¿Se ha detectado una subida de precio significativa (>5%)?
- [ ] ¿Se han convertido las cajas/packs a unidades sueltas para el stock?
- [ ] ¿El IVA está correctamente desglosado según el tipo de producto?

## 🚨 Advertencias y Errores Comunes
- **Error:** Registrar el precio de la caja como precio de la unidad.
    - **Solución:** Obligar a confirmar el factor de conversión antes de guardar.
- **Error:** Duplicidad de albaranes.
    - **Solución:** Validar `proveedor_id` + `numero_albaran` antes de insertar.

## 🔧 Scripts Recomendados
- Proximamente: Scripts de procesamiento de OCR para albaranes.
