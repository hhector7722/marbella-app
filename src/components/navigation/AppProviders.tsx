'use client';

import type { ReactNode } from 'react';
import { NavigationProvider } from '@/lib/navigation/navigation-context';
import { ModalLockProvider } from '@/lib/modal-lock/modal-lock-context';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ModalLockProvider>
      <NavigationProvider>{children}</NavigationProvider>
    </ModalLockProvider>
  );
}
