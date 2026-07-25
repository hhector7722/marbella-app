'use client'

import { cn } from '@/lib/utils'
import { SidebarItem } from './sidebar-item'
import type { NavigationSection } from './navigation'

type SidebarSectionProps = {
  section: NavigationSection
  collapsed?: boolean
  onNavigate?: () => void
}

export function SidebarSection({
  section,
  collapsed = false,
  onNavigate,
}: SidebarSectionProps) {
  return (
    <div className="flex flex-col gap-1">
      {section.label && !collapsed ? (
        <p
          className={cn(
            'px-3 pb-1 pt-3 text-[10px] font-black uppercase tracking-widest text-mds-muted'
          )}
        >
          {section.label}
        </p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {section.items.map((item) => (
          <li key={item.id}>
            <SidebarItem item={item} collapsed={collapsed} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </div>
  )
}
