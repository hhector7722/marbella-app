-- Carta: sección de primer nivel «Helados» (solo padre; ítems vía digital_menu_overrides.category_id)
-- Nota: la sección «Cervezas y aperitivos» se retiró en 20260502170000_* (subcategorías bajo Bebidas).

insert into public.categories (scope, slug, name, sort_order, parent_id)
values
  ('menu', 'helados', 'Helados', 55, null)
on conflict (name) do update
  set scope = excluded.scope,
      slug = excluded.slug,
      sort_order = excluded.sort_order,
      parent_id = excluded.parent_id;
