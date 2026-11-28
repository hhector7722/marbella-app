create table public.bdp_mobile_catalog (
  id text primary key check (id = 'principal'),
  revision integer not null default 1 check (revision > 0),
  categories jsonb not null check (jsonb_typeof(categories) = 'array' and jsonb_array_length(categories) <= 200),
  updated_at timestamptz not null default now()
);
alter table public.bdp_mobile_catalog enable row level security;
revoke all on public.bdp_mobile_catalog from public, anon, authenticated;
grant select, update on public.bdp_mobile_catalog to service_role;
with base as (
  select id, name, parent_id, sort_order
  from public.categories where scope = 'menu'
), rows as (
  select c.id, c.parent_id, c.sort_order, jsonb_build_object(
    'id', c.id::text,
    'sourceId', c.id::text,
    'parentId', c.parent_id::text,
    'name', c.name,
    'hidden', false,
    'products', coalesce((
      select jsonb_agg(p.articulo_id order by p.sort_order nulls last, p.articulo_id)
      from (
        select v.articulo_id, min(v.sort_order) sort_order
        from public.v_public_menu_items v
        join public.bdp_articulos a on a.id=v.articulo_id and a.id>0
        where coalesce(v.category_child_id,v.category_parent_id)=c.id
        group by v.articulo_id
      ) p
    ),'[]'::jsonb)
  ) as item
  from base c where c.parent_id is null or exists(select 1 from base p where p.id=c.parent_id and p.parent_id is null)
)
insert into public.bdp_mobile_catalog(id,categories)
select 'principal', coalesce(jsonb_agg(item order by parent_id nulls first, sort_order nulls last, id),'[]'::jsonb) from rows;
