'use client';

import { useState } from 'react';
import { Copy, Check, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/Field';
import { updateEmployeeBankAccount } from '@/app/actions/employee-personal-data';

interface DatosBancariosModalProps {
    isOpen: boolean;
    onClose: () => void;
    iban: string | null;
    /** Id del perfil mostrado (empleado). */
    employeeId?: string;
    /** El master puede editar los datos bancarios. */
    canEdit?: boolean;
    /** Se llama tras guardar para refrescar la ficha. */
    onSaved?: () => void;
}

export default function DatosBancariosModal({
    isOpen,
    onClose,
    iban,
    employeeId,
    canEdit = false,
    onSaved,
}: DatosBancariosModalProps) {
    const [copied, setCopied] = useState(false);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    const handleClose = () => {
        setEditing(false);
        onClose();
    };

    const handleCopy = async () => {
        const value = iban?.trim();
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success('IBAN copiado al portapapeles');
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('No se pudo copiar el IBAN');
        }
    };

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!employeeId) {
            toast.error('Empleado no identificado');
            return;
        }
        const ibanInput = String(new FormData(e.currentTarget).get('iban') ?? '');
        setSaving(true);
        try {
            const res = await updateEmployeeBankAccount(employeeId, ibanInput);
            if (!res.success) {
                toast.error(res.error ?? 'No se pudo guardar');
                return;
            }
            toast.success(res.simulated ? 'Cambio simulado en sandbox' : 'Datos bancarios guardados');
            setEditing(false);
            onSaved?.();
        } finally {
            setSaving(false);
        }
    };

    const editButton = (
        <button
            type="button"
            onClick={() => setEditing(true)}
            className="relative flex h-full max-h-full min-h-0 w-[var(--modal-header-height)] shrink-0 items-center justify-center border-0 bg-transparent text-zinc-700 shadow-none outline-none hover:bg-zinc-100 active:opacity-70 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
            aria-label="Editar datos bancarios"
        >
            <Pencil size={16} strokeWidth={2} />
        </button>
    );

    return (
        <Modal
            open={isOpen}
            onClose={handleClose}
            title="Datos bancarios"
            variant="compact"
            layer="base"
            instance="profile-bank"
            usageId="profile-bank"
            usageLabel="Datos bancarios"
            headerTrailing={canEdit && !editing ? editButton : undefined}
            footer={
                canEdit && editing ? (
                    <div className="flex w-full flex-wrap items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            instance="profile-bank-cancel"
                            disabled={saving}
                            onClick={() => setEditing(false)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            form="profile-bank-form"
                            variant="primary"
                            instance="profile-bank-save"
                            disabled={saving}
                            loading={saving}
                            loadingLabel="Guardando…"
                        >
                            Guardar
                        </Button>
                    </div>
                ) : undefined
            }
        >
            {canEdit && editing ? (
                <form id="profile-bank-form" onSubmit={handleSave}>
                    <Field instance="profile-bank-iban" label="IBAN" htmlFor="profile-bank-iban">
                        <input
                            id="profile-bank-iban"
                            name="iban"
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            defaultValue={iban ?? ''}
                            autoFocus
                        />
                    </Field>
                </form>
            ) : (
                <div className="py-ds-8 pb-[max(var(--espacio-8),env(safe-area-inset-bottom))]">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">IBAN</p>
                    <div className="flex items-center gap-2">
                        <p className="text-zinc-800 font-bold text-sm flex-1 min-w-0 break-all font-mono">{iban || '—'}</p>
                        {iban ? (
                            <button
                                type="button"
                                onClick={() => void handleCopy()}
                                aria-label="Copiar IBAN"
                                title="Copiar IBAN"
                                className="flex h-ds-tactil w-ds-tactil shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-600 transition-colors hover:bg-zinc-100 active:scale-95"
                            >
                                {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                            </button>
                        ) : null}
                    </div>
                </div>
            )}
        </Modal>
    );
}
