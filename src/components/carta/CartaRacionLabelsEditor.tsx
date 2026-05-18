'use client'

import { useEffect, useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { upsertCartaUiLabelsAction } from '@/app/dashboard/carta/actions'
import {
  defaultCartaUiLabelsRow,
  type CartaUiLabelsRow,
} from '@/lib/carta-ui-labels'

const LANG_FIELDS: {
  key: 'es' | 'ca' | 'en'
  label: string
  enteroKey: keyof Pick<
    CartaUiLabelsRow,
    'racion_entero_es' | 'racion_entero_ca' | 'racion_entero_en'
  >
  medioKey: keyof Pick<CartaUiLabelsRow, 'racion_medio_es' | 'racion_medio_ca' | 'racion_medio_en'>
}[] = [
  { key: 'es', label: 'ES', enteroKey: 'racion_entero_es', medioKey: 'racion_medio_es' },
  { key: 'ca', label: 'CA', enteroKey: 'racion_entero_ca', medioKey: 'racion_medio_ca' },
  { key: 'en', label: 'EN', enteroKey: 'racion_entero_en', medioKey: 'racion_medio_en' },
]

export function CartaRacionLabelsEditor({
  initial,
  className,
}: {
  initial: CartaUiLabelsRow | null
  className?: string
}) {
  const [draft, setDraft] = useState<CartaUiLabelsRow>(initial ?? defaultCartaUiLabelsRow())
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setDraft(initial ?? defaultCartaUiLabelsRow())
  }, [initial])

  const save = () => {
    startTransition(async () => {
      const res = await upsertCartaUiLabelsAction({
        racion_entero_es: draft.racion_entero_es,
        racion_entero_ca: draft.racion_entero_ca,
        racion_entero_en: draft.racion_entero_en,
        racion_medio_es: draft.racion_medio_es,
        racion_medio_ca: draft.racion_medio_ca,
        racion_medio_en: draft.racion_medio_en,
      })
      if (!res.ok) {
        toast.error(res.message ?? 'No se pudieron guardar las etiquetas')
        return
      }
      toast.success('Etiquetas Entero / Medio guardadas')
    })
  }

  return (
    <section
      className={cn(
        'rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm',
        className
      )}
    >
      <p className="text-xs font-black uppercase tracking-widest text-[#36606F]">
        Etiquetas Entero / Medio
      </p>
      <p className="mt-1 text-xs text-zinc-600">
        Texto junto al precio cuando un producto muestra ración entera y media (Bocadillos, Extras…).
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {LANG_FIELDS.map(({ key, label, enteroKey, medioKey }) => (
          <div key={key} className="space-y-2 rounded-xl border border-zinc-100 bg-zinc-50/80 p-3">
            <p className="text-center text-[10px] font-black uppercase tracking-widest text-zinc-500">
              {label}
            </p>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase text-zinc-600">Entero</span>
              <input
                type="text"
                value={draft[enteroKey]}
                onChange={(e) => setDraft((p) => ({ ...p, [enteroKey]: e.target.value }))}
                className="min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold"
                maxLength={32}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase text-zinc-600">Medio</span>
              <input
                type="text"
                value={draft[medioKey]}
                onChange={(e) => setDraft((p) => ({ ...p, [medioKey]: e.target.value }))}
                className="min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold"
                maxLength={32}
              />
            </label>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={isPending}
        onClick={save}
        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#36606F] px-4 font-black text-white active:opacity-90 disabled:opacity-60 sm:w-auto sm:min-w-[12rem]"
      >
        {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        Guardar etiquetas
      </button>
    </section>
  )
}
