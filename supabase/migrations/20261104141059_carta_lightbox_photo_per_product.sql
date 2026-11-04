-- Imagen opcional para la vista ampliada: nunca sustituye la miniatura.
alter table public.digital_menu_overrides
  add column if not exists lightbox_photo_url text;

-- Append-only: conserva las 36 columnas anteriores y sus tipos/orden.
-- El acceso anon de la vista pública mantiene la configuración previa.
create or replace view public.v_public_menu_items as
select
  v.articulo_id,
  v.carta_nombre,
  v.carta_nombre_es,
  v.carta_nombre_ca,
  v.carta_nombre_en,
  v.precio,
  v.photo_url,
  v.carta_photo_scale,
  v.sort_order,
  v.category_parent_id,
  v.category_parent_name,
  v.category_parent_sort_order,
  v.category_child_id,
  v.category_child_name,
  v.category_child_sort_order,
  v.category_child_slug,
  v.category_parent_cover_photo_url,
  v.category_parent_name_es,
  v.category_parent_name_ca,
  v.category_parent_name_en,
  v.category_child_name_es,
  v.category_child_name_ca,
  v.category_child_name_en,
  v.recipe_id,
  v.tpv_factor_porcion,
  v.plato_marbella_slot,
  v.plato_marbella_is_menu_price,
  v.plato_marbella_hide_name,
  v.carta_dual_racion_enabled,
  v.override_precio_medio,
  v.carta_racion_entero_es,
  v.carta_racion_entero_ca,
  v.carta_racion_entero_en,
  v.carta_racion_medio_es,
  v.carta_racion_medio_ca,
  v.carta_racion_medio_en,
  nullif(btrim(o.lightbox_photo_url), '') as lightbox_photo_url
from public.v_digital_menu_items as v
left join public.digital_menu_overrides as o
  on o.articulo_id = v.articulo_id;

comment on column public.digital_menu_overrides.lightbox_photo_url is
  'Foto opcional ampliada de la carta; si null usar photo_url habitual.';

notify pgrst, 'reload schema';
