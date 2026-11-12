-- Acceso anónimo limitado a la comprobación de duplicados del gateway TPV.
-- Los importes, métodos de pago, horas y demás campos permanecen privados.
-- Las consultas autenticadas mantienen los permisos previos.
REVOKE SELECT ON TABLE public.tickets_marbella FROM anon;
GRANT SELECT (numero_documento, fecha) ON TABLE public.tickets_marbella TO anon;
