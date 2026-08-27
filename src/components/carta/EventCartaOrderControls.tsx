'use client'

import { QuantityStepper } from '@/components/ui/QuantityStepper'

export function EventCartaOrderControls({
  quantity,
  onIncrement,
  onDecrement,
  onChange,
  className,
}: {
  quantity: number
  onIncrement: () => void
  onDecrement: () => void
  onChange?: (qty: number) => void
  className?: string
}) {
  return (
    <div
      className={className}
      onClick={(e) => e.stopPropagation()}
    >
      <QuantityStepper
        value={quantity}
        onChange={(n) => {
          if (onChange) {
            onChange(n)
            return
          }
          if (n > quantity) onIncrement()
          else if (n < quantity) onDecrement()
        }}
        min={0}
        max={999}
        ariaLabel="Cantidad"
      />
    </div>
  )
}
