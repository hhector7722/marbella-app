'use client'

import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  supplierName: string
  label?: string
  onPickFromList?: () => void
  onClear?: () => void
  className?: string
}

export function OrphanedSupplierAlert({
  supplierName,
  label = 'Proveedor',
  onPickFromList,
  onClear,
  className,
}: Props) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 flex gap-2.5',
        className,
      )}
    >
      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" strokeWidth={2.5} />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs font-bold text-amber-950 leading-snug">
          <span className="uppercase tracking-wide text-amber-800">{label}:</span>{' '}
          «{supplierName}» ya no está en la lista de proveedores. Elige uno válido o quita el
          campo.
        </p>
        {(onPickFromList || onClear) && (
          <div className="flex flex-wrap gap-2">
            {onPickFromList ? (
              <button
                type="button"
                onClick={onPickFromList}
                className="min-h-10 rounded-lg bg-white border border-amber-300 px-3 text-[10px] font-black uppercase tracking-wider text-amber-900 active:scale-95"
              >
                Elegir de lista
              </button>
            ) : null}
            {onClear ? (
              <button
                type="button"
                onClick={onClear}
                className="min-h-10 rounded-lg bg-white border border-amber-200 px-3 text-[10px] font-black uppercase tracking-wider text-rose-600 active:scale-95"
              >
                Quitar
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
