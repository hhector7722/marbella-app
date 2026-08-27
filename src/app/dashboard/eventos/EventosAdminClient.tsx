'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Surface } from '@/components/ui/Surface'
import { Field } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/EmptyState'
import { ModalDateButton } from '@/components/time/ModalDateButton'
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

const navLinkClass =
  'inline-flex min-h-12 shrink-0 items-center justify-center px-4 text-[12px] font-black uppercase tracking-wider'

export default function EventosAdminClient({
  events,
  canManage = true,
}: {
  events: AdminEventRow[]
  canManage?: boolean
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<AdminEventRow | null>(null)

  useModalUsageTracking({
    open: createOpen,
    usageId: 'eventos-create',
    usageLabel: 'Nuevo evento',
  })
  const [isPending, startTransition] = useTransition()

  const [contactName, setContactName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('10:00')
  const [guestCount, setGuestCount] = useState('20')

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
        <Link href="/dashboard/eventos/pedidos" className={cn(navLinkClass, 'text-ds-marca')}>
          Ver pedidos
        </Link>
        {canManage ? (
          <Button
            type="button"
            variant="primary"
            instance="eventos-admin-nuevo-encargo"
            onClick={() => setCreateOpen(true)}
          >
            Nuevo encargo
          </Button>
        ) : null}
      </div>

      <Surface variant="block" instance="eventos-admin-list">
        <div className="divide-y divide-zinc-100">
          {events.length === 0 ? (
            <EmptyState
              instance="eventos-admin-empty"
              variant="none"
              title={canManage ? 'Pulsa «Nuevo encargo» para crear el primero.' : 'No hay encargos.'}
            />
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
                      <Link href={`/eventos/${e.slug}`} className={cn(navLinkClass, 'bg-ds-marca text-white')}>
                        Editar
                      </Link>
                      <Link
                        href={`/dashboard/eventos/${e.id}/pedidos`}
                        className={cn(navLinkClass, 'bg-zinc-100 text-zinc-800')}
                      >
                        Pedidos
                      </Link>
                      <Button
                        type="button"
                        variant="secondary"
                        instance={`eventos-admin-copiar-${e.id}`}
                        onClick={() => {
                          void navigator.clipboard
                            ?.writeText(url)
                            .then(() => toast.success('Enlace copiado'))
                            .catch(() => toast.error('No se pudo copiar'))
                        }}
                      >
                        Copiar enlace
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        instance={`eventos-admin-eliminar-${e.id}`}
                        disabled={isPending}
                        onClick={() => setPendingDelete(e)}
                      >
                        Eliminar
                      </Button>
                    </div>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </Surface>

      <Modal
        open={createOpen}
        onClose={closeCreateModal}
        title="Nuevo encargo"
        subtitle="Contacto, hora y número de personas"
        instance="eventos-create"
        variant="standard"
        layer="base"
        headerTone="petroleum"
        headerTrailing={
          <ModalDateButton
            value={eventDate}
            onChange={setEventDate}
            ariaLabel="Fecha del encargo"
          />
        }
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              instance="eventos-create-cancel"
              disabled={isPending}
              onClick={closeCreateModal}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              instance="eventos-create-submit"
              disabled={!canSubmitCreate}
              loading={isPending}
              loadingLabel="Crear"
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
              Crear
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Field instance="eventos-create-contacto" label="Contacto del encargo" htmlFor="eventos-create-contacto">
            <input
              id="eventos-create-contacto"
              value={contactName}
              onChange={(ev) => setContactName(ev.target.value)}
              placeholder="Nombre del responsable"
              autoComplete="name"
            />
          </Field>
          <Field instance="eventos-create-hora" label="Hora" htmlFor="eventos-create-hora">
              <input
                id="eventos-create-hora"
                type="time"
                value={eventTime}
                onChange={(ev) => setEventTime(ev.target.value)}
              />
            </Field>
          <Field instance="eventos-create-personas" label="Cantidad de personas" htmlFor="eventos-create-personas">
            <input
              id="eventos-create-personas"
              type="number"
              min={1}
              max={9999}
              value={guestCount}
              onChange={(ev) => setGuestCount(ev.target.value)}
            />
          </Field>
        </div>
      </Modal>
      <ConfirmModal
        open={pendingDelete != null}
        onClose={() => { if (!isPending) setPendingDelete(null) }}
        title="Eliminar encargo"
        confirmLabel="Eliminar"
        instance="eventos-admin-delete-confirm"
        usageLabel="Confirmar eliminar encargo"
        confirming={isPending}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (!target) return
          startTransition(async () => {
            const res = await deleteEventAction({ eventId: target.id })
            if (!res.success) toast.error(res.message)
            else toast.success('Encargo eliminado')
          })
        }}
      >
        {`¿Eliminar el encargo de «${pendingDelete?.name ?? ''}»?`}
      </ConfirmModal>
    </div>
  )
}
