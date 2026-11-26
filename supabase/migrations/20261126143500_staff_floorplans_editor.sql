-- Plano operativo de mesas. Configuración inicial editable sin números;
-- tras publicar, ningún borrador ni plano publicado admite mesas sin numerar.
-- La sincronización/comandas de BDP no se modifica en esta migración.

create or replace function public.is_valid_staff_floorplan(
  payload jsonb,
  require_complete boolean
) returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  z text;
  b text;
  t jsonb;
  salon text;
  n text;
  key text;
  seen_ids text[] := '{}'::text[];
  seen_numbers text[] := '{}'::text[];
begin
  if payload is null then
    return not require_complete;
  end if;
  if jsonb_typeof(payload) is distinct from 'object'
    or payload->>'schema' is distinct from '1'
    or jsonb_typeof(payload->'salons') is distinct from 'object'
    or jsonb_typeof(payload->'tables') is distinct from 'array'
    or jsonb_array_length(payload->'tables') > 160
    or (require_complete and jsonb_array_length(payload->'tables') = 0)
  then return false; end if;

  for z in select unnest(array['alargadas','terraza','interior','individuales']) loop
    if not (payload->'salons' ? z) then return false; end if;
    b := jsonb_typeof(payload->'salons'->z);
    if b <> 'null' then
      if b <> 'number' then return false; end if;
      salon := payload->'salons'->>z;
      if salon !~ '^[0-9]{1,2}$' or salon::integer not between 1 and 99 then
        return false;
      end if;
    end if;
  end loop;

  for t in select value from jsonb_array_elements(payload->'tables') loop
    if jsonb_typeof(t) is distinct from 'object'
      or jsonb_typeof(t->'id') is distinct from 'string'
      or coalesce(t->>'id','') !~ '^[A-Za-z0-9_-]{1,64}      or coalesce(t->>'zone','') not in ('alargadas','terraza','interior','individuales')
      or coalesce(t->>'shape','') not in ('alargada','cuadrada','doble')
      or coalesce(t->>'rotation','') not in ('0','90','180','270')
    then return false; end if;
    if (t->>'id') = any(seen_ids) then return false; end if;
    seen_ids := array_append(seen_ids,t->>'id');

    if jsonb_typeof(t->'x') is distinct from 'number'
      or jsonb_typeof(t->'y') is distinct from 'number'
      or jsonb_typeof(t->'width') is distinct from 'number'
      or jsonb_typeof(t->'height') is distinct from 'number'
      or (t->>'x')::numeric < 0
      or (t->>'y')::numeric < 0
      or (t->>'width')::numeric < 4
      or (t->>'height')::numeric < 4
      or (t->>'x')::numeric + (t->>'width')::numeric > 100.001
      or (t->>'y')::numeric + (t->>'height')::numeric > 100.001
    then return false; end if;

    z := t->>'zone';
    b := jsonb_typeof(t->'number');
    salon := payload->'salons'->>z;
    if b is null or b = 'null' then
      if require_complete then return false; end if;
      continue;
    end if;
    if b <> 'number' then return false; end if;
    n := t->>'number';
    if n !~ '^[0-9]{1,4}$' or n::integer not between 1 and 9999 then
      return false;
    end if;
    if salon is null then
      if require_complete then return false; end if;
      continue;
    end if;
    key := salon || ':' || n;
    if key = any(seen_numbers) then return false; end if;
    seen_numbers := array_append(seen_numbers,key);
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.is_valid_staff_floorplan(jsonb, boolean) from public;
grant execute on function public.is_valid_staff_floorplan(jsonb, boolean) to authenticated;

create table if not exists public.staff_floorplans (
  id text primary key,
  draft jsonb,
  published jsonb,
  revision integer not null default 0,
  updated_at timestamptz,
  updated_by uuid references auth.users(id),
  constraint staff_floorplans_single check (id = 'principal'),
  constraint staff_floorplans_draft_valid
    check (public.is_valid_staff_floorplan(draft, published is not null)),
  constraint staff_floorplans_published_valid
    check (published is null or public.is_valid_staff_floorplan(published, true))
);

alter table public.staff_floorplans enable row level security;
revoke all on public.staff_floorplans from anon;
grant select, update on public.staff_floorplans to authenticated;
grant all on public.staff_floorplans to service_role;

create policy "staff_floorplans_read" on public.staff_floorplans
for select to authenticated
using ((select auth.uid()) is not null);

