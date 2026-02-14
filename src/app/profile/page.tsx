'use client';

import { useEffect, useState, Suspense } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Image from 'next/image';

import {
    User, Phone, CreditCard, FileText, Copy, Check,
    Briefcase, Hash, Euro, FileClock, Mail,
    CheckCircle2, ArrowLeft, Settings, LogOut, Lock, ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import EditProfileModal from '@/components/EditProfileModal';
import DocumentManager from '@/components/DocumentManager';
import ChangePasswordModal from '@/components/ChangePasswordModal';

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
    const router = useRouter();
    const searchParams = useSearchParams();
    const targetId = searchParams.get('id');

    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isManager, setIsManager] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [activeDocTab, setActiveDocTab] = useState<'contract' | 'payroll' | null>(null);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

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

            const managerStatus = currentProfile?.role === 'manager';
            setIsManager(managerStatus);
            const effectiveId = (targetId && managerStatus) ? targetId : user.id;

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

    const handleLogout = async () => {
        if (!confirm("¿Seguro que quieres cerrar sesión?")) return;
        const { error } = await supabase.auth.signOut();
        if (error) {
            toast.error('Error al salir');
        } else {
            router.push('/login');
            router.refresh();
        }
    };

    const handleChangePassword = () => {
        setIsPasswordModalOpen(true);
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
                <div className="bg-[#5B8FB9]/10 p-3 rounded-2xl text-[#5B8FB9] group-hover:bg-[#5B8FB9] group-hover:text-white transition-all duration-300">
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
                        className="text-gray-400 hover:text-[#5B8FB9] w-12 h-12 flex items-center justify-center rounded-2xl hover:bg-[#5B8FB9]/10 transition-all active:scale-90"
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
                <button onClick={() => router.back()} className="mt-6 w-full py-4 bg-[#5B8FB9] text-white rounded-2xl font-black uppercase text-xs tracking-widest">Volver</button>
            </div>
        </div>
    );

    const fullName = `${profile.first_name} ${profile.last_name || ''}`;
    const initials = `${profile.first_name.charAt(0)}${profile.last_name?.charAt(0) || ''}`;

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-6 pb-24">
            <div className="max-w-xl mx-auto">
                <div className="bg-white rounded-2xl shadow-2xl relative overflow-hidden flex flex-col min-h-[85vh]">

                    {/* ENCABEZADO CORPORATIVO SÓLIDO */}
                    <div className="bg-[#36606F] p-8 pt-10 text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl pointer-events-none"></div>

                        <div className="relative z-10 flex flex-col items-center text-center">
                            <div className="w-28 h-28 rounded-[2rem] bg-white p-1.5 shadow-2xl mb-6 relative group transform -rotate-3 hover:rotate-0 transition-transform duration-500">
                                <div className="w-full h-full rounded-[1.6rem] bg-gray-50 flex items-center justify-center overflow-hidden relative border border-gray-100">
                                    {profile.avatar_url ? (
                                        <Image src={profile.avatar_url} alt={fullName} fill className="object-cover" />
                                    ) : (
                                        <img src="/icons/profile.png" alt={fullName} className="w-full h-full object-cover" />
                                    )}
                                </div>
                                <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white w-10 h-10 rounded-xl border-4 border-white flex items-center justify-center shadow-lg">
                                    <CheckCircle2 size={16} />
                                </div>
                            </div>

                            <h1 className="text-3xl font-black tracking-tighter mb-1">{fullName}</h1>
                            {isManager && (
                                <button
                                    onClick={() => setIsEditModalOpen(true)}
                                    className="flex items-center gap-1.5 px-3 py-1 bg-white/10 hover:bg-white/20 rounded-full transition-all mt-2 active:scale-95"
                                >
                                    <Settings size={12} className="text-white/70" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Editar Datos</span>
                                </button>
                            )}
                        </div>

                        <button
                            onClick={() => router.back()}
                            className="absolute top-6 left-6 w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"
                        >
                            <ArrowLeft size={20} />
                        </button>
                    </div>

                    {/* SECCIONES BENTO DE ALTA DENSIDAD */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">

                        {/* Grupo 1: Datos Identificativos */}
                        <div className="divide-y divide-gray-50">
                            <ProfileDataRow
                                icon={Hash}
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

                        {/* Grupo 2: Contacto */}
                        <div className="divide-y divide-gray-50 border-t border-gray-100">
                            <ProfileDataRow
                                icon={Mail}
                                label="Email"
                                value={profile.email}
                                isCopyable
                            />
                            <ProfileDataRow
                                icon={Phone}
                                label="Teléfono Móvil"
                                value={profile.phone}
                                action={profile.phone && (
                                    <div className="flex gap-4 items-center">
                                        <a
                                            href={`tel:${profile.phone.replace(/\D/g, '').startsWith('34') ? '+' + profile.phone.replace(/\D/g, '') : '+34' + profile.phone.replace(/\D/g, '')}`}
                                            className="text-emerald-500 hover:text-emerald-600 transition-colors p-1 active:scale-95"
                                            title="Llamar"
                                        >
                                            <Phone size={22} />
                                        </a>
                                        <a
                                            href={`https://wa.me/${profile.phone.replace(/\D/g, '').startsWith('34') ? profile.phone.replace(/\D/g, '') : '34' + profile.phone.replace(/\D/g, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="transition-all hover:scale-110 active:scale-95"
                                            title="WhatsApp"
                                        >
                                            <Image src="/icons/whatsapp.png" alt="WhatsApp" width={28} height={28} className="object-contain" />
                                        </a>
                                    </div>
                                )}
                            />
                        </div>

                        {/* Grupo 3: Documentación Estilo Premium */}
                        <div className="p-8">
                            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Documentación Oficial</h2>

                            {activeDocTab ? (
                                <div className="animate-in slide-in-from-bottom-2 duration-300">
                                    <div className="flex items-center justify-between mb-4">
                                        <button
                                            onClick={() => setActiveDocTab(null)}
                                            className="text-[9px] font-black text-[#36606F] uppercase tracking-widest flex items-center gap-1 hover:underline"
                                        >
                                            <ArrowLeft size={10} strokeWidth={3} /> Volver
                                        </button>
                                    </div>
                                    <DocumentManager
                                        userId={profile.id}
                                        isManager={isManager}
                                        initialType={activeDocTab}
                                    />
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => setActiveDocTab('contract')}
                                        className="aspect-square flex flex-col items-center justify-center p-6 bg-[#36606F]/5 rounded-[2rem] border-2 border-dashed border-[#36606F]/10 hover:bg-white hover:border-[#36606F] hover:shadow-xl transition-all group active:scale-95"
                                    >
                                        <div className="bg-white p-4 rounded-2xl text-[#36606F] shadow-sm mb-3 group-hover:bg-[#36606F] group-hover:text-white transition-all">
                                            <FileText size={24} />
                                        </div>
                                        <span className="font-black text-[#36606F] text-[10px] uppercase tracking-widest">Contrato</span>
                                    </button>

                                    <button
                                        onClick={() => setActiveDocTab('payroll')}
                                        className="aspect-square flex flex-col items-center justify-center p-6 bg-[#36606F]/5 rounded-[2rem] border-2 border-dashed border-[#36606F]/10 hover:bg-white hover:border-[#36606F] hover:shadow-xl transition-all group active:scale-95"
                                    >
                                        <div className="bg-white p-4 rounded-2xl text-[#36606F] shadow-sm mb-3 group-hover:bg-[#36606F] group-hover:text-white transition-all">
                                            <Euro size={24} />
                                        </div>
                                        <span className="font-black text-[#36606F] text-[10px] uppercase tracking-widest">Nóminas</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Grupo 4: Configuración de Cuenta (Nueva sección migrada) */}
                        <div className="p-8 border-t border-gray-100 bg-gray-50/30">
                            <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Configuración de Cuenta</h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <button
                                    onClick={handleChangePassword}
                                    className="w-full flex items-center justify-between p-5 bg-white border border-gray-100 rounded-3xl shadow-sm hover:shadow-md hover:bg-gray-50 transition-all group active:scale-[0.98]"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="bg-[#36606F]/10 p-3 rounded-2xl text-[#36606F] group-hover:bg-[#36606F] group-hover:text-white transition-all duration-300">
                                            <Lock size={20} strokeWidth={2.5} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.15em] mb-0.5">Seguridad</p>
                                            <p className="text-gray-800 font-black text-xs tracking-tight">Cambiar Contraseña</p>
                                        </div>
                                    </div>
                                    <ChevronRight size={16} className="text-gray-300 group-hover:text-[#36606F] transition-colors" />
                                </button>

                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center justify-between p-5 bg-white border border-rose-50 rounded-3xl shadow-sm hover:shadow-md hover:bg-rose-50 transition-all group active:scale-[0.98]"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="bg-rose-500/10 p-3 rounded-2xl text-rose-500 group-hover:bg-rose-500 group-hover:text-white transition-all duration-300">
                                            <LogOut size={20} strokeWidth={2.5} />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-[10px] text-rose-300 font-black uppercase tracking-[0.15em] mb-0.5">Sesión</p>
                                            <p className="text-rose-600 font-black text-xs tracking-tight">Cerrar Sesión Corporativa</p>
                                        </div>
                                    </div>
                                    <ChevronRight size={16} className="text-rose-200 group-hover:text-rose-500 transition-colors" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {isEditModalOpen && (
                        <EditProfileModal
                            isOpen={isEditModalOpen}
                            onClose={() => setIsEditModalOpen(false)}
                            onSuccess={() => fetchInitialData()}
                            profile={profile}
                        />
                    )}

                    {isPasswordModalOpen && (
                        <ChangePasswordModal
                            isOpen={isPasswordModalOpen}
                            onClose={() => setIsPasswordModalOpen(false)}
                        />
                    )}

                </div>
            </div>
        </div>
    );
}

export default function StaffProfilePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#5B8FB9] flex flex-col items-center justify-center p-4">
                <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4"></div>
                <p className="text-white/80 font-black uppercase tracking-widest text-[10px] animate-pulse">Cargando perfil corporativo...</p>
            </div>
        }>
            <ProfileContent />
        </Suspense>
    );
}