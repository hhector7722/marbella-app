create table public.bdp_handy_jobs (
 id uuid primary key default gen_random_uuid(),
 request_key uuid not null unique,
 created_by uuid not null references auth.users(id),
 table_number integer not null check(table_number between 1 and 9999),
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 20),
 status text not null default 'queued' check(status in ('queued','executing','confirmed','rejected','uncertain','expired')),
 created_at timestamptz not null default now(),
 claimed_at timestamptz,
 finished_at timestamptz,
 result jsonb
);
alter table public.bdp_handy_jobs enable row level security;
revoke all on public.bdp_handy_jobs from public,anon,authenticated;
grant select,insert,update on public.bdp_handy_jobs to service_role;
create unique index bdp_handy_single_active on public.bdp_handy_jobs ((true)) where status in ('queued','executing','uncertain');
create table public.bdp_handy_agent_state (
 id boolean primary key default true check(id),
 checked_at timestamptz not null default now(),
 ready boolean not null default false,
 detail text not null default ''
);
alter table public.bdp_handy_agent_state enable row level security;
revoke all on public.bdp_handy_agent_state from public,anon,authenticated;
grant select,insert,update on public.bdp_handy_agent_state to service_role;
comment on table public.bdp_handy_jobs is 'Private serialized queue for official Handy Android. Uncertain operations block further jobs; never auto-retry.';
comment on table public.bdp_handy_agent_state is 'Readiness reported by the signed, dedicated TPV1 agent.';
create function public.bdp_handy_claim() returns setof public.bdp_handy_jobs
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 perform pg_advisory_xact_lock(182771261);
 update public.bdp_handy_jobs set status='expired', finished_at=now() where status='queued' and created_at < now()-interval '60 seconds';
 if exists(select 1 from public.bdp_handy_jobs where status in ('executing','uncertain')) then return; end if;
 return query update public.bdp_handy_jobs j set status='executing',claimed_at=now()
 where j.id=(select id from public.bdp_handy_jobs where status='queued' order by created_at limit 1 for update skip locked) and j.status='queued' returning j.*;
end $$;
revoke all on function public.bdp_handy_claim() from public,anon,authenticated;
grant execute on function public.bdp_handy_claim() to service_role;