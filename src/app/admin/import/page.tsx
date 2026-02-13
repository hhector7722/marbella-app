'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import {
    Upload,
    FileText,
    CheckCircle2,
    AlertCircle,
    Loader2,
    ChevronLeft,
    Database,
    AlertTriangle,
    X,
    FileUp
} from 'lucide-react';
import Papa from 'papaparse';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface CSVRow {
    email: string;
    date: string;
    check_in: string;
    check_out: string;
}

interface ImportResult {
    total: number;
    success: number;
    failed: number;
    missingEmails: string[];
}

export default function BulkImportPage() {
    const supabase = createClient();
    const router = useRouter();

    // Auth & Permission
    const [loading, setLoading] = useState(true);
    const [isAuthorized, setIsAuthorized] = useState(false);

    // Import State
    const [file, setFile] = useState<File | null>(null);
    const [previewData, setPreviewData] = useState<CSVRow[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<ImportResult | null>(null);

    useEffect(() => {
        const checkAuth = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.replace('/login');
                return;
            }
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            if (profile?.role === 'manager') {
                setIsAuthorized(true);
            } else {
                router.replace('/staff/dashboard');
            }
            setLoading(false);
        };
        checkAuth();
    }, [router, supabase]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            processFile(selectedFile);
        }
    };

    const processFile = (file: File) => {
        if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
            toast.error('Por favor, sube un archivo CSV válido');
            return;
        }

        setFile(file);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                setPreviewData(results.data.slice(0, 5) as CSVRow[]);
            },
            error: (error) => {
                toast.error('Error al leer el archivo: ' + error.message);
            }
        });
    };

    const handleImport = async () => {
        if (!file) return;

        setIsProcessing(true);
        setProgress(0);
        setResult(null);

        try {
            // 1. Fetch all profiles for mapping
            const { data: profiles, error: profError } = await supabase
                .from('profiles')
                .select('id, email');

            if (profError) throw profError;

            const emailToIdMap = new Map(profiles.map(p => [p.email?.toLowerCase(), p.id]));

            // 2. Parse full file
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: async (results) => {
                    const rows = results.data as CSVRow[];
                    const totalRows = rows.length;

                    // 3. Map & Validate
                    const validEntries: any[] = [];
                    const missingEmails = new Set<string>();

                    rows.forEach(row => {
                        const userId = emailToIdMap.get(row.email?.toLowerCase());
                        if (userId && row.date && row.check_in && row.check_out) {
                            validEntries.push({
                                user_id: userId,
                                clock_in: `${row.date}T${row.check_in}:00`,
                                clock_out: `${row.date}T${row.check_out}:00`,
                                event_type: 'regular',
                                is_manual_entry: true
                            });
                        } else if (!userId && row.email) {
                            missingEmails.add(row.email);
                        }
                    });

                    // 4. Sort Chronologically (ASC)
                    validEntries.sort((a, b) => new Date(a.clock_in).getTime() - new Date(b.clock_in).getTime());

                    // 5. Batch Insertion (50 at a time)
                    const batchSize = 50;
                    let successCount = 0;
                    let failCount = 0;

                    for (let i = 0; i < validEntries.length; i += batchSize) {
                        const batch = validEntries.slice(i, i + batchSize);
                        const { error: insertError } = await supabase
                            .from('time_logs')
                            .insert(batch);

                        if (insertError) {
                            console.error('Batch error:', insertError);
                            failCount += batch.length;
                        } else {
                            successCount += batch.length;
                        }

                        const currentProgress = Math.min(100, Math.round(((i + batch.length) / validEntries.length) * 100));
                        setProgress(currentProgress);
                    }

                    setResult({
                        total: totalRows,
                        success: successCount,
                        failed: totalRows - successCount,
                        missingEmails: Array.from(missingEmails)
                    });
                    setIsProcessing(false);
                    toast.success('Importación finalizada');
                }
            });

        } catch (err: any) {
            toast.error('Error crítico: ' + err.message);
            setIsProcessing(false);
        }
    };

    if (loading) return (
        <div className="min-h-screen bg-[#5B8FB9] flex flex-col items-center justify-center p-4">
            <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4"></div>
            <p className="text-white/80 font-black uppercase tracking-widest text-[10px] animate-pulse">Verificando acceso...</p>
        </div>
    );

    if (!isAuthorized) return null;

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-6 pb-24">
            <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col min-h-[80vh]">

                    {/* CABECERA */}
                    <div className="bg-[#5B8FB9] px-8 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => router.back()}
                                className="p-2 hover:bg-white/10 rounded-xl text-white transition-all active:scale-95"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <div className="flex items-center gap-2">
                                <Database className="text-white" size={20} />
                                <h1 className="text-base font-black text-white uppercase tracking-wider">
                                    Importación Masiva
                                </h1>
                            </div>
                        </div>
                    </div>

                    <div className="p-8 flex-1 flex flex-col">
                        {!result ? (
                            <>
                                {/* DROPZONE */}
                                <div
                                    className={cn(
                                        "relative group overflow-hidden border-2 border-dashed rounded-[2rem] p-10 transition-all flex flex-col items-center justify-center gap-4 text-center mb-8",
                                        file ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-100 hover:border-[#5B8FB9] hover:bg-white shadow-sm"
                                    )}
                                >
                                    <input
                                        type="file"
                                        accept=".csv"
                                        onChange={handleFileChange}
                                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                    />
                                    <div className={cn(
                                        "w-20 h-20 rounded-3xl flex items-center justify-center transition-all shadow-md group-hover:scale-110",
                                        file ? "bg-emerald-500 text-white" : "bg-white text-gray-400 group-hover:text-[#5B8FB9]"
                                    )}>
                                        {file ? <CheckCircle2 size={36} /> : <FileUp size={36} />}
                                    </div>
                                    <div>
                                        <p className="font-black text-gray-800 uppercase text-sm tracking-tight">
                                            {file ? file.name : 'Subir Archivo CSV'}
                                        </p>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                                            {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Arrastra o haz clic aquí'}
                                        </p>
                                    </div>
                                </div>

                                {/* PREVIEW TABLE */}
                                {previewData.length > 0 && (
                                    <div className="mb-8">
                                        <div className="flex items-center gap-2 mb-4 px-2">
                                            <FileText size={14} className="text-gray-400" />
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Previsualización (Primeras 5 filas)</span>
                                        </div>
                                        <div className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-100">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-gray-100/50">
                                                        <th className="px-4 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Email</th>
                                                        <th className="px-4 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Fecha</th>
                                                        <th className="px-4 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Entrada</th>
                                                        <th className="px-4 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest">Salida</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {previewData.map((row, i) => (
                                                        <tr key={i} className="hover:bg-white transition-colors">
                                                            <td className="px-4 py-3 text-[10px] font-bold text-gray-600 truncate max-w-[120px]">{row.email}</td>
                                                            <td className="px-4 py-3 text-[10px] font-bold text-gray-600">{row.date}</td>
                                                            <td className="px-4 py-3 text-[10px] font-bold text-gray-600">{row.check_in}</td>
                                                            <td className="px-4 py-3 text-[10px] font-bold text-gray-600">{row.check_out}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* ACTION BUTTONS & PROGRESS */}
                                <div className="mt-auto pt-6 border-t border-gray-50">
                                    {isProcessing ? (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between px-2">
                                                <div className="flex items-center gap-2">
                                                    <Loader2 className="animate-spin text-[#5B8FB9]" size={16} />
                                                    <span className="text-[10px] font-black text-gray-800 uppercase tracking-widest">Procesando...</span>
                                                </div>
                                                <span className="text-xs font-black text-[#5B8FB9]">{progress}%</span>
                                            </div>
                                            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-[#5B8FB9] transition-all duration-300"
                                                    style={{ width: `${progress}%` }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            disabled={!file}
                                            onClick={handleImport}
                                            className={cn(
                                                "w-full h-16 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] font-black uppercase text-xs tracking-widest shadow-lg",
                                                file
                                                    ? "bg-[#5B8FB9] text-white hover:bg-[#46769c]"
                                                    : "bg-gray-100 text-gray-300 cursor-not-allowed shadow-none"
                                            )}
                                        >
                                            <Database size={18} />
                                            Comenzar Importación
                                        </button>
                                    )}
                                </div>
                            </>
                        ) : (
                            /* RESULTS SUMMARY */
                            <div className="flex-1 flex flex-col">
                                <div className="flex flex-col items-center text-center py-10">
                                    <div className="w-24 h-24 rounded-[2.5rem] bg-emerald-50 text-emerald-500 flex items-center justify-center mb-6 shadow-sm">
                                        <CheckCircle2 size={48} />
                                    </div>
                                    <h2 className="text-2xl font-black text-gray-800 tracking-tighter mb-2">¡Importación Finalizada!</h2>
                                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Resumen de operaciones</p>
                                </div>

                                <div className="grid grid-cols-3 gap-4 mb-8">
                                    <div className="bg-gray-50 p-4 rounded-3xl text-center">
                                        <span className="text-[9px] font-black text-gray-400 uppercase block mb-1">Total CSV</span>
                                        <span className="text-xl font-black text-gray-800">{result.total}</span>
                                    </div>
                                    <div className="bg-emerald-50 p-4 rounded-3xl text-center">
                                        <span className="text-[9px] font-black text-emerald-400 uppercase block mb-1">Éxito</span>
                                        <span className="text-xl font-black text-emerald-600">{result.success}</span>
                                    </div>
                                    <div className="bg-rose-50 p-4 rounded-3xl text-center">
                                        <span className="text-[9px] font-black text-rose-400 uppercase block mb-1">Error</span>
                                        <span className="text-xl font-black text-rose-600">{result.failed}</span>
                                    </div>
                                </div>

                                {result.missingEmails.length > 0 && (
                                    <div className="flex-1 overflow-hidden flex flex-col">
                                        <div className="flex items-center gap-2 mb-3 px-2">
                                            <AlertTriangle size={14} className="text-amber-500" />
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Emails no encontrados ({result.missingEmails.length})</span>
                                        </div>
                                        <div className="flex-1 bg-amber-50 rounded-2xl overflow-y-auto p-4 border border-amber-100 custom-scrollbar">
                                            <ul className="space-y-2">
                                                {result.missingEmails.map((email, i) => (
                                                    <li key={i} className="text-[10px] font-bold text-amber-700 flex items-center gap-2">
                                                        <div className="w-1 h-1 rounded-full bg-amber-300" />
                                                        {email}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={() => {
                                        setFile(null);
                                        setPreviewData([]);
                                        setResult(null);
                                    }}
                                    className="mt-8 w-full h-14 bg-gray-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.2em] shadow-xl hover:bg-black transition-all active:scale-95"
                                >
                                    Realizar otra importación
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
