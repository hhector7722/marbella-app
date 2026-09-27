# B10 — Matriz de elaboraciones intermedias

Cada fila nombra la autoridad y el contrato o test que ya la cubre. B10 no crea un segundo motor.

| Capa | Escenario | Autoridad | Esperado | Cobertura |
|---|---|---|---|---|
| Coste | Directa válida | `get_recipe_cost_v2` | total finito y `ok` | `recipe-cost-v2.contract.sql` caso 8 |
| Coste | Padre → hija | `get_recipe_cost_v2` | coste prorrateado por rendimiento | caso 9 |
| Coste | Varios niveles | `get_recipe_cost_v2` | la hoja llega al padre | caso 16-17 |
| Coste | Misma materia por varias ramas | `get_recipe_cost_v2` | se suma en el total | caso 18 |
| Coste | `MISSING_PRICE` | `get_recipe_cost_v2` | total `null`, no 0 | caso 21 y hoja de línea |
| Coste | `INCOMPATIBLE_UNITS` | `get_recipe_cost_v2` | total `null` | caso 21 |
| Coste | `MISSING_YIELD` | `get_recipe_cost_v2` | total `null` | caso 20 |
| Coste | `CYCLE` | `get_recipe_cost_v2` | total `null` | caso 19 |
| Coste | `MAX_DEPTH_EXCEEDED` | `get_recipe_cost_v2` | `ok` falso y total `null` | bloque «profundidad» |
| Coste | `RECIPE_NOT_FOUND` | `get_recipe_cost_v2` | error y total `null` | caso inexistente |
| Coste | Vacía `ok` y total 0 sin componentes | `get_recipe_cost_v2` | el motor puede devolver 0; el comercio no lo usa como coste real | caso 22; ranking N; listado B10 |
| Stock | Directa | `get_recipe_stock_requirements_v2` | cantidad en unidad base | `recipe-stock-v2.contract.sql` caso 1-2 |
| Stock | Padre → hija | mismo motor | hoja de la hija | caso 14-16 |
| Stock | Varios niveles | mismo motor | factor acumulado | caso 27 |
| Stock | Misma materia por dos ramas | mismo motor | una fila agregada | caso suma |
| Stock | Cantidad según rendimiento | mismo motor | `factor * cantidad / yield` | caso 14-16 |
| Stock | `MISSING_YIELD` | mismo motor | `ok` falso | caso 13 y 24 |
| Stock | `CYCLE` | mismo motor | `ok` falso | caso 23 |
| Stock | `MAX_DEPTH_EXCEEDED` | coste v2, no el motor de stock | el stock corta ciclos y no publica este estado | matriz; no se cambia el motor publicado |
| Stock | `RECIPE_NOT_FOUND` | motor de stock | `ok` falso, sin hojas | caso 26 |
| Stock | Vacía válida | motor y wrapper | `ok`, cero ingredientes | caso 25; `recipe-stock-v2-rows.contract.sql` |
| Stock | Inválida | consumidores | no usan cantidades parciales | merma, Recetas TPV, Copilot |
| Ciclos | A → A, A → B → A, árbol válido, update | trigger `recipe_subrecipes` | el ciclo no se escribe; el update también | `recipe-subrecipes-cycle.contract.sql` |
| Vendibilidad | `is_sellable` explícito | columna, no el precio | Carta y TPV solo ofrecen vendibles; el mapping interno no se borra; el consumo no vende internas | carta, `recipe-tpv-materials.test.ts`, consumo |
| Composición | Editor y TPV | `/recipes` escribe; TPV lee el wrapper | TPV no inserta `recipe_ingredients` | `recipe-b9-parity.test.ts` |
| Venta | Directa, recursiva, agregada, inválida, vacía, histórico | `process_ticket_stock_deduction` | inválida no escribe; vacía no bloquea; un ticket cerrado no se reprocesa | `ticket-stock-deduction-v2.contract.sql` |
| Merma | Hojas, inválida, vacía, manual | `processRecipeWaste` | inválida y vacía no se dan por hechas | `recipe-waste.test.ts` |
| Consumo | Completa, media directa, media con elaboraciones | `process_staff_consumption` | la media con subrecetas sigue bloqueada | `staff-consumption-v2.contract.sql` |
| Ranking | Válido, inválido, vacío, factor | `get_product_margin_ranking` | desconocido es `NULL`, no 0 | `product-margin-ranking-v2.contract.sql` |
| Recetas TPV | Carbonara, vacío, inválida, albarán, legacy | `recipe_stock_requirements_v2_rows` | cuatro hojas; interna no seleccionable | `recipe-tpv-materials.test.ts` |
| Importación | Alta, omisión, overwrite directo, padre bloqueado | `decideLegacyRecipeImport` | el rechazo ocurre antes de escribir | `legacy-recipe-import.test.ts` |
| Copilot | Listado, expansión, coste, Carbonara, vacía | `gestionar_recetas` | no lee `recipe_ingredients` como composición | `copilot-recipes-v2.contract.sql` |
| Listado `/recipes` | Directa, recursiva válida, inválida, sin base | legacy si no hay hijas; `get_recipe_cost_v2` si las hay | inválida o sin base no es «óptimo» | `recipe-food-cost.test.ts` |

B8 queda fuera: Pesto y Brava esperan datos reales. Carbonara ya está migrada. `get_recipe_cost` sigue siendo el lector de una vendible sin subrecetas.
