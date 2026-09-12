-- Aviso puntual del campo de visión de la cámara de seguridad.
-- NULL = pendiente. Solo se escribe al confirmar con éxito un fichaje de entrada.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS camera_fov_notice_acked_at timestamptz NULL;

COMMENT ON COLUMN public.profiles.camera_fov_notice_acked_at IS
    'Instante en que la persona confirmó su primera entrada viendo el aviso del campo de visión de la cámara. NULL = aviso pendiente. Cancelar no escribe.';
