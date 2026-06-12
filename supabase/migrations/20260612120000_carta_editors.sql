-- Carta: editores delegados (staff con permiso de editar carta sin ser supervisor)
-- Patrón alineado con tip_pool_editors.

begin;

-- Helper RBAC (idempotente; incluye supervisor como en migraciones posteriores)
create or replace function public.is_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) in ('manager', 'admin', 'supervisor'),
    false
  );
$$;

-- 1) Tabla carta_editors
create table if not exists public.carta_editors (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.carta_editors is
  'Usuarios staff autorizados a editar la carta (productos, categorías, fotos) sin rol supervisor.';

alter table public.carta_editors enable row level security;

drop policy if exists "carta_editors_select_own" on public.carta_editors;
create policy "carta_editors_select_own"
  on public.carta_editors
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "carta_editors_mutate_managers" on public.carta_editors;
create policy "carta_editors_mutate_managers"
  on public.carta_editors
  for all
  to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

-- 2) Helper: manager/admin/supervisor O carta_editors
create or replace function public.can_manage_carta()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.is_manager_or_admin()
    or exists (
      select 1
      from public.carta_editors e
      where e.user_id = auth.uid()
    ),
    false
  );
$$;

comment on function public.can_manage_carta() is
  'True si el usuario puede editar carta: manager/admin/supervisor o fila en carta_editors.';

-- 3) RLS carta: digital_menu_overrides
drop policy if exists "Managers manage digital_menu_overrides" on public.digital_menu_overrides;
create policy "Managers manage digital_menu_overrides"
  on public.digital_menu_overrides
  for all
  to authenticated
  using (public.can_manage_carta())
  with check (public.can_manage_carta());

-- 4) RLS carta: menu_category_overrides
drop policy if exists "Managers manage menu_category_overrides" on public.menu_category_overrides;
create policy "Managers manage menu_category_overrides"
  on public.menu_category_overrides
  for all
  to authenticated
  using (public.can_manage_carta())
  with check (public.can_manage_carta());

-- 5) RLS carta: carta_ui_labels
drop policy if exists "Managers manage carta_ui_labels" on public.carta_ui_labels;
create policy "Managers manage carta_ui_labels"
  on public.carta_ui_labels
  for all
  to authenticated
  using (public.can_manage_carta())
  with check (public.can_manage_carta());

-- 6) RLS carta: categories (menú: portadas y orden)
drop policy if exists "categories_update_managers_menu" on public.categories;
create policy "categories_update_managers_menu"
  on public.categories
  for update
  to authenticated
  using (scope = 'menu' and public.can_manage_carta())
  with check (scope = 'menu' and public.can_manage_carta());

-- 7) Storage carta_items: subida/edición por editores delegados
drop policy if exists "carta_items_managers_insert" on storage.objects;
create policy "carta_items_managers_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'carta_items'
  and public.can_manage_carta()
);

drop policy if exists "carta_items_managers_update" on storage.objects;
create policy "carta_items_managers_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'carta_items'
  and public.can_manage_carta()
)
with check (
  bucket_id = 'carta_items'
  and public.can_manage_carta()
);

drop policy if exists "carta_items_managers_delete" on storage.objects;
create policy "carta_items_managers_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'carta_items'
  and public.can_manage_carta()
);

-- 8) Willy: editor de carta
insert into public.carta_editors (user_id)
values ('2a45bdcd-8850-4dc2-bd1e-50be0196106c'::uuid)
on conflict (user_id) do nothing;

notify pgrst, 'reload schema';

commit;
