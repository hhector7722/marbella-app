'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ClipboardList, Copy, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { createEventAction, deleteEventAction } from './actions'

export type AdminEventRow = {
  id: string
  slug: string
  name: string
  event_date: string
  event_time: string
  guest_count: number | null
  is_active: boolean
  created_at: string
}

function toHm(time: string): string {
  const t = String(time ?? '').trim()
  const m = t.match(/^(\d{2}):(\d{2})/)
  if (!m) return t
  return `${m[1]}:${m[2]}`
}

function formatGuestCount(n: number | null): string {
  if (n == null || n === 0) return ' '
  return `${n} pers.`
}

function publicEventUrl(slug: string): string {
  if (typeof window === 'undefined') return `/eventos/${slug}`
  return `${window.location.origin}/eventos/${slug}`
}

export default function EventosAdminClient({
  events,
  canManage = true,
}: {
  events: AdminEventRow[]
  canManage?: boolean
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [contactName, setContactName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('10:00')
  const [guestCount, setGuestCount] = useState('20')

  const cardClass = 'rounded-xl border border-zinc-100 bg-white shadow-sm'
  const btnBase =
    'inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-[12px] font-black uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50'

  const canSubmitCreate =
    Boolean(contactName.trim() && eventDate.trim() && eventTime.trim() && guestCount.trim()) && !isPending

  function resetCreateForm() {
    setContactName('')
    setEventDate('')
    setEventTime('10:00')
    setGuestCount('20')
  }

  function closeCreateModal() {
    if (isPending) return
    setCreateOpen(false)
    resetCreateForm()
  }

  return (
    <div className="space-y-4">
      <div className={cn('flex flex-wrap gap-2', canManage ? 'justify-between' : 'justify-end')}>
        <Link
          href="/dashboard/eventos/pedidos"
          className={cn(btnBase, 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200')}
        >
          <ClipboardList className="h-4 w-4" strokeWidth={2.5} />
          Ver pedidos
        </Link>
        {canManage ? (
          <button
            type="button"
            className={cn(btnBase, 'bg-emerald-600 text-white hover:bg-emerald-700')}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Nuevo encargo
          </button>
        ) : null}
      </div>

      <div className={cn(cardClass, 'divide-y divide-zinc-100')}>
        {events.length === 0 ? (
          <p className="p-6 text-center text-sm font-bold text-zinc-600">
            {canManage ? 'Pulsa «Nuevo encargo» para crear el primero.' : 'No hay encargos.'}
          </p>
        ) : (
          events.map((e) => {
            const url = publicEventUrl(e.slug)
            const guests = formatGuestCount(e.guest_count)

            return (
              <div key={e.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-zinc-900">{e.name}</p>
                  <p className="mt-1 text-xs font-semibold text-zinc-600">
                    {e.event_date} · {toHm(e.event_time)}h
                    {guests !== ' ' ? ` · ${guests}` : ''}
                    {!e.is_active ? ' · Inactivo' : ''}
                  </p>
                </div>

                {canManage ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Link
                      href={`/eventos/${e.slug}`}
                      className={cn(btnBase, 'bg-[#36606F] text-white hover:bg-[#2a4a56]')}
                    >
                      <Pencil className="h-4 w-4" strokeWidth={2.5} />
                      Editar
                    </Link>
                    <Link
                      href={`/dashboard/eventos/${e.id}/pedidos`}
                      className={cn(btnBase, 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200')}
                    >
                      <ClipboardList className="h-4 w-4" strokeWidth={2.5} />
                      Pedidos
                    </Link>
                    <button
                      type="button"
                      className={cn(btnBase, 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200')}
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(url)
                          .then(() => toast.success('Enlace copiado'))
                          .catch(() => toast.error('No se pudo copiar'))
                      }}
                    >
                      <Copy className="h-4 w-4" strokeWidth={2.5} />
                      Copiar enlace
                    </button>
                    <button
                      type="button"
                      className={cn(btnBase, 'bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100')}
                      disabled={isPending}
                      onClick={() => {
                        if (!window.confirm(`¿Eliminar el encargo de «${e.name}»?`)) return
                        startTransition(async () => {
                          const res = await deleteEventAction({ eventId: e.id })
                          if (!res.success) toast.error(res.message)
                          else toast.success('Encargo eliminado')
                        })
                      }}
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2.5} />
                      Eliminar
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>

      {createOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-label="Nuevo encargo"
          onClick={closeCreateModal}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-[#36606F]">Nuevo encargo</p>
                <p className="mt-1 text-xs text-zinc-600">Contacto, fecha, hora y número de personas</p>
              </div>
              <button
                type="button"
                className="flex min-h-12 min-w-[48px] shrink-0 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100"
                aria-label="Cerrar"
                onClick={closeCreateModal}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-zinc-700">
                  Contacto del encargo
                </label>
                <input
                  value={contactName}
                  onChange={(ev) => setContactName(ev.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
                  placeholder="Nombre del responsable"
                  autoComplete="name"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-700">Fecha</label>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(ev) => setEventDate(ev.target.value)}
                    className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-700">Hora</label>
                  <input
                    type="time"
                    value={eventTime}
                    onChange={(ev) => setEventTime(ev.target.value)}
                    className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-zinc-700">
                  Cantidad de personas
                </label>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={guestCount}
                  onChange={(ev) => setGuestCount(ev.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-900 outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
                />
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className={cn(btnBase, 'flex-1 bg-zinc-100 text-zinc-800 hover:bg-zinc-200')}
                disabled={isPending}
                onClick={closeCreateModal}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={cn(btnBase, 'flex-1 bg-emerald-600 text-white hover:bg-emerald-700')}
                disabled={!canSubmitCreate}
                onClick={() => {
                  startTransition(async () => {
                    const res = await createEventAction({
                      contact_name: contactName,
                      event_date: eventDate,
                      event_time: eventTime,
                      guest_count: Number(guestCount),
                    })
                    if (!res.success) {
                      toast.error(res.message)
                      return
                    }
                    toast.success('Encargo creado')
                    closeCreateModal()
                  })
                }}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
