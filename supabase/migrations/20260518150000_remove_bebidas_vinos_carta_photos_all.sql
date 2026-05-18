-- Eliminar subcategoría bebidas-vinos; fotos y talla S/M/L en carta pública para cualquier producto con imagen.

begin;

do $$
declare
  cid_vinos uuid;
  cid_bebidas uuid;
begin
  select id into cid_vinos
  from public.categories
  where scope = 'menu' and slug = 'bebidas-vinos'
  limit 1;

  select id into cid_bebidas
  from public.categories
  where scope = 'menu' and slug = 'bebidas' and parent_id is null
  limit 1;

  if cid_vinos is not null then
    if cid_bebidas is not null then
      update public.digital_menu_overrides
      set category_id = cid_bebidas
      where category_id = cid_vinos;

      update public.recipes
      set menu_category_id = cid_bebidas
      where menu_category_id = cid_vinos;
    else
      update public.digital_menu_overrides
      set category_id = null
      where category_id = cid_vinos;

      update public.recipes
      set menu_category_id = null
      where menu_category_id = cid_vinos;
    end if;

    delete from public.menu_category_overrides
    where category_id = cid_vinos;

    delete from public.categories
    where id = cid_vinos;
  end if;
end $$;

drop view if exists public.v_public_menu_items;

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
  plato_marbella_is_menu_price
from public.v_digital_menu_items;

comment on view public.v_public_menu_items is
  'Carta pública (QR): fotos y talla S/M/L para todo producto con photo_url; sin filtro por sección.';

grant select on public.v_public_menu_items to anon;
grant select on public.v_public_menu_items to authenticated;

notify pgrst, 'reload schema';

commit;
