-- Alinea el indicador «Completado» con sync_purchase_invoice_status.
-- Un movimiento PURCHASE vinculado a la línea pero cargado a otro ingrediente
-- no puede acreditar que la línea esté correctamente recibida.
-- No altera datos, existencias ni confirmaciones: solo la comprobación de lectura.

CREATE OR REPLACE FUNCTION public.get_purchase_invoice_processing_states(p_invoice_ids uuid[])
RETURNS TABLE(invoice_id uuid, is_fully_processed boolean)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH requested AS (
    SELECT DISTINCT id AS invoice_id
    FROM unnest(COALESCE(p_invoice_ids, '{}'::uuid[])) AS ids(id)
  ),
  active_lines AS (
    SELECT
      pil.id,
      pil.invoice_id,
      pil.status,
      pil.mapped_ingredient_id
    FROM public.purchase_invoice_lines pil
    JOIN requested r ON r.invoice_id = pil.invoice_id
    WHERE pil.superseded_by_extraction_id IS NULL
  ),
  resolved AS (
    SELECT
      al.invoice_id,
      COUNT(*)::int AS line_count,
      BOOL_AND(
        al.status IN ('excluded', 'expense_only')
        OR (
          al.status = 'mapped'
          AND al.mapped_ingredient_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.stock_movements sm
            WHERE sm.movement_type = 'PURCHASE'
              AND sm.ingredient_id = al.mapped_ingredient_id
              AND (
                sm.reference_doc = 'ALB-LINE-' || al.id::text
                OR (
                  sm.reference_type = 'purchase_invoice_line'::public.stock_reference_type
                  AND sm.reference_id = al.id
                )
              )
          )
        )
      ) AS all_lines_resolved
    FROM active_lines al
    GROUP BY al.invoice_id
  )
  SELECT
    r.invoice_id,
    COALESCE(
      resolved.line_count > 0 AND resolved.all_lines_resolved,
      false
    ) AS is_fully_processed
  FROM requested r
  LEFT JOIN resolved ON resolved.invoice_id = r.invoice_id;
$function$;

COMMENT ON FUNCTION public.get_purchase_invoice_processing_states(uuid[])
IS 'El indicador Completado exige líneas activas resueltas y PURCHASE vinculado al mismo ingrediente que cada línea; evita falsos positivos de stock antiguo o cambiado.';
