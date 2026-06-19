const PATH_LABELS: Record<string, string> = {
  '/': 'Inicio',
  '/carta': 'Carta',
  '/reservas': 'Reservas',
  '/reservas-interno': 'Reservas interno',
  '/ubicacion': 'Ubicación',
  '/aviso-legal': 'Aviso legal',
  '/privacidad': 'Privacidad',
  '/cookies': 'Cookies',
};

export function deriveWebPathLabel(pathname: string, label?: string | null): string {
  if (label?.trim()) return label.trim();
  return PATH_LABELS[pathname] ?? pathname;
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (!ms || ms < 1000) return ' ';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

export function formatNumber(value: number): string {
  if (value === 0) return ' ';
  return new Intl.NumberFormat('es-ES').format(value);
}
