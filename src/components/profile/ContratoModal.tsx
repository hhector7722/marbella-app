'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { X, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
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

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const ext = file.name.split('.').pop() || 'pdf';
            const fileName = `contrato_${Date.now()}.${ext}`;
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

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className={cn(
                    'bg-white w-full max-w-lg rounded-3xl shadow-xl border border-zinc-100 overflow-hidden animate-in zoom-in-95 duration-200'
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="shrink-0 flex items-center justify-between px-6 py-4 bg-[#36606F] text-white">
                    <h2 className="text-base font-black uppercase tracking-wider">Contrato</h2>
                    <div className="flex items-center gap-2">
                        {isManager && (
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
                                        'min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl cursor-pointer transition-colors bg-white/20 hover:bg-white/30',
                                        uploading && 'opacity-60 cursor-wait'
                                    )}
                                    aria-label="Subir contrato"
                                >
                                    {uploading ? <LoadingSpinner size="sm" className="text-white" /> : <Plus size={22} strokeWidth={2.5} />}
                                </label>
                            </>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-white hover:bg-white/20 transition-colors"
                            aria-label="Cerrar"
                        >
                            <X size={22} strokeWidth={2.5} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[60vh] p-4">
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
                            {docs.map((row) => (
                                <li
                                    key={row.id}
                                    className="min-h-[56px] flex items-stretch gap-1 rounded-xl border border-transparent hover:border-zinc-100 hover:bg-zinc-50 transition-colors"
                                >
                                    <button
                                        type="button"
                                        onClick={() => openDoc(row)}
                                        className={cn(
                                            'flex-1 min-w-0 flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors',
                                            'active:bg-zinc-100'
                                        )}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-zinc-700 truncate uppercase text-[11px] tracking-wide">
                                                {row.filename.replace(/\.(pdf|docx?|jpe?g|png|webp)$/i, '') || 'Contrato'}
                                            </p>
                                        </div>
                                    </button>
                                    {isManager && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(row);
                                            }}
                                            className="shrink-0 self-center min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition-colors mr-1"
                                            title="Eliminar"
                                            aria-label="Eliminar"
                                        >
                                            <Trash2 size={16} strokeWidth={2} />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
