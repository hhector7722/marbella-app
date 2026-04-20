-- Detalle día consumo personal: versión robusta (UUID vía substring, GROUP BY solo employee_id).
-- Evita fallos si la migración anterior no sustituyó la función o si regexp_match/subconsultas dan problemas en edge cases.

CREATE OR REPLACE FUNCTION public.get_staff_consumption_day_detail(
  p_date date,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_manager_or_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  WITH base AS (
    SELECT
      (substring(sm.reference_doc FROM '^STAFF-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-'))::uuid AS employee_id,
      regexp_replace(sm.original_description, '^Consumo Personal:\\s*', '') AS product_name,
      (COALESCE(ing.current_price, 0) * COALESCE(sm.quantity, 0))::numeric AS amount
    FROM public.stock_movements sm
    JOIN public.ingredients ing ON ing.id = sm.ingredient_id
    WHERE sm.movement_type = 'WASTE'
      AND sm.reference_doc LIKE 'STAFF-%'
      AND sm.original_description LIKE 'Consumo Personal:%'
      AND (sm.movement_date AT TIME ZONE 'Europe/Madrid')::date = p_date
      AND (
        p_user_id IS NULL
        OR (substring(sm.reference_doc FROM '^STAFF-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-'))::uuid = p_user_id
      )
  ),
  items AS (
    SELECT
      employee_id,
      product_name,
      SUM(amount)::numeric AS amount
    FROM base
    WHERE employee_id IS NOT NULL
    GROUP BY employee_id, product_name
  ),
  workers AS (
    SELECT
      i.employee_id,
      MAX(COALESCE(NULLIF(trim(p.full_name), ''), trim(concat_ws(' ', p.first_name, p.last_name)))) AS name,
      SUM(i.amount)::numeric AS total,
      jsonb_agg(
        jsonb_build_object(
          'name', i.product_name,
          'amount', i.amount
        )
      ) AS items
    FROM items i
    LEFT JOIN public.profiles p ON p.id = i.employee_id
    GROUP BY i.employee_id
  )
  SELECT jsonb_build_object(
    'date', to_char(p_date, 'YYYY-MM-DD'),
    'totalAmount', COALESCE((SELECT SUM(total) FROM workers), 0),
    'workers', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', employee_id,
          'name', name,
          'total', total,
          'items', items
        )
      ) FROM workers),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_consumption_day_detail(date, uuid) TO authenticated;
