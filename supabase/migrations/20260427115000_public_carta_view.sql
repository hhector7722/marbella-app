-- Carta pública (QR): vista mínima y segura para anon
-- - NO se edita (solo lectura)
-- - Lee de v_digital_menu_items (SSOT interna) y expone únicamente campos públicos
-- - photo_url solo en categorías padre whitelisted (Tapas, Bocadillos, Platos)

begin;

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
  category_child_sort_order
from public.v_digital_menu_items;

comment on view public.v_public_menu_items is 'Carta pública (QR): vista mínima (nombre+precio) con imágenes solo en Tapas/Bocadillos/Platos.';

grant select on public.v_public_menu_items to anon;
grant select on public.v_public_menu_items to authenticated;

notify pgrst, 'reload schema';

commit;

