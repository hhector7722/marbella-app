-- Recetas: categoría alineada con carta (`public.categories`, scope=menu).
-- `recipes.category` se mantiene como etiqueta texto (denormalizada) para listados e imports.

alter table public.recipes
  add column if not exists menu_category_id uuid references public.categories(id) on delete set null;

create index if not exists idx_recipes_menu_category_id on public.recipes(menu_category_id);

comment on column public.recipes.menu_category_id is
  'FK a public.categories (scope=menu). Misma taxonomía que la carta; recipes.category es copia legible (ES).';

-- Sección «Menús» (packs) para sustituir el valor libre histórico.
insert into public.categories (scope, slug, name, sort_order, parent_id)
values ('menu', 'menus-packs', 'Menús', 60, null)
on conflict (name) do update
  set scope = excluded.scope,
      slug = excluded.slug,
      sort_order = excluded.sort_order,
      parent_id = excluded.parent_id;

-- 1) Coincidencia exacta por nombre (case-insensitive)
update public.recipes r
set menu_category_id = c.id
from public.categories c
where r.menu_category_id is null
  and r.category is not null
  and trim(r.category) <> ''
  and c.scope = 'menu'
  and lower(trim(c.name)) = lower(trim(r.category));

-- 2) Valores del antiguo selector fijo → slug menú
update public.recipes r
set menu_category_id = c.id
from public.categories c
where r.menu_category_id is null
  and r.category is not null
  and c.scope = 'menu'
  and c.slug is not null
  and (
    (lower(trim(r.category)) = 'tapas' and c.slug = 'tapas')
    or (lower(trim(r.category)) = 'entrantes' and c.slug = 'tapas')
    or (lower(trim(r.category)) = 'principales' and c.slug = 'platos-platos')
    or (lower(trim(r.category)) = 'postres' and c.slug = 'helados')
    or (lower(trim(r.category)) = 'bebidas' and c.slug = 'bebidas' and c.parent_id is null)
    or (lower(trim(r.category)) = 'vinos' and c.slug = 'bebidas-vinos')
    or (lower(trim(r.category)) in ('cocktails', 'cóctails') and c.slug = 'bebidas-aperitivos')
    or (lower(trim(r.category)) in ('menús', 'menus') and c.slug = 'menus-packs')
  );

notify pgrst, 'reload schema';
