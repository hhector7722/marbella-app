---
documento: ADR-0017
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-09-21
depende_de: ADR-0012
supersede: —
---

# ADR-0017 · Archivado de ingredientes en lugar de borrado

## Contexto

Un ingrediente puede quedar obsoleto sin dejar de estar referenciado: un artículo
duplicado creado por una importación, un producto equivocado o un ingrediente
sustituido por otro. Retirarlo del catálogo no puede significar borrarlo.

`ADR-0012 §3` prohíbe borrar versiones de mapeo, que son inmutables. La clave
ajena `purchase_mapping_versions.ingredient_id` es `ON DELETE RESTRICT` y la
tabla es append-only. En consecuencia, **un ingrediente referenciado por una
versión de mapeo no se puede borrar nunca**, ni siquiera cuando no tiene stock,
recetas ni precio.

El catálogo de ingredientes no tenía forma de retirar una fila sin borrarla:
`inventory_visible` solo afecta a `/dashboard/inventory`. Caso real:
`AQUARIUS NARANJA LATA`, duplicado del canónico `Aquarius naranja`, quedó
referenciado por una versión de mapeo propuesta y dejó de ser borrable.

## Decisión

1. `ingredients.archived_at` es la marca de retirada del catálogo operativo.
   `NULL` significa activo; un instante, archivado.
2. Un ingrediente archivado **no se ofrece** en las superficies de selección:
   catálogo de ingredientes, selectores de receta, pedidos a proveedor,
   inventario, ledger, mermas, mapeo TPV y candidatos de mapeo de albarán.
3. Las lecturas históricas **siguen resolviéndose**: el nombre de un ingrediente
   ya referenciado por una receta, una línea de albarán, un movimiento o una
   versión de mapeo se lee con normalidad.
4. Archivar no borra nada: la fila y todas sus referencias permanecen. Es la
   operación compatible con `ADR-0012`.
5. Solo `manager` y `admin` archivan y reactivan. La operación es reversible
   devolviendo `archived_at` a `NULL`.
6. Archivar no toca `current_price`, las unidades ni el stock; no produce ni
   altera ningún hecho económico.

## Alternativas descartadas

| Alternativa | Motivo de descarte |
|---|---|
| Borrado físico del ingrediente | Imposible mientras exista una versión de mapeo inmutable (`ADR-0012`), y destruiría la trazabilidad del artículo del proveedor. |
| Reutilizar `inventory_visible` como ocultación total | Solo afecta a `/dashboard/inventory`; 178 ingredientes no inventariables deben seguir disponibles para recetas. |
| Filtrar con una policy RLS de `SELECT` | Ocultaría el ingrediente también en las lecturas históricas y dejaría sin nombre recetas que lo usan. |
| Renombrar el ingrediente obsoleto | No lo retira de ninguna superficie de selección. |

## Consecuencias

- El catálogo se puede limpiar sin borrar evidencia.
- `/ingredients` ofrece un filtro para ver los archivados y reactivarlos.
- `archived_at` y `inventory_visible` son cosas distintas: uno retira del
  catálogo operativo; el otro, solo del recuento de inventario.
- La comprobación de archivado es explícita en cada consulta de selección; no
  hay vista ni policy que la centralice.
- El import K5 puede seguir generando duplicados; la corrección es archivar y
  repuntar el mapeo al ingrediente canónico, nunca borrar.
