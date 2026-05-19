-- Plato Marbella: ocultar nombre del producto en carta (solo foto).

begin;

alter table public.digital_menu_overrides
  add column if not exists plato_marbella_hide_name boolean not null default false;

comment on column public.digital_menu_overrides.plato_marbella_hide_name is
  'Si true, en Plato Marbella la opción se muestra sin etiqueta de nombre (solo foto).';

drop view if exists public.v_public_menu_items;
drop view if exists public.v_digital_menu_items;

create view public.v_digital_menu_items as
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
  case when c.parent_id is null then null else c.slug end as category_child_slug,
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
  coalesce(o.override_precio, a.precio_base, r.sale_price)::numeric(10, 2) as precio,
  coalesce(nullif(trim(o.override_photo_url), ''), r.photo_url) as photo_url,
  coalesce(o.carta_photo_scale, 'm') as carta_photo_scale,
  o.sort_order as sort_order,
  o.plato_marbella_slot as plato_marbella_slot,
  coalesce(o.plato_marbella_is_menu_price, false) as plato_marbella_is_menu_price,
  coalesce(o.plato_marbella_hide_name, false) as plato_marbella_hide_name,
  coalesce(o.carta_dual_racion_enabled, false) as carta_dual_racion_enabled,
  o.override_precio_medio as override_precio_medio,
  nullif(trim(o.carta_racion_entero_es), '') as carta_racion_entero_es,
  nullif(trim(o.carta_racion_entero_ca), '') as carta_racion_entero_ca,
  nullif(trim(o.carta_racion_entero_en), '') as carta_racion_entero_en,
  nullif(trim(o.carta_racion_medio_es), '') as carta_racion_medio_es,
  nullif(trim(o.carta_racion_medio_ca), '') as carta_racion_medio_ca,
  nullif(trim(o.carta_racion_medio_en), '') as carta_racion_medio_en,
  case
    when nullif(trim(cat_parent.cover_photo_url), '') is not null then nullif(trim(cat_parent.cover_photo_url), '')
    when cat_parent.cover_articulo_id is null then null
    else coalesce(nullif(trim(o_cov.override_photo_url), ''), r_cov.photo_url)
  end as category_parent_cover_photo_url,
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
  end as category_child_name_en,
  coalesce(m.factor_porcion, 1.0)::numeric(10, 4) as tpv_factor_porcion
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

grant select on public.v_digital_menu_items to authenticated;

create view public.v_public_menu_items as
select
  articulo_id,
  carta_nombre,
  carta_nombre_es,
  carta_nombre_ca,
  carta_nombre_en,
  precio,
  photo_url,
  carta_photo_scale,
  sort_order,
  category_parent_id,
  category_parent_name,
  category_parent_sort_order,
  category_child_id,
  category_child_name,
  category_child_sort_order,
  category_child_slug,
  category_parent_cover_photo_url,
  category_parent_name_es,
  category_parent_name_ca,
  category_parent_name_en,
  category_child_name_es,
  category_child_name_ca,
  category_child_name_en,
  recipe_id,
  tpv_factor_porcion,
  plato_marbella_slot,
  plato_marbella_is_menu_price,
  plato_marbella_hide_name,
  carta_dual_racion_enabled,
  override_precio_medio,
  carta_racion_entero_es,
  carta_racion_entero_ca,
  carta_racion_entero_en,
  carta_racion_medio_es,
  carta_racion_medio_ca,
  carta_racion_medio_en
from public.v_digital_menu_items;

grant select on public.v_public_menu_items to anon;
grant select on public.v_public_menu_items to authenticated;

notify pgrst, 'reload schema';

commit;
