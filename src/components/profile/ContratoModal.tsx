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
import { addEmployeeDocumentByTipo, deleteEmployeeDocumentByTipo } from '@/app/actions/profile';

interface ContratoModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    isManager?: boolean;
}

interface DocRow {
    id: string;
    filename: string;
    storage_path: string;
    created_at: string;
    bucket: 'nominas' | 'employee-documents';
}

export default function ContratoModal({ isOpen, onClose, userId, isManager = false }: ContratoModalProps) {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [docs, setDocs] = useState<DocRow[]>([]);
    const [uploading, setUploading] = useState(false);

    const fetchDocs = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('employee_documents')
                .select('id, filename, storage_path, created_at')
                .eq('user_id', userId)
                .eq('tipo', 'contrato')
                .order('created_at', { ascending: false });

            if (error) {
                toast.error('Error al cargar contratos');
                setDocs([]);
            } else {
                const mapped = (data || []).map((row) => ({
                    ...row,
                    bucket: /^\d{2}\/\d{4}\//.test(row.storage_path) ? 'nominas' : 'employee-documents',
                })) as DocRow[];
                setDocs(mapped);
            }
        } catch {
            setDocs([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        fetchDocs();
    }, [isOpen, userId]);

    const openDoc = (doc: DocRow) => {
        const q = new URLSearchParams({
            owner: userId,
            path: doc.storage_path,
            tipo: 'contrato',
        });
        window.open(`/api/employee-documents/open?${q.toString()}`, '_blank', 'noopener,noreferrer');
    };

    const handleShare = async (e: React.MouseEvent, doc: DocRow) => {
        e.stopPropagation();
        if (!navigator.share) {
            toast.error('Tu navegador no soporta compartir nativamente');
            return;
        }

        const q = new URLSearchParams({
            owner: userId,
            path: doc.storage_path,
            tipo: 'contrato',
        });
        const docUrl = `/api/employee-documents/open?${q.toString()}`;
        const title = doc.filename.replace(/\.(pdf|docx?|jpe?g|png|webp)$/i, '') || 'Contrato';

        try {
            toast.loading('Preparando archivo...', { id: 'share-doc' });
            const res = await fetch(docUrl);
            const blob = await res.blob();
            const ext = doc.filename.split('.').pop() || 'pdf';
            const type = ext.toLowerCase() === 'pdf' ? 'application/pdf' : 
                         ext.toLowerCase().match(/jpe?g/) ? 'image/jpeg' : 
                         ext.toLowerCase() === 'png' ? 'image/png' : 'application/octet-stream';
            const file = new File([blob], `${title}.${ext}`, { type });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                toast.dismiss('share-doc');
                await navigator.share({
                    files: [file],
                    title: title,
                });
            } else {
                toast.dismiss('share-doc');
                await navigator.share({
                    title: title,
                    url: window.location.origin + docUrl
                });
            }
        } catch (err: any) {
            toast.dismiss('share-doc');
            if (err.name !== 'AbortError') {
                console.error('Error sharing:', err);
            }
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const fileName = file.name;
            const filePath = `${userId}/contratos/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('employee-documents')
                .upload(filePath, file, { upsert: true });

            if (uploadError) {
                console.error('Storage upload error:', uploadError);
                throw new Error(uploadError.message || 'Error al subir el archivo');
            }

            const result = await addEmployeeDocumentByTipo(userId, {
                tipo: 'contrato',
                storage_path: filePath,
                filename: file.name,
            });

            if (result.success) {
                toast.success('Contrato subido correctamente');
                fetchDocs();
            } else {
                throw new Error(result.error);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al subir el contrato';
            toast.error(msg);
            console.error('ContratoModal upload error:', err);
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleDelete = async (doc: DocRow) => {
        if (!confirm('¿Seguro que quieres borrar este contrato?')) return;
        const result = await deleteEmployeeDocumentByTipo(doc.id, doc.storage_path, doc.bucket);
        if (result.success) {
            toast.success('Contrato eliminado');
            fetchDocs();
        } else {
            toast.error(result.error || 'Error al eliminar');
        }
    };

    const uploadTrailing = isManager ? (
        <>
            <input
                type="file"
                id="contrato-upload"
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                onChange={handleUpload}
                disabled={uploading}
            />
            <label
                htmlFor="contrato-upload"
                className={cn(
                    'relative flex h-full max-h-full min-h-0 w-[var(--modal-header-height)] shrink-0 cursor-pointer items-center justify-center rounded-ds-control border-0 bg-zinc-100 text-zinc-700 shadow-none outline-none transition-colors hover:bg-zinc-200 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-[""]',
                    uploading && 'opacity-60 cursor-wait'
                )}
                aria-label="Subir contrato"
            >
                {uploading ? <LoadingSpinner size="sm" className="text-zinc-700" /> : <Plus size={22} strokeWidth={2.5} />}
            </label>
        </>
    ) : null;

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            title="Contrato"
            variant="standard"
            layer="derived"
            instance="profile-contract"
            parentInstance="documentos-menu"
            headerTone="petroleum"
            usageId="profile-contract"
            usageLabel="Contrato perfil"
            headerTrailing={uploadTrailing}
        >
            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <LoadingSpinner size="lg" className="text-[#36606F]" />
                        <p className="mt-3 text-sm text-zinc-500 font-medium">Cargando…</p>
                    </div>
                ) : docs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                        <p className="text-zinc-600 font-semibold text-sm">No hay contrato registrado</p>
                        <p className="mt-3 text-xs text-zinc-500 leading-relaxed max-w-sm">
                            Sube un archivo con el botón + de la cabecera.
                        </p>
                    </div>
                ) : (
                    <ul className="space-y-1">
                        {docs.map((row) => {
                            const title =
                                row.filename.replace(/\.(pdf|docx?|jpe?g|png|webp)$/i, '') ||
                                'Contrato';
                            return (
                                <DocumentListRow
                                    key={row.id}
                                    instance={`contrato-row-${row.id}`}
                                    title={title}
                                    onOpen={() => openDoc(row)}
                                    aria-label={`Abrir ${title}`}
                                    trailing={
                                        <>
                                            <button
                                                type="button"
                                                onClick={(e) => handleShare(e, row)}
                                                className="shrink-0 self-center min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                                                title="Compartir"
                                                aria-label="Compartir"
                                            >
                                                <Share2 size={16} strokeWidth={2.5} />
                                            </button>
                                            {isManager ? (
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    instance={`contrato-eliminar-${row.id}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDelete(row);
                                                    }}
                                                    aria-label="Eliminar"
                                                    icon={<Trash2 size={16} strokeWidth={2} />}
                                                    className="shrink-0 self-center"
                                                />
                                            ) : null}
                                        </>
                                    }
                                />
                            );
                        })}
                    </ul>
                )}
            </div>
        </Modal>
    );
}
