-- PostgREST parameterizes LIKE and can choose a full scan for a large OR list.
-- Seek each requested line through the existing varchar_pattern_ops index.
CREATE OR REPLACE FUNCTION public.get_purchase_line_rectification_counts(p_line_ids uuid[])
RETURNS TABLE(line_id uuid, rectified_count integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT ids.line_id,
    COALESCE(MAX(substring(m.reference_doc FROM '-REV([0-9]{1,9})-')::integer), 0)
  FROM (
    SELECT DISTINCT id AS line_id
    FROM unnest(COALESCE(p_line_ids[1:200], '{}'::uuid[])) AS requested(id)
    WHERE id IS NOT NULL
  ) ids
  LEFT JOIN LATERAL (
    SELECT sm.reference_doc
    FROM public.stock_movements sm
    WHERE sm.reference_doc ~>=~ ('ALB-LINE-' || ids.line_id::text || '-REV')::varchar
      AND sm.reference_doc ~<~ ('ALB-LINE-' || ids.line_id::text || '-REW')::varchar
  ) m ON true
  GROUP BY ids.line_id;
$$;

COMMENT ON FUNCTION public.get_purchase_line_rectification_counts(uuid[]) IS
  'Read-only indexed rectification lookup for at most 200 invoice lines; RLS on stock_movements remains in force.';

REVOKE ALL ON FUNCTION public.get_purchase_line_rectification_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_purchase_line_rectification_counts(uuid[]) TO authenticated, service_role;
