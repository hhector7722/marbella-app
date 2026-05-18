'use client'

import { createContext, useContext, type ReactNode } from 'react'
import {
  defaultCartaUiLabelsRow,
  racionLabelsForLang,
  type CartaRacionLabelsForLang,
  type CartaUiLabelsRow,
} from '@/lib/carta-ui-labels'
import type { CartaLang } from '@/lib/carta-menu-i18n'

const CartaUiLabelsContext = createContext<CartaUiLabelsRow | null>(null)

export function CartaUiLabelsProvider({
  labels,
  children,
}: {
  labels: CartaUiLabelsRow | null
  children: ReactNode
}) {
  return (
    <CartaUiLabelsContext.Provider value={labels}>{children}</CartaUiLabelsContext.Provider>
  )
}

export function useCartaRacionLabels(lang: CartaLang): CartaRacionLabelsForLang {
  const row = useContext(CartaUiLabelsContext)
  return racionLabelsForLang(row ?? defaultCartaUiLabelsRow(), lang)
}
