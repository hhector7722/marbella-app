create table if not exists public.recipe_kitchen_sheets (
  recipe_id uuid primary key references public.recipes(id) on delete cascade,
  key_points text[] not null default '{}',
  avoid_points text[] not null default '{}',
  step_images jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recipe_kitchen_sheets enable row level security;

create policy "Kitchen sheets master select"
on public.recipe_kitchen_sheets for select to authenticated
using (lower(coalesce((select auth.jwt()->>'email'),'')) = 'hhector7722@gmail.com');

create policy "Kitchen sheets master insert"
on public.recipe_kitchen_sheets for insert to authenticated
with check (lower(coalesce((select auth.jwt()->>'email'),'')) = 'hhector7722@gmail.com');

create policy "Kitchen sheets master update"
on public.recipe_kitchen_sheets for update to authenticated
using (lower(coalesce((select auth.jwt()->>'email'),'')) = 'hhector7722@gmail.com')
with check (lower(coalesce((select auth.jwt()->>'email'),'')) = 'hhector7722@gmail.com');

create policy "Kitchen sheets master delete"
on public.recipe_kitchen_sheets for delete to authenticated
using (lower(coalesce((select auth.jwt()->>'email'),'')) = 'hhector7722@gmail.com');
