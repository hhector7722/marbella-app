'use client';

import type { ReactNode } from 'react';
import { Button, type ButtonVariant } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

export type ConfirmModalProps = {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    confirmLabel: string;
    cancelLabel?: string;
    confirmVariant?: Extract<ButtonVariant, 'destructive' | 'primary'>;
    onConfirm: () => void;
    instance: string;
    usageLabel?: string;
    parentInstance?: string;
    confirming?: boolean;
};

/**
 * Confirmación de acción: composición de Modal compact + system + Button.
 * No es una variante nueva de Modal ni de Button.
 */
export function ConfirmModal({
    open,
    onClose,
    title,
    children,
    confirmLabel,
    cancelLabel = 'Cancelar',
    confirmVariant = 'destructive',
    onConfirm,
    instance,
    usageLabel,
    parentInstance,
    confirming = false,
}: ConfirmModalProps) {
    const close = () => {
        if (!confirming) onClose();
    };

    return (
        <Modal
            open={open}
            onClose={close}
            title={title}
            variant="compact"
            layer="system"
            instance={instance}
            usageId={instance}
            usageLabel={usageLabel ?? title}
            parentInstance={parentInstance}
            footer={
                <div className="flex w-full flex-wrap items-center justify-end gap-2">
                    <Button
                        type="button"
                        variant="secondary"
                        instance={`${instance}-cancel`}
                        disabled={confirming}
                        onClick={close}
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        type="button"
                        variant={confirmVariant}
                        instance={`${instance}-confirm`}
                        disabled={confirming}
                        loading={confirming}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </Button>
                </div>
            }
        >
            {typeof children === 'string' ? (
                <p className="text-sm text-zinc-500">{children}</p>
            ) : (
                children
            )}
        </Modal>
    );
}
