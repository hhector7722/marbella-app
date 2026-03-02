-- Políticas RLS para Mutación Destructiva (Update & Delete)
-- REGLA: Validación estricta mediante JWT Claims para rol manager

-- 1. Política para UPDATE
CREATE POLICY "Managers can update ledger" ON public.manager_ledger
FOR UPDATE TO authenticated
USING ( (auth.jwt() ->> 'role')::text = 'manager' )
WITH CHECK ( (auth.jwt() ->> 'role')::text = 'manager' );

-- 2. Política para DELETE
CREATE POLICY "Managers can delete from ledger" ON public.manager_ledger
FOR DELETE TO authenticated
USING ( (auth.jwt() ->> 'role')::text = 'manager' );
