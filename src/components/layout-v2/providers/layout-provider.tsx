'use client'

import {
  createContext,
  use,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

const MOBILE_QUERY = '(max-width: 1023px)'

type LayoutState = {
  sidebarCollapsed: boolean
  isMobile: boolean
  openMobileMenu: boolean
}

type LayoutActions = {
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebarCollapsed: () => void
  setOpenMobileMenu: (open: boolean) => void
  openMobile: () => void
  closeMobile: () => void
  toggleMobile: () => void
}

type LayoutContextValue = {
  state: LayoutState
  actions: LayoutActions
}

const LayoutContext = createContext<LayoutContextValue | null>(null)

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [openMobileMenu, setOpenMobileMenu] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY)
    const sync = () => {
      setIsMobile(media.matches)
      if (!media.matches) {
        setOpenMobileMenu(false)
      }
    }
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const value: LayoutContextValue = {
    state: { sidebarCollapsed, isMobile, openMobileMenu },
    actions: {
      setSidebarCollapsed,
      toggleSidebarCollapsed: () => setSidebarCollapsed((prev) => !prev),
      setOpenMobileMenu,
      openMobile: () => setOpenMobileMenu(true),
      closeMobile: () => setOpenMobileMenu(false),
      toggleMobile: () => setOpenMobileMenu((prev) => !prev),
    },
  }

  return (
    <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
  )
}

export function useLayout() {
  const ctx = use(LayoutContext)
  if (!ctx) {
    throw new Error('useLayout must be used within LayoutProvider')
  }
  return ctx
}
