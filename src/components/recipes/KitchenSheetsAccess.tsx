'use client'

import Link from 'next/link'
import { ChefHat } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { isMasterDashboardUser } from '@/lib/master-dashboard'

export function KitchenSheetsAccess() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let active = true
    void createClient().auth.getUser().then(({ data }) => {
      if (active) setVisible(isMasterDashboardUser(data.user?.email))
    })
    return () => {
      active = false
    }
  }, [])

  if (!visible) return null

  return (
    <Link
      href="/playground/fichas-cocina"
      aria-label="Fichas de cocina"
      title="Fichas de cocina"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
    >
      <ChefHat size={15} strokeWidth={1.8} />
    </Link>
  )
}
