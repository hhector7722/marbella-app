-- Carta: etiquetas editables Entero / Medio (ES, CA, EN) para precios duales en QR y staff.

begin;

create table if not exists public.carta_ui_labels (
  id text primary key default 'default',
  racion_entero_es text not null default 'Entero',
  racion_entero_ca text not null default 'Sencer',
  racion_entero_en text not null default 'Full',
  racion_medio_es text not null default 'Medio',
  racion_medio_ca text not null default 'Mig',
  racion_medio_en text not null default 'Half',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

comment on table public.carta_ui_labels is
  'Textos globales de la carta QR/staff. Fila id=default.';

insert into public.carta_ui_labels (id)
values ('default')
on conflict (id) do nothing;

drop trigger if exists trigger_carta_ui_labels_updated_at on public.carta_ui_labels;
create trigger trigger_carta_ui_labels_updated_at
before update on public.carta_ui_labels
for each row execute function public.update_updated_at_column();

alter table public.carta_ui_labels enable row level security;

drop policy if exists "Anon can read carta_ui_labels" on public.carta_ui_labels;
create policy "Anon can read carta_ui_labels"
  on public.carta_ui_labels
  for select
  to anon
  using (true);

drop policy if exists "Authenticated can read carta_ui_labels" on public.carta_ui_labels;
create policy "Authenticated can read carta_ui_labels"
  on public.carta_ui_labels
  for select
  to authenticated
  using (true);

drop policy if exists "Managers manage carta_ui_labels" on public.carta_ui_labels;
create policy "Managers manage carta_ui_labels"
  on public.carta_ui_labels
  for all
  to authenticated
  using (public.is_manager_or_admin())
  with check (public.is_manager_or_admin());

grant select on public.carta_ui_labels to anon;
grant select on public.carta_ui_labels to authenticated;

notify pgrst, 'reload schema';

commit;
