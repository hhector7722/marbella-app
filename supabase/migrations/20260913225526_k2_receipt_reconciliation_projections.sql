-- K2 · Proyecciones regenerables de conciliación pedido ↔ recepción.
-- Solo las asignaciones confirmadas y no supersedidas producen cantidades
-- recibidas. Una propuesta o una rectificación pendiente no altera el hecho
-- económico ni oculta la recepción anterior.

CREATE OR REPLACE VIEW public.purchase_order_item_reconciliation
WITH (security_invoker = true)
AS
WITH effective_allocations AS (
  SELECT a.*
  FROM public.purchase_order_item_receipt_allocations a
  WHERE a.status = 'confirmed'
    AND NOT EXISTS (
      SELECT 1
      FROM public.purchase_order_item_receipt_allocations successor
      WHERE successor.supersedes_id = a.id
        AND successor.status = 'confirmed'
    )
), received AS (
  SELECT
    purchase_order_item_id,
    SUM(quantity_in_order_unit) AS quantity_received,
    COUNT(DISTINCT purchase_invoice_line_id) AS receipt_line_count
  FROM effective_allocations
  GROUP BY purchase_order_item_id
)
SELECT
  poi.id AS purchase_order_item_id,
  poi.purchase_order_id,
  poi.ingredient_id,
  poi.ingredient_name,
  poi.quantity AS quantity_ordered,
  poi.unit AS order_unit,
  COALESCE(r.quantity_received, 0) AS quantity_received,
  GREATEST(poi.quantity - COALESCE(r.quantity_received, 0), 0) AS quantity_pending,
  COALESCE(r.quantity_received, 0) - poi.quantity AS quantity_difference,
  GREATEST(COALESCE(r.quantity_received, 0) - poi.quantity, 0) AS quantity_over_received,
  COALESCE(r.receipt_line_count, 0) AS receipt_line_count,
  CASE
    WHEN COALESCE(r.quantity_received, 0) = 0 THEN 'pending'
    WHEN COALESCE(r.quantity_received, 0) < poi.quantity THEN 'partial'
    WHEN COALESCE(r.quantity_received, 0) = poi.quantity THEN 'received'
    ELSE 'over_received'
  END AS receipt_state
FROM public.purchase_order_items poi
LEFT JOIN received r ON r.purchase_order_item_id = poi.id;

CREATE OR REPLACE VIEW public.purchase_invoice_line_reconciliation
WITH (security_invoker = true)
AS
WITH effective_allocations AS (
  SELECT a.*
  FROM public.purchase_order_item_receipt_allocations a
  WHERE a.status = 'confirmed'
    AND NOT EXISTS (
      SELECT 1
      FROM public.purchase_order_item_receipt_allocations successor
      WHERE successor.supersedes_id = a.id
        AND successor.status = 'confirmed'
    )
), allocated AS (
  SELECT
    purchase_invoice_line_id,
    SUM(quantity_in_invoice_line_unit) AS quantity_allocated,
    COUNT(DISTINCT purchase_order_item_id) AS order_item_count
  FROM effective_allocations
  GROUP BY purchase_invoice_line_id
)
SELECT
  pil.id AS purchase_invoice_line_id,
  pil.invoice_id,
  pil.original_name,
  pil.quantity AS quantity_invoiced,
  pil.line_unit AS invoice_line_unit,
  COALESCE(a.quantity_allocated, 0) AS quantity_allocated,
  GREATEST(COALESCE(pil.quantity, 0) - COALESCE(a.quantity_allocated, 0), 0) AS quantity_pending,
  COALESCE(a.quantity_allocated, 0) - COALESCE(pil.quantity, 0) AS quantity_difference,
  GREATEST(COALESCE(a.quantity_allocated, 0) - COALESCE(pil.quantity, 0), 0) AS quantity_over_allocated,
  COALESCE(a.order_item_count, 0) AS order_item_count,
  CASE
    WHEN COALESCE(a.quantity_allocated, 0) = 0 THEN 'unlinked'
    WHEN COALESCE(a.quantity_allocated, 0) < COALESCE(pil.quantity, 0) THEN 'partial'
    WHEN COALESCE(a.quantity_allocated, 0) = COALESCE(pil.quantity, 0) THEN 'allocated'
    ELSE 'over_allocated'
  END AS reconciliation_state
FROM public.purchase_invoice_lines pil
LEFT JOIN allocated a ON a.purchase_invoice_line_id = pil.id;

COMMENT ON VIEW public.purchase_order_item_reconciliation IS
  'Proyección por línea de pedido: pedido, recibido confirmado, pendiente y diferencia. Soporta recepciones parciales y varios albaranes.';
COMMENT ON VIEW public.purchase_invoice_line_reconciliation IS
  'Proyección por línea de albarán: cantidad de línea asignada a uno o varios pedidos, pendiente y diferencia. Un albarán sin pedido sigue válido.';

REVOKE ALL ON TABLE public.purchase_order_item_reconciliation, public.purchase_invoice_line_reconciliation FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.purchase_order_item_reconciliation, public.purchase_invoice_line_reconciliation TO authenticated, service_role;
