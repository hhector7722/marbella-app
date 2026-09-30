-- Inventario · Captura libre y certificación por gerencia.
--
-- El recuento físico se separa en dos hechos, como la recepción de compras
-- (ADR-0012): cualquier persona autenticada puede capturar un recuento, pero
-- solo manager/admin lo certifica y produce movimientos de stock. El recuento
-- capturado vive en inventory_counts / inventory_count_lines; la certificación
-- reutiliza record_inventory_count_movements (ledger canónico append-only).
--
-- Sin escritura directa: las mutaciones pasan por comandos estrechos
-- (submit_inventory_count / certify_inventory_count / reject_inventory_count).

CREATE TABLE IF NOT EXISTS public.inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'certified', 'rejected')),
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  certified_by uuid REFERENCES public.profiles(id),
  certified_at timestamptz,
  rejected_by uuid REFERENCES public.profiles(id),
  rejected_at timestamptz,
  rejection_reason text
);

CREATE INDEX IF NOT EXISTS inventory_counts_status_created_at_idx
  ON public.inventory_counts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS inventory_counts_created_by_status_idx
  ON public.inventory_counts (created_by, status);

CREATE TABLE IF NOT EXISTS public.inventory_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES public.inventory_counts(id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id),
  physical_stock numeric NOT NULL,
  theoretical_stock numeric NOT NULL,
  unit text NOT NULL,
  delta numeric GENERATED ALWAYS AS (physical_stock - theoretical_stock) STORED
);

CREATE INDEX IF NOT EXISTS inventory_count_lines_count_id_idx
  ON public.inventory_count_lines (count_id);

ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_count_lines ENABLE ROW LEVEL SECURITY;

-- Lectura: quien capturó ve lo suyo; gerencia ve todo.
DROP POLICY IF EXISTS inventory_counts_select_own_or_manager ON public.inventory_counts;
CREATE POLICY inventory_counts_select_own_or_manager ON public.inventory_counts
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS inventory_count_lines_select_own_or_manager ON public.inventory_count_lines;
CREATE POLICY inventory_count_lines_select_own_or_manager ON public.inventory_count_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inventory_counts c
      WHERE c.id = inventory_count_lines.count_id
        AND (c.created_by = auth.uid() OR public.is_purchase_manager_or_admin())
    )
  );

REVOKE ALL ON TABLE public.inventory_counts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.inventory_count_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inventory_counts TO authenticated;
GRANT SELECT ON TABLE public.inventory_count_lines TO authenticated;

-- Captura: cualquier persona autenticada. Sustituye su recuento pendiente
-- anterior (uno por persona) para no acumular borradores.
CREATE OR REPLACE FUNCTION public.submit_inventory_count(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  INSERT INTO public.inventory_count_lines (count_id, ingredient_id, physical_stock, theoretical_stock, unit)
  SELECT
    v_count_id,
    (item->>'ingredient_id')::uuid,
    (item->>'physical_stock')::numeric,
    coalesce((item->>'theoretical_stock')::numeric, 0),
    btrim(item->>'unit')
  FROM jsonb_array_elements(p_items) AS item;

  GET DIAGNOSTICS v_lines = ROW_COUNT;

  RETURN jsonb_build_object('count_id', v_count_id, 'line_count', v_lines);
END;
$$;

-- Certificación: solo manager/admin. Reutiliza el comando canónico del ledger
-- y marca el recuento como certificado en la misma transacción.
CREATE OR REPLACE FUNCTION public.certify_inventory_count(p_count_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_correlation uuid;
  v_items jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_purchase_manager_or_admin() THEN
    RAISE EXCEPTION 'No autorizado para certificar un recuento de inventario';
  END IF;

  SELECT status, correlation_id
  INTO v_status, v_correlation
  FROM public.inventory_counts
  WHERE id = p_count_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Recuento no encontrado';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'El recuento ya no está pendiente';
  END IF;

  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'ingredient_id', l.ingredient_id,
               'quantity_base', l.delta,
               'unit_base', l.unit,
               'physical_stock', l.physical_stock,
               'theoretical_stock', l.theoretical_stock
             )
           ),
           '[]'::jsonb
         )
  INTO v_items
  FROM public.inventory_count_lines l
  WHERE l.count_id = p_count_id
    AND l.delta <> 0;

  IF jsonb_array_length(v_items) > 0 THEN
    v_result := public.record_inventory_count_movements(v_items, v_correlation);
  ELSE
    v_result := jsonb_build_object('inserted_count', 0, 'idempotent_count', 0);
  END IF;

  UPDATE public.inventory_counts
  SET status = 'certified',
      certified_by = auth.uid(),
      certified_at = now()
  WHERE id = p_count_id;

  RETURN v_result;
END;
$$;

-- Rechazo: solo manager/admin. No produce movimientos.
CREATE OR REPLACE FUNCTION public.reject_inventory_count(p_count_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_purchase_manager_or_admin() THEN
    RAISE EXCEPTION 'No autorizado para rechazar un recuento de inventario';
  END IF;

  SELECT status INTO v_status
  FROM public.inventory_counts
  WHERE id = p_count_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Recuento no encontrado';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'El recuento ya no está pendiente';
  END IF;

  UPDATE public.inventory_counts
  SET status = 'rejected',
      rejected_by = auth.uid(),
      rejected_at = now(),
      rejection_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 500)
  WHERE id = p_count_id;

  RETURN jsonb_build_object('status', 'rejected');
END;
$$;

REVOKE ALL ON FUNCTION public.submit_inventory_count(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.certify_inventory_count(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_inventory_count(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_inventory_count(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.certify_inventory_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_inventory_count(uuid, text) TO authenticated;
