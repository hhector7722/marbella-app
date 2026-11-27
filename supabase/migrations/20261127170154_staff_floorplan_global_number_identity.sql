-- Un número identifica una mesa en todo el plano, sin depender del salón.
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
      or coalesce(t->>'id','') !~ '^[A-Za-z0-9_-]{1,64}$'
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

    b := jsonb_typeof(t->'number');
    if b is null or b = 'null' then
      if require_complete then return false; end if;
      continue;
    end if;
    if b <> 'number' then return false; end if;
    n := t->>'number';
    if n !~ '^[0-9]{1,4}$' or n::integer not between 1 and 9999 then
      return false;
    end if;
    key := n;
    if key = any(seen_numbers) then return false; end if;
    seen_numbers := array_append(seen_numbers,key);
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

-- Revalidar el estado existente sin modificar numeraciones ni geometría.
do $$ begin
  if exists (select 1 from public.staff_floorplans where not public.is_valid_staff_floorplan(draft, published is not null) or (published is not null and not public.is_valid_staff_floorplan(published,true))) then
    raise exception 'Existe un plano que no cumple la unicidad global';
  end if;
end $$;
