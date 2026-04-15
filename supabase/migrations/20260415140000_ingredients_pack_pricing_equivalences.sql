-- Permite precios por pack/caja y conversión automática a €/purchase_unit.
-- Mantiene compatibilidad con la lógica existente de recetas (current_price por purchase_unit).

ALTER TABLE public.ingredients
  ADD COLUMN IF NOT EXISTS supplier_pricing_mode text NOT NULL DEFAULT 'per_purchase_unit',
  ADD COLUMN IF NOT EXISTS pack_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS pack_units numeric,
  ADD COLUMN IF NOT EXISTS pack_unit_size_qty numeric,
  ADD COLUMN IF NOT EXISTS pack_unit_size_unit text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ingredients_supplier_pricing_mode_check'
  ) THEN
    ALTER TABLE public.ingredients
      ADD CONSTRAINT ingredients_supplier_pricing_mode_check
      CHECK (supplier_pricing_mode IN ('per_purchase_unit', 'per_pack'));
  END IF;
END $$;

-- Normaliza unidades de texto a un set pequeño compatible con la app.
CREATE OR REPLACE FUNCTION public.normalize_pricing_unit(p_unit text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(coalesce(p_unit, 'ud')))
    WHEN 'u' THEN 'ud'
    WHEN 'un' THEN 'ud'
    WHEN 'unidad' THEN 'ud'
    WHEN 'unidades' THEN 'ud'
    WHEN 'lt' THEN 'l'
    WHEN 'litro' THEN 'l'
    WHEN 'litros' THEN 'l'
    WHEN 'mililitro' THEN 'ml'
    WHEN 'mililitros' THEN 'ml'
    WHEN 'gr' THEN 'g'
    WHEN 'gramo' THEN 'g'
    WHEN 'gramos' THEN 'g'
    WHEN 'kilo' THEN 'kg'
    WHEN 'kilos' THEN 'kg'
    ELSE lower(trim(coalesce(p_unit, 'ud')))
  END;
$$;

-- Convierte una cantidad entre unidades compatibles (g<->kg, ml<->l, ud<->ud).
-- Devuelve NULL si las dimensiones no son compatibles.
CREATE OR REPLACE FUNCTION public.convert_pricing_qty(
  p_qty numeric,
  p_from_unit text,
  p_to_unit text
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  fu text := public.normalize_pricing_unit(p_from_unit);
  tu text := public.normalize_pricing_unit(p_to_unit);
BEGIN
  IF p_qty IS NULL THEN
    RETURN NULL;
  END IF;

  IF fu = tu THEN
    RETURN p_qty;
  END IF;

  -- masa
  IF fu IN ('g','kg') AND tu IN ('g','kg') THEN
    IF fu = 'g' AND tu = 'kg' THEN
      RETURN p_qty / 1000.0;
    ELSIF fu = 'kg' AND tu = 'g' THEN
      RETURN p_qty * 1000.0;
    END IF;
  END IF;

  -- volumen
  IF fu IN ('ml','l') AND tu IN ('ml','l') THEN
    IF fu = 'ml' AND tu = 'l' THEN
      RETURN p_qty / 1000.0;
    ELSIF fu = 'l' AND tu = 'ml' THEN
      RETURN p_qty * 1000.0;
    END IF;
  END IF;

  -- conteo
  IF fu = 'ud' AND tu = 'ud' THEN
    RETURN p_qty;
  END IF;

  RETURN NULL;
END;
$$;

-- Calcula el current_price (€/purchase_unit) desde los campos pack.
CREATE OR REPLACE FUNCTION public.compute_ingredient_current_price_from_pack(
  p_pack_price numeric,
  p_pack_units numeric,
  p_pack_unit_size_qty numeric,
  p_pack_unit_size_unit text,
  p_purchase_unit text
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  pu text := public.normalize_pricing_unit(p_purchase_unit);
  size_unit text := public.normalize_pricing_unit(coalesce(p_pack_unit_size_unit, 'ud'));
  size_qty numeric := COALESCE(p_pack_unit_size_qty, 1);
  units_in_pack numeric := COALESCE(p_pack_units, 0);
  converted_size numeric;
  denom numeric;
BEGIN
  IF p_pack_price IS NULL OR p_pack_price < 0 THEN
    RAISE EXCEPTION 'pack_price inválido (debe ser >= 0)';
  END IF;

  IF units_in_pack IS NULL OR units_in_pack <= 0 THEN
    RAISE EXCEPTION 'pack_units inválido (debe ser > 0)';
  END IF;

  IF size_qty IS NULL OR size_qty <= 0 THEN
    RAISE EXCEPTION 'pack_unit_size_qty inválido (debe ser > 0)';
  END IF;

  converted_size := public.convert_pricing_qty(size_qty, size_unit, pu);
  IF converted_size IS NULL OR converted_size <= 0 THEN
    RAISE EXCEPTION 'Conversión no soportada: % -> %', size_unit, pu;
  END IF;

  denom := units_in_pack * converted_size;
  IF denom <= 0 THEN
    RAISE EXCEPTION 'Denominador inválido al calcular current_price';
  END IF;

  RETURN (p_pack_price / denom);
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_ingredients_pack_pricing_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  mode text := coalesce(NEW.supplier_pricing_mode, 'per_purchase_unit');
  pu text := public.normalize_pricing_unit(NEW.purchase_unit);
BEGIN
  NEW.supplier_pricing_mode := mode;
  NEW.purchase_unit := pu;
  NEW.unit_type := pu;

  IF mode = 'per_pack' THEN
    -- Valida y deriva current_price a €/purchase_unit.
    NEW.current_price := public.compute_ingredient_current_price_from_pack(
      NEW.pack_price,
      NEW.pack_units,
      NEW.pack_unit_size_qty,
      NEW.pack_unit_size_unit,
      NEW.purchase_unit
    );
  ELSE
    -- En modo normal, permitimos current_price manual (o el que venga por albarán).
    NEW.pack_price := NULL;
    NEW.pack_units := NULL;
    NEW.pack_unit_size_qty := NULL;
    NEW.pack_unit_size_unit := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ingredients_pack_pricing_sync ON public.ingredients;
CREATE TRIGGER trigger_ingredients_pack_pricing_sync
BEFORE INSERT OR UPDATE OF supplier_pricing_mode, pack_price, pack_units, pack_unit_size_qty, pack_unit_size_unit, purchase_unit
ON public.ingredients
FOR EACH ROW
EXECUTE FUNCTION public.trg_ingredients_pack_pricing_sync();

GRANT EXECUTE ON FUNCTION public.normalize_pricing_unit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_pricing_qty(numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_ingredient_current_price_from_pack(numeric, numeric, numeric, text, text) TO authenticated;
