/**
 * Política única de visibilidad de cámaras para la cabecera y el servidor.
 * El rol efectivo procede siempre del perfil validado en Supabase.
 */
export function canAccessCamerasForRole(role: string | null | undefined): boolean {
  return role === 'manager' || role === 'admin';
}

const HECTOR_CAMERA_EMAIL = 'hhector7722@gmail.com';

/** El indicador de espectadores (verde) es exclusivo del propietario. */
export function canUseCameraPresenceIndicator(
  role: string | null | undefined,
  effectiveEmail: string | null | undefined,
): boolean {
  return canAccessCamerasForRole(role)
    && String(effectiveEmail ?? '').trim().toLowerCase() === HECTOR_CAMERA_EMAIL;
}
