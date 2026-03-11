-- RLS para notificaciones push: managers deben poder leer todas las suscripciones
-- para enviar alertas de horario; cualquier autenticado puede leer suscripciones de managers (cierre de caja).

DROP POLICY IF EXISTS "Managers can view all subscriptions" ON public.push_subscriptions;
CREATE POLICY "Managers can view all subscriptions"
    ON public.push_subscriptions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'manager'));

DROP POLICY IF EXISTS "Anyone can view manager subscriptions" ON public.push_subscriptions;
CREATE POLICY "Anyone can view manager subscriptions"
    ON public.push_subscriptions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = push_subscriptions.user_id AND role = 'manager'));
