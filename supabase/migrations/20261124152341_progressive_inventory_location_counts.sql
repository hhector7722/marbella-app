-- Progressive inventory: independent confirmation by location, actual ticket date.
ALTER TABLE public.inventory_count_drafts
 ADD COLUMN has_barra boolean NOT NULL DEFAULT false,
 ADD COLUMN has_camara boolean NOT NULL DEFAULT false,
 ADD COLUMN barra_counted_at timestamptz,
 ADD COLUMN camara_counted_at timestamptz;
UPDATE public.inventory_count_drafts SET has_barra=(quantity_barra<>0),has_camara=(quantity_camara<>0);
ALTER TABLE public.inventory_count_lines ADD COLUMN barra_counted_at timestamptz, ADD COLUMN camara_counted_at timestamptz;

CREATE FUNCTION public.set_inventory_draft_location(p_ingredient_id uuid,p_location text,p_quantity numeric,p_confirm boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
 IF p_location NOT IN ('BARRA','CAMARA') OR p_location IS NULL OR p_quantity<0 OR p_quantity='NaN'::numeric OR p_confirm IS NULL THEN RAISE EXCEPTION 'Cantidad o ubicación inválida'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ingredients WHERE id=p_ingredient_id AND inventory_visible AND archived_at IS NULL) THEN RAISE EXCEPTION 'Producto no activo'; END IF;
 IF p_location='BARRA' THEN
 INSERT INTO public.inventory_count_drafts(ingredient_id,quantity_barra,has_barra,barra_counted_at,updated_by,updated_at)
 VALUES(p_ingredient_id,coalesce(p_quantity,0),p_quantity IS NOT NULL OR p_confirm,CASE WHEN p_confirm THEN clock_timestamp() END,auth.uid(),clock_timestamp())
 ON CONFLICT(ingredient_id) DO UPDATE SET quantity_barra=excluded.quantity_barra,has_barra=excluded.has_barra,barra_counted_at=excluded.barra_counted_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 ELSE
 INSERT INTO public.inventory_count_drafts(ingredient_id,quantity_camara,has_camara,camara_counted_at,updated_by,updated_at)
 VALUES(p_ingredient_id,coalesce(p_quantity,0),p_quantity IS NOT NULL OR p_confirm,CASE WHEN p_confirm THEN clock_timestamp() END,auth.uid(),clock_timestamp())
 ON CONFLICT(ingredient_id) DO UPDATE SET quantity_camara=excluded.quantity_camara,has_camara=excluded.has_camara,camara_counted_at=excluded.camara_counted_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 END IF;
