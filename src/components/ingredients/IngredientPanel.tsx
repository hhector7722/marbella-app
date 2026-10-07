'use client'

import type { ReactNode } from 'react'

/**
 * Card canónica de las fichas de catálogo (recetas, ingredientes). Vive en la
 * pantalla, no es pieza de sistema. Conserva el lenguaje visual de la ficha.
 */
export function IngredientPanel({
  title,
  trailing,
  children,
}: {
  title: string
  trailing?: ReactNode
  children: ReactNode
}) {
  return (
    <section data-element="recipe-panel" className="h-full">
      <div data-element="block-header" className={trailing ? 'justify-between' : undefined}>
        <h2 data-element="title">{title}</h2>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function IngredientFact({
  label,
  children,
  valueClassName = '',
}: {
  label: string
  children: ReactNode
  valueClassName?: string
}) {
  return (
    <div className="min-w-0">
      <div className={`min-w-0 break-words text-sm font-black text-gray-800 ${valueClassName}`}>
        {children}
      </div>
      <div data-element="field-label">{label}</div>
    </div>
  )
}
