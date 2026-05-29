-- Límites de unidades por categoría/subcategoría en encargos (JSON: { "parents": { "uuid": 5 }, "subs": { "uuid": 3 } })
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS category_limits jsonb;

COMMENT ON COLUMN public.events.category_limits IS 'Máx. unidades que el cliente puede pedir por categoría padre o subcategoría.';
