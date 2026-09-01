'use client';

import type { ReactNode } from 'react';
import { Button, type ButtonVariant } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { ModalLayer } from '@/lib/design-system';

export type ConfirmModalProps = {
    open: boolean;
    onClose: () => void;
    title: string;
    children?: ReactNode;
    confirmLabel: string;
    cancelLabel?: string;
    confirmVariant?: Extract<ButtonVariant, 'destructive' | 'primary'>;
    onConfirm: () => void;
    instance: string;
    usageLabel?: string;
    parentInstance?: string;
    confirming?: boolean;
    /** `dark` = superficie azul del envolvente (menús / confirmaciones staff). */
    scheme?: 'work' | 'dark';
    hideCloseButton?: boolean;
    /** Oculta cabecera visible; el título queda para lectores de pantalla. */
    hideHeader?: boolean;
    /** Default `system`. Usar `base` cuando no hay modal inferior (backdrop con blur). */
    layer?: ModalLayer;
    /** Botones repartidos a ancho completo en fila horizontal. */
    buttonsStretch?: boolean;
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
    scheme = 'work',
    hideCloseButton = false,
    hideHeader = false,
    layer = 'system',
    buttonsStretch = false,
}: ConfirmModalProps) {
    const close = () => {
        if (!confirming) onClose();
    };

    const buttonLayout = buttonsStretch ? 'fill' : 'hug';

    const cancelButton = (
        <Button
            type="button"
            variant="secondary"
            layout={buttonLayout}
            className={buttonsStretch ? 'w-full' : undefined}
            instance={`${instance}-cancel`}
            disabled={confirming}
            onClick={close}
        >
            {cancelLabel}
        </Button>
    );

    const confirmButton = (
        <Button
            type="button"
            variant={confirmVariant}
            layout={buttonLayout}
            className={buttonsStretch ? 'w-full' : undefined}
            instance={`${instance}-confirm`}
            disabled={confirming}
            loading={confirming}
            onClick={onConfirm}
        >
            {confirmLabel}
        </Button>
    );

    const actions = buttonsStretch ? (
        <div className="flex w-full min-w-0 flex-nowrap gap-3">
            <div className="flex min-w-0 flex-1">{cancelButton}</div>
            <div className="flex min-w-0 flex-1">{confirmButton}</div>
        </div>
    ) : (
        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2">
            {cancelButton}
            {confirmButton}
        </div>
    );

    const bodyContent =
        children == null
            ? null
            : typeof children === 'string'
              ? <p className="text-sm text-zinc-500">{children}</p>
              : children;

    return (
        <Modal
            open={open}
            onClose={close}
            title={title}
            variant="compact"
            layer={layer}
            scheme={scheme}
            instance={instance}
            usageId={instance}
            usageLabel={usageLabel ?? title}
            parentInstance={parentInstance}
            hideCloseButton={hideCloseButton}
            hideHeader={hideHeader}
            ariaLabel={hideHeader ? (usageLabel ?? title) : undefined}
            scrollContent={!(hideHeader && buttonsStretch && bodyContent == null)}
            footer={actions}
        >
            {bodyContent}
        </Modal>
    );
}
