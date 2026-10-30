-- Un mensaje no confirmado por destinatario: un fichaje posterior no basta
-- para liberar el siguiente envío; es imprescindible pulsar "Entendido".
-- Índice único parcial: evita condiciones de carrera entre sesiones.
-- Histórico de mensajes confirmados permanece intacto.
CREATE UNIQUE INDEX IF NOT EXISTS staff_clock_messages_one_pending_per_recipient
ON public.staff_clock_messages (recipient_id)
WHERE acknowledged_at IS NULL;
