'use client'

import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SearchButtonProps = {
  className?: string
}

/** Placeholder — no search behavior in Sprint 3. */
export function SearchButton({ className }: SearchButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        'min-h-12 gap-2 border-mds-border bg-mds-surface px-3 text-mds-muted hover:text-mds-foreground',
        className
      )}
      aria-label="Buscar"
    >
      <Search className="size-4 shrink-0" aria-hidden />
      <span className="hidden text-sm font-semibold sm:inline">Buscar</span>
    </Button>
  )
}
