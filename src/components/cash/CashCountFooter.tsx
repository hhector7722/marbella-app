'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export function CashCountFooter({
    total,
    onCancel,
    onSave,
    cancelLabel = 'Cancelar',
    saveLabel = 'Guardar',
    saveDisabled = false,
    saveLoading = false,
    saveType = 'button',
    saveForm,
    extra,
    middleAction,
    instancePrefix,
}: {
    total: number;
    onCancel: () => void;
    onSave?: () => void;
    cancelLabel?: string;
    saveLabel?: string;
    saveDisabled?: boolean;
    saveLoading?: boolean;
    saveType?: 'button' | 'submit';
    saveForm?: string;
    extra?: ReactNode;
    /** Botón de función (p. ej. «Añadir hoja») entre Cancelar y Guardar, dentro de `footer-actions`. */
    middleAction?: ReactNode;
    instancePrefix: string;
}) {
    return (
        <div
            data-component="CashCountFooter"
            className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2"
        >
            <div className="mr-auto flex shrink-0 items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Total</span>
                <span className="text-base font-black tabular-nums text-zinc-800">
                    {total > 0.005 ? `${total.toFixed(2)}€` : ' '}
                </span>
            </div>
            {extra}
            <div data-element="footer-actions">
                <Button
                    type="button"
                    variant="secondary"
                    instance={`${instancePrefix}-cancel`}
                    onClick={onCancel}
                >
                    {cancelLabel}
                </Button>
                {middleAction}
                <Button
                    type={saveType}
                    variant="primary"
                    instance={`${instancePrefix}-save`}
                    form={saveForm}
                    onClick={saveType === 'submit' ? undefined : onSave}
                    disabled={saveDisabled}
                    loading={saveLoading}
                >
                    {saveLabel}
                </Button>
            </div>
        </div>
    );
}
