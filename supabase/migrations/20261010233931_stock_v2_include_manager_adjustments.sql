-- Stock 2.0 parte del último recuento físico certificado de cada unidad.
-- Los ajustes posteriores del ledger canónico también cambian su saldo.
CREATE OR REPLACE FUNCTION public.get_unit_stock_status()
RETURNS TABLE(
  ingredient_id uuid,
  stock_units numeric,
  baseline_at timestamptz,
  stock_tracked boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_role text;
BEGIN
 IF (select auth.uid()) IS NULL THEN
   RAISE EXCEPTION 'No autorizado';
 END IF;
 SELECT role INTO v_role FROM public.profiles WHERE id=(select auth.uid());
 IF v_role NOT IN ('manager','admin') THEN
   RAISE EXCEPTION 'Sin permiso para consultar stock';
 END IF;

 RETURN QUERY
 WITH latest AS (
  SELECT DISTINCT ON (l.ingredient_id) l.ingredient_id,l.physical_units,c.counted_at
  FROM stock_v2.unit_stock_count_lines l
  JOIN stock_v2.unit_stock_counts c ON c.count_id=l.count_id
  ORDER BY l.ingredient_id,c.counted_at DESC,c.certified_at DESC
 )
 SELECT i.id,
 CASE WHEN i.base_unit='ud' AND latest.counted_at IS NOT NULL
 THEN latest.physical_units::numeric +
   coalesce(sum(CASE
    WHEN m.movement_type='PURCHASE' AND m.origin IN ('legacy','receipt_confirmation') THEN m.quantity
    WHEN m.movement_type='SALE' AND m.origin IN ('legacy','sale_webhook') THEN -m.quantity
    WHEN m.movement_type='WASTE' AND m.origin IN ('legacy','staff_consumption') THEN -m.quantity
    WHEN m.movement_type='ADJUSTMENT' AND m.origin='manager_adjustment' THEN m.quantity
    ELSE 0::numeric END),0::numeric)
 ELSE NULL::numeric END,
 latest.counted_at,
 (i.base_unit='ud')::boolean
 FROM public.ingredients i
 LEFT JOIN latest ON latest.ingredient_id=i.id
 LEFT JOIN public.stock_movements m ON m.ingredient_id=i.id
   AND latest.counted_at IS NOT NULL AND m.movement_date>latest.counted_at
   AND m.movement_type IN ('PURCHASE','SALE','WASTE','ADJUSTMENT')
   AND m.unit IN ('ud','u','un')
 WHERE i.archived_at IS NULL AND i.inventory_visible=true
 GROUP BY i.id,i.base_unit,latest.physical_units,latest.counted_at
 ORDER BY i.id;
END;$function$;
