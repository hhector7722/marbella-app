'use client';

import { TabSwipeNavigator } from '@/components/navigation/TabSwipeNavigator';

/** Perfil comparte tabs swipeables con `/staff/*` vía bottom nav staff. */
export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="marbella-staff-shell min-h-screen pb-24 md:pb-20">
      <TabSwipeNavigator>{children}</TabSwipeNavigator>
    </div>
  );
}
