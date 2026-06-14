'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { cn } from '@/lib/utils';
import type { UsageDashboardFilters, UsageFilterUser } from '@/lib/usage/queries';

type UsageFiltersProps = {
  filters: UsageDashboardFilters;
  users: UsageFilterUser[];
};

export function UsageFilters({ filters, users }: UsageFiltersProps) {
  const router = useRouter();

  const [day, setDay] = useState(filters.day ?? '');
  const [profileId, setProfileId] = useState(filters.profileId ?? '');

  useEffect(() => {
    setDay(filters.day ?? '');
    setProfileId(filters.profileId ?? '');
  }, [filters.day, filters.profileId]);

  function applyFilters(nextDay: string, nextProfileId: string) {
    const params = new URLSearchParams();
    if (nextDay) params.set('dia', nextDay);
    if (nextProfileId) params.set('usuario', nextProfileId);
    const query = params.toString();
    router.push(query ? `/dashboard/uso?${query}` : '/dashboard/uso');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilters(day, profileId);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex shrink-0 items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
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

      <select
        id="usage-user"
        name="usuario"
        aria-label="Usuario"
        value={profileId}
        onChange={(event) => setProfileId(event.target.value)}
        className={cn(
          'h-12 min-w-[8rem] flex-1 shrink-0 rounded-xl border border-zinc-200 bg-white px-2 text-xs text-zinc-800 outline-none',
          'focus:border-[#36606F] focus:ring-1 focus:ring-[#36606F]/30'
        )}
      >
        <option value="">Todos</option>
        {users.map((user) => (
          <option key={user.profileId} value={user.profileId}>
            {user.displayName}
          </option>
        ))}
      </select>

      <button
        type="submit"
        className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-[#36606F] px-4 text-xs font-semibold text-white"
      >
        OK
      </button>

      <Link
        href="/dashboard/uso"
        onClick={() => {
          setDay('');
          setProfileId('');
        }}
        className={cn(
          'inline-flex h-12 shrink-0 items-center justify-center rounded-xl border border-zinc-200 px-3 text-xs text-zinc-500',
          'hover:border-[#36606F]/40 hover:text-[#36606F]'
        )}
      >
        ×
      </Link>
    </form>
  );
}
