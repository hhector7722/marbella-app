-- Carta: quitar sección padre «Cervezas y aperitivos»; Bebidas con 4 subcategorías (refrescos, cervezas, vinos, aperitivos)
-- Reafirma columnas i18n en overrides (ya existían en 20260427120000; idempotente)

alter table public.digital_menu_overrides
  add column if not exists override_nombre_es text;
alter table public.digital_menu_overrides
  add column if not exists override_nombre_ca text;
alter table public.digital_menu_overrides
  add column if not exists override_nombre_en text;

comment on column public.digital_menu_overrides.override_nombre_es is 'Nombre en carta (ES). Fallback en vista: override_nombre -> bdp_articulos.nombre.';
comment on column public.digital_menu_overrides.override_nombre_ca is 'Nom en carta (CA). Fallback en vista: override_nombre -> bdp_articulos.nombre.';
comment on column public.digital_menu_overrides.override_nombre_en is 'Name on menu (EN). Fallback en vista: override_nombre -> bdp_articulos.nombre.';

do $$
declare
  cid_old uuid;
  cid_target uuid;
  pid_bebidas uuid;
begin
  select id into cid_old
  from public.categories
  where scope = 'menu' and slug = 'cervezas-y-aperitivos'
  limit 1;

  select id into cid_target
  from public.categories
  where scope = 'menu' and slug = 'bebidas-cervezas'
  limit 1;

  if cid_old is not null and cid_target is not null then
    update public.digital_menu_overrides
    set category_id = cid_target
    where category_id = cid_old;
  elsif cid_old is not null then
    update public.digital_menu_overrides
    set category_id = null
    where category_id = cid_old;
  end if;

  delete from public.categories
  where scope = 'menu' and slug = 'cervezas-y-aperitivos';

  select id into pid_bebidas
  from public.categories
  where scope = 'menu' and slug = 'bebidas' and parent_id is null
  limit 1;

  if pid_bebidas is not null then
  -- Orden dentro de Bebidas: refrescos, cervezas, vinos, aperitivos
  insert into public.categories (scope, slug, name, sort_order, parent_id)
  values
    ('menu', 'bebidas-refrescos', 'Bebidas - Refrescos', 41, pid_bebidas),
    ('menu', 'bebidas-cervezas', 'Bebidas - Cervezas', 42, pid_bebidas),
    ('menu', 'bebidas-vinos', 'Bebidas - Vinos', 43, pid_bebidas),
    ('menu', 'bebidas-aperitivos', 'Bebidas - Aperitivos', 44, pid_bebidas)
  on conflict (name) do update
    set scope = excluded.scope,
        slug = excluded.slug,
        sort_order = excluded.sort_order,
        parent_id = excluded.parent_id;
  end if;
end $$;

notify pgrst, 'reload schema';
