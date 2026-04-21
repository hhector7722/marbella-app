import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { ScannerClient } from './ScannerClient'

export const dynamic = 'force-static'

export default function ScannerPage() {
  return (
    <DashboardDetailLayout
      title="Escáner"
      maxWidthClass="max-w-lg"
      showBackButton={false}
    >
      <ScannerClient />
    </DashboardDetailLayout>
  )
}
