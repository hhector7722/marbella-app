-- Expediente de alta laboral. El candidato no tiene sesión: el servidor
-- escribe con service role tras validar el hash del token.
-- Sin GRANT a anon. RLS activo y sin políticas para authenticated:
-- nadie consulta esta tabla desde el cliente.

begin;

create table public.employment_intakes (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  status text not null default 'pending_candidate',
  expires_at timestamptz not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  applied_at timestamptz,
  revoked_at timestamptz,

  first_name text,
  last_name text,
  dni text,
  afiliacion_seguridad_social text,
  nacionalidad text,
  fecha_nacimiento date,
  domicilio text,
  phone text,
  email text,
  bank_account text,
  dni_front_storage_path text,
  dni_back_storage_path text,

  categoria text,
  tipo_contrato text,
  weekly_hours numeric check (weekly_hours is null or weekly_hours >= 0),
  fecha_inicio date,
  fecha_fin date,

  profile_id uuid references public.profiles (id) on delete set null,

  constraint employment_intakes_status_chk check (
    status in (
      'pending_candidate',
      'submitted',
      'completed',
      'applied',
      'expired',
      'revoked'
    )
  ),
  constraint employment_intakes_dates_chk check (
    fecha_fin is null or fecha_inicio is null or fecha_fin >= fecha_inicio
  )
);

create index employment_intakes_status_created_idx
  on public.employment_intakes (status, created_at desc);

comment on table public.employment_intakes is
  'Expediente de alta laboral. Una persona, un token hasheado. Sin acceso anon.';

alter table public.employment_intakes enable row level security;

revoke all on table public.employment_intakes from public;
revoke all on table public.employment_intakes from anon;
revoke all on table public.employment_intakes from authenticated;
grant all on table public.employment_intakes to postgres;
grant all on table public.employment_intakes to service_role;

notify pgrst, 'reload schema';

commit;
