-- Portada de sección (carta): artículo TPV cuya foto se muestra en la cabecera plegada del acordeón padre

alter table public.categories
  add column if not exists cover_articulo_id bigint references public.bdp_articulos(id) on delete set null;

comment on column public.categories.cover_articulo_id is
  'Artículo TPV usado como imagen de portada de la sección (solo categorías menú padre). Resolución de URL igual que ítems de carta (override foto + receta).';

-- Manager puede actualizar categorías menú (portada)
drop policy if exists "categories_update_managers_menu" on public.categories;
create policy "categories_update_managers_menu"
  on public.categories
  for update
  to authenticated
  using (scope = 'menu' and public.is_manager_or_admin())
  with check (scope = 'menu' and public.is_manager_or_admin());

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
  end as category_parent_cover_photo_url
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
where coalesce(o.is_hidden, false) = false;

comment on view public.v_digital_menu_items is 'Carta digital: TPV + overrides + category_parent_cover_photo_url (foto portada sección).';

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
  category_parent_cover_photo_url
from public.v_digital_menu_items;

comment on view public.v_public_menu_items is 'Carta pública (QR): nombre+precio; fotos ítem en Tapas/Bocadillos/Platos; portada de sección si definida.';

grant select on public.v_public_menu_items to anon;
grant select on public.v_public_menu_items to authenticated;

notify pgrst, 'reload schema';
