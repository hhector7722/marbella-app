import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { ScannerClient } from './ScannerClient'

export const dynamic = 'force-dynamic'

export default async function ScannerPage({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>
}) {
  const { start } = await searchParams
  return (
    <DashboardDetailLayout
      title="Escáner"
      maxWidthClass="max-w-lg"
      showBackButton={false}
    >
      <ScannerClient autoStart={start === '1'} />
    </DashboardDetailLayout>
  )
}
