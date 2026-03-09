'use client';

import { useEffect, useState, Suspense } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Image from 'next/image';

import {
    User, Phone, CreditCard, FileText, Copy, Check,
    Briefcase, Hash, Euro, FileClock, Mail,
    CheckCircle2, ArrowLeft, Settings, LogOut, Lock, ChevronRight, Receipt, Calendar, Clock
} from 'lucide-react';
import { formatDisplayValue } from '@/lib/utils';
import { cn } from '@/lib/utils';
import EditProfileModal from '@/components/EditProfileModal';
import DocumentManager from '@/components/DocumentManager';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import NominasModal from '@/components/NominasModal';

// Definimos la interfaz basada en los datos (incl. campos laborales para vista manager)
interface UserProfile {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    dni: string | null;
    ss_number: string | null;
    bank_account: string | null; // IBAN
    contract_hours?: number | null;
    overtime_rate?: number | null;
    contracted_hours_weekly?: number | null;
    hours_balance?: number | null;
    prefer_stock_hours?: boolean | null;
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
    const [isNominasOpen, setIsNominasOpen] = useState(false);

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

    // Tarjeta tipo dashboard: icono, etiqueta, valor. Amable de leer.
    const DashboardCard = ({ icon: Icon, label, value, action, isCopyable }: { icon: any; label: string; value: string | null; action?: React.ReactNode; isCopyable?: boolean }) => (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md hover:border-[#36606F]/15 transition-all group min-h-[100px]">
            <div className="flex items-center justify-between">
                <div className="bg-[#36606F]/10 p-2.5 rounded-xl text-[#36606F] group-hover:bg-[#36606F] group-hover:text-white transition-all">
                    <Icon size={20} strokeWidth={2.5} />
                </div>
                {isCopyable && value && (
                    <button
                        onClick={() => copyToClipboard(value, label)}
                        className="text-zinc-400 hover:text-[#36606F] w-10 h-10 flex items-center justify-center rounded-xl hover:bg-[#36606F]/10 transition-all active:scale-90"
                        title={`Copiar ${label}`}
                    >
                        {copiedField === label ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                    </button>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-1">{label}</p>
                <p className="text-zinc-800 font-bold text-sm leading-snug break-words">{value || '—'}</p>
            </div>
            {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
        </div>
    );

    if (loading) {
        return (
            <div className="min-h-screen bg-[#5B8FB9]"></div>
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

    const viewingOtherProfile = isManager && !!targetId && currentUser?.id !== profile.id;
    type ViewMode = 'staff' | 'manager-self' | 'manager-employee';
    const viewMode: ViewMode = !isManager
        ? 'staff'
        : viewingOtherProfile
            ? 'manager-employee'
            : 'manager-self';

    const showAccountSection = !viewingOtherProfile;

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-6 pb-24">
            <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-2xl shadow-2xl relative overflow-hidden flex flex-col min-h-[85vh]">

                    {/* ENCABEZADO: variante por viewMode */}
                    {viewMode === 'staff' && (
                        <div className="bg-[#36606F] p-4 pt-8 text-white relative overflow-hidden shrink-0">
                            <div className="relative z-10 flex flex-col items-center text-center">
                                <div className="w-16 h-16 rounded-2xl bg-white p-1 shadow-xl mb-3 flex-shrink-0">
                                    <div className="w-full h-full rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden relative border border-gray-100">
                                        {profile.avatar_url ? (
                                            <Image src={profile.avatar_url} alt={fullName} fill className="object-cover" />
                                        ) : (
                                            <img src="/icons/profile.png" alt={fullName} className="w-full h-full object-cover" />
                                        )}
                                    </div>
                                </div>
                                <h1 className="text-base font-black uppercase tracking-tight px-2">{fullName}</h1>
                                <p className="text-[10px] text-white/70 uppercase tracking-widest mt-0.5">Mi cuenta</p>
                            </div>
                        </div>
                    )}

                    {viewMode === 'manager-self' && (
                        <div className="bg-[#36606F] p-5 pt-10 text-white relative overflow-hidden shrink-0">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl pointer-events-none" />
                            <div className="relative z-10 flex flex-col items-center text-center">
                                <div className="w-20 h-20 rounded-[1.5rem] bg-white p-1 shadow-2xl mb-4 relative flex-shrink-0">
                                    <div className="w-full h-full rounded-[1.2rem] bg-gray-50 flex items-center justify-center overflow-hidden relative border border-gray-100">
                                        {profile.avatar_url ? (
                                            <Image src={profile.avatar_url} alt={fullName} fill className="object-cover" />
                                        ) : (
                                            <img src="/icons/profile.png" alt={fullName} className="w-full h-full object-cover" />
                                        )}
                                    </div>
                                </div>
                                <h1 className="text-lg font-black uppercase tracking-tight mb-0 px-2">{fullName}</h1>
                            </div>
                            <button
                                onClick={() => setIsEditModalOpen(true)}
                                className="absolute top-5 right-5 w-12 h-12 min-h-[48px] flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"
                            >
                                <Settings size={20} />
                            </button>
                            {currentUser?.id === 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6' && (
                                <button
                                    onClick={() => router.push('/dashboard/ledger')}
                                    className="absolute top-5 left-5 h-12 min-h-[48px] px-4 flex items-center gap-2 justify-center bg-[#5B8FB9] shadow-xl shadow-blue-900/20 rounded-xl hover:bg-blue-400 border border-white/20 transition-all text-white active:scale-90"
                                >
                                    <Receipt size={18} strokeWidth={2.5} />
                                    <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Facturas</span>
                                </button>
                            )}
                        </div>
                    )}

                    {viewMode === 'manager-employee' && (
                        <div className="bg-[#36606F] p-5 pt-12 text-white relative overflow-hidden shrink-0">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl pointer-events-none" />
                            <button
                                onClick={() => router.push('/dashboard')}
                                className="absolute top-5 left-5 min-h-[48px] h-12 px-4 flex items-center gap-2 justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"
                            >
                                <ArrowLeft size={18} strokeWidth={2.5} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Plantilla</span>
                            </button>
                            <button
                                onClick={() => setIsEditModalOpen(true)}
                                className="absolute top-5 right-5 w-12 h-12 min-h-[48px] flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"
                            >
                                <Settings size={20} />
                            </button>
                            <div className="relative z-10 flex flex-col items-center text-center">
                                <div className="w-20 h-20 rounded-[1.5rem] bg-white p-1 shadow-2xl mb-3 flex-shrink-0">
                                    <div className="w-full h-full rounded-[1.2rem] bg-gray-50 flex items-center justify-center overflow-hidden relative border border-gray-100">
                                        {profile.avatar_url ? (
                                            <Image src={profile.avatar_url} alt={fullName} fill className="object-cover" />
                                        ) : (
                                            <img src="/icons/profile.png" alt={fullName} className="w-full h-full object-cover" />
                                        )}
                                    </div>
                                </div>
                                <h1 className="text-lg font-black uppercase tracking-tight mb-1 px-2">{fullName}</h1>
                                <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full">
                                    {profile.role === 'manager' ? 'Manager' : profile.role === 'supervisor' ? 'Supervisor' : 'Staff'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* DASHBOARD: Grid de tarjetas, toda la info visible y amable */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6">

                        {/* Grid principal: Datos identificativos + Contacto */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <DashboardCard
                                icon={Hash}
                                label="DNI / NIE"
                                value={profile.dni}
                                isCopyable
                            />
                            <DashboardCard
                                icon={CreditCard}
                                label="Cuenta Bancaria (IBAN)"
                                value={profile.bank_account}
                                isCopyable
                            />
                            <DashboardCard
                                icon={Mail}
                                label="Email"
                                value={profile.email}
                                isCopyable
                            />
                            <DashboardCard
                                icon={Phone}
                                label="Teléfono Móvil"
                                value={profile.phone}
                                isCopyable={!!profile.phone}
                                action={profile.phone && (
                                    <>
                                        <a
                                            href={`tel:${profile.phone.replace(/\D/g, '').startsWith('34') ? '+' + profile.phone.replace(/\D/g, '') : '+34' + profile.phone.replace(/\D/g, '')}`}
                                            className="w-10 h-10 flex items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all active:scale-95"
                                            title="Llamar"
                                        >
                                            <Phone size={18} strokeWidth={2.5} />
                                        </a>
                                        <a
                                            href={`https://wa.me/${profile.phone.replace(/\D/g, '').startsWith('34') ? profile.phone.replace(/\D/g, '') : '34' + profile.phone.replace(/\D/g, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-10 h-10 flex items-center justify-center rounded-xl bg-emerald-500/10 hover:bg-emerald-500 transition-all active:scale-95"
                                            title="WhatsApp"
                                        >
                                            <Image src="/icons/whatsapp.png" alt="WhatsApp" width={22} height={22} className="object-contain" />
                                        </a>
                                    </>
                                )}
                            />
                        </div>

                        {/* Datos laborales (solo vista Manager → Ficha empleado) */}
                        {viewMode === 'manager-employee' && (
                            <div>
                                <h2 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-3">Datos laborales</h2>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 hover:shadow-md hover:border-[#36606F]/15 transition-all">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Clock size={18} className="text-[#36606F]" />
                                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Horas contrato/sem</span>
                                        </div>
                                        <p className="text-zinc-800 font-black text-base">
                                            {formatDisplayValue(profile.contracted_hours_weekly ?? 0) === ' ' ? '\u00A0' : `${profile.contracted_hours_weekly}`}
                                        </p>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 hover:shadow-md hover:border-[#36606F]/15 transition-all">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Briefcase size={18} className="text-[#36606F]" />
                                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Banco horas</span>
                                        </div>
                                        <p className="text-zinc-800 font-black text-base">
                                            {formatDisplayValue(profile.hours_balance ?? 0) === ' ' ? '\u00A0' : `${profile.hours_balance}`}
                                        </p>
                                    </div>
                                    <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 hover:shadow-md hover:border-[#36606F]/15 transition-all col-span-2 sm:col-span-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <FileClock size={18} className="text-[#36606F]" />
                                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Preferir bolsa</span>
                                        </div>
                                        <p className="text-zinc-800 font-black text-base">
                                            {profile.prefer_stock_hours ? 'Sí' : 'No'}
                                        </p>
                                    </div>
                                </div>
                                <a
                                    href="/registros"
                                    className="mt-4 flex items-center justify-center gap-2 w-full min-h-[48px] py-3 rounded-2xl bg-[#36606F] text-white font-black text-[10px] uppercase tracking-widest hover:bg-[#2d4d57] transition-all active:scale-[0.98]"
                                >
                                    <Calendar size={18} strokeWidth={2.5} />
                                    Ver en Registros
                                </a>
                            </div>
                        )}

                        {/* Documentación Oficial */}
                        <div>
                            <h2 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-3">Documentación Oficial</h2>

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
                                        className="min-h-[120px] flex flex-col items-center justify-center p-6 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md hover:border-[#36606F]/30 transition-all group active:scale-[0.98]"
                                    >
                                        <div className="bg-[#36606F]/10 p-4 rounded-2xl text-[#36606F] mb-3 group-hover:bg-[#36606F] group-hover:text-white transition-all">
                                            <FileText size={28} strokeWidth={2} />
                                        </div>
                                        <span className="font-black text-[#36606F] text-[10px] uppercase tracking-widest">Contrato</span>
                                    </button>

                                    <button
                                        onClick={() => setIsNominasOpen(true)}
                                        className="min-h-[120px] flex flex-col items-center justify-center p-6 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md hover:border-[#36606F]/30 transition-all group active:scale-[0.98]"
                                    >
                                        <div className="bg-[#36606F]/10 p-4 rounded-2xl text-[#36606F] mb-3 group-hover:bg-[#36606F] group-hover:text-white transition-all">
                                            <Euro size={28} strokeWidth={2} />
                                        </div>
                                        <span className="font-black text-[#36606F] text-[10px] uppercase tracking-widest">Nóminas</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Configuración de Cuenta (solo cuando es el propio perfil) */}
                        {showAccountSection && (
                            <div>
                                <h2 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-3">Configuración de Cuenta</h2>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <button
                                        onClick={handleChangePassword}
                                        className="w-full min-h-[56px] flex items-center justify-between p-5 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md hover:border-[#36606F]/20 transition-all group active:scale-[0.98]"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="bg-[#36606F]/10 p-3 rounded-xl text-[#36606F] group-hover:bg-[#36606F] group-hover:text-white transition-all">
                                                <Lock size={20} strokeWidth={2.5} />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-0.5">Seguridad</p>
                                                <p className="text-zinc-800 font-black text-sm tracking-tight">Cambiar Contraseña</p>
                                            </div>
                                        </div>
                                        <ChevronRight size={18} className="text-zinc-300 group-hover:text-[#36606F] transition-colors shrink-0" />
                                    </button>

                                    <button
                                        onClick={handleLogout}
                                        className="w-full min-h-[56px] flex items-center justify-between p-5 bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md hover:border-rose-200 transition-all group active:scale-[0.98]"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="bg-rose-500/10 p-3 rounded-xl text-rose-500 group-hover:bg-rose-500 group-hover:text-white transition-all">
                                                <LogOut size={20} strokeWidth={2.5} />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest mb-0.5">Sesión</p>
                                                <p className="text-rose-600 font-black text-sm tracking-tight">Cerrar Sesión</p>
                                            </div>
                                        </div>
                                        <ChevronRight size={18} className="text-rose-200 group-hover:text-rose-500 transition-colors shrink-0" />
                                    </button>
                                </div>
                            </div>
                        )}
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

                    <NominasModal
                        isOpen={isNominasOpen}
                        onClose={() => setIsNominasOpen(false)}
                        targetUserId={viewingOtherProfile ? profile.id : undefined}
                    />

                </div>
            </div>
        </div>
    );
}

export default function StaffProfilePage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#5B8FB9]"></div>
        }>
            <ProfileContent />
        </Suspense>
    );
}