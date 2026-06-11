/** Textos del modal de activación push — revisar aquí antes de desplegar. */

/** Vista previa forzada para este email (poner FORCE_PREVIEW en false antes de producción). */
export const PUSH_PROMPT_PREVIEW_EMAIL = 'hhector7722@gmail.com' as const
export const PUSH_PROMPT_FORCE_PREVIEW = true

export const PUSH_PROMPT_COPY = {
  title: 'Activa las notificaciones',
  lead: 'Al activar las notificaciones recibirás avisos en tiempo real cuando se publiquen horarios, propinas, nóminas, comunicados de la empresa, etc.',
  activateLabel: 'Activar notificaciones',
  dismissLabel: 'Ahora no',
  deniedHint:
    'Tienes las notificaciones bloqueadas en el navegador. Actívalas en Ajustes del dispositivo o del navegador.',
  successToast: 'Notificaciones activadas',
} as const
