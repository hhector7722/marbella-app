'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/Field';
import { updateEmployeePersonalData } from '@/app/actions/employee-personal-data';

interface DatosPersonalesModalProps {
    isOpen: boolean;
    onClose: () => void;
    firstName: string;
    lastName: string | null;
    dni: string | null;
    email: string;
    phone: string | null;
    /** Nº de afiliación a la Seguridad Social. */
    afiliacionSeguridadSocial?: string | null;
    nacionalidad?: string | null;
    /** Fecha de nacimiento en formato YYYY-MM-DD. */
    fechaNacimiento?: string | null;
    domicilio?: string | null;
    /** Id del perfil al que pertenecen los datos mostrados (empleado). */
    ownerUserId?: string;
    /** El responsable puede editar y guardar los datos. */
    canEdit?: boolean;
    /** Se llama tras guardar para refrescar la ficha. */
    onSaved?: () => void;
}

interface PersonalDocImages {
    delantera: string | null;
    trasera: string | null;
}

function formatBirthDate(ymd?: string | null): string {
    if (!ymd) return '—';
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return ymd;
    return format(new Date(y, m - 1, d), "d 'de' MMMM 'de' yyyy", { locale: es });
}

export default function DatosPersonalesModal({
    isOpen,
    onClose,
    firstName,
    lastName,
    dni,
    email,
    phone,
    afiliacionSeguridadSocial,
    nacionalidad,
    fechaNacimiento,
    domicilio,
    ownerUserId,
    canEdit = false,
    onSaved,
}: DatosPersonalesModalProps) {
    const [images, setImages] = useState<PersonalDocImages | null>(null);
    const [saving, setSaving] = useState(false);

    const fullName = `${firstName} ${lastName || ''}`.trim();

    useEffect(() => {
        let cancelled = false;
        async function loadImages() {
            if (!isOpen) return;
            if (!ownerUserId) {
                setImages(null);
                return;
            }
            setImages(null);
            try {
                const res = await fetch(`/api/employee-documents/dni-files?owner=${encodeURIComponent(ownerUserId)}`);
                if (!res.ok) {
                    console.error('load dni files error', res.status);
                    return;
                }
                const data = (await res.json()) as PersonalDocImages;
                if (cancelled) return;
                setImages(data);
            } catch (e) {
                if (cancelled) return;
                console.error(e);
            }
        }
        loadImages();
        return () => {
            cancelled = true;
        };
    }, [isOpen, ownerUserId]);

    const hasImages = useMemo(() => {
        return Boolean(images && (images.delantera || images.trasera));
    }, [images]);

    const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!ownerUserId) {
            toast.error('Empleado no identificado');
            return;
        }
        const data = new FormData(e.currentTarget);
        const read = (name: string) => String(data.get(name) ?? '').trim();
        setSaving(true);
        try {
            const res = await updateEmployeePersonalData(ownerUserId, {
                firstName: read('firstName'),
                lastName: read('lastName'),
                dni: read('dni'),
                afiliacionSeguridadSocial: read('afiliacionSeguridadSocial'),
                nacionalidad: read('nacionalidad'),
                fechaNacimiento: read('fechaNacimiento'),
                domicilio: read('domicilio'),
                phone: read('phone'),
                email: read('email'),
            });
            if (!res.success) {
                toast.error(res.error ?? 'No se pudo guardar');
                return;
            }
            toast.success(res.simulated ? 'Cambio simulado en sandbox' : 'Datos guardados');
            onSaved?.();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Datos personales"
            variant="standard"
            layer="base"
            instance="profile-personal"
            headerTone="petroleum"
            usageId="profile-personal"
            usageLabel="Datos personales"
            footer={
                canEdit ? (
                    <div className="flex w-full flex-wrap items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            instance="profile-personal-cancel"
                            disabled={saving}
                            onClick={onClose}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            form="profile-personal-form"
                            variant="primary"
                            instance="profile-personal-save"
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
            {canEdit ? (
                <form id="profile-personal-form" onSubmit={handleSave} className="space-y-4">
                    <Field instance="profile-personal-first-name" label="Nombre" htmlFor="profile-personal-first-name">
                        <input
                            id="profile-personal-first-name"
                            name="firstName"
                            type="text"
                            defaultValue={firstName ?? ''}
                            autoComplete="given-name"
                            required
                        />
                    </Field>
                    <Field instance="profile-personal-last-name" label="Apellidos" htmlFor="profile-personal-last-name">
                        <input
                            id="profile-personal-last-name"
                            name="lastName"
                            type="text"
                            defaultValue={lastName ?? ''}
                            autoComplete="family-name"
                        />
                    </Field>
                    <Field instance="profile-personal-dni" label="NIF / NIE / Pasaporte" htmlFor="profile-personal-dni">
                        <input
                            id="profile-personal-dni"
                            name="dni"
                            type="text"
                            defaultValue={dni ?? ''}
                            autoComplete="off"
                        />
                    </Field>
                    <Field
                        instance="profile-personal-afiliacion-ss"
                        label="Nº de afiliación a la S.S."
                        htmlFor="profile-personal-afiliacion-ss"
                    >
                        <input
                            id="profile-personal-afiliacion-ss"
                            name="afiliacionSeguridadSocial"
                            type="text"
                            defaultValue={afiliacionSeguridadSocial ?? ''}
                            autoComplete="off"
                        />
                    </Field>
                    <Field
                        instance="profile-personal-nacionalidad"
                        label="Nacionalidad"
                        htmlFor="profile-personal-nacionalidad"
                    >
                        <input
                            id="profile-personal-nacionalidad"
                            name="nacionalidad"
                            type="text"
                            defaultValue={nacionalidad ?? ''}
                            autoComplete="off"
                        />
                    </Field>
                    <Field
                        instance="profile-personal-fecha-nacimiento"
                        label="Fecha de nacimiento"
                        htmlFor="profile-personal-fecha-nacimiento"
                    >
                        <input
                            id="profile-personal-fecha-nacimiento"
                            name="fechaNacimiento"
                            type="date"
                            defaultValue={fechaNacimiento ?? ''}
                        />
                    </Field>
                    <Field instance="profile-personal-domicilio" label="Domicilio" htmlFor="profile-personal-domicilio">
                        <input
                            id="profile-personal-domicilio"
                            name="domicilio"
                            type="text"
                            defaultValue={domicilio ?? ''}
                            autoComplete="street-address"
                        />
                    </Field>
                    <Field instance="profile-personal-phone" label="Teléfono" htmlFor="profile-personal-phone">
                        <input
                            id="profile-personal-phone"
                            name="phone"
                            type="tel"
                            defaultValue={phone ?? ''}
                            autoComplete="tel"
                        />
                    </Field>
                    <Field instance="profile-personal-email" label="Correo electrónico" htmlFor="profile-personal-email">
                        <input
                            id="profile-personal-email"
                            name="email"
                            type="email"
                            defaultValue={email ?? ''}
                            autoComplete="email"
                        />
                    </Field>

                    {hasImages ? (
                        <div>
                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Documento</p>
                            <div className="space-y-3">
                                {images!.delantera ? (
                                    <DocImage src={images!.delantera} label="Delantera" />
                                ) : null}
                                {images!.trasera ? (
                                    <DocImage src={images!.trasera} label="Trasera" />
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                </form>
            ) : (
                <div className="space-y-4">
                    <FieldRead label="Nombre completo" value={fullName} />
                    <FieldRead label="NIF / NIE / Pasaporte" value={dni} />
                    <FieldRead label="Nº de afiliación a la S.S." value={afiliacionSeguridadSocial} />
                    <FieldRead label="Nacionalidad" value={nacionalidad} />
                    <FieldRead label="Fecha de nacimiento" value={formatBirthDate(fechaNacimiento)} />
                    <FieldRead label="Domicilio" value={domicilio} />
                    <FieldRead label="Teléfono" value={phone} />
                    <FieldRead label="Correo electrónico" value={email} />

                    {hasImages ? (
                        <div>
                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Documento</p>
                            <div className="space-y-3">
                                {images!.delantera ? (
                                    <DocImage src={images!.delantera} label="Delantera" />
                                ) : null}
                                {images!.trasera ? (
                                    <DocImage src={images!.trasera} label="Trasera" />
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                </div>
            )}
        </Modal>
    );
}

function FieldRead({ label, value }: { label: string; value: string | null | undefined }) {
    const text = value && value.trim() ? value : '—';
    return (
        <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{label}</p>
                <p className="text-zinc-800 font-bold text-sm min-w-0 break-words">{text}</p>
            </div>
        </div>
    );
}

function DocImage({ src, label }: { src: string; label: string }) {
    return (
        <div>
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{label}</p>
            <img
                src={src}
                alt={`${label} del documento`}
                className="w-full max-h-56 rounded-2xl border border-zinc-200 object-contain bg-white"
            />
        </div>
    );
}