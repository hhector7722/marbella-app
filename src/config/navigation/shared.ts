import type { NavigationGroup, NavigationItem } from '@/components/layout-v2'

/** ¿El pathname actual corresponde a este href de nav? */
export function isNavItemActive(
  href: string,
  pathname: string,
  allHrefs: readonly string[] = []
): boolean {
  if (pathname === href) return true
  if (href === '/') return false
  if (!pathname.startsWith(`${href}/`)) return false

  // Si existe un item más específico en la nav que también matchea, ceder.
  // Evita que `/dashboard/inventory` quede activo en `/dashboard/inventory/waste`.
  const hasMoreSpecificMatch = allHrefs.some(
    (other) =>
      other !== href &&
      other.startsWith(`${href}/`) &&
      (pathname === other || pathname.startsWith(`${other}/`))
  )
  return !hasMoreSpecificMatch
}

function collectNavHrefs(groups: readonly NavigationGroup[]): string[] {
  return groups.flatMap((group) =>
    group.sections.flatMap((section) => section.items.map((item) => item.href))
  )
}

/** Marca `isActive` en todos los items según pathname. No muta el origen. */
export function markActiveNavigation(
  groups: readonly NavigationGroup[],
  pathname: string
): NavigationGroup[] {
  const allHrefs = collectNavHrefs(groups)
  return groups.map((group) => ({
    ...group,
    sections: group.sections.map((section) => ({
      ...section,
      items: section.items.map(
        (item): NavigationItem => ({
          ...item,
          isActive: isNavItemActive(item.href, pathname, allHrefs),
        })
      ),
    })),
  }))
}
