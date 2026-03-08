-- Permitir a cualquier usuario autenticado leer los turnos publicados.
-- Así el personal puede ver la tabla completa (todos los empleados) los días que tiene turno.
-- Las políticas SELECT se combinan con OR: se mantiene la que limita edición/lectura propia a user_id = auth.uid().

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read published shifts" ON public.shifts;
CREATE POLICY "Authenticated can read published shifts"
ON public.shifts
FOR SELECT
TO authenticated
USING (is_published = true);
