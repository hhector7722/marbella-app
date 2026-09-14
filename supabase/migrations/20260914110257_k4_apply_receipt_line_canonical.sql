-- K4 · Confirmación económica canónica de una línea de recepción.
--
-- `public.apply_receipt_line` es la única entrada expuesta para una recepción
-- económica. Delega en `private.apply_receipt_line`, una función definidora
-- fuera del esquema expuesto, para poder mantener atómicas las escrituras de
-- precio, conciliación y ledger sin conceder rutas directas de PURCHASE.
--
-- Este cambio no interpreta ni repara movimientos legacy. El cache heredado
-- `ingredients.stock_current` se conserva hasta el corte físico; K4 no lo
-- escribe. La proyección canónica se lee de `public.stock_current`.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- La precisión de céntimos era insuficiente para precios por unidad (p. ej.
-- 1.000 paletinas por 3,25 € = 0,00325 €/ud). Se amplía sin reescribir valores.
-- El trigger se recrea más abajo con la procedencia K4; Postgres no permite
-- alterar el tipo mientras conserva una definición que depende de la columna.
DROP TRIGGER IF EXISTS trigger_log_price_history ON public.ingredients;

ALTER TABLE public.ingredients
  ALTER COLUMN current_price TYPE numeric(18,8)
  USING current_price::numeric(18,8);