create policy "staff_floorplans_update_managers" on public.staff_floorplans
for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role in ('admin','manager','supervisor')
))
with check (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role in ('admin','manager','supervisor')
));

insert into public.staff_floorplans(id,draft,published,revision)
values ('principal',null,null,0)
on conflict (id) do nothing;

      or t->>'zone' not in ('alargadas','terraza','interior','individuales')
      or t->>'shape' not in ('alargada','cuadrada','doble')
      or t->>'rotation' not in ('0','90','180','270')
    then return false; end if;
    if (t->>'id') = any(seen_ids) then return false; end if;
    seen_ids := array_append(seen_ids,t->>'id');

    if jsonb_typeof(t->'x') <> 'number'
      or jsonb_typeof(t->'y') <> 'number'
      or jsonb_typeof(t->'width') <> 'number'
      or jsonb_typeof(t->'height') <> 'number'
      or (t->>'x')::numeric < 0
      or (t->>'y')::numeric < 0
      or (t->>'width')::numeric < 4
      or (t->>'height')::numeric < 4
      or (t->>'x')::numeric + (t->>'width')::numeric > 100.001
      or (t->>'y')::numeric + (t->>'height')::numeric > 100.001
    then return false; end if;

    z := t->>'zone';
    b := jsonb_typeof(t->'number');
    salon := payload->'salons'->>z;
    if b is null or b = 'null' then
      if require_complete then return false; end if;
      continue;
    end if;
    if b <> 'number' then return false; end if;
    n := t->>'number';
    if n !~ '^[0-9]{1,4}$' or n::integer not between 1 and 9999 then
      return false;
    end if;
    if salon is null then
      if require_complete then return false; end if;
      continue;
    end if;
    key := salon || ':' || n;
    if key = any(seen_numbers) then return false; end if;
    seen_numbers := array_append(seen_numbers,key);
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.is_valid_staff_floorplan(jsonb, boolean) from public;
grant execute on function public.is_valid_staff_floorplan(jsonb, boolean) to authenticated;

create table if not exists public.staff_floorplans (
  id text primary key,
  draft jsonb,
  published jsonb,
  revision integer not null default 0,
  updated_at timestamptz,
  updated_by uuid references auth.users(id),
  constraint staff_floorplans_single check (id = 'principal'),
  constraint staff_floorplans_draft_valid
    check (public.is_valid_staff_floorplan(draft, published is not null)),
  constraint staff_floorplans_published_valid
    check (published is null or public.is_valid_staff_floorplan(published, true))
);

alter table public.staff_floorplans enable row level security;
revoke all on public.staff_floorplans from anon;
grant select, update on public.staff_floorplans to authenticated;
grant all on public.staff_floorplans to service_role;

create policy "staff_floorplans_read" on public.staff_floorplans
for select to authenticated
using ((select auth.uid()) is not null);

create policy "staff_floorplans_update_managers" on public.staff_floorplans
for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role in ('admin','manager','supervisor')
))
with check (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role in ('admin','manager','supervisor')
));

insert into public.staff_floorplans(id,draft,published,revision)
values ('principal',null,null,0)
on conflict (id) do nothing;

      or coalesce(t->>'zone','') not in ('alargadas','terraza','interior','individuales')
      or coalesce(t->>'shape','') not in ('alargada','cuadrada','doble')
      or coalesce(t->>'rotation','') not in ('0','90','180','270')
    then return false; end if;
    if (t->>'id') = any(seen_ids) then return false; end if;
    seen_ids := array_append(seen_ids,t->>'id');

    if jsonb_typeof(t->'x') is distinct from 'number'
      or jsonb_typeof(t->'y') is distinct from 'number'
      or jsonb_typeof(t->'width') is distinct from 'number'
      or jsonb_typeof(t->'height') is distinct from 'number'
      or (t->>'x')::numeric < 0
      or (t->>'y')::numeric < 0
      or (t->>'width')::numeric < 4
      or (t->>'height')::numeric < 4
      or (t->>'x')::numeric + (t->>'width')::numeric > 100.001
      or (t->>'y')::numeric + (t->>'height')::numeric > 100.001
    then return false; end if;

    z := t->>'zone';
    b := jsonb_typeof(t->'number');
    salon := payload->'salons'->>z;
    if b is null or b = 'null' then
      if require_complete then return false; end if;
      continue;
    end if;
    if b <> 'number' then return false; end if;
    n := t->>'number';
    if n !~ '^[0-9]{1,4}$' or n::integer not between 1 and 9999 then
      return false;
    end if;
    if salon is null then
      if require_complete then return false; end if;
      continue;
    end if;
    key := salon || ':' || n;
    if key = any(seen_numbers) then return false; end if;
    seen_numbers := array_append(seen_numbers,key);
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.is_valid_staff_floorplan(jsonb, boolean) from public;
grant execute on function public.is_valid_staff_floorplan(jsonb, boolean) to authenticated;

