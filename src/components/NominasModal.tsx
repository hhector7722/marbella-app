'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Plus, Trash2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { DocumentListRow } from '@/components/ui/DocumentListRow';
interface NominasModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** ID del perfil cuyas nóminas mostrar. Si no se pasa, usa el usuario logueado (propio perfil). */
    targetUserId?: string;
    isManager?: boolean;
}

interface NominaRow {
    id: string;
    user_id: string;
    mes: string;
    year: number;
    filename: string;
    storage_path: string;
    created_at?: string;
    bucket: 'nominas' | 'employee-documents';
    sourceTable: 'nominas' | 'employee_documents';
}

export default function NominasModal({ isOpen, onClose, targetUserId, isManager = false }: NominasModalProps) {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [nominas, setNominas] = useState<NominaRow[]>([]);
    const [uploading, setUploading] = useState(false);
    const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);



    const fetchNominas = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                toast.error('Debes iniciar sesión para ver tus nóminas');
                onClose();
                setLoading(false);
                return;
            }
            const effectiveUserId = targetUserId ?? user.id;
            setResolvedUserId(effectiveUserId);

            const { fetchNominasListForUser } = await import('@/app/actions/profile');
            const { rows, error } = await fetchNominasListForUser(effectiveUserId);
            if (error) {
                toast.error(error);
                setNominas([]);
                return;
            }
            setNominas(rows as NominaRow[]);
        } catch (err) {
            console.error('NominasModal fetch error:', err);
            toast.error('Error al cargar las nóminas');
            setNominas([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) fetchNominas();
    }, [isOpen, targetUserId]);

    /** Misma UX que antes (nueva pestaña + visor PDF nativo), pero la URL es la de la app, no Supabase. */
    const openNomina = (row: NominaRow) => {
        if (!row.storage_path) {
            toast.error('No se puede abrir este documento');
            return;
        }
        const q = new URLSearchParams({
            owner: row.user_id,
            path: row.storage_path,
        });
        window.open(`/api/nominas/open?${q.toString()}`, '_blank', 'noopener,noreferrer');
    };

    const handleShare = async (e: React.MouseEvent, row: NominaRow) => {
        e.stopPropagation();
        if (!navigator.share) {
            toast.error('Tu navegador no soporta compartir nativamente');
            return;
        }

        const q = new URLSearchParams({
            owner: row.user_id,
            path: row.storage_path,
        });
        const docUrl = `/api/nominas/open?${q.toString()}`;
        const title = labelPeriod(row);

        try {
            toast.loading('Preparando archivo...', { id: 'share-nomina' });
            const res = await fetch(docUrl);
            const blob = await res.blob();
            const file = new File([blob], `${title}.pdf`, { type: 'application/pdf' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                toast.dismiss('share-nomina');
                await navigator.share({
                    files: [file],
                    title: title,
                });
            } else {
                toast.dismiss('share-nomina');
                await navigator.share({
                    title: title,
                    url: window.location.origin + docUrl
                });
            }
        } catch (err: any) {
            toast.dismiss('share-nomina');
            if (err.name !== 'AbortError') {
                console.error('Error sharing:', err);
            }
        }
    };


    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !resolvedUserId) return;

        setUploading(true);
        try {
            const fileName = file.name;
            const filePath = `${resolvedUserId}/nominas/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('employee-documents')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw new Error(uploadError.message);

            const { addEmployeeDocumentByTipo } = await import('@/app/actions/profile');
            const result = await addEmployeeDocumentByTipo(resolvedUserId, {
                tipo: 'nomina',
                storage_path: filePath,
                filename: file.name
            });

            if (result.success) {
                toast.success('Nómina subida correctamente');
                fetchNominas();
            } else {
                throw new Error(result.error);
            }
        } catch (err: any) {
            toast.error(err.message || 'Error al subir la nómina');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleDelete = async (row: NominaRow) => {
        if (!confirm(`¿Seguro que quieres borrar la nómina de ${row.mes} ${row.year}?`)) return;
        try {
            const { deleteEmployeeDocumentByTipo, deleteLegacyNomina } = await import('@/app/actions/profile');
            let result;
            if (row.sourceTable === 'nominas') {
                result = await deleteLegacyNomina(row.id, row.storage_path);
            } else {
                result = await deleteEmployeeDocumentByTipo(row.id, row.storage_path, row.bucket);
            }

            if (result.success) {
                toast.success('Nómina eliminada');
                fetchNominas();
            } else {
                toast.error(result.error || 'Error al eliminar');
            }
        } catch (err) {
            toast.error('Error al eliminar');
        }
    };

    function labelPeriod(row: NominaRow) {
        const m = row.mes ?? '';
        const y = row.year ?? '';
        if (m || y) return `${m} ${y}`.trim();
        return row.filename.replace(/\.(pdf|docx?|jpe?g|png|webp)$/i, '') || 'Nómina';
    }

    if (!isOpen) return null;

    const uploadTrailing = isManager && resolvedUserId ? (
        <>
            <input type="file" id="nomina-upload" className="hidden" accept=".pdf" onChange={handleUpload} disabled={uploading} />
            <label
                htmlFor="nomina-upload"
                className={cn(
                    'relative flex h-full max-h-full min-h-0 w-[var(--modal-header-height)] shrink-0 cursor-pointer items-center justify-center rounded-ds-control border-0 bg-zinc-100 text-zinc-700 shadow-none outline-none transition-colors hover:bg-zinc-200 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-[""]',
                    uploading && 'opacity-60 cursor-wait'
                )}
                aria-label="Subir nómina"
            >
                {uploading ? <LoadingSpinner size="sm" className="text-zinc-700" /> : <Plus size={22} strokeWidth={2.5} />}
            </label>
        </>
    ) : null;

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title={targetUserId ? 'Nóminas' : 'Mis nóminas'}
            variant="standard"
            layer="base"
            instance="nominas"
            headerTone="petroleum"
            usageId="nominas"
            usageLabel="Nóminas"
            headerTrailing={uploadTrailing}
        >
            <div className="overflow-y-auto">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <LoadingSpinner size="lg" className="text-[#36606F]" />
                            <p className="mt-3 text-sm text-zinc-500 font-medium">Cargando nóminas…</p>
                        </div>
                    ) : nominas.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                            <p className="text-zinc-600 font-semibold text-sm">
                                {targetUserId ? 'Este empleado no tiene nóminas registradas en la app' : 'No hay nóminas registradas para tu cuenta'}
                            </p>
                            <p className="mt-3 text-xs text-zinc-500 leading-relaxed max-w-sm">
                                Las nóminas automáticas solo aparecen cuando el correo las procesa y quedan guardadas en base de datos.
                                Si el PDF ya existe pero ves esto vacío, revisa que tu DNI en el perfil coincida con la nómina o contacta con administración.
                            </p>
                        </div>
                    ) : (
                        <ul className="space-y-1">
                            {nominas.map((row) => (
                                <DocumentListRow
                                    key={row.id}
                                    instance={`nominas-row-${row.id}`}
                                    title={labelPeriod(row)}
                                    subtitle={row.filename.replace('.pdf', '')}
                                    onOpen={() => openNomina(row)}
                                    aria-label={`Abrir nómina ${labelPeriod(row)}`}
                                    trailing={
                                        <>
                                            <button
                                                type="button"
                                                onClick={(e) => handleShare(e, row)}
                                                className="shrink-0 self-center min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                                                title="Compartir"
                                                aria-label="Compartir nómina"
                                            >
                                                <Share2 size={16} strokeWidth={2.5} />
                                            </button>
                                            {isManager ? (
                                                <Button
                                                    type="button"
                                                    variant="tertiary"
                                                    instance={`nominas-delete-${row.id}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDelete(row);
                                                    }}
                                                    className="shrink-0 self-center mr-1"
                                                    aria-label="Eliminar nómina"
                                                    icon={<Trash2 size={16} strokeWidth={2} />}
                                                />
                                            ) : null}
                                        </>
                                    }
                                />
                            ))}
                        </ul>
                    )}
                </div>
        </Modal>
    );
}
