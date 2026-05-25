'use client';

import type { ReactNode } from 'react';
import { NavigationProvider } from '@/lib/navigation/navigation-context';

export function AppProviders({ children }: { children: ReactNode }) {
  return <NavigationProvider>{children}</NavigationProvider>;
}
