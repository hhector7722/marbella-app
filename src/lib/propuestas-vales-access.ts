/** Email autorizado a descargar vales de bebida desde /propuestas. */
export const PROPUESTAS_VALES_DOWNLOAD_EMAIL = "hhector7722@gmail.com";

export function canDownloadPropuestasVales(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === PROPUESTAS_VALES_DOWNLOAD_EMAIL;
}
