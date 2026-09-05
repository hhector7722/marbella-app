'use client';

import { Copy, Check } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Modal } from '@/components/ui/modal';

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
}: DatosPersonalesModalProps) {
    const [copied, setCopied] = useState<string | null>(null);
    const [images, setImages] = useState<PersonalDocImages | null>(null);

    const fullName = `${firstName} ${lastName || ''}`.trim();

    const copy = (text: string, label: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopied(label);
        toast.success(`${label} copiado`);
        setTimeout(() => setCopied(null), 2000);
    };

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
        >
            <div className="space-y-4">
                <Field label="Nombre completo" value={fullName} />
                <Field label="NIF / NIE / Pasaporte" value={dni} onCopy={dni ? () => copy(dni, 'NIF / NIE / Pasaporte') : undefined} copied={copied === 'NIF / NIE / Pasaporte'} />
                <Field label="Nº de afiliación a la S.S." value={afiliacionSeguridadSocial} />
                <Field label="Nacionalidad" value={nacionalidad} />
                <Field label="Fecha de nacimiento" value={formatBirthDate(fechaNacimiento)} />
                <Field label="Domicilio" value={domicilio} />
                <Field label="Teléfono" value={phone} onCopy={phone ? () => copy(phone, 'Teléfono') : undefined} copied={copied === 'Teléfono'} />
                <Field label="Correo electrónico" value={email} onCopy={email ? () => copy(email, 'Email') : undefined} copied={copied === 'Email'} />

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
        </Modal>
    );
}

function Field({
    label,
    value,
    onCopy,
    copied,
}: {
    label: string;
    value: string | null | undefined;
    onCopy?: () => void;
    copied?: boolean;
}) {
    const text = value && value.trim() ? value : '—';
    return (
        <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{label}</p>
                <p className="text-zinc-800 font-bold text-sm min-w-0 break-words">{text}</p>
            </div>
            {onCopy && (
                <button
                    type="button"
                    onClick={onCopy}
                    className="shrink-0 min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl bg-zinc-100 text-zinc-500 hover:bg-[#36606F]/10 hover:text-[#36606F] transition-colors"
                    aria-label={`Copiar ${label}`}
                >
                    {copied ? <Check size={20} className="text-emerald-500" /> : <Copy size={18} />}
                    <span className="text-[10px] text-zinc-400 font-medium leading-tight">copiar</span>
                </button>
            )}
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