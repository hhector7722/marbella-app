'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/Field';
import { updateEmployeeContact } from '@/app/actions/employee-personal-data';

interface ContactoModalProps {
    isOpen: boolean;
    onClose: () => void;
    phone: string | null;
    /** Id del perfil mostrado (empleado). */
    employeeId?: string;
    /** El master puede editar el contacto. */
    canEdit?: boolean;
    /** Se llama tras guardar para refrescar la ficha. */
    onSaved?: () => void;
}

function normalizePhone(phone: string | null): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('34')) return digits;
    return '34' + digits;
}

export default function ContactoModal({
    isOpen,
    onClose,
    phone,
    employeeId,
    canEdit = false,
    onSaved,
}: ContactoModalProps) {
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    const telNumber = phone ? normalizePhone(phone) : '';
    const waNumber = telNumber;

    const handleClose = () => {
        setEditing(false);
        onClose();
    };

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!employeeId) {
            toast.error('Empleado no identificado');
            return;
        }
        const phoneInput = String(new FormData(e.currentTarget).get('phone') ?? '');
        setSaving(true);
        try {
            const res = await updateEmployeeContact(employeeId, phoneInput);
            if (!res.success) {
                toast.error(res.error ?? 'No se pudo guardar');
                return;
            }
            toast.success(res.simulated ? 'Cambio simulado en sandbox' : 'Contacto guardado');
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
            aria-label="Editar contacto"
        >
            <Pencil size={16} strokeWidth={2} />
        </button>
    );

    return (
        <Modal
            open={isOpen}
            onClose={handleClose}
            title="Contacto"
            variant="compact"
            layer="base"
            instance="profile-contact"
            usageId="profile-contact"
            usageLabel="Contacto perfil"
            headerTrailing={canEdit && !editing ? editButton : undefined}
            footer={
                canEdit && editing ? (
                    <div className="flex w-full flex-wrap items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            instance="profile-contact-cancel"
                            disabled={saving}
                            onClick={() => setEditing(false)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            form="profile-contact-form"
                            variant="primary"
                            instance="profile-contact-save"
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
                <form id="profile-contact-form" onSubmit={handleSave}>
                    <Field instance="profile-contact-phone" label="Teléfono" htmlFor="profile-contact-phone">
                        <input
                            id="profile-contact-phone"
                            name="phone"
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel"
                            defaultValue={phone ?? ''}
                            autoFocus
                        />
                    </Field>
                </form>
            ) : (
                <div className="space-y-5">
                    <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Teléfono</p>
                            <p className="text-black font-bold text-sm break-all">{phone || '—'}</p>
                        </div>
                    </div>
                    {phone && (
                        <div className="flex items-start justify-center gap-ds-8 pt-2 pb-ds-8">
                            <a
                                href={`tel:+${telNumber}`}
                                className="min-h-[48px] flex flex-col items-center justify-center gap-1 text-black hover:opacity-70 transition-opacity active:scale-[0.98]"
                            >
                                <img src="/icons/phone.png" alt="" className="w-6 h-6 object-contain" />
                                <span className="text-sm leading-tight">Llamar</span>
                            </a>
                            <a
                                href={`https://wa.me/${waNumber}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[48px] flex flex-col items-center justify-center gap-1 text-black hover:opacity-70 transition-opacity active:scale-[0.98]"
                            >
                                <img src="/icons/whatsapp.png" alt="" className="w-6 h-6 object-contain" />
                                <span className="text-sm leading-tight">WhatsApp</span>
                            </a>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}
