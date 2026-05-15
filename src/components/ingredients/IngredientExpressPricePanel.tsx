'use client'

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { pricingAssistantCopy } from '@/lib/ingredient-pricing-assistant-copy'
import { PricingChoiceButton, PricingStepHeader } from '@/components/ingredients/PricingAssistantControls'
import type { IngredientWizardInvoiceContext } from '@/components/ingredients/IngredientWizard'

export type ExpressKind = 'kg' | 'l' | 'piece_liquid' | 'piece' | 'pack'

export type ExpressPriceDraft = {
  name: string
  supplierPrice: number
  unitsInside: number | null
  contentPerUnitQty: number | null
  contentPerUnitUnit: string
}

const PACK_UNITS_PRESETS = [12, 24]
const VOLUME_PRESETS = [
  { qty: 200, unit: 'ml' as const },
  { qty: 250, unit: 'ml' as const },
  { qty: 330, unit: 'ml' as const },
  { qty: 500, unit: 'ml' as const },
  { qty: 700, unit: 'ml' as const },
  { qty: 740, unit: 'ml' as const },
  { qty: 750, unit: 'ml' as const },
  { qty: 1, unit: 'l' as const },
  { qty: 1.5, unit: 'l' as const },
  { qty: 2, unit: 'l' as const },
]

type Props = {
  draft: ExpressPriceDraft
  setDraft: React.Dispatch<React.SetStateAction<ExpressPriceDraft>>
  expressKind: ExpressKind | null
  onPickKind: (kind: ExpressKind) => void
  invoiceContext?: IngredientWizardInvoiceContext
  initialUnitPrice: number
  showNameField: boolean
  saving: boolean
  unitCost: number | null
  previewBaseUnit: string
  suggestedFactor: number | null
  onSave: () => void
  onAdvanced: () => void
}

