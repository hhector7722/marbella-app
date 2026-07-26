'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { firstNameOnly } from '@/lib/usage/display-name'
import {
  defaultUsageProfileIds,
  isDefaultUsageSelection,
  serializeProfileIdsForUrl,
} from '@/lib/usage/filters'
import type { UsageDashboardFilters, UsageFilterUser } from '@/lib/usage/queries'
import {
  Button,
  DateField,
  Surface,
  Text,
  Toolbar,
  ToolbarActions,
  ToolbarFilters,
} from '@/components/mds'

type UsageFiltersProps = {
  filters: UsageDashboardFilters
  users: UsageFilterUser[]
}

function resolveSelectedIds(
  filters: UsageDashboardFilters,
  users: UsageFilterUser[]
): Set<string> {
  if (filters.profileIds === null) {
    return new Set(defaultUsageProfileIds(users))
  }
  return new Set(filters.profileIds)
}

export function UsageFilters({ filters, users }: UsageFiltersProps) {
  const router = useRouter()
  const allUserIds = useMemo(() => users.map((user) => user.profileId), [users])

  const [day, setDay] = useState(filters.day ?? '')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    resolveSelectedIds(filters, users)
  )
  const [usersOpen, setUsersOpen] = useState(false)

  useEffect(() => {
    setDay(filters.day ?? '')
    setSelectedIds(resolveSelectedIds(filters, users))
  }, [filters.day, filters.profileIds, users])

  function applyFilters(nextDay: string, nextSelected: Set<string>) {
    const params = new URLSearchParams()
    if (nextDay) params.set('dia', nextDay)

    const allSelected =
      allUserIds.length > 0 && allUserIds.every((id) => nextSelected.has(id))
    const isDefault = isDefaultUsageSelection(nextSelected, users)

    if (allSelected) {
      const usuarios = serializeProfileIdsForUrl(allUserIds)
      if (usuarios !== null) params.set('usuarios', usuarios)
    } else if (!isDefault) {
      const usuarios = serializeProfileIdsForUrl([...nextSelected])
      if (usuarios !== null) params.set('usuarios', usuarios)
    }

    const query = params.toString()
    router.push(query ? `/dashboard/uso?${query}` : '/dashboard/uso')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    applyFilters(day, selectedIds)
  }

  function toggleUser(profileId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(profileId)) {
        next.delete(profileId)
      } else {
        next.add(profileId)
      }
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(allUserIds))
  }

  function deselectAll() {
    setSelectedIds(new Set())
  }

  const selectedCount = selectedIds.size
  const allSelected =
    allUserIds.length > 0 && allUserIds.every((id) => selectedIds.has(id))
  const isDefault = isDefaultUsageSelection(selectedIds, users)

  const userFilterLabel = allSelected
    ? 'Todos los usuarios'
    : isDefault
      ? `${selectedCount} usuarios`
      : `${selectedCount} usuario${selectedCount === 1 ? '' : 's'}`

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Toolbar className="gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ToolbarFilters className="min-w-0 flex-1 flex-nowrap">
          <div className="w-[9.5rem] shrink-0">
            <DateField
              id="usage-day"
              name="dia"
              aria-label="Día"
              value={day}
              onChange={(event) => setDay(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setUsersOpen((prev) => !prev)}
            aria-expanded={usersOpen}
            className={cn(
              'min-w-[8rem] flex-1 justify-start px-3 text-left text-xs font-medium',
              usersOpen && 'border-mds-primary ring-3 ring-mds-primary/20'
            )}
          >
            {userFilterLabel}
          </Button>
        </ToolbarFilters>
        <ToolbarActions className="ml-0">
          <Button type="submit" variant="primary" className="px-4 text-xs">
            OK
          </Button>
          <Button variant="outline" asChild className="px-3" aria-label="Limpiar filtros">
            <Link
              href="/dashboard/uso"
              onClick={() => {
                setDay('')
                setSelectedIds(new Set(defaultUsageProfileIds(users)))
                setUsersOpen(false)
              }}
            >
              <X className="size-4" aria-hidden />
            </Link>
          </Button>
        </ToolbarActions>
      </Toolbar>

      {usersOpen ? (
        <Surface variant="default" className="p-3">
          <div className="mb-2 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={selectAll}
              className="min-h-12 text-xs"
            >
              Seleccionar todos
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={deselectAll}
              className="min-h-12 text-xs"
            >
              Quitar todos
            </Button>
          </div>

          <div className="flex max-h-48 flex-wrap content-start gap-2 overflow-y-auto">
            {users.map((user) => {
              const checked = selectedIds.has(user.profileId)
              return (
                <label
                  key={user.profileId}
                  className={cn(
                    'inline-flex min-h-12 shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2',
                    checked
                      ? 'border-mds-primary/30 bg-mds-primary/5'
                      : 'border-mds-border hover:bg-mds-muted-surface'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleUser(user.profileId)}
                    className="size-4 shrink-0 rounded border-mds-border text-mds-primary accent-mds-primary focus-visible:ring-3 focus-visible:ring-mds-primary/20"
                  />
                  <Text as="span" variant="body" className="whitespace-nowrap text-sm">
                    {firstNameOnly(user.displayName)}
                  </Text>
                </label>
              )
            })}
          </div>
        </Surface>
      ) : null}
    </form>
  )
}
