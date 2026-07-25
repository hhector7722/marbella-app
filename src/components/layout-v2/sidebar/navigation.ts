import type { LucideIcon } from 'lucide-react'

/**
 * Navigation contracts for AppShell V2.
 * Pure data — no routing, auth, or permission evaluation here.
 */

export type NavigationItem = {
  id: string
  label: string
  href: string
  icon?: LucideIcon
  badge?: string | number
  shortcut?: string
  /** Declared only; AppShell does not evaluate permissions. */
  permissions?: readonly string[]
  isActive?: boolean
  disabled?: boolean
}

export type NavigationSection = {
  id: string
  label?: string
  items: NavigationItem[]
}

export type NavigationGroup = {
  id: string
  label?: string
  sections: NavigationSection[]
}

export type UserSummary = {
  id: string
  name: string
  email?: string
  avatarUrl?: string | null
  roleLabel?: string
}

export type AppShellVariant = 'manager' | 'staff' | 'master'

export type BreadcrumbItem = {
  id: string
  label: string
  href?: string
}
