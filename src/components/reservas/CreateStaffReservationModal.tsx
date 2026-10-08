'use client'

import { useState, type FormEvent } from 'react'
import { createStaffReservationAction } from '@/app/staff/reservas/actions'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/modal'
import { Notice } from '@/components/ui/Notice'
import { getEuropeMadridYmdToday } from '@/utils/date-utils'

const FORM_ID = 'create-staff-reservation-form'

export function CreateStaffReservationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (reservationDate: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const formData = new FormData(event.currentTarget)
    const reservationDate = String(formData.get('reservation_date') ?? '')
    setBusy(true)
    setError(null)

    try {
      const result = await createStaffReservationAction({
        reservation_date: reservationDate,
        reservation_time: String(formData.get('reservation_time') ?? ''),
        pax: String(formData.get('pax') ?? ''),
        customer_name: String(formData.get('customer_name') ?? ''),
        customer_phone: String(formData.get('customer_phone') ?? ''),
        notes: String(formData.get('notes') ?? ''),
      })

      if (!result.success) {
        setError(result.message)
        return
      }

      onCreated(reservationDate)
    } catch {
      setError('No se pudo guardar la reserva. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => { if (!busy) onClose() }}
      closeOnBackdrop={!busy}
      variant="standard"
      layer="base"
      instance="reservas-create-staff"
      title="Nueva reserva"
      subtitle="Reserva registrada por el equipo"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            instance="reservas-create-cancel"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant="primary"
            instance="reservas-create-save"
            loading={busy}
            loadingLabel="Guardando"
          >
            Guardar reserva
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-3">
        {error ? (
          <Notice instance="reservas-create-error" variant="negative">{error}</Notice>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field instance="reservas-create-date" label="Fecha" htmlFor="staff-reservation-date">
            <input
              id="staff-reservation-date"
              name="reservation_date"
              type="date"
              defaultValue={getEuropeMadridYmdToday()}
              disabled={busy}
              required
            />
          </Field>
          <Field instance="reservas-create-time" label="Hora" htmlFor="staff-reservation-time">
            <input
              id="staff-reservation-time"
              name="reservation_time"
              type="time"
              step={1800}
              disabled={busy}
              required
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field instance="reservas-create-pax" label="Personas" htmlFor="staff-reservation-pax">
            <input
              id="staff-reservation-pax"
              name="pax"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              disabled={busy}
              required
            />
          </Field>
          <Field instance="reservas-create-phone" label="Teléfono" htmlFor="staff-reservation-phone" hint="Opcional">
            <input
              id="staff-reservation-phone"
              name="customer_phone"
              type="tel"
              autoComplete="tel"
              maxLength={40}
              disabled={busy}
            />
          </Field>
        </div>
        <Field instance="reservas-create-name" label="Nombre" htmlFor="staff-reservation-name">
          <input
            id="staff-reservation-name"
            name="customer_name"
            type="text"
            autoComplete="name"
            minLength={2}
            maxLength={120}
            disabled={busy}
            required
          />
        </Field>
        <Field instance="reservas-create-notes" label="Notas" htmlFor="staff-reservation-notes">
          <textarea
            id="staff-reservation-notes"
            name="notes"
            rows={3}
            maxLength={500}
            disabled={busy}
          />
        </Field>
      </form>
    </Modal>
  )
}
