'use client';

import { useEffect, useState, Suspense } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    User, Phone, CreditCard, FileText, Copy, Check,
    Briefcase, Hash, Euro, FileClock, PhoneCall, Mail
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';

// Definimos la interfaz basada en los datos
interface UserProfile {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    dni: string | null;
    ss_number: string | null;
    bank_account: string | null; // IBAN
    contract_hours: number | null;
    overtime_rate: number | null;
    role: string;
    avatar_url: string | null;
}

function ProfileContent() {
    const supabase = createClient();
    const searchParams = useSearchParams();
    const targetId = searchParams.get('id');

    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [copiedField, setCopiedField] = useState<string | null>(null);

    useEffect(() => {
        fetchInitialData();
    }, [targetId]);

    const fetchInitialData = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setLoading(false);
                return;
            }
            setCurrentUser(user);

            // 1. Fetch current user's profile to check role
            const { data: currentProfile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            const isManager = currentProfile?.role === 'manager';
            const effectiveId = (targetId && isManager) ? targetId : user.id;

            // 2. Fetch target profile
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', effectiveId)
                .single();

            if (error) throw error;
            setProfile(data);
        } catch (error) {
            console.error('Error loading profile:', error);
            toast.error('Error al cargar el perfil');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string | null, fieldName: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedField(fieldName);
        toast.success(`${fieldName} copiado al portapapeles`);
        setTimeout(() => setCopiedField(null), 2000);
    };

    // Componente interno para filas de datos mejorado para el estilo corporativo
    const ProfileDataRow = ({ icon: Icon, label, value, action, isCopyable }: any) => (
        <div className="flex items-center justify-between p-5 border-b border-gray-50 last:border-0 hover:bg-gray-50/80 transition-all group">
            <div className="flex items-center gap-5 overflow-hidden">
                <div className="bg-[#36606F]/10 p-3 rounded-2xl text-[#36606F] group-hover:bg-[#36606F] group-hover:text-white transition-all duration-300">
                    <Icon size={22} strokeWidth={2.5} />
                </div>
                <div className="truncate">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.15em] mb-1">{label}</p>
                    <p className="text-gray-800 font-bold text-sm md:text-base truncate tracking-tight">{value || 'No definido'}</p>
                </div>
            </div>

            <div className="flex items-center gap-3 pl-2 shrink-0">
                {isCopyable && value && (
                    <button
                        onClick={() => copyToClipboard(value, label)}
                        className="text-gray-400 hover:text-[#36606F] w-12 h-12 flex items-center justify-center rounded-2xl hover:bg-[#36606F]/10 transition-all active:scale-90"
                        title={`Copiar ${label}`}
                    >
                        {copiedField === label ? <Check size={20} className="text-emerald-500" /> : <Copy size={20} />}
                    </button>
                )}
                {action}
            </div>
        </div>
    );

    if (loading) {
        return (
            <div className="min-h-screen bg-[#5B8FB9] flex flex-col items-center justify-center p-4">
                <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4"></div>
                <p className="text-white/80 font-black uppercase tracking-widest text-[10px] animate-pulse">Cargando perfil corporativo...</p>
            </div>
        );
    }

    if (!profile) return (
        <div className="min-h-screen bg-[#5B8FB9] flex items-center justify-center p-6">
            <div className="bg-white rounded-[2.5rem] p-10 text-center shadow-2xl max-w-sm w-full">
                <User size={48} className="mx-auto text-gray-200 mb-4" />
                <p className="text-gray-500 font-black uppercase tracking-widest text-xs">Perfil no encontrado</p>
                <button onClick={() => router.back()} className="mt-6 w-full py-4 bg-[#36606F] text-white rounded-2xl font-black uppercase text-xs tracking-widest">Volver</button>
            </div>
        </div>
    );

    const fullName = `${profile.first_name} ${profile.last_name || ''}`;
    const initials = `${profile.first_name.charAt(0)}${profile.last_name?.charAt(0) || ''}`;

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-6 pb-24">
            <div className="max-w-xl mx-auto">
                <div className="bg-white rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col min-h-[85vh]">

                    {/* ENCABEZADO CORPORATIVO SÓLIDO */}
                    <div className="bg-[#36606F] p-8 pt-10 text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl pointer-events-none"></div>

                        <div className="relative z-10 flex flex-col items-center text-center">
                            <div className="w-28 h-28 rounded-[2rem] bg-white p-1.5 shadow-2xl mb-6 relative group transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                                <div className="w-full h-full rounded-[1.6rem] bg-gray-50 flex items-center justify-center overflow-hidden relative border border-gray-100">
                                    {profile.avatar_url ? (
                                        <Image src={profile.avatar_url} alt={fullName} fill className="object-cover" />
                                    ) : (
                                        <span className="text-[#36606F] text-4xl font-black italic">{initials}</span>
                                    )}
                                </div>
                                <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white w-10 h-10 rounded-xl border-4 border-white flex items-center justify-center shadow-lg">
                                    <CheckCircle2 size={16} />
                                </div>
                            </div>

                            <h1 className="text-3xl font-black tracking-tighter mb-1">{fullName}</h1>
                            <div className="flex items-center gap-2">
                                <span className="bg-white/20 text-[10px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
                                    {profile.role === 'manager' ? 'Executive Manager' : 'Staff Member'}
                                </span>
                            </div>
                        </div>

                        <button
                            onClick={() => router.back()}
                            className="absolute top-6 left-6 w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"
                        >
                            <ArrowLeft size={20} />
                        </button>
                    </div>

                    {/* KPI MINI ROW - ESTILO CORPORATIVO */}
                    <div className="grid grid-cols-2 gap-px bg-gray-100 border-b border-gray-100">
                        <div className="bg-white p-5 flex flex-col items-center justify-center text-center">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Carga Semanal</span>
                            <span className="text-lg font-black text-[#36606F]">{profile.contract_hours || 0}h</span>
                        </div>
                        <div className="bg-white p-5 flex flex-col items-center justify-center text-center">
                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Status Laboral</span>
                            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase">Activo</span>
                        </div>
                    </div>

                    {/* SECCIONES BENTO DE ALTA DENSIDAD */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">

                        {/* Grupo 1: Contrato */}
                        <div>
                            <div className="px-8 py-5 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                                <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Asset Information</h2>
                                <Briefcase size={14} className="text-gray-300" />
                            </div>
                            <div className="divide-y divide-gray-50">
                                <ProfileDataRow
                                    icon={Hash}
                                    label="DNI / NIE Identification"
                                    value={profile.dni}
                                    isCopyable
                                />
                                <ProfileDataRow
                                    icon={Euro}
                                    label="Hourly Premium Rate"
                                    value={profile.overtime_rate ? `${profile.overtime_rate.toFixed(2)}€ / hora` : null}
                                />
                                <ProfileDataRow
                                    icon={FileClock}
                                    label="Social Security ID"
                                    value={profile.ss_number}
                                    isCopyable
                                />
                                <ProfileDataRow
                                    icon={CreditCard}
                                    label="Bank Account (IBAN)"
                                    value={profile.bank_account}
                                    isCopyable
                                />
                            </div>
                        </div>

                        {/* Grupo 2: Contacto */}
                        <div className="mt-4">
                            <div className="px-8 py-5 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                                <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Contact Channels</h2>
                                <Mail size={14} className="text-gray-300" />
                            </div>
                            <div className="divide-y divide-gray-50">
                                <ProfileDataRow
                                    icon={Mail}
                                    label="Corporate Email"
                                    value={profile.email}
                                    isCopyable
                                />
                                <ProfileDataRow
                                    icon={Phone}
                                    label="Mobile Phone"
                                    value={profile.phone}
                                    action={profile.phone && (
                                        <a href={`tel:${profile.phone}`} className="bg-emerald-50 text-emerald-600 w-12 h-12 flex items-center justify-center rounded-2xl hover:bg-emerald-500 hover:text-white transition-all active:scale-90 shadow-sm" title="Llamar">
                                            <PhoneCall size={20} />
                                        </a>
                                    )}
                                />
                            </div>
                        </div>

                        {/* Grupo 3: Documentación Estilo Premium */}
                        <div className="p-8">
                            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Official Documentation</h2>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => toast.info('Funcionalidad próximamente')}
                                    className="aspect-square flex flex-col items-center justify-center p-6 bg-[#36606F]/5 rounded-[2rem] border-2 border-dashed border-[#36606F]/10 hover:bg-white hover:border-[#36606F] hover:shadow-xl transition-all group active:scale-95"
                                >
                                    <div className="bg-white p-4 rounded-2xl text-[#36606F] shadow-sm mb-3 group-hover:bg-[#36606F] group-hover:text-white transition-all">
                                        <FileText size={24} />
                                    </div>
                                    <span className="font-black text-[#36606F] text-[10px] uppercase tracking-widest">Contrato</span>
                                </button>

                                <button
                                    onClick={() => toast.info('Funcionalidad próximamente')}
                                    className="aspect-square flex flex-col items-center justify-center p-6 bg-[#36606F]/5 rounded-[2rem] border-2 border-dashed border-[#36606F]/10 hover:bg-white hover:border-[#36606F] hover:shadow-xl transition-all group active:scale-95"
                                >
                                    <div className="bg-white p-4 rounded-2xl text-[#36606F] shadow-sm mb-3 group-hover:bg-[#36606F] group-hover:text-white transition-all">
                                        <Euro size={24} />
                                    </div>
                                    <span className="font-black text-[#36606F] text-[10px] uppercase tracking-widest">Nóminas</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* FOOTER ACCIONES */}
                    <div className="p-6 bg-gray-50/80 border-t border-gray-100 backdrop-blur-md">
                        <button
                            onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login'; }}
                            className="w-full py-5 text-rose-500 font-black text-xs uppercase tracking-[0.3em] bg-white border-2 border-rose-50 hover:bg-rose-500 hover:text-white hover:border-rose-500 rounded-2xl transition-all duration-300 shadow-sm flex items-center justify-center gap-3 active:scale-95"
                        >
                            Cerrar Sesión Corporativa
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

    );
}

export default function StaffProfilePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <div className="w-16 h-16 border-4 border-[#5B8FB9] border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-gray-500 animate-pulse">Cargando perfil...</p>
            </div>
        }>
            <ProfileContent />
        </Suspense>
    );
}