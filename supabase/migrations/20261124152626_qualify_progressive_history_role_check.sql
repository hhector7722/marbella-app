CREATE OR REPLACE FUNCTION public.get_unit_stock_movement_history(p_ingredient_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 500)
 RETURNS TABLE(id uuid, movement_type character varying, quantity numeric, unit character varying, movement_date timestamp with time zone, reference_doc character varying, original_description text, processed_by character varying, origin text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role IN ('manager','admin')) THEN RAISE EXCEPTION 'Sin permiso para consultar stock'; END IF;
 RETURN QUERY SELECT m.id,m.movement_type,m.quantity,m.unit,m.movement_date,m.reference_doc,m.original_description,m.processed_by,m.origin::text FROM stock_v2.unit_stock_applicable_movements m WHERE m.ingredient_id=p_ingredient_id
 ORDER BY m.movement_date DESC,m.id DESC OFFSET greatest(p_offset,0) LIMIT least(greatest(p_limit,1),500);
END;$function$;
