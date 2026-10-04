-- Move relocatable extensions out of the exposed public schema.
-- pg_net is intentionally left in public because this installed version is
-- non-relocatable and existing cron/webhook functions depend on net.*.
-- Applied to production as migration 20261004150425.

-- gestionar_recetas uses pg_trgm's similarity(); keep extensions resolvable
-- after moving pg_trgm.
ALTER FUNCTION public.gestionar_recetas(text, jsonb)
  SET search_path TO public, extensions;

ALTER EXTENSION pg_trgm SET SCHEMA extensions;
ALTER EXTENSION vector SET SCHEMA extensions;
