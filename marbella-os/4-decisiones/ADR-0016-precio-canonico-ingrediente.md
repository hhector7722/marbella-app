---
documento: ADR-0016
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-09-20
depende_de: ADR-0013
supersede: —
---

# ADR-0016 · Precio canónico único del ingrediente

## Contexto

El modelo heredado conservaba dos autoridades económicas: `current_price` y
un precio de pack capaz de recalcularlo mediante trigger. K4 ya normalizaba el
precio observado de un albarán a la unidad de compra, pero editar una
presentación antigua todavía podía sobrescribir el mismo valor desde otra
ruta. La interfaz y varios consumidores mezclaban por ello precio económico y
conversión física.

## Decisión

1. La única magnitud económica viva del ingrediente es
   `ingredients.current_price`, expresada siempre en
   `ingredients.purchase_unit`.
2. Solo existen dos writers: la confirmación atómica K4 con origen
   `receipt_confirmation` y una operación manual transaccional con origen
   `manual`. Ambos registran actor e histórico y no cambian la unidad de compra.
3. La base de datos rechaza cualquier escritura de `current_price` que no
   proceda de una de esas dos operaciones.
4. `price_locked` bloquea únicamente el cambio automático desde albaranes. Un
   `manager` o `admin` puede cambiar manualmente el precio de forma explícita.
5. La presentación del proveedor vive en `purchase_mapping_versions`. Las
   equivalencias físicas legacy pueden mantenerse mientras tengan consumidores,
   pero `pack_price` y `supplier_pricing_mode` dejan de producir precio.
6. Los históricos existentes no se reinterpretan ni se reescriben.

## Alternativas descartadas

| Alternativa | Motivo de descarte |
|---|---|
| Mantener el trigger de pack como sincronización auxiliar | Conserva dos productores de la misma magnitud y permite que una edición física revierta un precio confirmado. |
| Guardar un precio por proveedor dentro de `ingredients` | Mezcla presentación y autoridad económica; la procedencia pertenece al mapeo y al histórico. |
| Permitir actualizaciones directas desde cada pantalla | Fragmenta autorización, auditoría e idempotencia y vuelve a abrir writers laterales. |
| Borrar de inmediato todos los campos `pack_*` | Algunas equivalencias físicas todavía convierten cantidades de recetas y consumos; su retirada exige auditar consumidores. |

## Consecuencias

- La edición manual pasa por una única RPC para `manager` y `admin`.
- Cambiar una presentación no puede modificar el precio actual.
- Recetas, consumo e informes leen `current_price`; las equivalencias solo
  convierten cantidades.
- El código y los datos legacy de pack se retiran por fases, conservando
  conversiones físicas no ambiguas hasta migrarlas al mapeo de proveedor.
