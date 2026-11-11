import { Monitor, Smartphone, Tablet } from 'lucide-react';
import type { UsageDeviceType } from '@/lib/usage/device';

export function UsageDeviceIcon({ deviceType }: { deviceType: UsageDeviceType | null }) {
  if (!deviceType) return null;

  const Icon = deviceType === 'smartphone' ? Smartphone : deviceType === 'tablet' ? Tablet : Monitor;
  const label = deviceType === 'smartphone' ? 'Smartphone' : deviceType === 'tablet' ? 'Tableta' : 'Ordenador';

  return <Icon className="size-4 shrink-0 text-zinc-500" strokeWidth={1.8} role="img" aria-label={label} />;
}
