-- Corrección: el master en modo «ver como» simula al empleado y escribe la nota
-- del horario con user_id = empleado visto, pero las políticas de escritura
-- exigían user_id = auth.uid() (el master real), con lo que INSERT/UPDATE/DELETE
-- caían con "new row violates row-level security policy" (42501).
-- Se extienden las políticas de escritura igual que la de SELECT:
-- quien puede leer todas las notas del día (manager/supervisor/admin) también
-- puede escribirlas. El staff sigue pudiendo escribir solo la suya.

begin;

drop policy if exists "schedule_day_notes_insert" on public.schedule_day_notes;
create policy "schedule_day_notes_insert"
  on public.schedule_day_notes
  for insert
  to authenticated
  with check (user_id = auth.uid() or public.is_manager_or_admin());

drop policy if exists "schedule_day_notes_update" on public.schedule_day_notes;
create policy "schedule_day_notes_update"
  on public.schedule_day_notes
  for update
  to authenticated
  using (user_id = auth.uid() or public.is_manager_or_admin())
  with check (user_id = auth.uid() or public.is_manager_or_admin());

drop policy if exists "schedule_day_notes_delete" on public.schedule_day_notes;
create policy "schedule_day_notes_delete"
  on public.schedule_day_notes
  for delete
  to authenticated
  using (user_id = auth.uid() or public.is_manager_or_admin());

notify pgrst, 'reload schema';

commit;