create table if not exists public.staff_floorplans (
  id text primary key,
  draft jsonb,
  published jsonb,
  revision integer not null default 0,
  updated_at timestamptz,
  updated_by uuid references auth.users(id),
  constraint staff_floorplans_single check (id = 'principal'),
  constraint staff_floorplans_draft_valid
    check (public.is_valid_staff_floorplan(draft, published is not null)),
  constraint staff_floorplans_published_valid
    check (published is null or public.is_valid_staff_floorplan(published, true))
);

alter table public.staff_floorplans enable row level security;
revoke all on public.staff_floorplans from anon;
grant select, update on public.staff_floorplans to authenticated;
grant all on public.staff_floorplans to service_role;

create policy "staff_floorplans_read" on public.staff_floorplans
for select to authenticated
using ((select auth.uid()) is not null);

create policy "staff_floorplans_update_managers" on public.staff_floorplans
for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role in ('admin','manager','supervisor')
))
with check (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role in ('admin','manager','supervisor')
));

insert into public.staff_floorplans(id,draft,published,revision)
values ('principal',null,null,0)
on conflict (id) do nothing;

      or t->>'zone' not in ('alargadas','terraza','interior','individuales')
      or t->>'shape' not in ('alargada','cuadrada','doble')
      or t->>'rotation' not in ('0','90','180','270')
    then return false; end if;
    if (t->>'id') = any(seen_ids) then return false; end if;
    seen_ids := array_append(seen_ids,t->>'id');

    if jsonb_typeof(t->'x') <> 'number'
      or jsonb_typeof(t->'y') <> 'number'
      or jsonb_typeof(t->'width') <> 'number'
      or jsonb_typeof(t->'height') <> 'number'
      or (t->>'x')::numeric < 0
      or (t->>'y')::numeric < 0
      or (t->>'width')::numeric < 4
      or (t->>'height')::numeric < 4
      or (t->>'x')::numeric + (t->>'width')::numeric > 100.001
      or (t->>'y')::numeric + (t->>'height')::numeric > 100.001
    then return false; end if;

    z := t->>'zone';
    b := jsonb_typeof(t->'number');
    salon := payload->'salons'->>z;
    if b is null or b = 'null' then
      if require_complete then return false; end if;
      continue;
    end if;
    if b <> 'number' then return false; end if;
    n := t->>'number';
    if n !~ '^[0-9]{1,4}$' or n::integer not between 1 and 9999 then
      return false;
    end if;
    if salon is null then
      if require_complete then return false; end if;
      continue;
    end if;
    key := salon || ':' || n;
    if key = any(seen_numbers) then return false; end if;
    seen_numbers := array_append(seen_numbers,key);
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.is_valid_staff_floorplan(jsonb, boolean) from public;
grant execute on function public.is_valid_staff_floorplan(jsonb, boolean) to authenticated;

create table if not exists public.staff_floorplans (
  id text primary key,
  draft jsonb,
  published jsonb,
  revision integer not null default 0,
  updated_at timestamptz,
  updated_by uuid references auth.users(id),
  constraint staff_floorplans_single check (id = 'principal'),
  constraint staff_floorplans_draft_valid
    check (public.is_valid_staff_floorplan(draft, published is not null)),
  constraint staff_floorplans_published_valid
    check (published is null or public.is_valid_staff_floorplan(published, true))
);

alter table public.staff_floorplans enable row level security;
revoke all on public.staff_floorplans from anon;
grant select, update on public.staff_floorplans to authenticated;
grant all on public.staff_floorplans to service_role;

create policy "staff_floorplans_read" on public.staff_floorplans
for select to authenticated
using ((select auth.uid()) is not null);

create policy "staff_floorplans_update_managers" on public.staff_floorplans
for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role in ('admin','manager','supervisor')
))
with check (exists (
  select 1 from public.profiles p
  where p.id = (select auth.uid()) and p.role in ('admin','manager','supervisor')
));

insert into public.staff_floorplans(id,draft,published,revision)
values ('principal',null,null,0)
on conflict (id) do nothing;
