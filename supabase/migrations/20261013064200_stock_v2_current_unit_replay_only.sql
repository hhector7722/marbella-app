-- El replay de stock_v2 no puede sumar masa histórica (g) a metros
-- una vez que el ingrediente cambia de dimensión. El informe conserva
-- los eventos históricos pero sólo suma deltas de su unidad actual.
CREATE OR REPLACE VIEW stock_v2.relative_balance AS
SELECT
  r.id AS run_id,
  i.id AS ingredient_id,
  i.name AS ingredient_name,
  i.base_unit,
  COALESCE(sum(d.signed_quantity), 0::numeric)::numeric(20,4) AS hypothetical_zero_opening_balance,
  COALESCE(sum(d.source_records) FILTER (WHERE d.source = 'sale_recipe_estimate'::text), 0::numeric)::bigint AS estimated_recipe_impacts,
  COALESCE(sum(d.source_records) FILTER (WHERE d.source LIKE 'purchase_%'), 0::numeric)::bigint AS historical_purchase_movements,
  true AS requires_opening_stock_validation
FROM stock_v2.replay_runs r
CROSS JOIN public.ingredients i
LEFT JOIN stock_v2.daily_deltas d
  ON d.run_id = r.id
  AND d.ingredient_id = i.id
  AND d.base_unit = i.base_unit
GROUP BY r.id, i.id, i.name, i.base_unit;
