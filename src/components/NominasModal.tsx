'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { X, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
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
    const [openingNominaId, setOpeningNominaId] = useState<string | null>(null);
    const [pdfViewer, setPdfViewer] = useState<{ blobUrl: string; title: string } | null>(null);
    const [uploading, setUploading] = useState(false);



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

    const closePdfViewer = () => {
        setPdfViewer((prev) => {
            if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl);
            return null;
        });
    };

    const openNomina = async (row: NominaRow) => {
        if (!row.storage_path) {
            toast.error('No se puede abrir este documento');
            return;
        }
        setOpeningNominaId(row.id);
        try {
            const { getNominaSignedDownloadUrl } = await import('@/app/actions/profile');
            const result = await getNominaSignedDownloadUrl({
                ownerUserId: row.user_id,
                storagePath: row.storage_path
            });
            if (result.error || !result.url) {
                toast.error(result.error || 'No se pudo generar el enlace');
                return;
            }
            const res = await fetch(result.url);
            if (!res.ok) {
                toast.error('No se pudo cargar el PDF');
                return;
            }
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            setPdfViewer({ blobUrl, title: labelPeriod(row) });
        } catch (err) {
            console.error('Error abriendo nómina:', err);
            toast.error('No se pudo abrir el documento.');
        } finally {
            setOpeningNominaId(null);
        }
    };


    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !targetUserId) return;

        setUploading(true);
        try {
            const ext = file.name.split('.').pop() || 'pdf';
            const uploadMonth = new Date().toLocaleString('es-ES', { month: 'long' }).toLowerCase();
            const uploadYear = new Date().getFullYear();
            const fileName = `nomina_${uploadMonth}_${uploadYear}_${Date.now()}.${ext}`;
            const filePath = `${targetUserId}/nominas/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('employee-documents')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw new Error(uploadError.message);

            const { addEmployeeDocumentByTipo } = await import('@/app/actions/profile');
            const result = await addEmployeeDocumentByTipo(targetUserId, {
                tipo: 'nomina',
                storage_path: filePath,
                filename: file.name,
                mes: uploadMonth,
                year: uploadYear
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
        return row.filename || 'Nómina';
    }

    if (!isOpen && !pdfViewer) return null;

    return (
        <>
        {pdfViewer && (
            <div
                className="fixed inset-0 z-[200] flex flex-col bg-white animate-in fade-in duration-200"
                role="dialog"
                aria-modal="true"
                aria-label="Visor de nómina"
            >
                <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 bg-[#36606F] text-white min-h-[52px]">
                    <p className="text-sm font-black uppercase tracking-wider truncate pr-2">
                        Nómina · {pdfViewer.title}
                    </p>
                    <button
                        type="button"
                        onClick={closePdfViewer}
                        className="min-h-[48px] min-w-[48px] shrink-0 flex items-center justify-center rounded-xl text-white hover:bg-white/20 transition-colors"
                        aria-label="Cerrar visor"
                    >
                        <X size={22} strokeWidth={2.5} />
                    </button>
                </div>
                <iframe
                    title={pdfViewer.title}
                    src={pdfViewer.blobUrl}
                    className="flex-1 w-full min-h-0 border-0 bg-zinc-100"
                />
            </div>
        )}
        {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className={cn('bg-white w-full max-w-lg rounded-3xl shadow-xl border border-zinc-100 overflow-hidden animate-in zoom-in-95 duration-200')} onClick={e => e.stopPropagation()}>
                <div className="shrink-0 flex items-center justify-between px-6 py-4 bg-[#36606F] text-white">
                    <h2 className="text-base font-black uppercase tracking-wider">
                        {targetUserId ? 'Nóminas' : 'Mis nóminas'}
                    </h2>
                    <div className="flex items-center gap-2">
                        {isManager && targetUserId && (
                            <>
                                <input type="file" id="nomina-upload" className="hidden" accept=".pdf" onChange={handleUpload} disabled={uploading} />
                                <label htmlFor="nomina-upload" className={cn('min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl cursor-pointer transition-colors bg-white/20 hover:bg-white/30', uploading && 'opacity-60 cursor-wait')}>
                                    {uploading ? <LoadingSpinner size="sm" className="text-white" /> : <Plus size={22} strokeWidth={2.5} />}
                                </label>
                            </>
                        )}
                        <button type="button" onClick={onClose} className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-white hover:bg-white/20 transition-colors" aria-label="Cerrar">
                            <X size={22} strokeWidth={2.5} />
                        </button>
                    </div>
                </div>



                <div className="flex-1 overflow-y-auto max-h-[60vh] p-4">
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
                                <li key={row.id} className="min-h-[56px] flex items-stretch gap-1 rounded-xl border border-transparent hover:border-zinc-100 hover:bg-zinc-50 transition-colors">
                                    <button
                                        type="button"
                                        onClick={() => openNomina(row)}
                                        disabled={openingNominaId !== null}
                                        className={cn(
                                            'flex-1 min-w-0 flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors',
                                            'active:bg-zinc-100 disabled:opacity-60 disabled:pointer-events-none'
                                        )}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-zinc-700 truncate uppercase text-[11px] tracking-wide">{labelPeriod(row)}</p>
                                            <p className="text-[10px] text-zinc-400 truncate">{row.filename.replace('.pdf', '')}</p>
                                        </div>
                                        {openingNominaId === row.id ? (
                                            <LoadingSpinner size="sm" className="shrink-0 text-[#36606F]" />
                                        ) : null}
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
                                            aria-label="Eliminar nómina"
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
        )}
        </>
    );
}