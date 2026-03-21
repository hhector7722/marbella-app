-- ==============================================================================
-- Libro Mayor (manager_ledger): eliminar filas duplicadas exactas
-- Criterio: mismo movement_type, amount, concept y date (timestamptz).
-- Se conserva la fila con id UUID menor; se borran las demás copias.
-- Típico tras ejecutar dos veces el seed 20260327090000_manager_ledger_seed_master_account.sql
-- ==============================================================================

DELETE FROM public.manager_ledger a
USING public.manager_ledger b
WHERE a.id > b.id
  AND a.movement_type = b.movement_type
  AND a.amount = b.amount
  AND a.concept = b.concept
  AND a.date = b.date;
