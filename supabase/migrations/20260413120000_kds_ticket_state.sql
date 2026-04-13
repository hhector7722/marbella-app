-- KDS: estado manual por ticket + reapertura solo con artículos nuevos
-- (2026-04-13)

-- Fuente de verdad del estado de cocina por `id_ticket`.
-- La UI marca "Finalizada" / "Pendiente" por ticket, y solo reabre automáticamente
-- cuando entran nuevas líneas posteriores a `manual_completed_at`.

create table if not exists public.kds_ticket_state (
  id_ticket text primary key,
  kitchen_state text not null check (kitchen_state in ('activa', 'completada')),
  manual_completed_at timestamptz null,
  updated_at timestamptz not null default now()
);

-- Mantener updated_at
create or replace function public.trg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_kds_ticket_state_updated_at on public.kds_ticket_state;
create trigger trg_kds_ticket_state_updated_at
before update on public.kds_ticket_state
for each row execute function public.trg_set_updated_at();

alter table public.kds_ticket_state enable row level security;

-- Lectura: cualquier autenticado (KDS en cocina)
drop policy if exists "kds_ticket_state_select_authenticated" on public.kds_ticket_state;
create policy "kds_ticket_state_select_authenticated"
on public.kds_ticket_state
for select
to authenticated
using (true);

-- Escritura: cualquier autenticado (si queréis RBAC, estrechar aquí)
drop policy if exists "kds_ticket_state_insert_authenticated" on public.kds_ticket_state;
create policy "kds_ticket_state_insert_authenticated"
on public.kds_ticket_state
for insert
to authenticated
with check (true);

drop policy if exists "kds_ticket_state_update_authenticated" on public.kds_ticket_state;
create policy "kds_ticket_state_update_authenticated"
on public.kds_ticket_state
for update
to authenticated
using (true)
with check (true);

-- Grants explícitos (defensa en profundidad)
grant select, insert, update on public.kds_ticket_state to authenticated;

