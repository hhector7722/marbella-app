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

    // Componente interno para filas de datos
    const ProfileDataRow = ({ icon: Icon, label, value, action, isCopyable }: any) => (
        <div className="flex items-center justify-between p-4 border-b border-gray-100 last:border-0 hover:bg-blue-50/30 transition-colors group">
            <div className="flex items-center gap-4 overflow-hidden">
                <div className="bg-blue-100/50 p-2.5 rounded-xl text-[#5B8FB9] group-hover:bg-[#5B8FB9] group-hover:text-white transition-colors">
                    <Icon size={20} strokeWidth={2} />
                </div>
                <div className="truncate">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">{label}</p>
                    <p className="text-gray-800 font-semibold text-sm md:text-base truncate">{value || 'No definido'}</p>
                </div>
            </div>

            <div className="flex items-center gap-2 pl-2 shrink-0">
                {isCopyable && value && (
                    <button
                        onClick={() => copyToClipboard(value, label)}
                        className="text-gray-400 hover:text-[#5B8FB9] p-2 rounded-full hover:bg-blue-100/50 transition-all active:scale-95"
                        title={`Copiar ${label}`}
                    >
                        {copiedField === label ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                    </button>
                )}
                {action}
            </div>
        </div>
    );

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <div className="w-16 h-16 border-4 border-[#5B8FB9] border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-gray-500 animate-pulse">Cargando perfil...</p>
            </div>
        );
    }

    if (!profile) return <div className="p-8 text-center text-gray-500">No se encontró el perfil.</div>;

    const fullName = `${profile.first_name} ${profile.last_name || ''}`;
    const initials = `${profile.first_name.charAt(0)}${profile.last_name?.charAt(0) || ''}`;

    return (
        <div className="min-h-screen bg-gray-50 pb-10 rounded-[2.5rem] overflow-hidden border border-gray-100 relative">

            {/* CABECERA AZUL CON AVATAR */}
            <div className="bg-[#5B8FB9] p-6 pb-16 text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl pointer-events-none"></div>
                <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-900/10 rounded-full translate-y-1/3 -translate-x-1/4 blur-2xl pointer-events-none"></div>

                <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="w-24 h-24 rounded-full bg-white p-1 shadow-xl mb-4 relative group">
                        <div className="w-full h-full rounded-full bg-gray-100 flex items-center justify-center overflow-hidden relative">
                            {profile.avatar_url ? (
                                <Image src={profile.avatar_url} alt={fullName} fill className="object-cover" />
                            ) : (
                                <span className="text-[#5B8FB9] text-3xl font-black">{initials}</span>
                            )}
                        </div>
                        <button className="absolute bottom-0 right-0 bg-[#5B8FB9] text-white p-1.5 rounded-full border-2 border-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                            <User size={14} />
                        </button>
                    </div>
                    <h1 className="text-2xl font-black">{fullName}</h1>

                    <p className="text-blue-100 text-sm bg-blue-800/30 px-3 py-0.5 rounded-full mt-2 capitalize">
                        {profile.role === 'manager' ? 'Gerente' : 'Personal'}
                    </p>
                </div>
            </div>

            {/* TARJETA DE DATOS PRINCIPAL */}
            <div className="px-4 -mt-10 relative z-20">
                <div className="bg-white rounded-3xl shadow-xl overflow-hidden">

                    {/* Sección 1: Datos Laborales */}
                    <div className="p-4 bg-gray-50/50 border-b border-gray-100">
                        <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Información Laboral</h2>
                    </div>
                    <div className="divide-y divide-gray-50">
                        <ProfileDataRow
                            icon={Briefcase}
                            label="H. Contrato Semanal"
                            value={profile.contract_hours ? `${profile.contract_hours}h` : null}
                        />
                        <ProfileDataRow
                            icon={Euro}
                            label="Precio Hora Extra"
                            value={profile.overtime_rate ? `${profile.overtime_rate.toFixed(2)}€` : null}
                        />
                        <ProfileDataRow
                            icon={Hash}
                            label="Nº Seguridad Social"
                            value={profile.ss_number}
                            isCopyable
                        />
                    </div>

                    {/* Sección 2: Datos Personales y Contacto */}
                    <div className="p-4 bg-gray-50/50 border-b border-gray-100 mt-2">
                        <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Contacto y Datos</h2>
                    </div>
                    <div className="divide-y divide-gray-50">
                        <ProfileDataRow
                            icon={Mail}
                            label="Email Acceso"
                            value={profile.email}
                            isCopyable
                        />
                        <ProfileDataRow
                            icon={Phone}
                            label="Teléfono"
                            value={profile.phone}
                            action={profile.phone && (
                                <a href={`tel:${profile.phone}`} className="bg-green-50 text-green-600 p-2 rounded-full hover:bg-green-500 hover:text-white transition-colors active:scale-95" title="Llamar">
                                    <PhoneCall size={18} />
                                </a>
                            )}
                        />
                        <ProfileDataRow
                            icon={CreditCard}
                            label="DNI / NIE"
                            value={profile.dni}
                            isCopyable
                        />
                        <ProfileDataRow
                            icon={CreditCard}
                            label="Cuenta Bancaria (IBAN)"
                            value={profile.bank_account}
                            isCopyable
                        />
                    </div>

                    {/* Sección 3: Documentación */}
                    <div className="p-4 bg-gray-50/50 border-b border-gray-100 mt-2">
                        <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Documentación</h2>
                    </div>
                    <div className="p-4 flex gap-3">
                        <button
                            onClick={() => toast.info('Funcionalidad de ver contrato próximamente')}
                            className="flex-1 flex items-center justify-between p-3 bg-blue-50 rounded-2xl border border-blue-100 hover:bg-blue-100 hover:border-blue-300 transition-all group active:scale-95"
                        >
                            <div className="flex items-center gap-3">
                                <div className="bg-white p-2 rounded-xl text-[#5B8FB9] shadow-sm group-hover:text-blue-600">
                                    <FileText size={20} />
                                </div>
                                <span className="font-bold text-[#5B8FB9] text-sm group-hover:text-blue-700">Contrato</span>
                            </div>
                            <div className="text-blue-300 group-hover:text-blue-500"><FileClock size={16} /></div>
                        </button>

                        <button
                            onClick={() => toast.info('Funcionalidad de ver nóminas próximamente')}
                            className="flex-1 flex items-center justify-between p-3 bg-blue-50 rounded-2xl border border-blue-100 hover:bg-blue-100 hover:border-blue-300 transition-all group active:scale-95"
                        >
                            <div className="flex items-center gap-3">
                                <div className="bg-white p-2 rounded-xl text-[#5B8FB9] shadow-sm group-hover:text-blue-600">
                                    <FileText size={20} />
                                </div>
                                <span className="font-bold text-[#5B8FB9] text-sm group-hover:text-blue-700">Nóminas</span>
                            </div>
                            <div className="text-blue-300 group-hover:text-blue-500"><FileClock size={16} /></div>
                        </button>
                    </div>
                </div>

                <button
                    onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login'; }}
                    className="w-full mt-6 p-3 text-red-500 font-bold text-sm bg-red-50 hover:bg-red-100 rounded-2xl transition-colors flex items-center justify-center gap-2"
                >
                    Cerrar Sesión en este dispositivo
                </button>
            </div>
        </div>
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