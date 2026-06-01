-- Habilitar Realtime en reservas para que /staff/reservas reciba INSERT/UPDATE de la web.
ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;
