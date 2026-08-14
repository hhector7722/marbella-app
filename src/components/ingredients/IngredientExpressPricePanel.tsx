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

  const invoiceMeta = [invoiceQty ? `Cant. ${invoiceQty}` : null, initialUnitPrice > 0 ? `${initialUnitPrice.toFixed(2).replace('.', ',')} €/ud` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="space-y-2.5">
      {invoiceContext?.lineLabel ? (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-zinc-100 pb-2 px-0.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400 shrink-0">
            {copy.invoiceBanner}
          </span>
          <span className="min-w-0 break-words text-xs font-medium text-zinc-800">{invoiceContext.lineLabel}</span>
          {invoiceMeta ? <span className="text-[10px] font-normal text-zinc-500 tabular-nums">{invoiceMeta}</span> : null}
        </div>
      ) : null}

      <PricingStepHeader compact title={copy.title} hint={copy.hint} />

      {showNameField ? (
        <label className="block space-y-0.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">{copy.nameLabel}</span>
          <input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Ej. Vino blanco 75 cl"
            className="w-full min-h-12 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-900 outline-none focus:border-[#36606F]/50"
          />
        </label>
      ) : (
        <div className="min-h-12 rounded-lg border border-zinc-100 bg-zinc-50 px-2.5 flex items-center shrink-0">
          <span className="text-xs font-semibold text-zinc-900 truncate">{draft.name || '—'}</span>
        </div>
      )}

      <label className="block space-y-0.5">
        <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">{copy.priceLabel}</span>
        <input
          type="number"
          step="0.01"
          inputMode="decimal"
          value={draft.supplierPrice || ''}
          onChange={(e) => {
            const n = Number(String(e.target.value).replace(',', '.'))
            setDraft((d) => ({ ...d, supplierPrice: Number.isFinite(n) ? n : 0 }))
          }}
          className="w-full min-h-12 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm font-mono font-semibold text-zinc-900 outline-none focus:border-[#36606F]/50"
        />
      </label>

      <div className="space-y-1.5">
        <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">{copy.chargeBy}</p>
        <div className="grid grid-cols-2 gap-1.5">
          <PricingChoiceButton
            compact
            disabled={saving}
            selected={expressKind === 'kg'}
            title={copy.perKg}
            subtitle={copy.perKgSub}
            onClick={() => onPickKind('kg')}
          />
          <PricingChoiceButton
            compact
            disabled={saving}
            selected={expressKind === 'l'}
            title={copy.perL}
            subtitle={copy.perLSub}
            onClick={() => onPickKind('l')}
          />
          <PricingChoiceButton
            compact
            disabled={saving}
            selected={expressKind === 'piece_liquid' || expressKind === 'piece'}
            title={copy.perBottle}
            subtitle={copy.perBottleSub}
            onClick={() => onPickKind('piece_liquid')}
          />
          <PricingChoiceButton
            compact
            disabled={saving}
            selected={expressKind === 'pack'}
            title={copy.perBox}
            subtitle={copy.perBoxSub}
            onClick={() => onPickKind('pack')}
          />
        </div>
      </div>

      {expressKind === 'piece_liquid' ? (
        <div className="space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">{copy.bottleSize}</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
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
                    'min-h-12 rounded-lg border px-2 text-xs font-semibold',
                    active ? 'border-[#36606F] bg-[#36606F]/5 text-[#36606F]' : 'border-zinc-200 bg-white text-zinc-800',
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
        <div className="space-y-2">
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">{copy.boxCount}</p>
            <div className="grid grid-cols-4 gap-1.5">
              {PACK_UNITS_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, unitsInside: n }))}
                  className={cn(
                    'min-h-12 rounded-lg border text-xs font-semibold',
                    draft.unitsInside === n
                      ? 'border-[#36606F] bg-[#36606F]/5 text-[#36606F]'
                      : 'border-zinc-200 bg-white text-zinc-800',
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
                className="min-h-12 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-mono outline-none focus:border-[#36606F]/50"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">{copy.bottleSize}</p>
            <div className="grid grid-cols-2 gap-1.5">
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
                    'min-h-12 rounded-lg border px-2 text-xs font-semibold',
                    draft.contentPerUnitQty === p.qty && draft.contentPerUnitUnit === p.unit
                      ? 'border-[#36606F] bg-[#36606F]/5 text-[#36606F]'
                      : 'border-zinc-200 bg-white text-zinc-800',
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
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-2.5 py-2">
          <span className="text-[9px] font-black uppercase tracking-wider text-emerald-800/80">{copy.recipeCost}</span>
          <span className="text-sm font-semibold tabular-nums text-emerald-950">
            {unitCost.toFixed(2).replace('.', ',')} €/{previewBaseUnit}
          </span>
          {suggestedFactor != null && suggestedFactor > 0 && suggestedFactor !== 1 ? (
            <span className="w-full text-[10px] font-normal text-emerald-900/75">
              {copy.mapFactor}: <span className="font-mono">{String(suggestedFactor).replace('.', ',')}</span>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5 pt-0.5 sm:flex-row sm:items-stretch">
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="min-h-12 flex-1 rounded-lg bg-[#36606F] text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : copy.save}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onAdvanced}
          className="min-h-12 shrink-0 rounded-lg border border-zinc-200 bg-white px-3 text-[10px] font-medium uppercase tracking-wide text-zinc-500 hover:bg-zinc-50"
        >
          {copy.advanced}
        </button>
      </div>
    </div>
  )
}
