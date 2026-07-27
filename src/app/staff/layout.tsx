'use client'

import { usePathname } from 'next/navigation'
import { Toaster } from 'sonner'
import StaffBottomNav from '@/components/StaffBottomNav'
import { isV2ShellPath } from '@/lib/v2-shell-path'

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  /** Carta staff: pantalla completa como `/carta` (sin barra inferior ni padding extra). */
  const isStaffCartaFullscreen = pathname === '/staff/carta'
  /** Mismo shell que `/dashboard` y `/master/dashboard` (padding en `MainWrapper`, sin wrapper extra). */
  const isStaffDashboard = pathname === '/staff/dashboard'
  /** Rutas Staff en AppShell V2: sin BottomNav legacy ni padding extra (espejo Dashboard). */
  const isStaffV2 = isV2ShellPath(pathname)
  const skipStaffChromePad =
    isStaffDashboard || isStaffCartaFullscreen || isStaffV2

  return (
    <>
      <Toaster position="top-center" richColors />
      {skipStaffChromePad ? (
        children
      ) : (
        <div className="pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-[calc(4rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      )}
      {!isStaffCartaFullscreen && !isStaffV2 ? <StaffBottomNav /> : null}
    </>
  )
}
