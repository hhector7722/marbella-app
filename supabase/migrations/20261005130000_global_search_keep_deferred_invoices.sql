-- Conserva la búsqueda ligera: los albaranes se consultan solo al solicitarlo.
create or replace function public.global_search_records(p_query text, p_effective_user_id uuid default null)
returns table(kind text, entity_id text, title text, subtitle text, line_id text, score numeric)
language sql stable security invoker
set search_path = 'public', 'extensions'
as $$
  with actor as (
    select (select auth.uid()) uid,
      lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'hhector7722@gmail.com' is_master
  ), effective as (
    select case when actor.is_master and p_effective_user_id is not null then p_effective_user_id else actor.uid end uid,
      actor.is_master and (p_effective_user_id is null or p_effective_user_id = actor.uid) is_master
    from actor where actor.uid is not null
  ), access as (
    select effective.uid, (effective.is_master or p.role in ('manager', 'admin')) can_manage
    from effective left join public.profiles p on p.id = effective.uid
    where p.id is not null or effective.is_master
  ), candidates as (
    select 'ingredient'::text kind, i.id::text entity_id, i.name::text title,
      coalesce(i.supplier, i.category, 'Ingrediente')::text subtitle, null::text line_id,
      greatest(public.global_search_score(p_query, i.name), public.global_search_score(p_query, i.category) * 0.6, public.global_search_score(p_query, i.supplier) * 0.5) score
    from public.ingredients i cross join access where i.archived_at is null
    union all
    select 'recipe', r.id::text, r.name::text, coalesce(r.category, 'Receta')::text, null::text, public.global_search_score(p_query, r.name)
    from public.recipes r cross join access
    union all
    select 'supplier', s.id::text, s.name, coalesce(s.category, 'Proveedor'), null::text, public.global_search_score(p_query, s.name)
    from public.suppliers s cross join access
    union all
    select 'employee', p.id::text, trim(concat_ws(' ', p.first_name, p.last_name)), 'Plantilla'::text, null::text,
      public.global_search_score(p_query, concat_ws(' ', p.first_name, p.last_name))
    from public.profiles p cross join access a
    where a.can_manage and p.visible_in_plantilla is distinct from false and public.global_search_fold(p.first_name) not in ('ramon', 'empleado')
  ), ranked as (
    select distinct on (kind, entity_id) kind, entity_id, title, subtitle, line_id, score
    from candidates where score > 0 order by kind, entity_id, score desc, line_id nulls last
  )
  select kind, entity_id, title, subtitle, line_id, score from ranked order by score desc, title limit 10
$$;
