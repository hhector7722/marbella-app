-- Categoría exclusiva de recetas de producción; nunca entra en la carta (scope='menu').
-- No recategoriza elaboraciones ya existentes.
INSERT INTO public.categories (name, slug, scope, parent_id, sort_order)
VALUES ('Producción', 'produccion', 'recipes', NULL, 90)
ON CONFLICT (name) DO NOTHING;
