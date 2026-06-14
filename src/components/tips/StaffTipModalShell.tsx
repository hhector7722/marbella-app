'use client';

import type { ReactNode } from 'react';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';

/** Modal staff: siempre centrado y más estrecho que la página. */
export const STAFF_TIP_MODAL_PANEL_CLASS =
  'flex w-full max-h-[min(88vh,28rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl';

type StaffTipModalShellProps = {
  open?: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  zClass?: string;
  bodyClassName?: string;
  usageId: string;
  usageLabel: string;
};

export function StaffTipModalShell({
  open = true,
  title,
  onClose,
  children,
  zClass = 'z-[120]',
  bodyClassName,
  usageId,
  usageLabel,
}: StaffTipModalShellProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      headerVariant="petroleum"
      headerCompact
      className={STAFF_TIP_MODAL_PANEL_CLASS}
      wrapperClassName="w-[calc(100%-2rem)] max-w-[min(20rem,calc(100vw-2rem))]"
      zIndexClass={zClass}
      usageId={usageId}
      usageLabel={usageLabel}
    >
      <div className={cn('p-3', bodyClassName)}>{children}</div>
    </Modal>
  );
}
