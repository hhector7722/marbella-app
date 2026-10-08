-- K4 exige g para compras en kg, ml para litros y ud para unidades.
-- El alta simple dejaba el DEFAULT ud incluso al escoger kg: cuatro ingredientes
-- afectados no tienen stock ni movimientos, por lo que pueden corregirse sin
-- convertir saldos históricos.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.ingredients i
    WHERE private.k4_base_unit_for_purchase_unit(i.purchase_unit)
            IS DISTINCT FROM lower(btrim(i.base_unit))
      AND (
        i.stock_current <> 0
        OR EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.ingredient_id = i.id)
      )
  ) THEN
    RAISE EXCEPTION 'Hay ingredientes con stock histórico cuya unidad base requiere revisión manual';
  END IF;
END;
$$;

UPDATE public.ingredients i
SET base_unit = private.k4_base_unit_for_purchase_unit(i.purchase_unit),
    unit = private.k4_base_unit_for_purchase_unit(i.purchase_unit)
WHERE private.k4_base_unit_for_purchase_unit(i.purchase_unit) IS NOT NULL
  AND (private.k4_base_unit_for_purchase_unit(i.purchase_unit)
       IS DISTINCT FROM lower(btrim(i.base_unit))
       OR private.k4_base_unit_for_purchase_unit(i.purchase_unit)
       IS DISTINCT FROM lower(btrim(i.unit)))
  AND i.stock_current = 0
  AND NOT EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.ingredient_id = i.id);

-- Protege también las altas hechas por otras rutas que omitan base_unit/unit.
CREATE OR REPLACE FUNCTION private.k4_ingredient_insert_canonical_base_unit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_base text := private.k4_base_unit_for_purchase_unit(NEW.purchase_unit);
BEGIN
  IF v_base IS NULL THEN
    RAISE EXCEPTION 'Unidad de compra no admitida para el ingrediente';
  END IF;
  NEW.base_unit := v_base;
  NEW.unit := v_base;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ingredient_insert_canonical_base_unit ON public.ingredients;
CREATE TRIGGER ingredient_insert_canonical_base_unit
BEFORE INSERT ON public.ingredients
FOR EACH ROW EXECUTE FUNCTION private.k4_ingredient_insert_canonical_base_unit();

ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_purchase_base_unit_canonical
  CHECK (
    private.k4_base_unit_for_purchase_unit(purchase_unit) IS NOT NULL
    AND lower(btrim(base_unit)) = private.k4_base_unit_for_purchase_unit(purchase_unit)
    AND lower(btrim(unit)) = private.k4_base_unit_for_purchase_unit(purchase_unit)
  );
