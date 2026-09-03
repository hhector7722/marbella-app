-- Corrección: schedule_day_notes necesita GRANT explícito a authenticated.
-- Las políticas RLS existen, pero sin privilegio de tabla el INSERT/UPDATE
-- cae con "permission denied" (patrón del resto del esquema, p. ej. event_orders).

begin;

grant select, insert, update, delete on public.schedule_day_notes to authenticated;

notify pgrst, 'reload schema';

commit;