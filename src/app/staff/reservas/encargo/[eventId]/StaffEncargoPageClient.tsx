'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { EncargoProductEditor } from '@/components/reservas/EncargoProductEditor'
import { Button, PageActions, PageHeader } from '@/components/mds'
import { orderItemsToStaffLines, parseOrderItems } from '@/lib/encargo-staff-helpers'

export default function StaffEncargoPageClient({
  event,
  orderId,
  initialItems,
}: {
  event: { id: string; name: string }
  orderId: string | null
  initialItems: unknown
}) {
  const router = useRouter()
  const lines = orderItemsToStaffLines(parseOrderItems(initialItems))

  const goBack = () => router.push('/staff/reservas')

  return (
    <div className="space-y-3">
      <PageHeader
        title={event.name}
        description="Editar encargo"
        actions={
          <PageActions>
            <Button type="button" variant="icon" onClick={goBack} aria-label="Volver a reservas">
              <ChevronLeft className="size-5" strokeWidth={2.5} aria-hidden />
            </Button>
          </PageActions>
        }
      />
      <div className="flex w-full justify-center">
        <div className="w-full max-w-2xl">
          <EncargoProductEditor
            asModal={false}
            eventId={event.id}
            eventName={event.name}
            orderId={orderId}
            initialItems={lines}
            onClose={goBack}
            onSaved={goBack}
            onDeleted={goBack}
          />
        </div>
      </div>
    </div>
  )
}
