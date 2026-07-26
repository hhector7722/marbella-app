import type { NavigationGroup, NavigationItem } from '@/components/layout-v2'

/** ¿El pathname actual corresponde a este href de nav? */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (pathname === href) return true
  if (href === '/') return false
  return pathname.startsWith(`${href}/`)
}

/** Marca `isActive` en todos los items según pathname. No muta el origen. */
export function markActiveNavigation(
  groups: readonly NavigationGroup[],
  pathname: string
): NavigationGroup[] {
  return groups.map((group) => ({
    ...group,
    sections: group.sections.map((section) => ({
      ...section,
      items: section.items.map(
        (item): NavigationItem => ({
          ...item,
          isActive: isNavItemActive(item.href, pathname),
        })
      ),
    })),
  }))
}
