-- Metros como unidad física independiente de kg/l/ud.
-- Sin migrar saldos ni precios históricos: el papel de aluminio existente
-- contiene movimientos en g y no puede recodificarse como metros.
CREATE OR REPLACE FUNCTION private.k4_normalize_unit(p_unit text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = ''
AS $fn$
 SELECT CASE lower(trim(p_unit))
   WHEN 'kg' THEN 'kg' WHEN 'kilo' THEN 'kg' WHEN 'kilos' THEN 'kg'
   WHEN 'g' THEN 'g' WHEN 'gr' THEN 'g' WHEN 'gramo' THEN 'g' WHEN 'gramos' THEN 'g'
   WHEN 'l' THEN 'l' WHEN 'lt' THEN 'l' WHEN 'litro' THEN 'l' WHEN 'litros' THEN 'l'
   WHEN 'ml' THEN 'ml' WHEN 'mililitro' THEN 'ml' WHEN 'mililitros' THEN 'ml'
   WHEN 'cl' THEN 'cl'
   WHEN 'ud' THEN 'ud' WHEN 'uds' THEN 'ud' WHEN 'u' THEN 'ud'
   WHEN 'unidad' THEN 'ud' WHEN 'unidades' THEN 'ud'
   WHEN 'm' THEN 'm' WHEN 'mts' THEN 'm' WHEN 'mts.' THEN 'm'
   WHEN 'mt' THEN 'm' WHEN 'metro' THEN 'm' WHEN 'metros' THEN 'm'
   ELSE NULL
 END;
$fn$;

CREATE OR REPLACE FUNCTION private.k4_unit_dimension(p_unit text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = ''
AS $fn$
 SELECT CASE p_unit
   WHEN 'kg' THEN 'mass' WHEN 'g' THEN 'mass'
   WHEN 'l' THEN 'volume' WHEN 'ml' THEN 'volume' WHEN 'cl' THEN 'volume'
   WHEN 'ud' THEN 'count'
   WHEN 'm' THEN 'length'
   ELSE NULL
 END;
$fn$;

CREATE OR REPLACE FUNCTION private.k4_base_unit_for_purchase_unit(p_purchase_unit text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = ''
AS $fn$
 SELECT CASE private.k4_unit_dimension(private.k4_normalize_unit(p_purchase_unit))
   WHEN 'mass' THEN 'g'
   WHEN 'volume' THEN 'ml'
   WHEN 'count' THEN 'ud'
   WHEN 'length' THEN 'm'
   ELSE NULL
 END;
$fn$;

CREATE OR REPLACE FUNCTION public.normalize_pricing_unit(p_unit text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = 'public', 'extensions'
AS $fn$
 SELECT CASE lower(trim(coalesce(p_unit,'ud')))
   WHEN 'u' THEN 'ud' WHEN 'un' THEN 'ud'
   WHEN 'unidad' THEN 'ud' WHEN 'unidades' THEN 'ud'
   WHEN 'lt' THEN 'l' WHEN 'litro' THEN 'l' WHEN 'litros' THEN 'l'
   WHEN 'mililitro' THEN 'ml' WHEN 'mililitros' THEN 'ml'
   WHEN 'gr' THEN 'g' WHEN 'gramo' THEN 'g' WHEN 'gramos' THEN 'g'
   WHEN 'kilo' THEN 'kg' WHEN 'kilos' THEN 'kg'
   WHEN 'mt' THEN 'm' WHEN 'mts' THEN 'm' WHEN 'mts.' THEN 'm'
   WHEN 'metro' THEN 'm' WHEN 'metros' THEN 'm'
   ELSE lower(trim(coalesce(p_unit,'ud')))
 END;
$fn$;

ALTER TABLE public.ingredients DROP CONSTRAINT IF EXISTS ingredients_base_unit_check;
ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_base_unit_check CHECK (base_unit IN ('ml','g','ud','m'));
ALTER TABLE public.ingredients DROP CONSTRAINT IF EXISTS ingredients_recipe_unit_check;
ALTER TABLE public.ingredients
  ADD CONSTRAINT ingredients_recipe_unit_check CHECK (recipe_unit IN ('g','kg','ml','cl','l','ud','m'));

ALTER TABLE public.purchase_receipt_confirmations
  DROP CONSTRAINT IF EXISTS purchase_receipt_confirmations_base_unit_check;
ALTER TABLE public.purchase_receipt_confirmations
  ADD CONSTRAINT purchase_receipt_confirmations_base_unit_check
    CHECK (base_unit IN ('g','ml','ud','m'));
ALTER TABLE public.purchase_receipt_confirmations
  DROP CONSTRAINT IF EXISTS purchase_receipt_confirmations_purchase_unit_check;
ALTER TABLE public.purchase_receipt_confirmations
  ADD CONSTRAINT purchase_receipt_confirmations_purchase_unit_check
    CHECK (purchase_unit IN ('kg','g','l','ml','cl','ud','m'));

COMMENT ON FUNCTION private.k4_base_unit_for_purchase_unit(text)
 IS 'Unidades base K4: masa g, volumen ml, recuento ud, longitud m; dimensiones incompatibles nunca convierten.';
