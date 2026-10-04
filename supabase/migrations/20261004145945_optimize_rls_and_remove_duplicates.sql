-- Security hardening and low-risk RLS/index cleanup.
-- Applied to production as migration 20261004145945.

REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.view_payable_overtime FROM anon;

DROP POLICY IF EXISTS "Manager acceso total" ON public.profiles;

ALTER VIEW public.view_payable_overtime SET (security_invoker = true);

-- Supabase recommends wrapping auth helpers in a scalar SELECT so PostgreSQL
-- evaluates them once per statement instead of once per candidate row.
DO $$
DECLARE
  r record;
  new_qual text;
  new_check text;
  ddl text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname IN ('public', 'storage')
      AND (
        coalesce(qual, '') ~ 'auth\.(uid|role|jwt)\(\)'
        OR coalesce(with_check, '') ~ 'auth\.(uid|role|jwt)\(\)'
      )
  LOOP
    new_qual := r.qual;
    new_check := r.with_check;

    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
      new_qual := replace(new_qual, 'auth.role()', '(select auth.role())');
      new_qual := replace(new_qual, 'auth.jwt()', '(select auth.jwt())');
    END IF;

    IF new_check IS NOT NULL THEN
      new_check := replace(new_check, 'auth.uid()', '(select auth.uid())');
      new_check := replace(new_check, 'auth.role()', '(select auth.role())');
      new_check := replace(new_check, 'auth.jwt()', '(select auth.jwt())');
    END IF;

    ddl := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);

    IF new_qual IS NOT NULL THEN
      ddl := ddl || format(' USING (%s)', new_qual);
    END IF;

    IF new_check IS NOT NULL THEN
      ddl := ddl || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE ddl;
  END LOOP;
END
$$;

-- Exact duplicate permissive policies. The retained policies have identical
-- roles, commands and expressions, so behaviour is unchanged.
DROP POLICY IF EXISTS "Allow authenticated read on cash_box_inventory"
  ON public.cash_box_inventory;
DROP POLICY IF EXISTS "Allow authenticated users to read cash boxes"
  ON public.cash_boxes;
DROP POLICY IF EXISTS "Lectura Global Autenticada"
  ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated select treasury"
  ON public.treasury_log;
DROP POLICY IF EXISTS "Subida imagenes ingredientes"
  ON storage.objects;
DROP POLICY IF EXISTS "Subida imagenes recetas"
  ON storage.objects;

-- Physically identical, non-constraint indexes.
DROP INDEX IF EXISTS public.idx_kds_orders_ref;
DROP INDEX IF EXISTS public.idx_recipe_ingredients_recipe_id;
