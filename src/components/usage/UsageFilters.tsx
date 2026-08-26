'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { firstNameOnly } from '@/lib/usage/display-name';
import {
  defaultUsageProfileIds,
  isDefaultUsageSelection,
  serializeProfileIdsForUrl,
} from '@/lib/usage/filters';
import type { UsageDashboardFilters, UsageFilterUser } from '@/lib/usage/queries';

type UsageFiltersProps = {
  filters: UsageDashboardFilters;
  users: UsageFilterUser[];
};

function resolveSelectedIds(
  filters: UsageDashboardFilters,
  users: UsageFilterUser[]
): Set<string> {
  if (filters.profileIds === null) {
    return new Set(defaultUsageProfileIds(users));
  }
  return new Set(filters.profileIds);
}

export function UsageFilters({ filters, users }: UsageFiltersProps) {
  const router = useRouter();
  const allUserIds = useMemo(() => users.map((user) => user.profileId), [users]);

  const [day, setDay] = useState(filters.day ?? '');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    resolveSelectedIds(filters, users)
  );
  const [usersOpen, setUsersOpen] = useState(false);

  useEffect(() => {
    setDay(filters.day ?? '');
    setSelectedIds(resolveSelectedIds(filters, users));
  }, [filters.day, filters.profileIds, users]);

  function applyFilters(nextDay: string, nextSelected: Set<string>) {
    const params = new URLSearchParams();
    if (nextDay) params.set('dia', nextDay);

    const allSelected =
      allUserIds.length > 0 && allUserIds.every((id) => nextSelected.has(id));
    const isDefault = isDefaultUsageSelection(nextSelected, users);

    if (allSelected) {
      const usuarios = serializeProfileIdsForUrl(allUserIds);
      if (usuarios !== null) params.set('usuarios', usuarios);
    } else if (!isDefault) {
      const usuarios = serializeProfileIdsForUrl([...nextSelected]);
      if (usuarios !== null) params.set('usuarios', usuarios);
    }

    const query = params.toString();
    router.push(query ? `/dashboard/uso?${query}` : '/dashboard/uso');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilters(day, selectedIds);
  }

  function toggleUser(profileId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(profileId)) {
        next.delete(profileId);
      } else {
        next.add(profileId);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(allUserIds));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  const selectedCount = selectedIds.size;
  const allSelected = allUserIds.length > 0 && allUserIds.every((id) => selectedIds.has(id));
  const isDefault = isDefaultUsageSelection(selectedIds, users);

  const userFilterLabel = allSelected
    ? 'Todos los usuarios'
    : isDefault
      ? `${selectedCount} usuarios`
      : `${selectedCount} usuario${selectedCount === 1 ? '' : 's'}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <input
          id="usage-day"
          name="dia"
          type="date"
          aria-label="Día"
          value={day}
          onChange={(event) => setDay(event.target.value)}
          className={cn(
            'box-border h-12 w-[7rem] max-w-[7rem] shrink-0 rounded-xl border border-zinc-200 bg-white px-2 text-xs text-zinc-800 outline-none',
            'focus:border-[#36606F] focus:ring-1 focus:ring-[#36606F]/30'
          )}
        />

        <button
          type="button"
          onClick={() => setUsersOpen((prev) => !prev)}
          className={cn(
            'h-12 min-w-[8rem] flex-1 shrink-0 rounded-xl border border-zinc-200 bg-white px-3 text-left text-xs text-zinc-800 outline-none',
            'focus:border-[#36606F] focus:ring-1 focus:ring-[#36606F]/30',
            usersOpen && 'border-[#36606F] ring-1 ring-[#36606F]/30'
          )}
        >
          {userFilterLabel}
        </button>

        <Button type="submit" variant="primary" instance="usage-filters-ok">
          OK
        </Button>

        <Link
          href="/dashboard/uso"
          onClick={() => {
            setDay('');
            setSelectedIds(new Set(defaultUsageProfileIds(users)));
            setUsersOpen(false);
          }}
          className={cn(
            'inline-flex h-12 shrink-0 items-center justify-center rounded-xl border border-zinc-200 px-3 text-xs text-zinc-500',
            'hover:border-[#36606F]/40 hover:text-[#36606F]'
          )}
        >
          ×
        </Link>
      </div>

      {usersOpen ? (
        <div className="rounded-xl border border-zinc-100 bg-white p-3 shadow-sm">
          <div className="mb-2 flex gap-2">
            <Button
              type="button"
              variant="tertiary"
              instance="usage-filters-seleccionar-todos"
              onClick={selectAll}
            >
              Seleccionar todos
            </Button>
            <button
              type="button"
              onClick={deselectAll}
              className="min-h-10 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
            >
              Quitar todos
            </button>
          </div>

          <div className="flex max-h-48 flex-wrap content-start gap-2 overflow-y-auto">
            {users.map((user) => {
              const checked = selectedIds.has(user.profileId);
              return (
                <label
                  key={user.profileId}
                  className={cn(
                    'inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5',
                    checked
                      ? 'border-[#36606F]/30 bg-[#36606F]/5'
                      : 'border-zinc-100 hover:bg-zinc-50'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleUser(user.profileId)}
                    className="size-4 shrink-0 rounded border-zinc-300 text-[#36606F] focus:ring-[#36606F]/30"
                  />
                  <span className="whitespace-nowrap text-sm text-zinc-800">
                    {firstNameOnly(user.displayName)}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </form>
  );
}
