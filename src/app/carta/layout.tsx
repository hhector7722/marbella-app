import type { ReactNode } from 'react'
import IframeNavBridge from '@/components/IframeNavBridge'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function CartaLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <IframeNavBridge />
      {children}
    </>
  )
}
