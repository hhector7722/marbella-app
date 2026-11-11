/** Tipo de dispositivo inferido del User-Agent de la solicitud, sin identificar al usuario. */
export type UsageDeviceType = 'smartphone' | 'tablet' | 'desktop';

export function usageDeviceFromUserAgent(userAgent: string | null): UsageDeviceType | null {
  if (!userAgent) return null;

  if (/iPad|Tablet|Kindle|Silk/i.test(userAgent) || (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent))) {
    return 'tablet';
  }

  if (/iPhone|iPod|Windows Phone|Android.*Mobile|Mobile.*Android/i.test(userAgent)) {
    return 'smartphone';
  }

  if (/Windows|Macintosh|Linux|X11|CrOS/i.test(userAgent)) {
    return 'desktop';
  }

  return null;
}

export function usageDeviceFromMetadata(metadata: Record<string, unknown> | null | undefined): UsageDeviceType | null {
  const type = metadata?.deviceType;
  return type === 'smartphone' || type === 'tablet' || type === 'desktop' ? type : null;
}
