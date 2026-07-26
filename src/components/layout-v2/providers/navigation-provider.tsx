'use client'

import { createContext, use, type ReactNode } from 'react'
import type { NavigationGroup } from '../sidebar/navigation'

type NavigationContextValue = {
  navigation: NavigationGroup[]
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

type NavigationProviderProps = {
  navigation: NavigationGroup[]
  children: ReactNode
}

/**
 * Expone la navegación V2 resuelta a descendientes (sin fetch).
 */
export function NavigationProvider({
  navigation,
  children,
}: NavigationProviderProps) {
  return (
    <NavigationContext.Provider value={{ navigation }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useShellNavigation(): NavigationGroup[] {
  const ctx = use(NavigationContext)
  if (!ctx) {
    throw new Error('useShellNavigation must be used within NavigationProvider')
  }
  return ctx.navigation
}
