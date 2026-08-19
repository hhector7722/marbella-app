'use client';

import type { ReactNode } from 'react';
import { Modal, type ModalLayer } from '@/components/ui/modal';
import { cn } from '@/lib/utils';

type StaffTipModalShellProps = {
  open?: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  bodyClassName?: string;
  /** Capa semántica. Default `base`. Usar `derived` solo encima de un Modal base (ADR-0007). */
  layer?: ModalLayer;
  instance: string;
  usageId: string;
  usageLabel: string;
  parentInstance?: string;
};

export function StaffTipModalShell({
  open = true,
  title,
  onClose,
  children,
  bodyClassName,
  layer = 'base',
  instance,
  usageId,
  usageLabel,
  parentInstance,
}: StaffTipModalShellProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      variant="compact"
      layer={layer}
      instance={instance}
      parentInstance={parentInstance}
      headerTone="petroleum"
      headerCompact
      usageId={usageId}
      usageLabel={usageLabel}
    >
      <div className={cn('p-2.5 sm:p-3', bodyClassName)}>{children}</div>
    </Modal>
  );
}
