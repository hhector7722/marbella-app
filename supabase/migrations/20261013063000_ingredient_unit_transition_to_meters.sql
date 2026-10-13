-- Cambio auditable de dimensión de un ingrediente existente (g/ml/ud -> m).
-- Conserva los movimientos y el ID; el saldo anterior se cierra con un
-- ajuste en su propia unidad y el recuento nuevo abre stock en metros.
-- No hay conversión inventada entre gramos y metros.
CREATE TABLE IF NOT EXISTS public.ingredient_unit_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id),
  actor_profile_id uuid NOT NULL,
  old_purchase_unit text NOT NULL,
  old_base_unit text NOT NULL,
  new_purchase_unit text NOT NULL,
  new_base_unit text NOT NULL,
  old_stock_quantity numeric NOT NULL,
  opening_stock_quantity numeric NOT NULL,
  old_price numeric NOT NULL,
  new_price numeric NOT NULL,
  close_movement_id uuid REFERENCES public.stock_movements(id),
  opening_movement_id uuid REFERENCES public.stock_movements(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ingredient_unit_transitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ingredient_unit_transitions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ingredient_unit_transitions TO authenticated;
DROP POLICY IF EXISTS ingredient_unit_transitions_manager_select ON public.ingredient_unit_transitions;
CREATE POLICY ingredient_unit_transitions_manager_select
  ON public.ingredient_unit_transitions FOR SELECT TO authenticated
  USING (public.is_purchase_manager_or_admin());

CREATE OR REPLACE FUNCTION public.transition_ingredient_to_meters(
  p_ingredient_id uuid,
  p_expected_base_unit text,
  p_new_price numeric,
  p_opening_meters numeric,
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_i public.ingredients%ROWTYPE;
  v_prior public.ingredient_unit_transitions%ROWTYPE;
  v_old_balance numeric;
  v_close_id uuid;
  v_open_id uuid;
  v_transition_id uuid := gen_random_uuid();
  v_prefix text := 'unit-transition:' || v_transition_id::text;
  v_cache numeric;
BEGIN
  IF v_actor IS NULL OR NOT public.is_purchase_manager_or_admin() THEN
    RAISE EXCEPTION 'Solo gerencia puede cambiar la unidad física';
  END IF;
  IF p_request_id IS NULL OR p_ingredient_id IS NULL
    OR p_expected_base_unit IS NULL THEN
    RAISE EXCEPTION 'Identificación de operación incompleta';
  END IF;
  IF p_new_price IS NULL OR p_new_price <= 0 OR p_new_price > 1000000
    OR p_opening_meters IS NULL OR p_opening_meters < 0 OR p_opening_meters > 10000000 THEN
    RAISE EXCEPTION 'Introduce precio por metro positivo y existencias en metros no negativas';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ingredient-unit-transition:' || p_ingredient_id::text, 0));

  SELECT * INTO v_prior FROM public.ingredient_unit_transitions
  WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.ingredient_id <> p_ingredient_id OR v_prior.new_price <> p_new_price
      OR v_prior.opening_stock_quantity <> p_opening_meters THEN
      RAISE EXCEPTION 'La clave de operación ya se utilizó con datos distintos';
    END IF;
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'transition_id', v_prior.id);
  END IF;

  SELECT * INTO v_i FROM public.ingredients WHERE id = p_ingredient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ingrediente no encontrado'; END IF;
  IF v_i.base_unit IS DISTINCT FROM p_expected_base_unit
    OR v_i.base_unit NOT IN ('g','ml','ud')
    OR v_i.purchase_unit = 'm' THEN
    RAISE EXCEPTION 'El ingrediente ha cambiado o no tiene una unidad anterior compatible';
  END IF;

  -- Las recetas existentes podrían conservar cantidades en otra dimensión.
  IF EXISTS (SELECT 1 FROM public.recipe_ingredients WHERE ingredient_id = p_ingredient_id) THEN
    RAISE EXCEPTION 'El ingrediente se utiliza en recetas: revisa primero sus cantidades antes de cambiar la unidad';
  END IF;
  -- El saldo legado sólo puede contener la dimensión antigua en esta fase.
  IF EXISTS (
    SELECT 1 FROM public.stock_movements sm
    WHERE sm.ingredient_id=p_ingredient_id AND sm.unit <> v_i.base_unit
  ) THEN RAISE EXCEPTION 'Existen movimientos en otras unidades; se requiere revisión manual del historial'; END IF;

  SELECT coalesce(sum(
    CASE movement_type WHEN 'PURCHASE' THEN abs(quantity)
      WHEN 'SALE' THEN -abs(quantity) WHEN 'WASTE' THEN -abs(quantity)
      WHEN 'ADJUSTMENT' THEN quantity WHEN 'INVENTORY_COUNT' THEN quantity
      ELSE 0 END
  ),0) INTO v_old_balance
  FROM public.stock_movements WHERE ingredient_id=p_ingredient_id AND unit=v_i.base_unit;

  -- No inventar conciliaciones si el caché legado no refleja el libro de movimientos.
  v_cache := coalesce(v_i.stock_current, 0);
  IF abs(v_cache-v_old_balance) > 0.0001 THEN
    RAISE EXCEPTION 'El saldo actual no concilia con el libro histórico. Revisa el inventario antes de cambiar unidad';
  END IF;

  -- Primero cerrar SOLO el saldo antiguo en su propia dimensión.
  IF v_old_balance <> 0 THEN
    INSERT INTO public.stock_movements (
      movement_type,ingredient_id,quantity,unit,movement_date,reference_doc,
      original_description,notes,processed_by,reference_type,reference_external_id,
      idempotency_key,origin,actor_profile_id,correlation_id,provenance
    ) VALUES (
      'ADJUSTMENT',p_ingredient_id,-v_old_balance,v_i.base_unit,now(),v_prefix||':close',
      'Cierre de saldo antiguo por cambio de unidad',
      'Cierre de '||v_i.base_unit||' sin conversión a metros',v_actor::text,
      'manual_adjustment'::public.stock_reference_type,v_prefix||':close',
      v_prefix||':close','manager_adjustment'::public.stock_movement_origin,
      v_actor,v_transition_id,
      jsonb_build_object('source','ingredient_unit_transition','phase','close_old_unit',
        'old_base_unit',v_i.base_unit,'new_base_unit','m')
    ) RETURNING id INTO v_close_id;
  END IF;

  PERFORM set_config('app.manual_ingredient_price_write','on',true);
  UPDATE public.ingredients SET
    purchase_unit='m',unit_type='m',base_unit='m',unit='m',recipe_unit='m',
    current_price=p_new_price,density_g_per_ml=NULL,recommended_stock=NULL,
    pack_unit_size_qty=NULL,pack_unit_size_unit=NULL,pack_units=NULL
  WHERE id=p_ingredient_id;
  PERFORM set_config('app.manual_ingredient_price_write','off',true);

  IF v_i.current_price IS DISTINCT FROM p_new_price THEN
    INSERT INTO public.ingredient_price_history (
      ingredient_id,old_price,new_price,changed_by,changed_at,source,provenance
    ) VALUES (
      p_ingredient_id,v_i.current_price,p_new_price,v_actor,now(),'manual',
      jsonb_build_object('origin','ingredient_unit_transition',
        'transition_id',v_transition_id,'old_purchase_unit',v_i.purchase_unit,'new_purchase_unit','m')
    );
  END IF;

  -- Después abrir el recuento exacto declarado por el responsable en metros.
  IF p_opening_meters > 0 THEN
    INSERT INTO public.stock_movements (
      movement_type,ingredient_id,quantity,unit,movement_date,reference_doc,
      original_description,notes,processed_by,reference_type,reference_external_id,
      idempotency_key,origin,actor_profile_id,correlation_id,provenance
    ) VALUES (
      'ADJUSTMENT',p_ingredient_id,p_opening_meters,'m',now(),v_prefix||':open',
      'Recuento inicial en metros al cambiar la unidad',
      'Apertura de stock en metros verificada por el responsable',v_actor::text,
      'manual_adjustment'::public.stock_reference_type,v_prefix||':open',
      v_prefix||':open','manager_adjustment'::public.stock_movement_origin,
      v_actor,v_transition_id,
      jsonb_build_object('source','ingredient_unit_transition','phase','opening_meters')
    ) RETURNING id INTO v_open_id;
  END IF;

  SELECT coalesce(stock_current,0) INTO v_cache
  FROM public.ingredients WHERE id=p_ingredient_id;
  IF abs(v_cache-p_opening_meters) > 0.0001 THEN
    RAISE EXCEPTION 'El saldo final no coincide con el recuento inicial; operación revertida';
  END IF;

  INSERT INTO public.ingredient_unit_transitions (
    id,request_id,ingredient_id,actor_profile_id,old_purchase_unit,old_base_unit,
    new_purchase_unit,new_base_unit,old_stock_quantity,opening_stock_quantity,
    old_price,new_price,close_movement_id,opening_movement_id
  ) VALUES (
    v_transition_id,p_request_id,p_ingredient_id,v_actor,v_i.purchase_unit,v_i.base_unit,
    'm','m',v_old_balance,p_opening_meters,v_i.current_price,p_new_price,v_close_id,v_open_id
  );
  RETURN jsonb_build_object(
    'ok',true,'transition_id',v_transition_id,'old_unit',v_i.base_unit,
    'old_closed',v_old_balance,'new_unit','m','opening_meters',p_opening_meters
  );
END;
$fn$;
REVOKE ALL ON FUNCTION public.transition_ingredient_to_meters(uuid,text,numeric,numeric,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_ingredient_to_meters(uuid,text,numeric,numeric,uuid)
  TO authenticated;
