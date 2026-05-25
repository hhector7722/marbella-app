export const CLOSING_WEATHER_OPTIONS = [
  { id: 'soleado', label: 'Soleado', icon: '/icons/clima/soleado.png' },
  { id: 'nublado', label: 'Nublado', icon: '/icons/clima/nublado.png' },
  { id: 'lluvioso', label: 'Lluvioso', icon: '/icons/clima/lluvioso.png' },
  { id: 'sol-nubes', label: 'Sol y nubes', icon: '/icons/clima/sol-nubes.png' },
  { id: 'viento', label: 'Viento', icon: '/icons/clima/viento.png' },
  { id: 'sol-lluvia', label: 'Sol y lluvia', icon: '/icons/clima/sol-lluvia.png' },
  { id: 'tormenta', label: 'Tormenta', icon: '/icons/clima/tormenta.png' },
] as const;

export type ClosingWeatherId = (typeof CLOSING_WEATHER_OPTIONS)[number]['id'];

const labelById = new Map<ClosingWeatherId, string>(
  CLOSING_WEATHER_OPTIONS.map((o) => [o.id, o.label]),
);

/** Legacy DB values from old select */
const legacyLabelMap: Record<string, ClosingWeatherId> = {
  Soleado: 'soleado',
  Nublado: 'nublado',
  Lluvia: 'lluvioso',
  Evento: 'tormenta',
};

export function weatherLabelFromId(id: ClosingWeatherId): string {
  return labelById.get(id) ?? id;
}

export function weatherIdFromLabel(label: string | null | undefined): ClosingWeatherId | null {
  if (!label) return null;
  const direct = CLOSING_WEATHER_OPTIONS.find((o) => o.label === label);
  if (direct) return direct.id;
  return legacyLabelMap[label] ?? null;
}
