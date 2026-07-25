import type { Metadata } from 'next'
import { AppShell } from '@/components/layout-v2'
import { demoBreadcrumbs } from '@/components/layout-v2/demo/breadcrumbs'
import { demoNavigation } from '@/components/layout-v2/demo/navigation'
import { AppShellPlaygroundContent } from '@/components/layout-v2/demo/playground-content'
import { demoUser } from '@/components/layout-v2/demo/user'

export const metadata: Metadata = {
  title: 'AppShell Playground · Dev',
  robots: { index: false, follow: false },
}

/**
 * Dev-only visual reference for AppShell V2 + MDS.
 * Not linked from production menus. Fixed overlay so legacy chrome
 * (Navbar / BottomNav from root layout) does not pollute the preview.
 */
export default function AppShellPlaygroundPage() {
  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-mds-background">
      <AppShell
        variant="manager"
        navigation={demoNavigation}
        user={demoUser}
        breadcrumbs={demoBreadcrumbs}
        className="h-full min-h-0"
      >
        <AppShellPlaygroundContent />
      </AppShell>
    </div>
  )
}