END;$$;
REVOKE ALL ON FUNCTION public.set_inventory_draft_location(uuid,text,numeric,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_inventory_draft_location(uuid,text,numeric,boolean) TO authenticated;

CREATE FUNCTION public.get_inventory_draft_sales()
RETURNS TABLE(ingredient_id uuid,sold_units numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autorizado'; END IF;
 RETURN QUERY SELECT d.ingredient_id,coalesce(sum(m.quantity) FILTER (WHERE coalesce(t.fecha_real,m.movement_date)>d.barra_counted_at),0)
 FROM public.inventory_count_drafts d
 JOIN public.ingredients i ON i.id=d.ingredient_id AND i.inventory_visible AND i.archived_at IS NULL AND i.base_unit='ud'
 LEFT JOIN public.stock_movements m ON m.ingredient_id=d.ingredient_id AND m.movement_type='SALE' AND m.origin IN ('legacy','sale_webhook') AND m.unit IN ('ud','u','un') AND m.movement_date>d.barra_counted_at
 LEFT JOIN public.tickets_marbella t ON m.origin='sale_webhook' AND t.numero_documento=m.reference_external_id
 WHERE d.barra_counted_at IS NOT NULL GROUP BY d.ingredient_id;
END;$$;
REVOKE ALL ON FUNCTION public.get_inventory_draft_sales() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_draft_sales() TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_inventory_count(p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_count_id uuid;
  v_lines integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado para guardar un recuento';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El recuento requiere al menos una línea';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS item
    WHERE jsonb_typeof(item) <> 'object'
       OR coalesce(item->>'ingredient_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR jsonb_typeof(item->'physical_stock') <> 'number'
       OR btrim(coalesce(item->>'unit', '')) = ''
  ) THEN
    RAISE EXCEPTION 'Línea de recuento inválida';
  END IF;

  DELETE FROM public.inventory_counts
  WHERE created_by = auth.uid() AND status = 'pending';

  INSERT INTO public.inventory_counts (created_by)
  VALUES (auth.uid())
  RETURNING id INTO v_count_id;

  INSERT INTO public.inventory_count_lines
    (count_id, ingredient_id, physical_stock, theoretical_stock, unit, quantity_barra, quantity_camara, barra_counted_at, camara_counted_at)
  SELECT
    v_count_id,
    (item->>'ingredient_id')::uuid,
    (item->>'physical_stock')::numeric,
    coalesce((item->>'theoretical_stock')::numeric, 0),
    btrim(item->>'unit'),
    coalesce((item->>'quantity_barra')::numeric, 0),
    coalesce((item->>'quantity_camara')::numeric, 0),
    CASE WHEN item->>'progressive' = 'true' THEN coalesce(CASE WHEN d.quantity_barra = coalesce((item->>'quantity_barra')::numeric,0) THEN d.barra_counted_at END, c.created_at) END,
    CASE WHEN item->>'progressive' = 'true' THEN coalesce(CASE WHEN d.quantity_camara = coalesce((item->>'quantity_camara')::numeric,0) THEN d.camara_counted_at END, c.created_at) END
  FROM jsonb_array_elements(p_items) AS item
  JOIN public.inventory_counts c ON c.id = v_count_id
  LEFT JOIN public.inventory_count_drafts d ON d.ingredient_id=(item->>'ingredient_id')::uuid;

  GET DIAGNOSTICS v_lines = ROW_COUNT;

  RETURN jsonb_build_object('count_id', v_count_id, 'line_count', v_lines);
END;
$function$;

CREATE VIEW stock_v2.unit_stock_latest_counts AS
 SELECT DISTINCT ON (l.ingredient_id) l.ingredient_id,l.physical_units,c.counted_at,p.barra_counted_at
 FROM stock_v2.unit_stock_count_lines l JOIN stock_v2.unit_stock_counts c ON c.count_id=l.count_id
 LEFT JOIN public.inventory_count_lines p ON p.count_id=l.count_id AND p.ingredient_id=l.ingredient_id
 ORDER BY l.ingredient_id,c.counted_at DESC,c.certified_at DESC;
CREATE VIEW stock_v2.unit_stock_applicable_movements AS
 SELECT m.id,m.ingredient_id,m.movement_type,m.quantity,m.unit,
 CASE WHEN l.barra_counted_at IS NOT NULL AND m.movement_type='SALE' THEN coalesce(t.fecha_real,m.movement_date) ELSE m.movement_date END AS movement_date,
 m.reference_doc,m.original_description,m.processed_by,m.origin,
 CASE WHEN m.movement_type='PURCHASE' AND m.origin IN ('legacy','receipt_confirmation') THEN m.quantity
 WHEN m.movement_type='SALE' AND m.origin IN ('legacy','sale_webhook') THEN -m.quantity
 WHEN m.movement_type='WASTE' AND m.origin IN ('legacy','staff_consumption') THEN -m.quantity
 WHEN m.movement_type='ADJUSTMENT' AND m.origin='manager_adjustment' THEN m.quantity ELSE 0::numeric END AS signed_quantity
 FROM stock_v2.unit_stock_latest_counts l
 JOIN public.stock_movements m ON m.ingredient_id=l.ingredient_id AND m.movement_date>least(l.counted_at,coalesce(l.barra_counted_at,l.counted_at))
 LEFT JOIN public.tickets_marbella t ON m.origin='sale_webhook' AND m.movement_type='SALE' AND t.numero_documento=m.reference_external_id
 WHERE m.unit IN ('ud','u','un') AND ((m.movement_type='PURCHASE' AND m.origin IN ('legacy','receipt_confirmation')) OR (m.movement_type='SALE' AND m.origin IN ('legacy','sale_webhook')) OR (m.movement_type='WASTE' AND m.origin IN ('legacy','staff_consumption')) OR (m.movement_type='ADJUSTMENT' AND m.origin='manager_adjustment'))
 AND CASE WHEN m.movement_type='SALE' AND l.barra_counted_at IS NOT NULL THEN coalesce(t.fecha_real,m.movement_date)>l.barra_counted_at ELSE m.movement_date>l.counted_at END;
REVOKE ALL ON stock_v2.unit_stock_latest_counts,stock_v2.unit_stock_applicable_movements FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_unit_stock_status()
RETURNS TABLE(ingredient_id uuid,stock_units numeric,baseline_at timestamptz,stock_tracked boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('manager','admin')) THEN RAISE EXCEPTION 'Sin permiso para consultar stock'; END IF;
 RETURN QUERY SELECT i.id,CASE WHEN i.base_unit='ud' AND l.counted_at IS NOT NULL THEN l.physical_units::numeric+coalesce(sum(m.signed_quantity),0) END,l.counted_at,(i.base_unit='ud')::boolean
 FROM public.ingredients i LEFT JOIN stock_v2.unit_stock_latest_counts l ON l.ingredient_id=i.id LEFT JOIN stock_v2.unit_stock_applicable_movements m ON m.ingredient_id=i.id
 WHERE i.archived_at IS NULL AND i.inventory_visible=true GROUP BY i.id,i.base_unit,l.physical_units,l.counted_at ORDER BY i.id;
END;$$;

CREATE FUNCTION public.get_unit_stock_movement_history(p_ingredient_id uuid,p_offset integer DEFAULT 0,p_limit integer DEFAULT 500)
RETURNS TABLE(id uuid,movement_type varchar,quantity numeric,unit varchar,movement_date timestamptz,reference_doc varchar,original_description text,processed_by varchar,origin text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('manager','admin')) THEN RAISE EXCEPTION 'Sin permiso para consultar stock'; END IF;
 RETURN QUERY SELECT m.id,m.movement_type,m.quantity,m.unit,m.movement_date,m.reference_doc,m.original_description,m.processed_by,m.origin::text FROM stock_v2.unit_stock_applicable_movements m WHERE m.ingredient_id=p_ingredient_id
 ORDER BY m.movement_date DESC,m.id DESC OFFSET greatest(p_offset,0) LIMIT least(greatest(p_limit,1),500);
END;$$;
REVOKE ALL ON FUNCTION public.get_unit_stock_movement_history(uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_unit_stock_movement_history(uuid,integer,integer) TO authenticated;
