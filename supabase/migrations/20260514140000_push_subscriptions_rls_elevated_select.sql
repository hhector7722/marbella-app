-- Permitir que supervisor y admin lean todas las suscripciones push (igual que manager).
-- Antes solo `role = 'manager'` podía hacer SELECT de todas las filas; un supervisor
-- que enviaba avisos de horario solo veía su propia suscripción vía RLS → el resto
-- del equipo no recibía push aunque tuvieran permiso en el navegador.

DROP POLICY IF EXISTS "Managers can view all subscriptions" ON public.push_subscriptions;

CREATE POLICY "Elevated roles can view all push subscriptions"
    ON public.push_subscriptions FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('manager', 'admin', 'supervisor')
        )
    );
