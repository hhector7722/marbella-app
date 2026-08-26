'use client'

import { useRouter } from 'next/navigation'

import { EncargoProductEditor } from '@/components/reservas/EncargoProductEditor'
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

  return (
    <EncargoProductEditor
      asModal={false}
      eventId={event.id}
      eventName={event.name}
      orderId={orderId}
      initialItems={lines}
      onClose={() => router.push('/staff/reservas')}
      onSaved={() => router.push('/staff/reservas')}
      onDeleted={() => router.push('/staff/reservas')}
    />
  )
}
