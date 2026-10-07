drop policy if exists "weekly_snapshots_staff_write_own"
  on public.weekly_snapshots;

create policy "weekly_snapshots_staff_write_own"
  on public.weekly_snapshots
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
