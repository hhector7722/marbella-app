'use client';

import { Suspense, type ReactNode } from 'react';
import { NavigationProvider } from '@/lib/navigation/navigation-context';

function NavigationProviderFallback({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<NavigationProviderFallback>{children}</NavigationProviderFallback>}>
      <NavigationProvider>{children}</NavigationProvider>
    </Suspense>
  );
}
