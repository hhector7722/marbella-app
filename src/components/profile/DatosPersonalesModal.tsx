'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Pencil } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
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
    avatarUrl?: string | null;
    /** Id del perfil al que pertenecen los datos mostrados (empleado). */
    ownerUserId?: string;
    /** El responsable puede pasar a modo edición desde la cabecera. */
    canEdit?: boolean;
    /** Se llama tras guardar para refrescar la ficha. */
    onSaved?: () => void;
}

interface PersonalDocImages {
    delantera: string | null;
    trasera: string | null;
}

function formatBirthDate(ymd?: string | null): string {
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return ymd;
    return format(new Date(y, m - 1, d), "d 'de' MMMM 'de' yyyy", { locale: es });
}

function displayValue(value: string | null | undefined): string {
    return value && value.trim() ? value : '';
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
    avatarUrl,
    ownerUserId,
    canEdit = false,
    onSaved,
}: DatosPersonalesModalProps) {
    const [images, setImages] = useState<PersonalDocImages | null>(null);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);

    const fullName = `${firstName} ${lastName || ''}`.trim();

    useEffect(() => {
        let cancelled = false;
        async function loadImages() {
            if (!isOpen) {
                setEditing(false);
                return;
            }
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
            aria-label="Editar datos personales"
        >
            <Pencil size={16} strokeWidth={2} />
        </button>
    );

    const recordContent = (
        <div>
            <div className="flex items-center gap-ds-3 px-ds-4 py-ds-3">
                <Avatar
                    src={avatarUrl}
                    alt={fullName}
                    size="md"
                    className="ring-2 ring-white/20"
                />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold leading-tight text-ds-texto-invertido">
                        {fullName}
                    </p>
                </div>
            </div>

            <RecordSection title="Identificación">
                <FieldCell label="NIF / NIE / Pasaporte" value={dni} />
                <FieldCell label="Nº afiliación S.S." value={afiliacionSeguridadSocial} />
                <FieldCell label="Nacionalidad" value={nacionalidad} />
                <FieldCell label="Fecha de nacimiento" value={formatBirthDate(fechaNacimiento)} />
            </RecordSection>

            <RecordSection title="Contacto">
                <FieldCell label="Teléfono" value={phone} />
                <FieldCell label="Correo electrónico" value={email} />
            </RecordSection>

            <RecordSection title="Domicilio">
                <FieldCell label="Dirección" value={domicilio} className="col-span-2" />
            </RecordSection>

            {hasImages ? (
                <RecordSection title="Documento">
                    {images!.delantera ? (
                        <DocImage src={images!.delantera} label="Delantera" />
                    ) : null}
                    {images!.trasera ? (
                        <DocImage src={images!.trasera} label="Trasera" />
                    ) : null}
                </RecordSection>
            ) : null}
        </div>
    );

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Datos personales"
            variant="standard"
            layer="base"
            instance="profile-personal"
            headerTone="petroleum"
            scheme="dark"
            usageId="profile-personal"
            usageLabel="Datos personales"
            headerTrailing={canEdit && !editing ? editButton : undefined}
            footer={
                canEdit && editing ? (
                    <div className="flex w-full flex-wrap items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            instance="profile-personal-cancel"
                            disabled={saving}
                            onClick={() => setEditing(false)}
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
            {canEdit && editing ? (
                <form id="profile-personal-form" onSubmit={handleSave} className="space-y-4">
                    <div className="grid grid-cols-2 gap-x-ds-4 gap-y-ds-3">
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
                        <div className="col-span-2">
                            <Field instance="profile-personal-domicilio" label="Domicilio" htmlFor="profile-personal-domicilio">
                                <input
                                    id="profile-personal-domicilio"
                                    name="domicilio"
                                    type="text"
                                    defaultValue={domicilio ?? ''}
                                    autoComplete="street-address"
                                />
                            </Field>
                        </div>
                    </div>

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
                recordContent
            )}
        </Modal>
    );
}

function RecordSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="border-t border-white/10 first:border-t-0">
            <h3 className="px-ds-4 pt-ds-3 pb-ds-1 text-[11px] font-medium tracking-wide text-white/60">
                {title}
            </h3>
            <div className="grid grid-cols-2 gap-x-ds-4 px-ds-4 pb-ds-2">{children}</div>
        </section>
    );
}

function FieldCell({
    label,
    value,
    className,
}: {
    label: string;
    value: string | null | undefined;
    className?: string;
}) {
    return (
        <div className={cn('min-w-0 py-ds-1', className)}>
            <p className="text-[10px] font-medium leading-tight text-white/55">{label}</p>
            <p className="mt-0.5 text-[12px] font-normal leading-snug break-words text-ds-texto-invertido">
                {displayValue(value)}
            </p>
        </div>
    );
}

function DocImage({ src, label }: { src: string; label: string }) {
    return (
        <div className="min-w-0">
            <p className="text-[11px] font-medium leading-tight text-ds-texto-tenue">{label}</p>
            <img
                src={src}
                alt={`${label} del documento`}
                className="mt-1 w-full max-h-40 rounded-ds-control border border-ds-borde object-contain bg-white"
            />
        </div>
    );
}