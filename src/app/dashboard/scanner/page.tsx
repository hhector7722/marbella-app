import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { ScannerClient } from './ScannerClient'

export const dynamic = 'force-static'

export default function ScannerPage() {
  return (
    <DashboardDetailLayout
      title="Escáner"
      subtitle="Captura el albarán: se optimiza la imagen y se procesa con IA"
      maxWidthClass="max-w-lg"
    >
      <ScannerClient />
    </DashboardDetailLayout>
  )
}
