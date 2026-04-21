import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { ScannerClient } from './ScannerClient'

export const dynamic = 'force-static'

export default function ScannerPage() {
  return (
    <DashboardDetailLayout
      title="Escáner"
      subtitle="Foto del albarán: comprobación rápida de nitidez, registro y deduplicación si ya existía la misma imagen o el mismo documento"
      maxWidthClass="max-w-lg"
    >
      <ScannerClient />
    </DashboardDetailLayout>
  )
}
