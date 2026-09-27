-- La vitrina coloca productos que ya están en la carta virtual.
-- El precio y el nombre se copian de v_digital_menu_items.
-- Rollback, en dos sentencias aparte
-- drop index if exists public.menu_board_items_articulo_id_key
-- alter table public.menu_board_items drop column if exists articulo_id

alter table public.menu_board_items
  add column if not exists articulo_id bigint;

create unique index if not exists menu_board_items_articulo_id_key
  on public.menu_board_items (articulo_id)
  where articulo_id is not null;

with ranked as (
  select
    src.articulo_id,
    src.board_slug,
    src.name_ca,
    src.name_es,
    src.name_en,
    src.descripcion,
    src.precio,
    src.secondary_price,
    src.medio_ca,
    src.medio_es,
    src.medio_en,
    src.sort_n,
    case
      when src.board_slug = 'plats' and src.plato_marbella_is_menu_price is true and src.plate_n = 1 then 'plate'
      when src.board_slug = 'plats' and src.plato_marbella_is_menu_price is not true and src.plato_marbella_slot = 'entrante' then 'plate_option'
      when src.board_slug = 'plats' and src.plato_marbella_is_menu_price is not true and src.plato_marbella_slot = 'principal' then 'plate_option'
      when src.board_slug = 'plats' and src.plato_marbella_is_menu_price is not true and src.plato_marbella_slot = 'guarnicion' then 'plate_option'
      else 'product'
    end as item_kind,
    case
      when src.board_slug = 'plats' and src.plato_marbella_is_menu_price is not true and src.plato_marbella_slot = 'entrante' then 'entrants'
      when src.board_slug = 'plats' and src.plato_marbella_is_menu_price is not true and src.plato_marbella_slot = 'principal' then 'principals'
      when src.board_slug = 'plats' and src.plato_marbella_is_menu_price is not true and src.plato_marbella_slot = 'guarnicion' then 'side'
      else null
    end as plate_section
  from (
    select
      v.articulo_id,
      case
        when v.category_child_slug in ('bebidas-aperitivos', 'bebidas-vinos', 'bebidas-cervezas') then 'vermut'
        when lower(btrim(coalesce(v.category_parent_name, ''))) = 'tapas' then 'tapes'
        when lower(btrim(coalesce(v.category_parent_name, ''))) = 'bocadillos' then 'entrepans'
        when lower(btrim(coalesce(v.category_parent_name, ''))) = 'platos' then 'plats'
        when lower(btrim(coalesce(v.category_parent_name, ''))) in ('cafetería', 'cafeteria') then 'cafeteria'
        when lower(btrim(coalesce(v.category_parent_name, ''))) in ('bebidas', 'snacks') then 'begudes'
        else null
      end as board_slug,
      coalesce(
        nullif(btrim(v.carta_nombre_ca), ''),
        nullif(btrim(v.carta_nombre), ''),
        nullif(btrim(v.articulo_nombre), ''),
        nullif(btrim(v.carta_nombre_es), '')
      ) as name_ca,
      coalesce(nullif(btrim(v.carta_nombre_es), ''), nullif(btrim(v.carta_nombre), ''), nullif(btrim(v.articulo_nombre), ''), '') as name_es,
      coalesce(nullif(btrim(v.carta_nombre_en), ''), '') as name_en,
      nullif(btrim(v.descripcion), '') as descripcion,
      v.precio,
      case when v.carta_dual_racion_enabled is true then v.override_precio_medio else null end as secondary_price,
      case when v.carta_dual_racion_enabled is true then nullif(btrim(v.carta_racion_medio_ca), '') else null end as medio_ca,
      case when v.carta_dual_racion_enabled is true then nullif(btrim(v.carta_racion_medio_es), '') else null end as medio_es,
      case when v.carta_dual_racion_enabled is true then nullif(btrim(v.carta_racion_medio_en), '') else null end as medio_en,
      v.plato_marbella_is_menu_price,
      v.plato_marbella_slot,
      row_number() over (
        partition by case
          when v.category_child_slug in ('bebidas-aperitivos', 'bebidas-vinos', 'bebidas-cervezas') then 'vermut'
          when lower(btrim(coalesce(v.category_parent_name, ''))) = 'tapas' then 'tapes'
          when lower(btrim(coalesce(v.category_parent_name, ''))) = 'bocadillos' then 'entrepans'
          when lower(btrim(coalesce(v.category_parent_name, ''))) = 'platos' then 'plats'
          when lower(btrim(coalesce(v.category_parent_name, ''))) in ('cafetería', 'cafeteria') then 'cafeteria'
          when lower(btrim(coalesce(v.category_parent_name, ''))) in ('bebidas', 'snacks') then 'begudes'
          else null
        end
        order by coalesce(v.sort_order, 9999), v.articulo_id
      ) as sort_n,
      row_number() over (
        partition by case
          when lower(btrim(coalesce(v.category_parent_name, ''))) = 'platos' then 'plats'
          else null
        end
        order by case when v.plato_marbella_is_menu_price is true then 0 else 1 end, coalesce(v.sort_order, 9999), v.articulo_id
      ) as plate_n
    from public.v_digital_menu_items v
    where v.articulo_id is not null
      and v.precio is not null
      and v.precio >= 0
  ) src
  where src.board_slug is not null
    and src.name_ca is not null
)
update public.menu_board_items as item
set
  articulo_id = ranked.articulo_id,
  name_es = ranked.name_es,
  name_en = ranked.name_en,
  description_ca = ranked.descripcion,
  description_es = ranked.descripcion,
  description_en = ranked.descripcion,
  price = ranked.precio,
  secondary_price = ranked.secondary_price,
  secondary_price_label_ca = ranked.medio_ca,
  secondary_price_label_es = ranked.medio_es,
  secondary_price_label_en = ranked.medio_en
