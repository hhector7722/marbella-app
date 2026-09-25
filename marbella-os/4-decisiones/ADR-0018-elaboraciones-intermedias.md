---
documento: ADR-0018
clase: inmutable
estado: vigente
capa: decisiones
normativo: true
precedencia: 80
responsable: propiedad del producto
decidido: 2026-09-25
depende_de: DOMINIO-PRECIOS-Y-COMPRAS, ADR-0016, PRINCIPIOS
supersede: —
---

# ADR-0018 · Elaboraciones intermedias y subrecetas

## Contexto

La cocina elabora preparaciones que no se venden solas y que entran en otros
platos: bechamel, salsa parmesana, sofrito, alioli, fondos, rellenos, masas.
Hoy el modelo de datos no las representa. Este ADR cierra el modelo objetivo.
No lo implementa.

### Hechos del modelo actual

Verificado contra el esquema generado y el código de aplicación el 2026-09-25:

- `ingredients` es el catálogo de materias primas con precio y unidades. El
  precio vivo es `ingredients.current_price` por `purchase_unit`
  ([ADR-0016](./ADR-0016-precio-canonico-ingrediente.md)).
- `recipes` es una elaboración. Tiene `sale_price` (PVP de barra, anulable),
  `servings` y el resto de campos de ficha. No tiene `is_sellable`,
  `yield_quantity` ni `yield_unit`.
- `recipe_ingredients` solo une receta con ingrediente (`ingredient_id`
  obligatorio, cantidad y unidad). No admite otra receta como componente.
- `map_tpv_receta` une un artículo del punto de venta con una receta. Sin ese
  puente no hay descuento de existencias ni margen por producto
  ([MODELO-DE-DATOS](../3-ingenieria/MODELO-DE-DATOS.md)).
- La conversión de una línea de ingrediente a la unidad de compra, y la regla
  de que cliente y base de datos deben coincidir, siguen en
  [PRECIOS-Y-COMPRAS §5](../3-ingenieria/dominio/PRECIOS-Y-COMPRAS.md).
- `recipe_combos` lo usa el código de menús (`combo_recipe_id`,
  `child_recipe_id`, `quantity`) junto con `SubRecipesPanel`, visible cuando
  la receta es de categoría menú. El servidor de ese flujo rechaza la
  autorreferencia y el ciclo entre menús. No está en los tipos generados ni
  en la lista de tablas de cocina de `MODELO-DE-DATOS`. Es un modelo de
  menú/combo, no de elaboración de cocina.

## Decisión

### Decisiones cerradas

1. `ingredients` representa materias primas y productos comprados a proveedor.
2. `recipes` representa cualquier elaboración, vendible o no vendible.
3. Una receta puede contener ingredientes y otras recetas.
4. La vendibilidad es una propiedad explícita de la receta: `is_sellable`
   verdadero o falso.
5. Toda elaboración que pueda ser componente de otra —y, por la decisión 15,
   eso incluye a una receta vendible— declara rendimiento: `yield_quantity` y
   `yield_unit`. `servings` sigue siendo la ración de servicio; no sustituye
   al rendimiento.
6. El coste de una subreceta se calcula a partir del coste de sus componentes
   y se reparte de forma proporcional a su rendimiento: coste por unidad de
   rendimiento = coste de los componentes / `yield_quantity`, en
   `yield_unit`.
7. El coste de una receta final se calcula de forma recursiva hasta llegar a
   ingredientes reales. El precio que entra es solo
   `ingredients.current_price`. Ninguna pantalla recalcula esa magnitud por
   su cuenta.
8. Un error o un dato ausente de coste, conversión o rendimiento no se
   convierte en 0 €. Aplica el principio 2 de
   [PRINCIPIOS](../1-producto/PRINCIPIOS.md): el sistema grita.
9. Existen, al menos como contrato conceptual, estos estados de error o
   indeterminación: `MISSING_PRICE`, `INCOMPATIBLE_UNITS`, `MISSING_YIELD`,
   `CYCLE`. Si uno de ellos aparece en la expansión, el total no se presenta
   como coste válido.
10. En esta fase del producto, el inventario se consume de forma recursiva
    hasta materias primas reales.
11. Las elaboraciones intermedias no tienen stock propio.
12. No hay producción por lotes.
13. Se prohíben los ciclos directos (A → A) y los indirectos (A → B → C → A).
    Un ciclo es estado `CYCLE`, no un coste.
14. No se deduce si una receta es vendible porque `sale_price` sea 0 o NULL.
    Hace falta `is_sellable`.
15. Una receta vendible también puede ser componente de otra receta.
16. `recipe_combos` no es el modelo de las subrecetas de cocina. No se
    reutiliza para bechamel, sofrito, salsas, fondos, rellenos ni masas.
17. `recipe_combos` queda fuera de este bloque: no se limpia, no se migra y
    no se modifica.

### Contrato de cálculo

