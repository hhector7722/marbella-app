import type { MenuBoardMode } from './types';

/** Acepta «5,20» y «5.20». Vacío es null. */
export function parseEuroInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s/g, '').replace('€', '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
}

export function formatMenuPrice(value: number, mode: MenuBoardMode): string {
  const cents = Math.round(value * 100);
  const euros = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, '0');
  if (mode === 'en') return `€${euros}.${frac}`;
  return `${euros},${frac} €`;
}

export function formatMenuAmount(value: number, mode: MenuBoardMode): string {
  const cents = Math.round(value * 100);
  const euros = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, '0');
  if (mode === 'en') return `${euros}.${frac}`;
  return `${euros},${frac}`;
}
