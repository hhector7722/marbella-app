'use client'

import Link from 'next/link'
import { ChefHat } from 'lucide-react'

export function KitchenSheetsAccess() {
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
