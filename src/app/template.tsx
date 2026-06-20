'use client';

import { AppPageTransition } from '@/components/navigation/AppPageTransition';

export default function Template({ children }: { children: React.ReactNode }) {
  return <AppPageTransition>{children}</AppPageTransition>;
}
