-- 2026-10-09 Stock unitario: arranque REAL únicamente con recuento físico nuevo.
-- El ledger histórico y todas las ventas son INMUTABLES para este despliegue.
-- La fecha de cada inventario es la de CAPTURA, no una fecha arbitraria a cero.

CREATE TABLE IF NOT EXISTS stock_v2.unit_stock_counts(
 count_id uuid PRIMARY KEY REFERENCES public.inventory_counts(id) ON DELETE RESTRICT,
 counted_at timestamptz NOT NULL,
 certified_at timestamptz NOT NULL DEFAULT now(),
 certified_by uuid NOT NULL REFERENCES public.profiles(id),
 product_count integer NOT NULL CHECK(product_count > 0)
);
CREATE TABLE IF NOT EXISTS stock_v2.unit_stock_count_lines(
 count_id uuid NOT NULL REFERENCES stock_v2.unit_stock_counts(count_id) ON DELETE RESTRICT,
 ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
 physical_units integer NOT NULL CHECK(physical_units >= 0),
 PRIMARY KEY(count_id,ingredient_id)
);
CREATE INDEX IF NOT EXISTS unit_stock_counts_date_idx ON stock_v2.unit_stock_counts(counted_at DESC);
CREATE INDEX IF NOT EXISTS unit_stock_count_lines_ingredient_idx ON stock_v2.unit_stock_count_lines(ingredient_id,count_id);
ALTER TABLE stock_v2.unit_stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_v2.unit_stock_count_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON stock_v2.unit_stock_counts,stock_v2.unit_stock_count_lines FROM public,anon,authenticated;

-- Este comando sustituye SOLO la certificación económica para el nuevo inventario unitario.
-- No llama a record_inventory_count_movements (así evita ajustar el stock antiguo).
CREATE OR REPLACE FUNCTION public.certify_unit_stock_count(p_count_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 v_role text;
 v_created_at timestamptz;
 v_author uuid;
 v_status text;
 v_required integer;
 v_counted integer;
BEGIN
 IF (select auth.uid()) IS NULL THEN
   RAISE EXCEPTION 'No autorizado';
 END IF;
 SELECT role INTO v_role FROM public.profiles WHERE id=(select auth.uid());
 IF v_role NOT IN ('manager','admin') THEN
   RAISE EXCEPTION 'Solo gerencia puede certificar el stock';
 END IF;

 SELECT created_at,created_by,status INTO v_created_at,v_author,v_status
 FROM public.inventory_counts WHERE id=p_count_id FOR UPDATE;
 IF v_status IS DISTINCT FROM 'pending' THEN
   RAISE EXCEPTION 'El recuento ya no está pendiente o no existe';
 END IF;
 IF v_created_at < timestamptz '2026-10-09 00:00:00+02' THEN
   RAISE EXCEPTION 'Este recuento corresponde al inventario anterior y no puede ser el nuevo punto de partida';
 END IF;

 SELECT count(*) INTO v_required FROM public.ingredients
 WHERE inventory_visible=true AND archived_at IS NULL AND base_unit='ud';
 IF v_required=0 THEN
   RAISE EXCEPTION 'No hay productos unitarios activos en inventario';
 END IF;

 -- Exige un valor EXPLÍCITO incluso para stock físico cero. No rellenamos huecos.
 SELECT count(*) INTO v_counted
 FROM public.inventory_count_lines l
 JOIN public.ingredients i ON i.id=l.ingredient_id
 WHERE l.count_id=p_count_id AND i.inventory_visible=true
   AND i.archived_at IS NULL AND i.base_unit='ud'
   AND l.unit IN ('ud','u','un')
   AND l.physical_stock >= 0
   AND l.physical_stock = trunc(l.physical_stock)
   AND l.physical_stock = l.quantity_barra+l.quantity_camara;

 IF v_counted <> v_required THEN
   RAISE EXCEPTION 'Recuento incompleto: % de % artículos unitarios contados. Indica también 0 para los que no tengas.',v_counted,v_required;
 END IF;

 IF EXISTS(
  SELECT 1 FROM public.inventory_count_lines l JOIN public.ingredients i ON i.id=l.ingredient_id
  WHERE l.count_id=p_count_id AND i.inventory_visible=true AND i.archived_at IS NULL AND i.base_unit='ud'
  GROUP BY l.ingredient_id HAVING count(*)<>1
 ) THEN
   RAISE EXCEPTION 'El recuento incluye productos duplicados';
 END IF;

 INSERT INTO stock_v2.unit_stock_counts(count_id,counted_at,certified_by,product_count)
 VALUES(p_count_id,v_created_at,(select auth.uid()),v_required);

 INSERT INTO stock_v2.unit_stock_count_lines(count_id,ingredient_id,physical_units)
 SELECT l.count_id,l.ingredient_id,l.physical_stock::integer
 FROM public.inventory_count_lines l JOIN public.ingredients i ON i.id=l.ingredient_id
 WHERE l.count_id=p_count_id AND i.inventory_visible=true AND i.archived_at IS NULL AND i.base_unit='ud';

 UPDATE public.inventory_counts
 SET status='certified',certified_by=(select auth.uid()),certified_at=now()
 WHERE id=p_count_id;

 RETURN jsonb_build_object('count_id',p_count_id,'certified_unit_products',v_required,
   'stock_source','stock_v2','legacy_stock_modified',false);
END;$$;

REVOKE ALL ON FUNCTION public.certify_unit_stock_count(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.certify_unit_stock_count(uuid) TO authenticated;

-- Lectura gerencial del NUEVO stock: exactamente los productos habilitados en Inventario.
-- Antes del primer recuento muestra quantity=NULL (no 0 ficticio).
-- Después calcula SOLO los movimientos posteriores a la captura:
-- compras, ventas del TPV y mermas; omite los ajustes antiguos y los recuentos previos.
CREATE OR REPLACE FUNCTION public.get_unit_stock_status()
RETURNS TABLE(
 ingredient_id uuid,
 stock_units numeric,
 baseline_at timestamptz,
 stock_tracked boolean
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = ''
AS $$
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
    ELSE 0::numeric END),0::numeric)
 ELSE NULL::numeric END,
 latest.counted_at,
 (i.base_unit='ud')::boolean
 FROM public.ingredients i
 LEFT JOIN latest ON latest.ingredient_id=i.id
 LEFT JOIN public.stock_movements m ON m.ingredient_id=i.id
   AND latest.counted_at IS NOT NULL AND m.movement_date>latest.counted_at
   AND m.movement_type IN ('PURCHASE','SALE','WASTE')
   AND m.unit IN ('ud','u','un')
 WHERE i.archived_at IS NULL AND i.inventory_visible=true
 GROUP BY i.id,i.base_unit,latest.physical_units,latest.counted_at
 ORDER BY i.id;
END;$$;
REVOKE ALL ON FUNCTION public.get_unit_stock_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_unit_stock_status() TO authenticated;

COMMENT ON FUNCTION public.get_unit_stock_status() IS 'Stock nuevo solo después de recuento verificado; ventas y compras antiguas intactas. No usar stock_current ni contabilizar antes del corte.';
