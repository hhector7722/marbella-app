/** Acceso temporal de propietario al piloto de reposición visual. */
export const REPLENISHMENT_PILOT_EMAIL = 'hhector7722@gmail.com'

export function isReplenishmentPilotUser(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === REPLENISHMENT_PILOT_EMAIL
}
