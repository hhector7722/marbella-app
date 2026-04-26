'use client';

import { X, Copy, Check, Upload, Eye } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DatosPersonalesModalProps {
    isOpen: boolean;
    onClose: () => void;
    dni: string | null;
    email: string;
    /** Id del perfil al que pertenecen los datos mostrados (empleado). */
    ownerUserId?: string;
    /** Solo manager viendo ficha de empleado. */
    canManageDniImage?: boolean;
}

type DniDocRow = { id: string; storage_path: string; filename: string };

export default function DatosPersonalesModal({
    isOpen,
    onClose,
    dni,
    email,
    ownerUserId,
    canManageDniImage,
}: DatosPersonalesModalProps) {
    const [copied, setCopied] = useState<string | null>(null);
    const [dniDoc, setDniDoc] = useState<DniDocRow | null>(null);
    const [dniDocLoading, setDniDocLoading] = useState(false);
    const [dniUploading, setDniUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const canDni = !!canManageDniImage && !!ownerUserId;
    const openHref = useMemo(() => {
        if (!dniDoc || !ownerUserId) return null;
        const qs = new URLSearchParams({
            owner: ownerUserId,
            tipo: 'dni',
            path: dniDoc.storage_path,
        });
        return `/api/employee-documents/open?${qs.toString()}`;
    }, [dniDoc, ownerUserId]);

    const copy = (text: string, label: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopied(label);
        toast.success(`${label} copiado`);
        setTimeout(() => setCopied(null), 2000);
    };

    useEffect(() => {
        let cancelled = false;
        async function loadExisting() {
            if (!isOpen) return;
            if (!canDni || !ownerUserId) {
                setDniDoc(null);
                return;
            }
            setDniDocLoading(true);
            try {
                const { createClient } = await import('@/utils/supabase/client');
                const supabase = createClient();
                const { data, error } = await supabase
                    .from('employee_documents')
                    .select('id, storage_path, filename')
                    .eq('user_id', ownerUserId)
                    .eq('tipo', 'dni')
                    .order('created_at', { ascending: false })
                    .limit(1);
                if (cancelled) return;
                if (error) {
                    console.error('load dni doc error', error);
                    toast.error('Error al cargar el DNI');
                    setDniDoc(null);
                    return;
                }
                setDniDoc((data?.[0] as DniDocRow) ?? null);
            } catch (e) {
                if (cancelled) return;
                console.error(e);
                toast.error('Error al cargar el DNI');
                setDniDoc(null);
            } finally {
                if (!cancelled) setDniDocLoading(false);
            }
        }
        loadExisting();
        return () => {
            cancelled = true;
        };
    }, [isOpen, canDni, ownerUserId]);

    if (!isOpen) return null;

    const handlePickDniImage = () => {
        if (!canDni) return;
        fileInputRef.current?.click();
    };

    const handleDniFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !canDni || !ownerUserId) return;

        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.type)) {
            toast.error('Formato no permitido. Usa JPG, PNG o WebP.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error('La imagen no puede superar 5 MB');
            return;
        }

        setDniUploading(true);
        try {
            const fd = new FormData();
            fd.append('dni_image', file);
            fd.append('ownerUserId', ownerUserId);
            const res = await fetch('/api/employee-documents/dni', {
                method: 'POST',
                body: fd,
                credentials: 'same-origin',
            });
            let data: { success?: boolean; error?: string; doc?: DniDocRow } = {};
            try {
                data = await res.json();
            } catch {
                toast.error(res.statusText || 'Error al subir');
                return;
            }
            if (!res.ok || !data.success) {
                const msg = data.error || res.statusText || 'Error al subir';
                toast.error(msg);
                console.error('dni upload failed:', res.status, msg);
                return;
            }
            if (data.doc) setDniDoc(data.doc);
            toast.success('DNI actualizado');
        } catch (err) {
            console.error(err);
            toast.error('Error al subir');
        } finally {
            setDniUploading(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className={cn(
                    'bg-white w-full max-w-sm rounded-3xl shadow-xl border border-zinc-100 overflow-hidden',
                    'animate-in zoom-in-95 duration-200'
                )}
                onClick={e => e.stopPropagation()}
            >
                <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-[#36606F] text-white">
                    <h2 className="text-base font-black uppercase tracking-wider">Datos personales</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-white/80 hover:bg-white/20 transition-colors active:scale-95"
                        aria-label="Cerrar"
                    >
                        <X size={22} strokeWidth={2.5} />
                    </button>
                </div>
                <div className="p-6 space-y-5">
                    <div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">DNI / NIE</p>
                        <div className="flex items-center gap-2">
                            <p className="text-zinc-800 font-bold text-sm flex-1 min-w-0 break-words">{dni || '—'}</p>
                            {dni && (
                                <button
                                    onClick={() => copy(dni, 'DNI')}
                                    className="shrink-0 min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl bg-zinc-100 text-zinc-500 hover:bg-[#36606F]/10 hover:text-[#36606F] transition-colors"
                                >
                                    {copied === 'DNI' ? <Check size={20} className="text-emerald-500" /> : <Copy size={18} />}
                                    <span className="text-[10px] text-zinc-400 font-medium leading-tight">copiar</span>
                                </button>
                            )}
                            {canDni && (
                                <>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        onChange={handleDniFileChange}
                                        className="hidden"
                                    />
                                    <button
                                        type="button"
                                        onClick={handlePickDniImage}
                                        disabled={dniUploading}
                                        className={cn(
                                            'shrink-0 min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl',
                                            'bg-zinc-100 text-zinc-500 hover:bg-[#36606F]/10 hover:text-[#36606F] transition-colors active:scale-95',
                                            (dniUploading || dniDocLoading) && 'opacity-60 pointer-events-none'
                                        )}
                                        aria-label="Subir imagen DNI"
                                        title="Subir imagen DNI"
                                    >
                                        <Upload size={18} />
                                        <span className="text-[10px] text-zinc-400 font-medium leading-tight">
                                            {dniUploading ? 'subiendo' : 'imagen'}
                                        </span>
                                    </button>
                                    {openHref && (
                                        <button
                                            type="button"
                                            onClick={() => window.open(openHref, '_blank')}
                                            className="shrink-0 min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl bg-zinc-100 text-zinc-500 hover:bg-[#36606F]/10 hover:text-[#36606F] transition-colors active:scale-95"
                                            aria-label="Ver imagen DNI"
                                            title="Ver imagen DNI"
                                        >
                                            <Eye size={18} />
                                            <span className="text-[10px] text-zinc-400 font-medium leading-tight">ver</span>
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Email</p>
                        <div className="flex items-center gap-2">
                            <p className="text-zinc-800 font-bold text-sm flex-1 min-w-0 break-all">{email || '—'}</p>
                            {email && (
                                <button
                                    onClick={() => copy(email, 'Email')}
                                    className="shrink-0 min-h-[48px] min-w-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl bg-zinc-100 text-zinc-500 hover:bg-[#36606F]/10 hover:text-[#36606F] transition-colors"
                                >
                                    {copied === 'Email' ? <Check size={20} className="text-emerald-500" /> : <Copy size={18} />}
                                    <span className="text-[10px] text-zinc-400 font-medium leading-tight">copiar</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
