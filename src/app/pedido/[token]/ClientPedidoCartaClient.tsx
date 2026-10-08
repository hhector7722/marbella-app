'use client'

import { useState } from 'react'

import EventEncargoCartaClient, {
  type EncargoCartaEvent,
} from '@/app/eventos/[slug]/EventEncargoCartaClient'
import type { PublicMenuRow } from '@/components/public/PublicCarta'
import type { MenuCategoryCatalogEntry } from '@/lib/carta-plato-marbella'
import type { CartaPhotoScale } from '@/lib/carta-product-photo'
import type { EventCategoryLimits } from '@/lib/event-encargo-config'
import type { EventOrderStartingPackItem } from '@/lib/event-order-carta'
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
  initialOrderNotes,
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
  startingPackItems: EventOrderStartingPackItem[]
  initialOrderNotes: string
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
      initialOrderNotes={initialOrderNotes}
      initialEnabledProductIds={initialEnabledProductIds}
      initialCategoryLimits={initialCategoryLimits}
      canManage={false}
      variant="client-token"
      clientEditToken={token}
      contactWhatsAppPhone={contactWhatsAppPhone}
    />
  )
}
