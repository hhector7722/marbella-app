-- Supervisor: alcance propio (carta y recetas), sin documentos ajenos,
-- sin guardar horarios ni notas de otros, sin coste laboral en copiloto.
-- Willy deja de ser editor delegado y pasa a supervisor.

begin;

-- 1) Carta: solo manager/admin/supervisor. carta_editors deja de conceder.
create or replace function public.can_manage_carta()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.is_manager_or_admin(), false);
$$;

comment on function public.can_manage_carta() is
  'True si el usuario puede editar carta: manager, admin o supervisor.';

comment on table public.carta_editors is
  'Residual. Ya no concede edición de carta. El alcance vive en el rol.';

delete from public.carta_editors
where user_id = '2a45bdcd-8850-4dc2-bd1e-50be0196106c';

update public.profiles
set role = 'supervisor',
    is_supervisor = true
where id = '2a45bdcd-8850-4dc2-bd1e-50be0196106c'
  and first_name = 'Willy';

-- 2) Notas de horario: cada persona la suya; manager/admin, las de cualquiera.
drop policy if exists "schedule_day_notes_select" on public.schedule_day_notes;
create policy "schedule_day_notes_select"
  on public.schedule_day_notes
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (select role from public.profiles where id = auth.uid()) in ('manager', 'admin')
  );

drop policy if exists "schedule_day_notes_insert" on public.schedule_day_notes;
create policy "schedule_day_notes_insert"
  on public.schedule_day_notes
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or (select role from public.profiles where id = auth.uid()) in ('manager', 'admin')
  );

drop policy if exists "schedule_day_notes_update" on public.schedule_day_notes;
create policy "schedule_day_notes_update"
  on public.schedule_day_notes
  for update
  to authenticated
  using (
    user_id = auth.uid()
    or (select role from public.profiles where id = auth.uid()) in ('manager', 'admin')
  )
  with check (
    user_id = auth.uid()
    or (select role from public.profiles where id = auth.uid()) in ('manager', 'admin')
  );

drop policy if exists "schedule_day_notes_delete" on public.schedule_day_notes;
create policy "schedule_day_notes_delete"
  on public.schedule_day_notes
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or (select role from public.profiles where id = auth.uid()) in ('manager', 'admin')
  );

-- 3) Documentos personales: supervisor no lee los de otros.
drop policy if exists "managers_all_documents" on public.employee_documents;
drop policy if exists "employee_docs_table_managers_all" on public.employee_documents;
create policy "employee_docs_table_managers_all"
on public.employee_documents for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('manager', 'admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('manager', 'admin')
  )
);

drop policy if exists "nominas_table_managers_all" on public.nominas;
create policy "nominas_table_managers_all"
on public.nominas for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('manager', 'admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('manager', 'admin')
  )
);

drop policy if exists "employee_docs_managers_insert" on storage.objects;
create policy "employee_docs_managers_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'employee-documents'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('manager', 'admin')
  )
);

drop policy if exists "employee_docs_managers_read_all" on storage.objects;
create policy "employee_docs_managers_read_all"
on storage.objects for select
to authenticated
using (
  bucket_id = 'employee-documents'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('manager', 'admin')
  )
);

drop policy if exists "employee_docs_managers_delete" on storage.objects;
create policy "employee_docs_managers_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'employee-documents'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('manager', 'admin')
  )
);

drop policy if exists "nominas_managers_read_all" on storage.objects;
create policy "nominas_managers_read_all"
on storage.objects for select
to authenticated
using (
  bucket_id = 'nominas'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('manager', 'admin')
  )
);

drop policy if exists "employees_view_own_nominas" on storage.objects;
create policy "employees_view_own_nominas"
on storage.objects for select
to authenticated
using (
  bucket_id = 'nominas'
  and (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('manager', 'admin')
    )
    or name like (
      (select profiles.codigo_empleado from public.profiles where profiles.id = auth.uid()) || '/%'
    )
  )
);

-- 4) Avisos de horario: solo manager/admin.
drop policy if exists "Elevated roles can view all push subscriptions" on public.push_subscriptions;
create policy "Elevated roles can view all push subscriptions"
  on public.push_subscriptions for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('manager', 'admin')
    )
  );

create or replace function public.create_user_notifications_bulk(
  p_user_ids uuid[],
  p_type text,
  p_title text,
  p_body text,
  p_action_url text,
  p_entity_type text default null,
  p_entity_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_count integer;
begin
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return 0;
  end if;

  select role into v_caller_role
  from public.profiles
  where id = auth.uid();

  if v_caller_role is null then
    raise exception 'not_authenticated';
  end if;

  if v_caller_role not in ('manager', 'admin') then
    raise exception 'forbidden';
  end if;

  insert into public.user_notifications (
    user_id, type, title, body, action_url, entity_type, entity_id
  )
  select
    uid,
    p_type,
    p_title,
    nullif(trim(both from coalesce(p_body, '')), ''),
    p_action_url,
    p_entity_type,
    p_entity_id
  from unnest(p_user_ids) as uid
  where uid is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 5) Copiloto: supervisor no consulta coste laboral.
create or replace function public.consultar_costes_mano_obra(p_fecha_inicio date, p_fecha_fin date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r text := public.current_employee_role();
  d date;
  v_user record;
  v_day_fixed numeric;
  v_day_ot numeric;
  v_total numeric := 0;
begin
  if r is null or r not in ('manager','admin','chef') then
    return jsonb_build_object('error', 'forbidden', 'detail', 'solo_gerencia_o_cocina');
  end if;

  if p_fecha_fin < p_fecha_inicio then
    return jsonb_build_object('error', 'rango_invalido');
  end if;

  d := p_fecha_inicio;
  while d <= p_fecha_fin loop
    v_day_fixed := 0;
    v_day_ot := 0;

    for v_user in
      select p.id as uid
      from public.profiles as p
      where coalesce(p.joining_date, date '2000-01-01') <= d
    loop
      v_day_fixed := v_day_fixed + public.fn_labor_fixed_day_for_user(v_user.uid, d);
      v_day_ot := v_day_ot + coalesce(public.fn_labor_overtime_allocated_day(v_user.uid, d), 0);
    end loop;

    v_total := v_total + round(v_day_fixed + v_day_ot, 2);
    d := d + 1;
  end loop;

  return jsonb_build_object(
    'fecha_inicio', p_fecha_inicio,
    'fecha_fin', p_fecha_fin,
    'coste_total', round(v_total, 2)
  );
end;
$$;

notify pgrst, 'reload schema';

commit;
