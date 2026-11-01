-- Revocar privilegios no sujetos a Row Level Security (TRUNCATE, REFERENCES, TRIGGER).
-- Política única de correo autenticado y permisos CRUD mínimos.
REVOKE ALL PRIVILEGES ON TABLE public.replenishment_fridges FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.replenishment_slots FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.replenishment_fridges TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.replenishment_slots TO authenticated;