from ranked
join public.menu_board_categories as category on category.slug = ranked.board_slug
where item.category_id = category.id
  and item.articulo_id is null
  and lower(btrim(item.name_ca)) = lower(btrim(ranked.name_ca))
  and not exists (
    select 1
    from public.menu_board_items as other
    where other.articulo_id = ranked.articulo_id
  );

with ranked as (
  select
    src.articulo_id,
    src.board_slug,
    src.name_ca,
    src.name_es,
    src.name_en,
    src.descripcion,
    src.precio,
    src.secondary_price,
    src.medio_ca,
    src.medio_es,
    src.medio_en,
    src.sort_n,
    case
      when src.board_slug = 'plats' and src.plato_marbella_is_menu_price is true and src.plate_n = 1 then 'plate'
      when src.board_slug = 'plats' and src.plato_marbella_is_menu_price is not true and src.plato_marbella_slot = 'entrante' then 'plate_option'
      when src.board_slug = 'plats' and src.plato_marbella_is_menu_price is not true and src.plato_marbella_slot = 'principal' then 'plate_option'
      when src.board_slug = 'plats' and src.plato_marbella_is_menu_price is not true and src.plato_marbella_slot = 'guarnicion' then 'plate_option'
      else 'product'
    end as item_kind,
    case
      when src.board_slug = 'plats' and src.plato_marbella_is_menu_price is not true and src.plato_marbella_slot = 'entrante' then 'entrants'
      when src.board_slug = 'plats' and src.plato_marbella_is_menu_price is not true and src.plato_marbella_slot = 'principal' then 'principals'
      when src.board_slug = 'plats' and src.plato_marbella_is_menu_price is not true and src.plato_marbella_slot = 'guarnicion' then 'side'
      else null
    end as plate_section
  from (
    select
      v.articulo_id,
      case
        when v.category_child_slug in ('bebidas-aperitivos', 'bebidas-vinos', 'bebidas-cervezas') then 'vermut'
        when lower(btrim(coalesce(v.category_parent_name, ''))) = 'tapas' then 'tapes'
        when lower(btrim(coalesce(v.category_parent_name, ''))) = 'bocadillos' then 'entrepans'
        when lower(btrim(coalesce(v.category_parent_name, ''))) = 'platos' then 'plats'
        when lower(btrim(coalesce(v.category_parent_name, ''))) in ('cafetería', 'cafeteria') then 'cafeteria'
        when lower(btrim(coalesce(v.category_parent_name, ''))) in ('bebidas', 'snacks') then 'begudes'
        else null
      end as board_slug,
      coalesce(
        nullif(btrim(v.carta_nombre_ca), ''),
        nullif(btrim(v.carta_nombre), ''),
        nullif(btrim(v.articulo_nombre), ''),
        nullif(btrim(v.carta_nombre_es), '')
      ) as name_ca,
      coalesce(nullif(btrim(v.carta_nombre_es), ''), nullif(btrim(v.carta_nombre), ''), nullif(btrim(v.articulo_nombre), ''), '') as name_es,
      coalesce(nullif(btrim(v.carta_nombre_en), ''), '') as name_en,
      nullif(btrim(v.descripcion), '') as descripcion,
      v.precio,
      case when v.carta_dual_racion_enabled is true then v.override_precio_medio else null end as secondary_price,
      case when v.carta_dual_racion_enabled is true then nullif(btrim(v.carta_racion_medio_ca), '') else null end as medio_ca,
      case when v.carta_dual_racion_enabled is true then nullif(btrim(v.carta_racion_medio_es), '') else null end as medio_es,
      case when v.carta_dual_racion_enabled is true then nullif(btrim(v.carta_racion_medio_en), '') else null end as medio_en,
      v.plato_marbella_is_menu_price,
      v.plato_marbella_slot,
      row_number() over (
        partition by case
          when v.category_child_slug in ('bebidas-aperitivos', 'bebidas-vinos', 'bebidas-cervezas') then 'vermut'
          when lower(btrim(coalesce(v.category_parent_name, ''))) = 'tapas' then 'tapes'
          when lower(btrim(coalesce(v.category_parent_name, ''))) = 'bocadillos' then 'entrepans'
          when lower(btrim(coalesce(v.category_parent_name, ''))) = 'platos' then 'plats'
          when lower(btrim(coalesce(v.category_parent_name, ''))) in ('cafetería', 'cafeteria') then 'cafeteria'
          when lower(btrim(coalesce(v.category_parent_name, ''))) in ('bebidas', 'snacks') then 'begudes'
          else null
        end
        order by coalesce(v.sort_order, 9999), v.articulo_id
      ) as sort_n,
      row_number() over (
        partition by case
          when lower(btrim(coalesce(v.category_parent_name, ''))) = 'platos' then 'plats'
          else null
        end
        order by case when v.plato_marbella_is_menu_price is true then 0 else 1 end, coalesce(v.sort_order, 9999), v.articulo_id
      ) as plate_n
    from public.v_digital_menu_items v
    where v.articulo_id is not null
      and v.precio is not null
      and v.precio >= 0
  ) src
  where src.board_slug is not null
    and src.name_ca is not null
)
insert into public.menu_board_items (
  category_id,
  articulo_id,
  name_ca,
  name_es,
  name_en,
  description_ca,
  description_es,
  description_en,
  price,
  secondary_price,
  secondary_price_label_ca,
  secondary_price_label_es,
  secondary_price_label_en,
  sort_order,
  active,
  item_kind,
  plate_section
)
select
  category.id,
  ranked.articulo_id,
  ranked.name_ca,
  ranked.name_es,
  ranked.name_en,
  ranked.descripcion,
  ranked.descripcion,
  ranked.descripcion,
  ranked.precio,
  ranked.secondary_price,
  ranked.medio_ca,
  ranked.medio_es,
  ranked.medio_en,
  ranked.sort_n,
  true,
  case
    when ranked.item_kind = 'plate' and exists (
      select 1
      from public.menu_board_items as existing_plate
      where existing_plate.item_kind = 'plate'
        and existing_plate.category_id = category.id
    ) then 'product'
    else ranked.item_kind
  end,
  case
    when ranked.item_kind = 'plate' and exists (
      select 1
      from public.menu_board_items as existing_plate
      where existing_plate.item_kind = 'plate'
        and existing_plate.category_id = category.id
    ) then null
    else ranked.plate_section
  end
from ranked
join public.menu_board_categories as category on category.slug = ranked.board_slug
where not exists (
  select 1
  from public.menu_board_items as item
  where item.articulo_id = ranked.articulo_id
     or (
       item.category_id = category.id
       and lower(btrim(item.name_ca)) = lower(btrim(ranked.name_ca))
     )
);
