-- Los costes de recetas son información económica reservada.
-- Corregir el acceso por Data API, no solamente las comprobaciones del chat.
DO $marbella_recipe_gate$
DECLARE
  f record;
  definition text;
  original_body text;
  guarded_body text;
  updated_definition text;
  marker constant text := 'MARBELLA_RECIPE_COST_ROLE_GUARD_20261112';
  gate constant text := '((auth.uid() IS NOT NULL AND public.current_employee_role() IN (''supervisor'',''manager'',''admin'')) OR COALESCE(auth.jwt()->>''role'','''') = ''service_role'' OR current_user = ''postgres'')';
BEGIN
  FOR f IN
    SELECT p.oid,p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'get_recipe_cost','get_recipe_cost_v2',
      'get_recipe_cost_v2_half','recipe_cost_v2_walk_portion'
    )
  LOOP
    definition := pg_get_functiondef(f.oid);
    IF position(marker in definition)>0 THEN CONTINUE; END IF;
    IF position('$function$' in definition)=0 THEN
      RAISE EXCEPTION 'Unexpected SQL delimiter in %',f.oid::regprocedure;
    END IF;
    original_body := split_part(definition,'$function$',2);
    IF position('BEGIN' in original_body)=0 THEN
      RAISE EXCEPTION 'Missing PL/pgSQL BEGIN in %',f.oid::regprocedure;
    END IF;
    guarded_body := overlay(original_body PLACING
      'BEGIN'||chr(10)||' -- '||marker||chr(10)||
      ' IF NOT '||gate||' THEN RAISE EXCEPTION ''forbidden''; END IF;'||chr(10)
      FROM position('BEGIN' in original_body) FOR 5);
    updated_definition := replace(definition,
      '$function$'||original_body||'$function$',
      '$function$'||guarded_body||'$function$');
    IF updated_definition=definition THEN
      RAISE EXCEPTION 'Could not modify %',f.oid::regprocedure;
    END IF;
    EXECUTE updated_definition;
  END LOOP;
END;
$marbella_recipe_gate$;

CREATE OR REPLACE FUNCTION public.recipe_cost_v2_walk(p_recipe_id uuid,p_path uuid[])
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $function$
  -- MARBELLA_RECIPE_COST_ROLE_GUARD_20261112
  SELECT CASE WHEN (
    (auth.uid() IS NOT NULL AND public.current_employee_role() IN ('supervisor','manager','admin'))
    OR COALESCE(auth.jwt()->>'role','')='service_role'
    OR current_user='postgres'
  ) THEN public.recipe_cost_v2_walk_portion(p_recipe_id,p_path,false)
  ELSE jsonb_build_object('error','forbidden') END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_recipe_cost(uuid,boolean) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.get_recipe_cost_v2(uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.get_recipe_cost_v2_half(uuid) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.recipe_cost_v2_walk(uuid,uuid[]) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.recipe_cost_v2_walk_portion(uuid,uuid[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_recipe_cost(uuid,boolean) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_recipe_cost_v2(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_recipe_cost_v2_half(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.recipe_cost_v2_walk(uuid,uuid[]) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.recipe_cost_v2_walk_portion(uuid,uuid[],boolean) TO authenticated,service_role;
