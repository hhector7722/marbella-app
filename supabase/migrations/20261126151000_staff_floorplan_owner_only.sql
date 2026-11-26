-- Restringir toda lectura y escritura de planos a la cuenta master verificada.
-- El id proviene de auth.users (usuario principal de Marbella).
drop policy if exists staff_floorplans_read on public.staff_floorplans;
drop policy if exists staff_floorplans_update_managers on public.staff_floorplans;

create policy staff_floorplans_owner_read on public.staff_floorplans
for select to authenticated
using ((select auth.uid()) = 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6'::uuid);

create policy staff_floorplans_owner_update on public.staff_floorplans
for update to authenticated
using ((select auth.uid()) = 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6'::uuid)
with check ((select auth.uid()) = 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6'::uuid);
