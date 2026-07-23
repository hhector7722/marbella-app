/** Emails autorizados a descargar vales de bebida desde /propuestas. */
export const PROPUESTAS_VALES_DOWNLOAD_EMAILS = [
  "hhector7722@gmail.com",
  "fogotorrat@gmail.com",
] as const;

export function canDownloadPropuestasVales(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return PROPUESTAS_VALES_DOWNLOAD_EMAILS.some((allowed) => allowed === normalized);
}
