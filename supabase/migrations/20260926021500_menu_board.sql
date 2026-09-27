-- Carta física de vitrina. Ejecutar el fichero entero, no una selección a medias.
-- Rollback: drop table if exists public.menu_board_items; drop table if exists public.menu_board_categories;

create table if not exists public.menu_board_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name_ca text not null,
  name_es text not null,
  name_en text not null,
  position smallint not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_board_categories_slug_key unique (slug),
  constraint menu_board_categories_position_key unique (position),
  constraint menu_board_categories_position_range check (position between 1 and 6),
  constraint menu_board_categories_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint menu_board_categories_names_not_blank check (
    length(btrim(name_ca)) > 0
    and length(btrim(name_es)) > 0
    and length(btrim(name_en)) > 0
  )
);

create table if not exists public.menu_board_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.menu_board_categories (id) on delete cascade,
  name_ca text not null,
  name_es text not null default '',
  name_en text not null default '',
  description_ca text,
  description_es text,
  description_en text,
  price numeric(10,2) not null,
  secondary_price numeric(10,2),
  secondary_price_label_ca text,
  secondary_price_label_es text,
  secondary_price_label_en text,
  sort_order integer not null default 0,
  active boolean not null default true,
  item_kind text not null default 'product',
  plate_section text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_board_items_price_nonneg check (price >= 0),
  constraint menu_board_items_secondary_nonneg check (secondary_price is null or secondary_price >= 0),
  constraint menu_board_items_kind check (item_kind in ('product', 'plate', 'plate_option')),
  constraint menu_board_items_section check (
    (item_kind = 'plate_option' and plate_section in ('entrants', 'principals', 'side'))
    or (item_kind <> 'plate_option' and plate_section is null)
  ),
  constraint menu_board_items_name_ca_not_blank check (length(btrim(name_ca)) > 0)
);

alter table public.menu_board_items add column if not exists secondary_price_label_ca text;
alter table public.menu_board_items add column if not exists secondary_price_label_es text;
alter table public.menu_board_items add column if not exists secondary_price_label_en text;

create unique index if not exists menu_board_items_one_plate
  on public.menu_board_items (category_id)
  where item_kind = 'plate';

create index if not exists menu_board_items_category_sort
  on public.menu_board_items (category_id, sort_order, id);

create or replace function public.menu_board_categories_lock_layout()
returns trigger
language plpgsql
as $$
begin
  if new.position is distinct from old.position or new.slug is distinct from old.slug then
    raise exception 'La posición y el slug de la vitrina son fijos';
  end if;
  return new;
end;
$$;

drop trigger if exists menu_board_categories_lock_layout on public.menu_board_categories;
create trigger menu_board_categories_lock_layout
before update on public.menu_board_categories
for each row execute function public.menu_board_categories_lock_layout();

drop trigger if exists menu_board_categories_set_updated_at on public.menu_board_categories;
create trigger menu_board_categories_set_updated_at
before update on public.menu_board_categories
for each row execute function public.trg_set_updated_at();

create or replace function public.menu_board_items_guard()
returns trigger
language plpgsql
as $$
declare
  v_slug text;
begin
  select slug into v_slug
  from public.menu_board_categories
  where id = new.category_id;

  if new.item_kind in ('plate', 'plate_option') and v_slug is distinct from 'plats' then
    raise exception 'Plat Marbella solo existe en la hoja PLATS';
  end if;

  return new;
end;
$$;

drop trigger if exists menu_board_items_guard on public.menu_board_items;
create trigger menu_board_items_guard
before insert or update on public.menu_board_items
for each row execute function public.menu_board_items_guard();

drop trigger if exists menu_board_items_set_updated_at on public.menu_board_items;
create trigger menu_board_items_set_updated_at
before update on public.menu_board_items
for each row execute function public.trg_set_updated_at();

insert into public.menu_board_categories (slug, name_ca, name_es, name_en, position)
values
  ('entrepans', 'ENTREPANS', 'Bocadillos', 'Sandwiches', 1),
  ('tapes', 'TAPES', 'Tapas', 'Tapas', 2),
  ('plats', 'PLATS', 'Platos', 'Main dishes', 3),
  ('cafeteria', 'CAFETERIA', 'Cafetería', 'Coffee & tea', 4),
  ('vermut', 'VERMUT', 'Aperitivo', 'Aperitif / beer & wine', 5),
  ('begudes', 'BEGUDES I SNACKS', 'Bebidas y snacks', 'Drinks & snacks', 6)
on conflict (slug) do nothing;

alter table public.menu_board_categories enable row level security;
alter table public.menu_board_items enable row level security;

drop policy if exists "menu_board_categories_master_select" on public.menu_board_categories;
create policy "menu_board_categories_master_select"
on public.menu_board_categories for select to authenticated
using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'hhector7722@gmail.com');

drop policy if exists "menu_board_categories_master_update" on public.menu_board_categories;
create policy "menu_board_categories_master_update"
on public.menu_board_categories for update to authenticated
using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'hhector7722@gmail.com')
with check (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'hhector7722@gmail.com');

drop policy if exists "menu_board_items_master_all" on public.menu_board_items;
create policy "menu_board_items_master_all"
on public.menu_board_items for all to authenticated
using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'hhector7722@gmail.com')
with check (lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'hhector7722@gmail.com');

revoke all on public.menu_board_categories from public, anon;
revoke all on public.menu_board_items from public, anon;
grant select, update on public.menu_board_categories to authenticated;
grant select, insert, update, delete on public.menu_board_items to authenticated;
