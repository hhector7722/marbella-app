'use client'

import { useState } from 'react'

import EventEncargoCartaClient, {
  type EncargoCartaEvent,
} from '@/app/eventos/[slug]/EventEncargoCartaClient'
import type { PublicMenuRow } from '@/components/public/PublicCarta'
import type { MenuCategoryCatalogEntry } from '@/lib/carta-plato-marbella'
import type { CartaPhotoScale } from '@/lib/carta-product-photo'
import type { EventCategoryLimits } from '@/lib/event-encargo-config'
import { PedidoBienvenidaView } from './PedidoBienvenidaView'

export default function ClientPedidoCartaClient({
  token,
  event,
  guestCount = null,
  allMenuItems,
  clientMenuItems,
  menuCategories,
  categoryCoverById,
  categoryCoverScaleById,
  startingPackItems,
  initialEnabledProductIds,
  initialCategoryLimits,
  contactWhatsAppPhone = null,
}: {
  token: string
  event: EncargoCartaEvent
  guestCount?: number | null
  allMenuItems: PublicMenuRow[]
  clientMenuItems: PublicMenuRow[]
  menuCategories: MenuCategoryCatalogEntry[]
  categoryCoverById: Record<string, string | null>
  categoryCoverScaleById: Record<string, CartaPhotoScale>
  startingPackItems: Array<{ product_id: string; quantity: number }>
  initialEnabledProductIds: string[] | null
  initialCategoryLimits: EventCategoryLimits
  contactWhatsAppPhone?: string | null
}) {
  const [started, setStarted] = useState(false)

  if (!started) {
    return (
      <PedidoBienvenidaView
        customerName={event.name}
        eventDate={event.event_date}
        eventTime={event.event_time}
        guestCount={guestCount}
        orderName={event.name}
        onStart={() => setStarted(true)}
      />
    )
  }

  return (
    <EventEncargoCartaClient
      event={event}
      allMenuItems={allMenuItems}
      clientMenuItems={clientMenuItems}
      menuCategories={menuCategories}
      categoryCoverById={categoryCoverById}
      categoryCoverScaleById={categoryCoverScaleById}
      startingPackItems={startingPackItems}
      initialEnabledProductIds={initialEnabledProductIds}
      initialCategoryLimits={initialCategoryLimits}
      canManage={false}
      variant="client-token"
      clientEditToken={token}
      contactWhatsAppPhone={contactWhatsAppPhone}
    />
  )
}
