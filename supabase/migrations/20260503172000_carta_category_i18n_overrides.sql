-- Carta: overrides i18n de categorías (ES/CA/EN) + vistas
-- Objetivo:
-- - Permitir editar el nombre mostrado de categorías por idioma sin tocar `categories.name` (que es UNIQUE global).
-- - Exponer nombres por idioma en `v_digital_menu_items` y `v_public_menu_items` manteniendo compatibilidad.

begin;

-- 1) Tabla de overrides por categoría (idempotente)
create table if not exists public.menu_category_overrides (
  category_id uuid primary key references public.categories(id) on delete cascade,
  override_name_es text,
  override_name_ca text,
  override_name_en text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid()
);

comment on table public.menu_category_overrides is
  'Overrides i18n de nombres de categorías de carta (ES/CA/EN). Solo afecta a UI; no cambia categories.name.';

comment on column public.menu_category_overrides.category_id is
  'ID de la categoría (public.categories.id).';
comment on column public.menu_category_overrides.override_name_es is
  'Nombre mostrado (ES). Fallback: categories.name.';
comment on column public.menu_category_overrides.override_name_ca is
  'Nombre mostrado (CA). Fallback: categories.name.';
comment on column public.menu_category_overrides.override_name_en is
  'Nombre mostrado (EN). Fallback: categories.name.';

-- updated_at trigger (helper ya usado en el repo)
drop trigger if exists trigger_menu_category_overrides_updated_at on public.menu_category_overrides;
create trigger trigger_menu_category_overrides_updated_at
before update on public.menu_category_overrides
for each row execute function public.update_updated_at_column();

alter table public.menu_category_overrides enable row level security;

-- Lectura: cualquier autenticado
drop policy if exists "Authenticated can read menu_category_overrides" on public.menu_category_overrides;
create policy "Authenticated can read menu_category_overrides"
  on public.menu_category_overrides
  for select
  to authenticated
  using (true);

-- Mutaciones: solo manager/admin/supervisor
drop policy if exists "Managers manage menu_category_overrides" on public.menu_category_overrides;
create policy "Managers manage menu_category_overrides"
  on public.menu_category_overrides
  for all
  to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

-- 2) Vista SSOT de carta: añadir columnas i18n de categorías
create or replace view public.v_digital_menu_items as
select
  a.id as articulo_id,
  a.nombre as articulo_nombre,
  coalesce(nullif(trim(o.override_nombre), ''), a.nombre) as carta_nombre,
  coalesce(nullif(trim(o.override_nombre_es), ''), nullif(trim(o.override_nombre), ''), a.nombre) as carta_nombre_es,
  coalesce(nullif(trim(o.override_nombre_ca), ''), nullif(trim(o.override_nombre), ''), a.nombre) as carta_nombre_ca,
  coalesce(nullif(trim(o.override_nombre_en), ''), nullif(trim(o.override_nombre), ''), a.nombre) as carta_nombre_en,
  d.id as departamento_id,
  d.nombre as departamento_nombre,
  o.category_id as category_id,
  case when c.parent_id is null then c.id else cp.id end as category_parent_id,
  case when c.parent_id is null then c.name else cp.name end as category_parent_name,
  case when c.parent_id is null then c.sort_order else cp.sort_order end as category_parent_sort_order,
  case when c.parent_id is null then null else c.id end as category_child_id,
  case when c.parent_id is null then null else c.name end as category_child_name,
  case when c.parent_id is null then null else c.sort_order end as category_child_sort_order,
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
  coalesce(o.override_precio, a.precio_base, r.sale_price)::numeric(10,2) as precio,
  coalesce(nullif(trim(o.override_photo_url), ''), r.photo_url) as photo_url,
  o.sort_order as sort_order,
  case
    when cat_parent.cover_articulo_id is null then null
    else coalesce(nullif(trim(o_cov.override_photo_url), ''), r_cov.photo_url)
  end as category_parent_cover_photo_url,

  -- Nuevas columnas: nombres de categoría por idioma (fallback a categories.name)
  coalesce(nullif(trim(mco_parent.override_name_es), ''), case when c.parent_id is null then c.name else cp.name end) as category_parent_name_es,
  coalesce(nullif(trim(mco_parent.override_name_ca), ''), case when c.parent_id is null then c.name else cp.name end) as category_parent_name_ca,
  coalesce(nullif(trim(mco_parent.override_name_en), ''), case when c.parent_id is null then c.name else cp.name end) as category_parent_name_en,
  case
    when c.parent_id is null then null
    else coalesce(nullif(trim(mco_child.override_name_es), ''), c.name)
  end as category_child_name_es,
  case
    when c.parent_id is null then null
    else coalesce(nullif(trim(mco_child.override_name_ca), ''), c.name)
  end as category_child_name_ca,
  case
    when c.parent_id is null then null
    else coalesce(nullif(trim(mco_child.override_name_en), ''), c.name)
  end as category_child_name_en
from public.map_tpv_receta m
join public.bdp_articulos a on a.id = m.articulo_id
join public.recipes r on r.id = m.recipe_id
left join public.bdp_departamentos d on d.id = a.departamento_id
left join public.digital_menu_overrides o on o.articulo_id = a.id
left join public.categories c on c.id = o.category_id
left join public.categories cp on cp.id = c.parent_id
left join public.categories cat_parent
  on cat_parent.id = (case when c.parent_id is null then c.id else cp.id end)
left join public.map_tpv_receta m_cov on m_cov.articulo_id = cat_parent.cover_articulo_id
left join public.recipes r_cov on r_cov.id = m_cov.recipe_id
left join public.digital_menu_overrides o_cov on o_cov.articulo_id = cat_parent.cover_articulo_id
left join public.menu_category_overrides mco_parent
  on mco_parent.category_id = (case when c.parent_id is null then c.id else cp.id end)
left join public.menu_category_overrides mco_child
  on mco_child.category_id = (case when c.parent_id is null then null else c.id end)
where coalesce(o.is_hidden, false) = false;

comment on view public.v_digital_menu_items is
  'Carta digital: TPV + overrides + portada sección + nombres i18n de categorías.';

grant select on public.v_digital_menu_items to authenticated;

create or replace view public.v_public_menu_items as
select
  articulo_id,
  carta_nombre,
  carta_nombre_es,
  carta_nombre_ca,
  carta_nombre_en,
  precio,
  case
    when category_parent_name in ('Tapas', 'Bocadillos', 'Platos') then photo_url
    else null
  end as photo_url,
  sort_order,
  category_parent_id,
  category_parent_name,
  category_parent_sort_order,
  category_child_id,
  category_child_name,
  category_child_sort_order,
  category_parent_cover_photo_url,
  category_parent_name_es,
  category_parent_name_ca,
  category_parent_name_en,
  category_child_name_es,
  category_child_name_ca,
  category_child_name_en
from public.v_digital_menu_items;

comment on view public.v_public_menu_items is
  'Carta pública (QR): nombre+precio; fotos ítem en Tapas/Bocadillos/Platos; portada sección; nombres i18n de categorías.';

grant select on public.v_public_menu_items to anon;
grant select on public.v_public_menu_items to authenticated;

notify pgrst, 'reload schema';

commit;

