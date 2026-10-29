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
      onClose={() => { /* Requiere confirmación explícita de lectura. */ }}
      closeOnBackdrop={false}
      hideCloseButton
      title="Mensaje de Héctor"
      instance="staff-clock-message"
      layer="system"
      scheme="dark"
      footer={
        <div className="flex justify-center">
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
      }
    >
      <div className="space-y-3 py-3">
        <p className="text-xs opacity-70">Mensaje recibido al registrar tu entrada o salida.</p>
        <p className="whitespace-pre-wrap break-words text-base font-medium leading-relaxed">
          {message?.body ?? ''}
        </p>
        {messages.length > 1 && (
          <p className="text-xs opacity-65">{messages.length - 1} mensaje(s) más pendientes</p>
        )}
      </div>
    </Modal>
  );
}
