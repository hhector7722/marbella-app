-- RLS: Permitir a staff y supervisor leer tickets_marbella para autocompletar ventas/tickets en cierres de caja
-- Sin esta política, solo managers pueden SELECT; el modal de cierre queda vacío para el personal.
-- Managers siguen teniendo acceso completo vía Manager_Full_Access_Tickets.

CREATE POLICY "Staff_Read_Tickets_For_Closing" ON "public"."tickets_marbella"
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM "public"."profiles"
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('manager', 'staff', 'supervisor')
        )
    );
