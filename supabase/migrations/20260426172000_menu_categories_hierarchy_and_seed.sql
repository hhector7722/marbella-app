-- Menú (Carta): jerarquía de categorías (padre -> subcategoría) usando public.categories
-- Objetivo:
-- - Reutilizar categories (antes sin uso para carta) para agrupar visualización
-- - Crear estructura solicitada (Tapas, Bocadillos{Calientes, Fríos, Especiales}, Platos{Platos, Plato Marbella}, Bebidas{Refrescos, Cervezas, Aperitivos}, Cafetería)

-- 1) Extender tabla categories para jerarquía y scope (idempotente)
alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete cascade;

alter table public.categories
  add column if not exists scope text not null default 'menu';

alter table public.categories
  add column if not exists slug text;

-- Índice UNIQUE para upsert idempotente por scope+slug
-- IMPORTANTE: no puede ser parcial si queremos ON CONFLICT (scope, slug)
drop index if exists public.categories_scope_slug_unique;
create unique index if not exists categories_scope_slug_unique
  on public.categories (scope, slug);

-- 2) Seed (idempotente por scope+slug)
with
parents as (
  select *
  from (
    values
      ('menu','tapas','Tapas',10),
      ('menu','snacks','Snacks',15),
      ('menu','bocadillos','Bocadillos',20),
      ('menu','platos','Platos',30),
      ('menu','extras','Extras',35),
      ('menu','bebidas','Bebidas',40),
      ('menu','cafeteria','Cafetería',50)
  ) as v(scope, slug, name, sort_order)
),
ins_parents as (
  insert into public.categories (scope, slug, name, sort_order, parent_id)
  select p.scope, p.slug, p.name, p.sort_order, null
  from parents p
  -- En este schema existe UNIQUE global en categories.name.
  -- Por tanto el upsert se hace por name y se "adopta" la fila para scope=menu.
  on conflict (name) do update
    set scope = excluded.scope,
        slug = excluded.slug,
        sort_order = excluded.sort_order,
        parent_id = null
  returning *
),
parent_ids as (
  select scope, slug, id
  from public.categories
  where scope = 'menu'
    and slug in ('tapas','snacks','bocadillos','platos','extras','bebidas','cafeteria')
),
children as (
  select *
  from (
    values
      -- IMPORTANTE: categories.name es UNIQUE global; los hijos deben tener name único.
      ('menu','bocadillos-calientes','Bocadillos - Calientes',21,'bocadillos'),
      ('menu','bocadillos-frios','Bocadillos - Fríos',22,'bocadillos'),
      ('menu','bocadillos-especiales','Bocadillos - Especiales',23,'bocadillos'),
      ('menu','platos-platos','Platos - Platos',31,'platos'),
      ('menu','platos-marbella','Platos - Plato Marbella',32,'platos'),
      ('menu','bebidas-refrescos','Bebidas - Refrescos',41,'bebidas'),
      ('menu','bebidas-cervezas','Bebidas - Cervezas',42,'bebidas'),
      ('menu','bebidas-aperitivos','Bebidas - Aperitivos',43,'bebidas')
  ) as v(scope, slug, name, sort_order, parent_slug)
)
insert into public.categories (scope, slug, name, sort_order, parent_id)
select
  c.scope,
  c.slug,
  c.name,
  c.sort_order,
  p.id as parent_id
from children c
join parent_ids p
  on p.scope = c.scope
 and p.slug = c.parent_slug
on conflict (name) do update
  set scope = excluded.scope,
      slug = excluded.slug,
      sort_order = excluded.sort_order,
      parent_id = excluded.parent_id;

