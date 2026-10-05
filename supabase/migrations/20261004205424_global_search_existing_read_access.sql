-- Proveedores y albaranes ya son consultables por staff en las pantallas existentes.
-- La búsqueda usa ese mismo alcance; RLS sigue filtrando las filas accesibles.
create or replace function public.global_search_records(p_query text, p_effective_user_id uuid default null)
returns table(kind text, entity_id text, title text, subtitle text, line_id text, score numeric)
language sql
stable
security invoker
set search_path = 'public', 'extensions'
as $$
  with actor as (
    select (select auth.uid()) uid,
      lower(coalesce((select auth.jwt() ->> 'email'), '')) = 'hhector7722@gmail.com' is_master
  ),
  effective as (
    select case
        when actor.is_master and p_effective_user_id is not null then p_effective_user_id
        else actor.uid
      end uid,
      actor.is_master and (p_effective_user_id is null or p_effective_user_id = actor.uid) is_master
    from actor
    where actor.uid is not null
  ),
  access as (
    select effective.uid, (effective.is_master or p.role in ('manager', 'admin')) can_manage
    from effective
    left join public.profiles p on p.id = effective.uid
    where p.id is not null or effective.is_master
  ),
  candidates as (
    select 'ingredient'::text kind, i.id::text entity_id, i.name::text title,
      coalesce(i.supplier, i.category, 'Ingrediente')::text subtitle,
      null::text line_id,
      greatest(public.global_search_score(p_query, i.name),
        public.global_search_score(p_query, i.category) * 0.6,
        public.global_search_score(p_query, i.supplier) * 0.5) score
    from public.ingredients i cross join access a
    where a.can_manage and i.archived_at is null

    union all
    select 'recipe', r.id::text, r.name::text, coalesce(r.category, 'Receta')::text,
      null::text, public.global_search_score(p_query, r.name)
    from public.recipes r cross join access

    union all
    select 'supplier', s.id::text, s.name, coalesce(s.category, 'Proveedor'),
      null::text, public.global_search_score(p_query, s.name)
    from public.suppliers s cross join access

    union all
    select 'employee', p.id::text,
      trim(concat_ws(' ', p.first_name, p.last_name)),
      'Plantilla'::text, null::text,
      public.global_search_score(p_query, concat_ws(' ', p.first_name, p.last_name))
    from public.profiles p cross join access a
    where a.can_manage and p.visible_in_plantilla is distinct from false
      and public.global_search_fold(p.first_name) not in ('ramon', 'empleado')

    union all
    select 'invoice', pi.id::text,
      concat(coalesce(s.name, 'Albarán'), ' · ',
        coalesce(to_char(pi.invoice_date, 'DD/MM/YYYY'), pi.invoice_number, 'Sin fecha')),
      coalesce(pi.invoice_number, 'Albarán'), null::text,
      greatest(public.global_search_score(p_query, pi.invoice_number),
        public.global_search_score(p_query, s.name) * 0.85,
        case when p_query ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
          then public.global_search_score(p_query, to_char(pi.invoice_date, 'DD/MM/YYYY')) else 0 end)
    from public.purchase_invoices pi
    left join public.suppliers s on s.id = pi.supplier_id
    cross join access

    union all
    select 'invoice', pi.id::text,
      concat(coalesce(s.name, 'Albarán'), ' · ',
        coalesce(to_char(pi.invoice_date, 'DD/MM/YYYY'), pi.invoice_number, 'Sin fecha')),
      pil.original_name, pil.id::text,
      public.global_search_score(p_query, pil.original_name)
    from public.purchase_invoice_lines pil
    join public.purchase_invoices pi on pi.id = pil.invoice_id
    left join public.suppliers s on s.id = pi.supplier_id
    cross join access
    where pil.superseded_by_extraction_id is null

    union all
    select 'reservation', r.id::text, r.customer_name,
      to_char(r.reservation_date, 'DD/MM/YYYY'), null::text,
      greatest(public.global_search_score(p_query, r.customer_name),
        public.global_search_score(p_query, r.customer_phone))
    from public.reservations r cross join access
  ),
  ranked as (
    select distinct on (kind, entity_id) kind, entity_id, title, subtitle, line_id, score
    from candidates
    where score > 0
    order by kind, entity_id, score desc, line_id nulls last
  )
  select kind, entity_id, title, subtitle, line_id, score
  from ranked
  order by score desc, title
  limit 10
$$;
