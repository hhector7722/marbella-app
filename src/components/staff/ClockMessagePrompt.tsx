'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import {
  acknowledgeStaffClockMessage,
  type StaffClockMessage,
} from '@/app/actions/staff-clock-messages';

export function ClockMessagePrompt({
  messages,
  onAcknowledged,
}: {
  messages: StaffClockMessage[];
  onAcknowledged: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const message = messages[0] ?? null;

  const confirm = async () => {
    if (!message || confirming) return;
    setConfirming(true);
    try {
      const result = await acknowledgeStaffClockMessage(message.id);
      if (!result.success) {
        toast.error(result.error ?? 'No se pudo confirmar el mensaje');
        return;
      }
      onAcknowledged(message.id);
    } catch {
      toast.error('No se ha podido confirmar la lectura.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal
      open={Boolean(message)}
      onClose={() => { /* Solo se cierra tras confirmar la lectura. */ }}
      closeOnBackdrop={false}
      hideHeader
      hideCloseButton
      title="Mensaje"
      ariaLabel="Mensaje pendiente de fichaje"
      instance="staff-clock-message"
      layer="base"
      scheme="dark"
    >
      <div className="flex flex-col items-center gap-6 px-4 py-6 text-center">
        <p className="w-full whitespace-pre-wrap break-words text-base font-medium leading-relaxed">
          {message?.body ?? ''}
        </p>
        <Button
          variant="primary"
          instance="staff-clock-message-acknowledge"
          disabled={confirming}
          loading={confirming}
          loadingLabel="Confirmando…"
          onClick={() => void confirm()}
        >
          Entendido
        </Button>
      </div>
    </Modal>
  );
}
