'use client'

import { useState } from 'react'
import { processInventoryCounts } from './actions'
import { toast } from 'sonner'
import { Save, AlertCircle } from 'lucide-react'

type Ingredient = {
  id: string
  name: string
  unit: string
  stock_current: number
  category: string
}

interface InventoryClientProps {
  initialIngredients: Ingredient[]
}

export function InventoryClient({ initialIngredients }: InventoryClientProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, string>>({})

  const handleInputChange = (id: string, value: string) => {
    if (/^-?\d*\.?\d*$/.test(value)) {
      setPhysicalCounts(prev => ({ ...prev, [id]: value }))
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      const payload = Object.entries(physicalCounts).map(([id, val]) => {
        const item = initialIngredients.find(i => i.id === id)
        const physicalValue = parseFloat(val)
        const safePhysical = isNaN(physicalValue) ? (item?.stock_current || 0) : physicalValue

        return {
          ingredient_id: id,
          physical_stock: safePhysical,
          theoretical_stock: item?.stock_current || 0,
          unit: item?.unit || 'ud'
        }
      })

      const res = await processInventoryCounts(payload)
      if (res.success) {
        toast.success(res.message)
        setPhysicalCounts({})
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al procesar el recuento.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const grouped = initialIngredients.reduce((acc, curr) => {
    (acc[curr.category] = acc[curr.category] || []).push(curr)
    return acc
  }, {} as Record<string, Ingredient[]>)

  return (
    <div className="space-y-8 pb-24">
      {Object.entries(grouped).map(([category, items]) => (
        <section key={category} className="rounded-xl border border-zinc-100 bg-zinc-50/80 overflow-hidden shrink-0">
          <div className="bg-zinc-100/80 px-4 py-3 border-b border-zinc-100 font-semibold text-zinc-700 text-sm">
            {category}
          </div>
          <div className="divide-y divide-gray-50">
            {items.map((item) => {
              const displayTeorico = item.stock_current === 0 ? " " : item.stock_current.toString()
              
              return (
                <div key={item.id} className="flex items-center justify-between p-4 px-4 hover:bg-white/60 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-base font-medium text-gray-900">{item.name}</span>
                    <span className="text-sm text-gray-400">Teórico: {displayTeorico} {item.unit}</span>
                  </div>
                  
                  <div className="flex items-center gap-3 shrink-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={item.stock_current.toString()}
                      value={physicalCounts[item.id] !== undefined ? physicalCounts[item.id] : ''}
                      onChange={(e) => handleInputChange(item.id, e.target.value)}
                      className="w-24 h-14 text-center text-lg font-medium bg-gray-100 rounded-xl border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all touch-manipulation"
                    />
                    <span className="text-gray-500 font-medium w-8">{item.unit}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-lg bg-gray-900 rounded-2xl p-2 shadow-2xl flex items-center justify-between z-50">
        <div className="flex items-center gap-2 text-gray-300 px-4">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">Solo se ajustarán campos modificados</span>
        </div>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || Object.keys(physicalCounts).length === 0}
          className="flex items-center gap-2 h-12 px-6 bg-white text-gray-900 rounded-xl font-bold hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          <Save className="w-5 h-5" />
          {isSubmitting ? 'Guardando...' : 'Confirmar Arqueo'}
        </button>
      </div>
    </div>
  )
}