ALTER TABLE public.ingredient_price_history
  ALTER COLUMN old_price TYPE numeric(18,8)
  USING old_price::numeric(18,8),
  ALTER COLUMN new_price TYPE numeric(18,8)
  USING new_price::numeric(18,8),
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS purchase_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS purchase_invoice_line_id uuid REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS mapping_version_id uuid REFERENCES public.purchase_mapping_versions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS receipt_confirmation_id uuid,
  ADD COLUMN IF NOT EXISTS stock_movement_id uuid REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS provenance jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.purchase_receipt_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_invoice_line_id uuid NOT NULL UNIQUE REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
  purchase_invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
  supplier_id bigint NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  mapping_version_id uuid NOT NULL REFERENCES public.purchase_mapping_versions(id) ON DELETE RESTRICT,
  source_document_extraction_id uuid REFERENCES public.document_extractions(id) ON DELETE RESTRICT,
  stock_movement_id uuid NOT NULL UNIQUE REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL UNIQUE,
  physical_quantity numeric NOT NULL CHECK (physical_quantity > 0),
  base_unit text NOT NULL CHECK (base_unit IN ('g', 'ml', 'ud')),
  purchase_quantity numeric NOT NULL CHECK (purchase_quantity > 0),
  purchase_unit text NOT NULL CHECK (purchase_unit IN ('kg', 'g', 'l', 'ml', 'cl', 'ud')),
  observed_unit_price numeric NOT NULL CHECK (observed_unit_price > 0),
  normalized_unit_price numeric(18,8) NOT NULL CHECK (normalized_unit_price > 0),
  price_before numeric(18,8) NOT NULL CHECK (price_before >= 0),
  price_after numeric(18,8) NOT NULL CHECK (price_after >= 0),
  price_locked boolean NOT NULL,
  price_changed boolean NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.ingredient_price_history
  ADD CONSTRAINT ingredient_price_history_receipt_confirmation_fkey
  FOREIGN KEY (receipt_confirmation_id)
  REFERENCES public.purchase_receipt_confirmations(id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ingredient_price_history_receipt_confirmation_unique
  ON public.ingredient_price_history (receipt_confirmation_id)
  WHERE receipt_confirmation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ingredient_price_history_idempotency_key_unique
  ON public.ingredient_price_history (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_purchase_invoice_line_unique
  ON public.stock_movements (reference_type, reference_id)
  WHERE reference_type = 'purchase_invoice_line'::public.stock_reference_type;
CREATE INDEX IF NOT EXISTS purchase_receipt_confirmations_invoice_idx
  ON public.purchase_receipt_confirmations (purchase_invoice_id, confirmed_at DESC);

COMMENT ON TABLE public.purchase_receipt_confirmations IS
  'Auditoría append-only de cada confirmación económica K4. No es un ledger: el único ledger continúa siendo stock_movements.';
COMMENT ON COLUMN public.purchase_receipt_confirmations.normalized_unit_price IS
  'Precio observado normalizado a €/purchase_unit por la función canónica.';

-- La historia de precio conserva correcciones mediante nuevos hechos, nunca
-- mediante UPDATE o DELETE. El trigger de precio manual conserva su finalidad,
-- pero se inhibe explícitamente dentro de la recepción canónica para no crear
-- una segunda entrada sin procedencia.
CREATE OR REPLACE FUNCTION public.prevent_k4_price_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'El historial de precio es append-only; registre un nuevo hecho de precio.';
END;
$$;

DROP TRIGGER IF EXISTS ingredient_price_history_append_only ON public.ingredient_price_history;
CREATE TRIGGER ingredient_price_history_append_only
  BEFORE UPDATE OR DELETE ON public.ingredient_price_history
  FOR EACH ROW EXECUTE FUNCTION public.prevent_k4_price_history_mutation();

CREATE OR REPLACE FUNCTION public.log_price_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.current_price IS DISTINCT FROM NEW.current_price
     AND COALESCE(current_setting('app.receipt_confirmation_price_write', true), '') <> 'on' THEN
    INSERT INTO public.ingredient_price_history (
      ingredient_id,
      old_price,
      new_price,
      changed_by,
      changed_at,
      source,
      provenance
    ) VALUES (
      NEW.id,
      OLD.current_price,
      NEW.current_price,
      auth.uid(),
      now(),
      'manual',
      jsonb_build_object('schema_version', 'k4', 'origin', 'manual_ingredient_edit')
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_log_price_history
  BEFORE UPDATE OF current_price ON public.ingredients
  FOR EACH ROW EXECUTE FUNCTION public.log_price_change();

-- Impide que un cliente autenticado inserte un PURCHASE por la Data API. Los
-- otros productores ya existentes (venta, merma, inventario y consumo) siguen
-- usando sus tipos tipados; la recepción pasa exclusivamente por la función
-- privada que ejecuta como definidor.
DROP POLICY IF EXISTS k4_stock_purchase_only_via_receipt_command ON public.stock_movements;
CREATE POLICY k4_stock_purchase_only_via_receipt_command ON public.stock_movements
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (movement_type <> 'PURCHASE');

-- Una versión propuesta puede prepararse en la revisión. Solo el comando
-- canónico materializa una versión confirmada y solo él confirma asignaciones.
DROP POLICY IF EXISTS k4_mapping_confirmed_only_via_receipt_command ON public.purchase_mapping_versions;
CREATE POLICY k4_mapping_confirmed_only_via_receipt_command ON public.purchase_mapping_versions
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (status <> 'confirmed'::public.purchase_mapping_version_status);

DROP POLICY IF EXISTS k4_price_history_receipt_only_via_command ON public.ingredient_price_history;
CREATE POLICY k4_price_history_receipt_only_via_command ON public.ingredient_price_history
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (COALESCE(source, 'manual') <> 'receipt_confirmation');

REVOKE INSERT ON TABLE public.purchase_order_item_receipt_allocations FROM authenticated;

ALTER TABLE public.purchase_receipt_confirmations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.purchase_receipt_confirmations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.purchase_receipt_confirmations TO service_role;
GRANT SELECT ON TABLE public.purchase_receipt_confirmations TO authenticated;

DROP POLICY IF EXISTS k4_receipt_confirmations_select_manager_admin ON public.purchase_receipt_confirmations;
CREATE POLICY k4_receipt_confirmations_select_manager_admin ON public.purchase_receipt_confirmations
  FOR SELECT TO authenticated
  USING (public.is_purchase_manager_or_admin());

DROP TRIGGER IF EXISTS purchase_receipt_confirmations_append_only ON public.purchase_receipt_confirmations;
CREATE TRIGGER purchase_receipt_confirmations_append_only
  BEFORE UPDATE OR DELETE ON public.purchase_receipt_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_k2_append_only_mutation();

-- Normalizadores sin valores por defecto: una unidad desconocida retorna NULL
-- y obliga a volver a revisión. Las funciones trabajan solo con las unidades
-- canónicas que ya admite el modelo de ingrediente.
CREATE OR REPLACE FUNCTION private.k4_normalize_unit(p_unit text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT CASE lower(trim(p_unit))
    WHEN 'kg' THEN 'kg'
    WHEN 'kilo' THEN 'kg'
    WHEN 'kilos' THEN 'kg'
    WHEN 'g' THEN 'g'
    WHEN 'gr' THEN 'g'
    WHEN 'gramo' THEN 'g'
    WHEN 'gramos' THEN 'g'
    WHEN 'l' THEN 'l'
    WHEN 'lt' THEN 'l'
    WHEN 'litro' THEN 'l'
    WHEN 'litros' THEN 'l'
    WHEN 'ml' THEN 'ml'
    WHEN 'mililitro' THEN 'ml'
    WHEN 'mililitros' THEN 'ml'
    WHEN 'cl' THEN 'cl'
    WHEN 'ud' THEN 'ud'
    WHEN 'uds' THEN 'ud'
    WHEN 'u' THEN 'ud'
    WHEN 'unidad' THEN 'ud'
    WHEN 'unidades' THEN 'ud'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION private.k4_unit_dimension(p_unit text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT CASE p_unit
    WHEN 'kg' THEN 'mass'
    WHEN 'g' THEN 'mass'
    WHEN 'l' THEN 'volume'
    WHEN 'ml' THEN 'volume'
    WHEN 'cl' THEN 'volume'
    WHEN 'ud' THEN 'count'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION private.k4_convert_quantity(
  p_quantity numeric,
  p_from_unit text,
  p_to_unit text
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  v_from text := private.k4_normalize_unit(p_from_unit);
  v_to text := private.k4_normalize_unit(p_to_unit);
  v_dimension text;
BEGIN
  IF p_quantity <= 0 OR v_from IS NULL OR v_to IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_from = v_to THEN
    RETURN p_quantity;
  END IF;
  v_dimension := private.k4_unit_dimension(v_from);
  IF v_dimension IS NULL OR v_dimension <> private.k4_unit_dimension(v_to) THEN
    RETURN NULL;
  END IF;
  IF v_dimension = 'mass' THEN
    RETURN CASE
      WHEN v_from = 'g' AND v_to = 'kg' THEN p_quantity / 1000
      WHEN v_from = 'kg' AND v_to = 'g' THEN p_quantity * 1000
      ELSE NULL
    END;
  END IF;
  IF v_dimension = 'volume' THEN
    RETURN CASE
      WHEN v_from = 'ml' AND v_to = 'l' THEN p_quantity / 1000
      WHEN v_from = 'ml' AND v_to = 'cl' THEN p_quantity / 10
      WHEN v_from = 'l' AND v_to = 'ml' THEN p_quantity * 1000
      WHEN v_from = 'l' AND v_to = 'cl' THEN p_quantity * 100
      WHEN v_from = 'cl' AND v_to = 'ml' THEN p_quantity * 10
      WHEN v_from = 'cl' AND v_to = 'l' THEN p_quantity / 100
      ELSE NULL
    END;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.k4_base_unit_for_purchase_unit(p_purchase_unit text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT CASE private.k4_unit_dimension(private.k4_normalize_unit(p_purchase_unit))
    WHEN 'mass' THEN 'g'
    WHEN 'volume' THEN 'ml'
    WHEN 'count' THEN 'ud'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION private.apply_receipt_line(
  p_invoice_line_id uuid,
  p_mapping_version_id uuid,
  p_allocations jsonb,
  p_idempotency_key text,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_key text := trim(COALESCE(p_idempotency_key, ''));
  v_now timestamptz := now();
  v_line public.purchase_invoice_lines%ROWTYPE;
  v_invoice public.purchase_invoices%ROWTYPE;
  v_ingredient public.ingredients%ROWTYPE;
  v_mapping public.purchase_mapping_versions%ROWTYPE;
  v_effective_mapping public.purchase_mapping_versions%ROWTYPE;
  v_existing public.purchase_receipt_confirmations%ROWTYPE;
  v_order_item public.purchase_order_items%ROWTYPE;
  v_allocation jsonb;
  v_confirmation_id uuid := gen_random_uuid();
  v_movement_id uuid := gen_random_uuid();
  v_line_unit text;
  v_billing_unit text;
  v_content_unit text;
  v_purchase_unit text;
  v_base_unit text;
  v_expected_base_unit text;
  v_content_in_purchase_unit numeric;
  v_purchase_quantity numeric;
  v_physical_quantity numeric;
  v_observed_price numeric;
  v_normalized_price numeric;
  v_price_before numeric(18,8);
  v_price_after numeric(18,8);
  v_pack_content_in_purchase_unit numeric;
  v_new_pack_price numeric;
  v_price_changed boolean := false;
  v_mapping_requires_confirmation boolean := false;
  v_allocated_line_quantity numeric := 0;
  v_allocation_order_quantity numeric;
  v_allocation_line_quantity numeric;
  v_already_received_for_order numeric;
  v_effective_allocation_count integer := 0;
BEGIN
  IF v_actor_id IS NULL OR NOT public.is_purchase_manager_or_admin() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'Solo manager o admin puede confirmar una recepción.');
  END IF;

  IF p_invoice_line_id IS NULL OR p_mapping_version_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'Faltan la línea de albarán o la versión de mapeo seleccionada.');
  END IF;
  IF length(v_key) = 0 OR length(v_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La clave de idempotencia es obligatoria y debe tener como máximo 200 caracteres.');
  END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'Las asignaciones a pedidos deben ser una lista, aunque esté vacía.');
  END IF;

  -- Serializa reintentos de la misma intención antes de tomar filas de negocio.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_key, 0));
  SELECT * INTO v_existing
  FROM public.purchase_receipt_confirmations
  WHERE idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.purchase_invoice_line_id = p_invoice_line_id THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'confirmation_id', v_existing.id,
        'stock_movement_id', v_existing.stock_movement_id,
        'physical_quantity', v_existing.physical_quantity,
        'base_unit', v_existing.base_unit,
        'normalized_unit_price', v_existing.normalized_unit_price,
        'price_changed', v_existing.price_changed,
        'price_locked', v_existing.price_locked
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'idempotency_conflict', 'message', 'La clave de idempotencia ya pertenece a otra recepción.');
  END IF;

  SELECT * INTO v_line
  FROM public.purchase_invoice_lines
  WHERE id = p_invoice_line_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La línea de albarán no existe.');
  END IF;

  SELECT * INTO v_existing
  FROM public.purchase_receipt_confirmations
  WHERE purchase_invoice_line_id = v_line.id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'receipt_already_applied', 'message', 'La línea ya tiene una recepción económica confirmada.');
  END IF;

  SELECT * INTO v_invoice
  FROM public.purchase_invoices
  WHERE id = v_line.invoice_id
  FOR UPDATE;
  IF NOT FOUND OR v_invoice.supplier_id IS NULL OR trim(COALESCE(v_invoice.file_path, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'El documento no tiene proveedor o archivo original válido.');
  END IF;
  IF trim(COALESCE(v_line.original_name, '')) = ''
     OR v_line.status IS DISTINCT FROM 'mapped'
     OR v_line.mapped_ingredient_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La línea debe estar revisada, con nombre e ingrediente mapeado.');
  END IF;
  IF v_line.quantity IS NULL OR v_line.quantity <= 0
     OR v_line.unit_price IS NULL OR v_line.unit_price <= 0
     OR trim(COALESCE(v_line.line_unit, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'Faltan cantidad física, unidad de línea o precio unitario positivo.');
  END IF;

  SELECT * INTO v_mapping
  FROM public.purchase_mapping_versions
  WHERE id = p_mapping_version_id
  FOR UPDATE;
  IF NOT FOUND OR v_mapping.status = 'rejected'::public.purchase_mapping_version_status
     OR v_mapping.supplier_id <> v_invoice.supplier_id
     OR v_mapping.ingredient_id IS NULL
     OR v_mapping.ingredient_id <> v_line.mapped_ingredient_id
     OR lower(trim(v_mapping.supplier_item_name)) <> lower(trim(v_line.original_name)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La versión de mapeo no es válida para esta línea, proveedor e ingrediente.');
  END IF;

  -- Una propuesta se confirma por copia append-only solo al final, cuando ya
  -- pasaron todas las validaciones. Mientras tanto puede interpretarse para
  -- la previsualización sin dejar un hecho parcial.
  IF v_mapping.status = 'proposed'::public.purchase_mapping_version_status THEN
    SELECT * INTO v_effective_mapping
    FROM public.purchase_mapping_versions
    WHERE supersedes_id = v_mapping.id
      AND status = 'confirmed'::public.purchase_mapping_version_status;
    IF NOT FOUND THEN
      v_effective_mapping := v_mapping;
      v_mapping_requires_confirmation := true;
    END IF;
  ELSE
    v_effective_mapping := v_mapping;
  END IF;

  SELECT * INTO v_ingredient
  FROM public.ingredients
  WHERE id = v_effective_mapping.ingredient_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'El ingrediente destino ya no existe.');
  END IF;

  v_line_unit := lower(trim(v_line.line_unit));
  v_billing_unit := lower(trim(COALESCE(v_effective_mapping.line_billing_unit, '')));
  v_content_unit := private.k4_normalize_unit(v_effective_mapping.line_content_unit);
  v_purchase_unit := private.k4_normalize_unit(v_ingredient.purchase_unit);
  v_base_unit := private.k4_normalize_unit(v_ingredient.base_unit);
  v_expected_base_unit := private.k4_base_unit_for_purchase_unit(v_purchase_unit);

  IF v_line_unit = '' OR v_billing_unit = '' OR v_line_unit <> v_billing_unit
     OR v_effective_mapping.line_content_qty IS NULL OR v_effective_mapping.line_content_qty <= 0
     OR v_content_unit IS NULL OR v_purchase_unit IS NULL OR v_base_unit IS NULL
     OR v_expected_base_unit IS NULL OR v_base_unit <> v_expected_base_unit THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La presentación no define una conversión física compatible con la unidad base del ingrediente.');
  END IF;

  v_content_in_purchase_unit := private.k4_convert_quantity(
    v_effective_mapping.line_content_qty,
    v_content_unit,
    v_purchase_unit
  );
  IF v_content_in_purchase_unit IS NULL OR v_content_in_purchase_unit <= 0
     OR abs(v_effective_mapping.conversion_factor - v_content_in_purchase_unit) > 0.00000001 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'El factor de conversión no coincide con el contenido físico declarado.');
  END IF;

  v_purchase_quantity := v_line.quantity * v_effective_mapping.conversion_factor;
  v_physical_quantity := private.k4_convert_quantity(v_purchase_quantity, v_purchase_unit, v_base_unit);
  v_observed_price := v_line.unit_price;
  v_normalized_price := v_observed_price / v_effective_mapping.conversion_factor;
  IF v_purchase_quantity <= 0 OR v_physical_quantity IS NULL OR v_physical_quantity <= 0
     OR v_normalized_price <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'No se puede normalizar la cantidad física o el precio de la línea.');
  END IF;

  -- Valida primero la forma y la suma de todas las asignaciones. Una recepción
  -- sin pedido es válida: la lista vacía no genera filas de conciliación.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_allocations) AS a(value)
    WHERE jsonb_typeof(a.value) <> 'object'
       OR COALESCE(a.value->>'purchase_order_item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR jsonb_typeof(a.value->'quantity_in_order_unit') <> 'number'
       OR jsonb_typeof(a.value->'quantity_in_invoice_line_unit') <> 'number'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'Cada asignación debe indicar una línea de pedido y dos cantidades numéricas positivas.');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_allocations) AS a(value)
    GROUP BY a.value->>'purchase_order_item_id'
    HAVING count(*) > 1
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'Una línea de pedido solo puede aparecer una vez por recepción.');
  END IF;

  FOR v_allocation IN
    SELECT a.value
    FROM jsonb_array_elements(p_allocations) AS a(value)
    ORDER BY (a.value->>'purchase_order_item_id')::uuid
  LOOP
    v_allocation_order_quantity := (v_allocation->>'quantity_in_order_unit')::numeric;
    v_allocation_line_quantity := (v_allocation->>'quantity_in_invoice_line_unit')::numeric;
    IF v_allocation_order_quantity <= 0 OR v_allocation_line_quantity <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'Las cantidades asignadas deben ser positivas.');
    END IF;
    SELECT * INTO v_order_item
    FROM public.purchase_order_items
    WHERE id = (v_allocation->>'purchase_order_item_id')::uuid
    FOR UPDATE;
    IF NOT FOUND OR v_order_item.ingredient_id <> v_ingredient.id THEN
      RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'Una asignación no pertenece al ingrediente de esta recepción.');
    END IF;
    SELECT COALESCE(sum(a.quantity_in_order_unit), 0)
    INTO v_already_received_for_order
    FROM public.purchase_order_item_receipt_allocations a
    WHERE a.purchase_order_item_id = v_order_item.id
      AND a.status = 'confirmed'::public.purchase_receipt_allocation_status
      AND NOT EXISTS (
        SELECT 1
        FROM public.purchase_order_item_receipt_allocations successor
        WHERE successor.supersedes_id = a.id
          AND successor.status = 'confirmed'::public.purchase_receipt_allocation_status
      );
    IF v_already_received_for_order + v_allocation_order_quantity > v_order_item.quantity + 0.00000001 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La asignación supera la cantidad pendiente de una línea de pedido.');
    END IF;
    v_allocated_line_quantity := v_allocated_line_quantity + v_allocation_line_quantity;
    v_effective_allocation_count := v_effective_allocation_count + 1;
  END LOOP;
  IF v_allocated_line_quantity > v_line.quantity + 0.00000001 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'Las asignaciones superan la cantidad recibida en la línea.');
  END IF;

  v_price_before := v_ingredient.current_price;
  v_price_after := CASE WHEN v_ingredient.price_locked THEN v_price_before ELSE v_normalized_price END;
  v_price_changed := NOT v_ingredient.price_locked
    AND abs(v_price_before - v_normalized_price) > 0.00000001;

  -- La configuración de pack es una precondición de precio, no un fallo que
  -- pueda aparecer tras crear el movimiento. Se valida antes de toda escritura.
  IF v_price_changed AND v_ingredient.supplier_pricing_mode = 'per_pack' THEN
    IF v_ingredient.pack_units IS NULL OR v_ingredient.pack_units <= 0
       OR v_ingredient.pack_unit_size_qty IS NULL OR v_ingredient.pack_unit_size_qty <= 0
       OR trim(COALESCE(v_ingredient.pack_unit_size_unit, '')) = '' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'La configuración de pack del ingrediente está incompleta.');
    END IF;
    v_pack_content_in_purchase_unit := private.k4_convert_quantity(
      v_ingredient.pack_unit_size_qty,
      v_ingredient.pack_unit_size_unit,
      v_purchase_unit
    );
    IF v_pack_content_in_purchase_unit IS NULL OR v_pack_content_in_purchase_unit <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'needs_review', 'message', 'El contenido de pack no es compatible con la unidad de compra.');
    END IF;
    v_new_pack_price := v_normalized_price * v_ingredient.pack_units * v_pack_content_in_purchase_unit;
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'ok', true,
      'preview', true,
      'line_name', v_line.original_name,
      'ingredient_id', v_ingredient.id,
      'ingredient_name', v_ingredient.name,
      'mapping_version_id', v_effective_mapping.id,
      'mapping_will_be_confirmed', v_mapping_requires_confirmation,
      'line_billing_unit', v_effective_mapping.line_billing_unit,
      'line_content_qty', v_effective_mapping.line_content_qty,
      'line_content_unit', v_effective_mapping.line_content_unit,
      'conversion_factor', v_effective_mapping.conversion_factor,
      'physical_quantity', v_physical_quantity,
      'base_unit', v_base_unit,
      'purchase_quantity', v_purchase_quantity,
      'purchase_unit', v_purchase_unit,
      'observed_unit_price', v_observed_price,
      'normalized_unit_price', v_normalized_price,
      'price_before', v_price_before,
      'price_after', v_price_after,
      'price_locked', v_ingredient.price_locked,
      'price_changed', v_price_changed,
      'allocation_count', v_effective_allocation_count
    );
  END IF;

  IF v_mapping_requires_confirmation THEN
    INSERT INTO public.purchase_mapping_versions (
      legacy_mapping_id, supplier_id, supplier_item_name, ingredient_id,
      conversion_factor, line_billing_unit, line_content_qty, line_content_unit,
      status, supersedes_id, source_document_extraction_id, idempotency_key,
      proposed_by, confirmed_by, confirmed_at, note
    ) VALUES (
      v_mapping.legacy_mapping_id, v_mapping.supplier_id, v_mapping.supplier_item_name, v_mapping.ingredient_id,
      v_mapping.conversion_factor, v_mapping.line_billing_unit, v_mapping.line_content_qty, v_mapping.line_content_unit,
      'confirmed'::public.purchase_mapping_version_status, v_mapping.id, v_mapping.source_document_extraction_id,
      'receipt-map:' || v_key, v_mapping.proposed_by, v_actor_id, v_now,
      'Confirmada por apply_receipt_line'
    )
    RETURNING * INTO v_effective_mapping;
  END IF;

  INSERT INTO public.stock_movements (
    id, movement_type, ingredient_id, quantity, unit, unit_price, total_amount,
    movement_date, reference_doc, original_description, processed_by,
    reference_type, reference_id, idempotency_key, origin, actor_profile_id,
    mapping_version_id, source_document_extraction_id, correlation_id, provenance
  ) VALUES (
    v_movement_id, 'PURCHASE', v_ingredient.id, v_physical_quantity, v_base_unit,
    v_normalized_price, v_normalized_price * v_purchase_quantity,
    v_now, 'RECEIPT:' || v_confirmation_id::text, v_line.original_name,
    'apply_receipt_line', 'purchase_invoice_line'::public.stock_reference_type,
    v_line.id, v_key, 'receipt_confirmation'::public.stock_movement_origin,
    v_actor_id, v_effective_mapping.id, v_effective_mapping.source_document_extraction_id,
    v_confirmation_id,
    jsonb_build_object(
      'schema_version', 'k4',
      'receipt_confirmation_id', v_confirmation_id,
      'purchase_invoice_id', v_invoice.id,
      'purchase_invoice_line_id', v_line.id,
      'supplier_id', v_invoice.supplier_id,
      'mapping_version_id', v_effective_mapping.id,
      'observed_unit_price', v_observed_price,
      'normalized_unit_price', v_normalized_price,
      'purchase_unit', v_purchase_unit,
      'purchase_quantity', v_purchase_quantity,
      'base_unit', v_base_unit,
      'physical_quantity', v_physical_quantity
    )
  );

  INSERT INTO public.purchase_receipt_confirmations (
    id, purchase_invoice_line_id, purchase_invoice_id, supplier_id, ingredient_id,
    mapping_version_id, source_document_extraction_id, stock_movement_id,
    actor_profile_id, idempotency_key, physical_quantity, base_unit,
    purchase_quantity, purchase_unit, observed_unit_price, normalized_unit_price,
    price_before, price_after, price_locked, price_changed, confirmed_at, provenance
  ) VALUES (
    v_confirmation_id, v_line.id, v_invoice.id, v_invoice.supplier_id, v_ingredient.id,
    v_effective_mapping.id, v_effective_mapping.source_document_extraction_id, v_movement_id,
    v_actor_id, v_key, v_physical_quantity, v_base_unit,
    v_purchase_quantity, v_purchase_unit, v_observed_price, v_normalized_price,
    v_price_before, v_price_after, v_ingredient.price_locked, v_price_changed, v_now,
    jsonb_build_object(
      'schema_version', 'k4',
      'line_status_at_confirmation', v_line.status,
      'allocation_count', v_effective_allocation_count,
      'source_document_path', v_invoice.file_path
    )
  );

  FOR v_allocation IN
    SELECT a.value
    FROM jsonb_array_elements(p_allocations) AS a(value)
    ORDER BY (a.value->>'purchase_order_item_id')::uuid
  LOOP
    INSERT INTO public.purchase_order_item_receipt_allocations (
      purchase_order_item_id, purchase_invoice_line_id,
      quantity_in_order_unit, quantity_in_invoice_line_unit,
      mapping_version_id, status, idempotency_key,
      proposed_by, confirmed_by, confirmed_at, note
    ) VALUES (
      (v_allocation->>'purchase_order_item_id')::uuid, v_line.id,
      (v_allocation->>'quantity_in_order_unit')::numeric,
      (v_allocation->>'quantity_in_invoice_line_unit')::numeric,
      v_effective_mapping.id, 'confirmed'::public.purchase_receipt_allocation_status,
      'receipt-allocation:' || v_confirmation_id::text || ':' || (v_allocation->>'purchase_order_item_id'),
      v_actor_id, v_actor_id, v_now, 'Confirmada por apply_receipt_line'
    );
  END LOOP;

  IF v_price_changed THEN
    PERFORM set_config('app.receipt_confirmation_price_write', 'on', true);
    IF v_ingredient.supplier_pricing_mode = 'per_pack' THEN
      UPDATE public.ingredients
      SET pack_price = v_new_pack_price,
          updated_at = v_now
      WHERE id = v_ingredient.id
      RETURNING current_price INTO v_price_after;
    ELSE
      UPDATE public.ingredients
      SET current_price = v_normalized_price,
          updated_at = v_now
      WHERE id = v_ingredient.id
      RETURNING current_price INTO v_price_after;
    END IF;

    IF abs(v_price_after - v_normalized_price) > 0.00000001 THEN
      RAISE EXCEPTION 'K4_NEEDS_REVIEW: El modelo de precio no produjo el precio normalizado esperado.';
    END IF;

    INSERT INTO public.ingredient_price_history (
      ingredient_id, old_price, new_price, changed_by, changed_at, source,
      purchase_invoice_id, purchase_invoice_line_id, mapping_version_id,
      receipt_confirmation_id, stock_movement_id, idempotency_key, provenance
    ) VALUES (
      v_ingredient.id, v_price_before, v_price_after, v_actor_id, v_now,
      'receipt_confirmation', v_invoice.id, v_line.id, v_effective_mapping.id,
      v_confirmation_id, v_movement_id, 'receipt-price:' || v_key,
      jsonb_build_object(
        'schema_version', 'k4',
        'observed_unit_price', v_observed_price,
        'normalized_unit_price', v_normalized_price,
        'purchase_unit', v_purchase_unit,
        'price_model', v_ingredient.supplier_pricing_mode
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'confirmation_id', v_confirmation_id,
    'stock_movement_id', v_movement_id,
    'mapping_version_id', v_effective_mapping.id,
    'physical_quantity', v_physical_quantity,
    'base_unit', v_base_unit,
    'purchase_quantity', v_purchase_quantity,
    'purchase_unit', v_purchase_unit,
    'observed_unit_price', v_observed_price,
    'normalized_unit_price', v_normalized_price,
    'price_before', v_price_before,
    'price_after', v_price_after,
    'price_locked', v_ingredient.price_locked,
    'price_changed', v_price_changed,
    'allocation_count', v_effective_allocation_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_receipt_line(
  p_invoice_line_id uuid,
  p_mapping_version_id uuid,
  p_allocations jsonb DEFAULT '[]'::jsonb,
  p_idempotency_key text DEFAULT NULL,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.apply_receipt_line(
    p_invoice_line_id,
    p_mapping_version_id,
    p_allocations,
    p_idempotency_key,
    p_dry_run
  );
$$;

REVOKE ALL ON FUNCTION private.apply_receipt_line(uuid, uuid, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.apply_receipt_line(uuid, uuid, jsonb, text, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_receipt_line(uuid, uuid, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_receipt_line(uuid, uuid, jsonb, text, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_receipt_line(uuid, uuid, jsonb, text, boolean) IS
  'K4: único comando público de confirmación económica de una línea revisada. Es atómico, idempotente y solo permite manager/admin.';
