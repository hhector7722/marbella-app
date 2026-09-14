-- K2 · Modelo aditivo y reversible.
--
-- No se reescribe ningún movimiento, precio, mapeo ni saldo histórico. Los
-- campos nuevos clasifican los hechos futuros; los existentes quedan marcados
-- como legacy por defaults de metadatos. `stock_movements` sigue siendo la
-- única fuente de movimientos: no se crea un ledger v2.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_reference_type' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.stock_reference_type AS ENUM (
      'legacy',
      'purchase_invoice_line',
      'purchase_confirmation',
      'sale_ticket',
      'staff_consumption',
      'waste_entry',
      'inventory_count',
      'manual_adjustment',
      'stock_reversal'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_movement_origin' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.stock_movement_origin AS ENUM (
      'legacy',
      'receipt_confirmation',
      'sale_webhook',
      'staff_consumption',
      'inventory_count',
      'manager_adjustment',
      'reversal',
      'migration'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_mapping_version_status' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.purchase_mapping_version_status AS ENUM ('proposed', 'confirmed', 'rejected');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_receipt_allocation_status' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.purchase_receipt_allocation_status AS ENUM ('proposed', 'confirmed', 'rejected');
  END IF;
END $$;

-- Metadatos de procedencia, referencia tipada e idempotencia estructural del
-- ledger existente. Son nullable cuando no existen en un hecho histórico.
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS reference_type public.stock_reference_type NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS reference_id uuid,
  ADD COLUMN IF NOT EXISTS reference_external_id text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS origin public.stock_movement_origin NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mapping_version_id uuid,
  ADD COLUMN IF NOT EXISTS source_document_extraction_id uuid REFERENCES public.document_extractions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversal_of_movement_id uuid REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS correlation_id uuid,
  ADD COLUMN IF NOT EXISTS provenance jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_typed_reference_check CHECK (
    (reference_type = 'legacy' AND reference_id IS NULL AND reference_external_id IS NULL)
    OR (reference_type IN ('purchase_invoice_line', 'purchase_confirmation', 'stock_reversal') AND reference_id IS NOT NULL)
    OR (reference_type IN ('sale_ticket', 'staff_consumption', 'waste_entry', 'inventory_count', 'manual_adjustment') AND reference_external_id IS NOT NULL)
  ) NOT VALID,
  ADD CONSTRAINT stock_movements_reversal_not_self_check CHECK (
    reversal_of_movement_id IS NULL OR reversal_of_movement_id <> id
  ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_idempotency_key_unique
  ON public.stock_movements (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movements_reference_typed_idx
  ON public.stock_movements (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movements_reference_external_idx
  ON public.stock_movements (reference_type, reference_external_id)
  WHERE reference_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movements_reversal_of_idx
  ON public.stock_movements (reversal_of_movement_id)
  WHERE reversal_of_movement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movements_mapping_version_idx
  ON public.stock_movements (mapping_version_id)
  WHERE mapping_version_id IS NOT NULL;

COMMENT ON COLUMN public.stock_movements.reference_type IS
  'Tipo de referencia del hecho. legacy conserva movimientos anteriores a K2; los nuevos deben ser tipados.';
COMMENT ON COLUMN public.stock_movements.idempotency_key IS
  'Clave única estructural para impedir duplicar un hecho de stock al reintentar un proceso.';
COMMENT ON COLUMN public.stock_movements.reversal_of_movement_id IS
  'Movimiento canónico que este hecho reversor compensa; no se borra ni reescribe el original.';
COMMENT ON COLUMN public.stock_movements.provenance IS
  'Procedencia inmutable del movimiento: entrada, versión de extractor, decisión y correlación.';

-- Versiones append-only del mapeo proveedor ↔ ingrediente. No se migra el
-- diccionario mutable legado: K4 decidirá qué versión se confirma para cada
-- recepción, conservando el original como evidencia histórica.
CREATE TABLE IF NOT EXISTS public.purchase_mapping_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_mapping_id uuid REFERENCES public.supplier_item_mappings(id) ON DELETE RESTRICT,
  supplier_id bigint NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_item_name text NOT NULL,
  ingredient_id uuid REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  conversion_factor numeric NOT NULL CHECK (conversion_factor > 0),
  line_billing_unit text,
  line_content_qty numeric CHECK (line_content_qty IS NULL OR line_content_qty > 0),
  line_content_unit text,
  status public.purchase_mapping_version_status NOT NULL DEFAULT 'proposed',
  supersedes_id uuid UNIQUE REFERENCES public.purchase_mapping_versions(id) ON DELETE RESTRICT,
  source_document_extraction_id uuid REFERENCES public.document_extractions(id) ON DELETE RESTRICT,
  idempotency_key text,
  proposed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_mapping_versions_content_pair_check CHECK (
    (line_content_qty IS NULL AND line_content_unit IS NULL)
    OR (line_content_qty IS NOT NULL AND line_content_unit IS NOT NULL)
  ),
  CONSTRAINT purchase_mapping_versions_not_self_supersede CHECK (supersedes_id IS NULL OR supersedes_id <> id),
  CONSTRAINT purchase_mapping_versions_confirmation_check CHECK (
    (status = 'confirmed' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
    OR (status <> 'confirmed' AND confirmed_by IS NULL AND confirmed_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_mapping_versions_idempotency_key_unique
  ON public.purchase_mapping_versions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchase_mapping_versions_lookup_idx
  ON public.purchase_mapping_versions (supplier_id, lower(supplier_item_name), created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_mapping_versions_ingredient_idx
  ON public.purchase_mapping_versions (ingredient_id)
  WHERE ingredient_id IS NOT NULL;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_mapping_version_fkey
  FOREIGN KEY (mapping_version_id)
  REFERENCES public.purchase_mapping_versions(id)
  ON DELETE RESTRICT
  NOT VALID;

-- Un albarán puede repartir una línea entre varios pedidos y una línea de
-- pedido puede acumular recepciones parciales. Se almacenan ambas cantidades
-- explícitamente para no inventar conversiones ni perder la unidad de origen.
CREATE TABLE IF NOT EXISTS public.purchase_order_item_receipt_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_item_id uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
  purchase_invoice_line_id uuid NOT NULL REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
  quantity_in_order_unit numeric NOT NULL CHECK (quantity_in_order_unit > 0),
  quantity_in_invoice_line_unit numeric NOT NULL CHECK (quantity_in_invoice_line_unit > 0),
  mapping_version_id uuid REFERENCES public.purchase_mapping_versions(id) ON DELETE RESTRICT,
  status public.purchase_receipt_allocation_status NOT NULL DEFAULT 'proposed',
  supersedes_id uuid UNIQUE REFERENCES public.purchase_order_item_receipt_allocations(id) ON DELETE RESTRICT,
  idempotency_key text,
  proposed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_order_item_receipt_allocations_not_self_supersede CHECK (supersedes_id IS NULL OR supersedes_id <> id),
  CONSTRAINT purchase_order_item_receipt_allocations_confirmation_check CHECK (
    (status = 'confirmed' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)
    OR (status <> 'confirmed' AND confirmed_by IS NULL AND confirmed_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_order_item_receipt_allocations_idempotency_key_unique
  ON public.purchase_order_item_receipt_allocations (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS purchase_order_item_receipt_allocations_order_idx
  ON public.purchase_order_item_receipt_allocations (purchase_order_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_order_item_receipt_allocations_invoice_line_idx
  ON public.purchase_order_item_receipt_allocations (purchase_invoice_line_id, created_at DESC);

-- Bloqueo append-only de los hechos nuevos y del único ledger canónico.
CREATE OR REPLACE FUNCTION public.prevent_k2_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Los hechos de % son append-only; use una versión superseding o un movimiento reversor.', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS stock_movements_append_only ON public.stock_movements;
CREATE TRIGGER stock_movements_append_only
  BEFORE UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.prevent_k2_append_only_mutation();

DROP TRIGGER IF EXISTS purchase_mapping_versions_append_only ON public.purchase_mapping_versions;
CREATE TRIGGER purchase_mapping_versions_append_only
  BEFORE UPDATE OR DELETE ON public.purchase_mapping_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_k2_append_only_mutation();

DROP TRIGGER IF EXISTS purchase_order_item_receipt_allocations_append_only ON public.purchase_order_item_receipt_allocations;
CREATE TRIGGER purchase_order_item_receipt_allocations_append_only
  BEFORE UPDATE OR DELETE ON public.purchase_order_item_receipt_allocations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_k2_append_only_mutation();

-- Proyección regenerable, desglosada por unidad del propio ledger. No mezcla
-- unidades ni reemplaza aún ingredients.stock_current; K4 hará el corte de
-- lectura tras el inventario físico certificado.
CREATE OR REPLACE VIEW public.stock_current
WITH (security_invoker = true)
AS
SELECT
  sm.ingredient_id,
  sm.unit,
  SUM(
    CASE sm.movement_type
      WHEN 'PURCHASE' THEN abs(sm.quantity)
      WHEN 'SALE' THEN -abs(sm.quantity)
      WHEN 'WASTE' THEN -abs(sm.quantity)
      WHEN 'ADJUSTMENT' THEN sm.quantity
      WHEN 'INVENTORY_COUNT' THEN sm.quantity
      ELSE 0
    END
  ) AS quantity,
  COUNT(*) AS movement_count,
  MAX(sm.movement_date) AS last_movement_at
FROM public.stock_movements sm
GROUP BY sm.ingredient_id, sm.unit;

COMMENT ON VIEW public.stock_current IS
  'Proyección regenerable del ledger canónico por ingrediente y unidad. No combina unidades ni sustituye el saldo legado antes del corte físico.';

-- RLS y grants explícitos para las piezas aditivas. Los procesos de servidor
-- usan service_role; las personas solo pueden leer/escribir propuestas dentro
-- de su ámbito y nunca mutar/borrar un hecho ya creado.
ALTER TABLE public.purchase_mapping_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_item_receipt_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS k2_mapping_versions_select_manager_admin ON public.purchase_mapping_versions;
CREATE POLICY k2_mapping_versions_select_manager_admin ON public.purchase_mapping_versions
  FOR SELECT TO authenticated
  USING (public.is_purchase_manager_or_admin());
DROP POLICY IF EXISTS k2_mapping_versions_insert_manager_admin ON public.purchase_mapping_versions;
CREATE POLICY k2_mapping_versions_insert_manager_admin ON public.purchase_mapping_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_purchase_manager_or_admin());

DROP POLICY IF EXISTS k2_receipt_allocations_select_actor ON public.purchase_order_item_receipt_allocations;
CREATE POLICY k2_receipt_allocations_select_actor ON public.purchase_order_item_receipt_allocations
  FOR SELECT TO authenticated
  USING (
    public.is_purchase_manager_or_admin()
    OR EXISTS (
      SELECT 1
      FROM public.purchase_order_items poi
      JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
      WHERE poi.id = purchase_order_item_receipt_allocations.purchase_order_item_id
        AND po.created_by = auth.uid()
    )
  );
DROP POLICY IF EXISTS k2_receipt_allocations_insert_manager_admin ON public.purchase_order_item_receipt_allocations;
CREATE POLICY k2_receipt_allocations_insert_manager_admin ON public.purchase_order_item_receipt_allocations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_purchase_manager_or_admin());

REVOKE ALL ON TABLE public.purchase_mapping_versions, public.purchase_order_item_receipt_allocations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.purchase_mapping_versions, public.purchase_order_item_receipt_allocations TO service_role;
GRANT SELECT, INSERT ON TABLE public.purchase_mapping_versions, public.purchase_order_item_receipt_allocations TO authenticated;

REVOKE ALL ON TABLE public.stock_current FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.stock_current TO authenticated, service_role;