export function IngredientExpressPricePanel({
  draft,
  setDraft,
  expressKind,
  onPickKind,
  invoiceContext,
  initialUnitPrice,
  showNameField,
  saving,
  unitCost,
  previewBaseUnit,
  suggestedFactor,
  onSave,
  onAdvanced,
}: Props) {
  const copy = pricingAssistantCopy.express
  const invoiceQty =
    invoiceContext?.quantity == null || invoiceContext.quantity === ''
      ? null
      : String(invoiceContext.quantity).trim()

  return (
    <div className="space-y-4">
      {invoiceContext?.lineLabel ? (
        <div className="rounded-xl border border-[#36606F]/20 bg-[#36606F]/5 px-3 py-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-[#36606F]">{copy.invoiceBanner}</p>
          <p className="mt-1 break-words text-sm font-black text-zinc-900">{invoiceContext.lineLabel}</p>
          {(invoiceQty || initialUnitPrice > 0) && (
            <p className="mt-1 text-xs font-bold text-zinc-600">
              {[invoiceQty ? `Cant. ${invoiceQty}` : null, initialUnitPrice > 0 ? `${initialUnitPrice.toFixed(2).replace('.', ',')} €/ud` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
      ) : null}

      <PricingStepHeader title={copy.title} hint={copy.hint} />

      {showNameField ? (
        <label className="block space-y-1">
          <span className="text-xs font-bold text-zinc-700">{copy.nameLabel}</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Ej. Vino blanco 75 cl"
            className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-bold"
          />
        </label>
      ) : (
        <div className="min-h-12 rounded-xl border border-zinc-100 bg-zinc-50 px-3 flex items-center shrink-0">
          <span className="font-black text-zinc-900">{draft.name || '—'}</span>
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-xs font-bold text-zinc-700">{copy.priceLabel}</span>
        <input
          type="number"
          step="0.01"
          inputMode="decimal"
          value={draft.supplierPrice || ''}
          onChange={(e) => {
            const n = Number(String(e.target.value).replace(',', '.'))
            setDraft((d) => ({ ...d, supplierPrice: Number.isFinite(n) ? n : 0 }))
          }}
          className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-lg font-mono font-black"
        />
      </label>

      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-wider text-zinc-500">{copy.chargeBy}</p>
        <div className="grid grid-cols-2 gap-2">
          <PricingChoiceButton
            disabled={saving}
            selected={expressKind === 'kg'}
            title={copy.perKg}
            subtitle={copy.perKgSub}
            onClick={() => onPickKind('kg')}
          />
          <PricingChoiceButton
            disabled={saving}
            selected={expressKind === 'l'}
            title={copy.perL}
            subtitle={copy.perLSub}
            onClick={() => onPickKind('l')}
          />
          <PricingChoiceButton
            disabled={saving}
            selected={expressKind === 'piece_liquid' || expressKind === 'piece'}
            title={copy.perBottle}
            subtitle={copy.perBottleSub}
            onClick={() => onPickKind('piece_liquid')}
          />
          <PricingChoiceButton
            disabled={saving}
            selected={expressKind === 'pack'}
            title={copy.perBox}
            subtitle={copy.perBoxSub}
            onClick={() => onPickKind('pack')}
          />
        </div>
      </div>

      {expressKind === 'piece_liquid' ? (
        <div className="space-y-2 rounded-xl border border-zinc-100 bg-zinc-50 p-3">
          <p className="text-xs font-bold text-zinc-700">{copy.bottleSize}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {VOLUME_PRESETS.filter((p) => p.unit === 'ml' || (p.unit === 'l' && p.qty <= 2)).map((p) => {
              const active = draft.contentPerUnitQty === p.qty && draft.contentPerUnitUnit === p.unit
              return (
                <button
                  key={`${p.qty}-${p.unit}`}
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      contentPerUnitQty: p.qty,
                      contentPerUnitUnit: p.unit,
                    }))
                  }
                  className={cn(
                    'min-h-12 rounded-xl border px-2 text-sm font-black',
                    active ? 'border-[#36606F] bg-[#36606F]/5 text-[#36606F]' : 'border-zinc-200 bg-white',
                  )}
                >
                  {p.qty}
                  {p.unit}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {expressKind === 'pack' ? (
        <div className="space-y-3 rounded-xl border border-zinc-100 bg-zinc-50 p-3">
          <div className="space-y-1">
            <p className="text-xs font-bold text-zinc-700">{copy.boxCount}</p>
            <div className="grid grid-cols-4 gap-2">
              {PACK_UNITS_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, unitsInside: n }))}
                  className={cn(
                    'min-h-12 rounded-xl border text-sm font-black',
                    draft.unitsInside === n ? 'border-[#36606F] bg-[#36606F]/5 text-[#36606F]' : 'border-zinc-200 bg-white',
                  )}
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                step="1"
                placeholder="Otro"
                value={draft.unitsInside ?? ''}
                onChange={(e) => {
                  const raw = e.target.value
                  const n = raw === '' ? null : Number(raw)
                  setDraft((d) => ({ ...d, unitsInside: n != null && Number.isFinite(n) ? n : null }))
                }}
                className="min-h-12 rounded-xl border border-zinc-200 px-2 text-sm font-mono"
              />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-bold text-zinc-700">{copy.bottleSize}</p>
            <div className="grid grid-cols-2 gap-2">
              {VOLUME_PRESETS.slice(0, 6).map((p) => (
                <button
                  key={`pack-${p.qty}-${p.unit}`}
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      contentPerUnitQty: p.qty,
                      contentPerUnitUnit: p.unit,
                    }))
                  }
                  className={cn(
                    'min-h-12 rounded-xl border px-2 text-sm font-black',
                    draft.contentPerUnitQty === p.qty && draft.contentPerUnitUnit === p.unit
                      ? 'border-[#36606F] bg-[#36606F]/5 text-[#36606F]'
                      : 'border-zinc-200 bg-white',
                  )}
                >
                  {p.qty}
                  {p.unit}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {expressKind && unitCost != null && unitCost > 0 ? (
        <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800">{copy.recipeCost}</p>
          <p className="mt-1 text-2xl font-black text-emerald-950">
            {unitCost.toFixed(2).replace('.', ',')} €/{previewBaseUnit}
          </p>
          {suggestedFactor != null && suggestedFactor > 0 && suggestedFactor !== 1 ? (
            <p className="mt-2 text-xs font-bold text-emerald-900/80">
              {copy.mapFactor}: <span className="font-mono">{String(suggestedFactor).replace('.', ',')}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="min-h-12 flex-1 rounded-xl bg-[#36606F] text-white font-black disabled:opacity-50"
        >
          {saving ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : copy.save}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onAdvanced}
          className="min-h-12 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-600 hover:bg-zinc-50"
        >
          {copy.advanced}
        </button>
      </div>
    </div>
  )
}
