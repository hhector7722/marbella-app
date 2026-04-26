-- Carta digital: overrides operativos (sin tocar TPV ni recetas)
-- - Permite ocultar artículos, ordenar y sobrescribir nombre/descr/precio/foto
-- - La vista public.v_digital_menu_items aplica estos overrides

-- Helper (si no existe en el entorno)
create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) in ('manager','admin','supervisor'),
    false
  );
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'digital_menu_overrides'
  ) then
    create table public.digital_menu_overrides (
      articulo_id bigint primary key references public.bdp_articulos(id) on delete cascade,
      is_hidden boolean not null default false,
      sort_order integer,
      category_id uuid references public.categories(id) on delete set null,
      override_nombre text,
      override_descripcion text,
      -- Mantener precisión compatible con la vista histórica (numeric(10,2))
      override_precio numeric(10,2),
      override_photo_url text,
      created_by uuid not null default auth.uid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint digital_menu_overrides_sort_order_non_negative check (sort_order is null or sort_order >= 0),
      constraint digital_menu_overrides_precio_non_negative check (override_precio is null or override_precio >= 0)
    );

    -- updated_at trigger (helper ya existe en este repo en la mayoría de entornos)
    create trigger trigger_digital_menu_overrides_updated_at
    before update on public.digital_menu_overrides
    for each row execute function public.update_updated_at_column();
  end if;
end $$;

-- Si la tabla ya existía antes, asegurar nueva columna (idempotente)
alter table public.digital_menu_overrides
  add column if not exists category_id uuid references public.categories(id) on delete set null;

alter table public.digital_menu_overrides enable row level security;

-- Lectura: cualquier autenticado (para permitir preview interno si se usa en dashboard)
drop policy if exists "Authenticated can read digital_menu_overrides" on public.digital_menu_overrides;
create policy "Authenticated can read digital_menu_overrides"
  on public.digital_menu_overrides
  for select
  to authenticated
  using (true);

-- Mutaciones: solo manager/admin/supervisor
drop policy if exists "Managers manage digital_menu_overrides" on public.digital_menu_overrides;
create policy "Managers manage digital_menu_overrides"
  on public.digital_menu_overrides
  for all
  to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

-- Vista SSOT para carta (reemplaza si ya existía)
create or replace view public.v_digital_menu_items as
select
  a.id as articulo_id,
  -- Nombre TPV/BDP puro (no override)
  a.nombre as articulo_nombre,
  -- Nombre en carta (override_nombre si existe; si no, nombre TPV)
  coalesce(nullif(trim(o.override_nombre), ''), a.nombre) as carta_nombre,
  d.id as departamento_id,
  d.nombre as departamento_nombre,
  o.category_id as category_id,
  cp.id as category_parent_id,
  cp.name as category_parent_name,
  cp.sort_order as category_parent_sort_order,
  c.id as category_child_id,
  c.name as category_child_name,
  c.sort_order as category_child_sort_order,
  r.id as recipe_id,
  r.name as recipe_name,
  nullif(
    trim(
      coalesce(
        nullif(trim(coalesce(o.override_descripcion, ''::text)), ''),
        nullif(trim(coalesce(r.presentation, ''::text)), ''),
        nullif(trim(coalesce(r.elaboration, ''::text)), '')
      )
    ),
    ''
  ) as descripcion,
  -- IMPORTANTE: no cambiar el tipo de columna de la vista al hacer OR REPLACE
  coalesce(o.override_precio, a.precio_base, r.sale_price)::numeric(10,2) as precio,
  coalesce(nullif(trim(o.override_photo_url), ''), r.photo_url) as photo_url,
  o.sort_order as sort_order
from public.map_tpv_receta m
join public.bdp_articulos a on a.id = m.articulo_id
join public.recipes r on r.id = m.recipe_id
left join public.bdp_departamentos d on d.id = a.departamento_id
left join public.digital_menu_overrides o on o.articulo_id = a.id
left join public.categories c on c.id = o.category_id
left join public.categories cp on cp.id = c.parent_id
where coalesce(o.is_hidden, false) = false;

comment on view public.v_digital_menu_items is 'Carta digital: TPV mapeado a receta + overrides operativos (ocultar/orden/sobrescrituras).';

grant select on public.v_digital_menu_items to authenticated;
-- Lectura pública (QR): descomentar cuando se exponga sin login
-- grant select on public.v_digital_menu_items to anon;

