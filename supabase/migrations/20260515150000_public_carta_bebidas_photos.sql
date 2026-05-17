-- Carta pública: mostrar fotos también en sección Bebidas (QR).

begin;

drop view if exists public.v_public_menu_items;

create view public.v_public_menu_items as
select
  articulo_id,
  carta_nombre,
  carta_nombre_es,
  carta_nombre_ca,
  carta_nombre_en,
  precio,
  case
    when category_parent_name in ('Tapas', 'Bocadillos', 'Platos', 'Bebidas') then photo_url
    else null
  end as photo_url,
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
  plato_marbella_is_menu_price
from public.v_digital_menu_items;

comment on view public.v_public_menu_items is
  'Carta pública (QR): nombre+precio; fotos en Tapas/Bocadillos/Platos/Bebidas; Plato Marbella slots.';

grant select on public.v_public_menu_items to anon;
grant select on public.v_public_menu_items to authenticated;

notify pgrst, 'reload schema';

commit;