La expansión de coste y la de stock son la misma árbol, leído con dos
preguntas distintas.

- Hoja: ingrediente. El coste usa `current_price` y la conversión a
  `purchase_unit` ya definida para líneas de ingrediente. El stock descuenta
  esa materia prima.
- Nodo: receta componente. Se expande. Su coste por unidad de rendimiento se
  multiplica por la cantidad que la receta padre consume, en una unidad
  compatible con `yield_unit`. El stock no se detiene en el nodo: sigue hasta
  las hojas.
- `MISSING_PRICE`: un ingrediente hoja no tiene precio utilizable.
- `INCOMPATIBLE_UNITS`: la cantidad consumida no se puede convertir a la
  unidad de compra del ingrediente o a la unidad de rendimiento de la
  subreceta.
- `MISSING_YIELD`: hace falta el rendimiento de una receta componente y
  `yield_quantity` o `yield_unit` no están declarados, o la cantidad es nula
  o no positiva.
- `CYCLE`: la expansión vuelve a una receta ya visitada en el mismo camino.

Una elaboración con `is_sellable = false` no necesita PVP. Sí tiene coste de
elaboración en cuanto sus hojas lo permiten.

### Ejemplos

Los números ilustran el contrato. No son datos cargados en el sistema.

**Salsa parmesana.** Elaboración intermedia. Componentes: leche, harina,
mantequilla, nuez moscada y sal. Rendimiento de ejemplo: 1.000 ml. No
necesita PVP. Puede ser `is_sellable = false`. Sí tiene coste de elaboración,
repartido entre esos 1.000 ml. Otra receta puede consumir 120 ml: se lleva
120/1000 del coste y, en stock, la parte proporcional de leche, harina,
mantequilla, nuez moscada y sal. No deja saldo de «salsa parmesana».

**Bechamel.** Segunda elaboración intermedia medida por volumen, con el mismo
contrato: rendimiento en mililitros o litros, coste repartido según ese
rendimiento, consumo por volumen desde la receta padre, expansión hasta
materias primas.

**Sofrito.** Elaboración intermedia cuyo rendimiento se declara por peso
(gramos o kilos) o por volumen (mililitros o litros). La unidad elegida es
`yield_unit`. Quien la consuma tiene que usar una unidad compatible; si no,
el estado es `INCOMPATIBLE_UNITS`.

**Lasaña, receta final.** Contiene ingredientes directos (carne, pasta,
queso) y 120 ml de salsa parmesana o de bechamel. El coste de la lasaña es
la suma del coste de la carne, la pasta y el queso más el coste de esos
120 ml. El consumo de stock de una lasaña vendida descuenta carne, pasta,
queso y las materias primas de los 120 ml. No descuenta un bote de salsa.

## Alternativas descartadas

| Alternativa | Motivo de descarte |
|---|---|
| Reutilizar `recipe_combos` / `SubRecipesPanel` | Modela menús y combos vendibles, no el rendimiento ni el coste de una elaboración de cocina. |
| Tratar la subreceta como un ingrediente comprado | Un ingrediente es lo que se compra a proveedor. Una salsa no tiene precio de albarán propio. |
| Deducir «no vendible» de `sale_price` 0 o NULL | El PVP ausente o a cero ya existe en recetas que sí se venden y aún no tienen precio. Mezcla dos hechos. |
| Dar stock propio a la elaboración intermedia | Exige producción por lotes, mermas de producto semielaborado y un ledger que esta fase no abre. |
| Parar el coste en la subreceta con un precio manual | Crea una segunda autoridad económica distinta de `current_price`. |
| Convertir un fallo de conversión, precio o rendimiento en 0 € | Oculta el dato ausente y contradice el principio 2. |

## Consecuencias

### Fuera de alcance de este bloque

No hay migración, tabla, columna, RPC, acción de servidor, pantalla, cambio
de stock, cambio de coste, refactor, limpieza de `recipe_combos`, prueba
funcional ni cambio en Vercel o Supabase. El comportamiento de producción no
cambia con este ADR.

### Consecuencias para bloques futuros

Quien implemente los bloques siguientes no reabre estas decisiones:

- Añadir `is_sellable`, `yield_quantity` y `yield_unit` a la elaboración, y
  una relación receta → receta distinta de `recipe_combos` y distinta de
  `recipe_ingredients` tal como está hoy (solo ingrediente).
- Calcular coste y consumo con la expansión recursiva y los cuatro estados.
  Cliente y base de datos siguen teniendo que coincidir.
- Rechazar ciclos directos e indirectos antes de persistir el enlace.
- No crear stock ni orden de producción para la elaboración intermedia.
- No usar `sale_price` como proxy de vendibilidad.
- No editar ni retirar `recipe_combos` como parte del modelo de subreceta.
- Mientras el código no cumpla este contrato, la brecha está en
  [D32](../5-estado/DEUDA.md).
