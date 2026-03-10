'use client';

import { useEffect, useState, Suspense } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Image from 'next/image';
import { ArrowLeft, Settings, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import EditProfileModal from '@/components/EditProfileModal';
import DocumentManager from '@/components/DocumentManager';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import NominasModal from '@/components/NominasModal';
import DatosPersonalesModal from '@/components/profile/DatosPersonalesModal';
import ContactoModal from '@/components/profile/ContactoModal';
import DatosBancariosModal from '@/components/profile/DatosBancariosModal';
import NominasMenuModal, { NominasMenuAction } from '@/components/profile/NominasMenuModal';
import ComunicadosModal from '@/components/profile/ComunicadosModal';
import ContratoModal from '@/components/profile/ContratoModal';

interface UserProfile {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    dni: string | null;
    bank_account: string | null;
    codigo_empleado?: string | null;
    contracted_hours_weekly?: number | null;
    hours_balance?: number | null;
    prefer_stock_hours?: boolean | null;
    role: string;
    avatar_url: string | null;
}

const PROFILE_GRID = [
    { id: 'datos-personales', label: 'Datos personales', icon: '/icons/staff-card.png' },
    { id: 'contacto', label: 'Contacto', icon: '/icons/phone.png' },
    { id: 'datos-bancarios', label: 'Datos bancarios', icon: '/icons/visa.png' },
    { id: 'nominas', label: 'Nóminas', icon: '/icons/admin.png' },
    { id: 'cambiar-password', label: 'Cambiar contraseña', icon: '/icons/lock.png' },
    { id: 'cerrar-sesion', label: 'Cerrar sesión', icon: '/icons/log-out.png' },
] as const;

function ProfileContent() {
    const supabase = createClient();
    const router = useRouter();
    const searchParams = useSearchParams();
    const targetId = searchParams.get('id');

    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [isManager, setIsManager] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [modalDatosPersonales, setModalDatosPersonales] = useState(false);
    const [modalContacto, setModalContacto] = useState(false);
    const [modalDatosBancarios, setModalDatosBancarios] = useState(false);
    const [nominasMenuOpen, setNominasMenuOpen] = useState(false);
    const [nominasListOpen, setNominasListOpen] = useState(false);
    const [comunicadosOpen, setComunicadosOpen] = useState(false);
    const [contratoOpen, setContratoOpen] = useState(false);
    const [logoutConfirm, setLogoutConfirm] = useState(false);

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
            const { data: currentProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            const managerStatus = currentProfile?.role === 'manager';
            setIsManager(managerStatus);
            const effectiveId = (targetId && managerStatus) ? targetId : user.id;
            const { data, error } = await supabase.from('profiles').select('*').eq('id', effectiveId).single();
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
        const { error } = await supabase.auth.signOut();
        if (error) toast.error('Error al salir');
        else {
            router.push('/login');
            router.refresh();
        }
        setLogoutConfirm(false);
    };

    const handleGridAction = (id: string) => {
        if (!profile) return;
        switch (id) {
            case 'datos-personales':
                setModalDatosPersonales(true);
                break;
            case 'contacto':
                setModalContacto(true);
                break;
            case 'datos-bancarios':
                setModalDatosBancarios(true);
                break;
            case 'nominas':
                setNominasMenuOpen(true);
                break;
            case 'cambiar-password':
                setIsPasswordModalOpen(true);
                break;
            case 'cerrar-sesion':
                setLogoutConfirm(true);
                break;
        }
    };

    const handleNominasMenuSelect = (action: NominasMenuAction) => {
        if (action === 'nominas') setNominasListOpen(true);
        if (action === 'comunicados') setComunicadosOpen(true);
        if (action === 'contrato') setContratoOpen(true);
    };

    const viewingOtherProfile = isManager && !!targetId && currentUser?.id !== profile?.id;
    const showAccountSection = !viewingOtherProfile;
    type ViewMode = 'staff' | 'manager-self' | 'manager-employee';
    const viewMode: ViewMode = !isManager ? 'staff' : viewingOtherProfile ? 'manager-employee' : 'manager-self';

    const gridItems = showAccountSection
        ? PROFILE_GRID
        : PROFILE_GRID.filter(i => i.id !== 'cambiar-password' && i.id !== 'cerrar-sesion');

    if (loading) {
        return <div className="min-h-screen bg-[#5B8FB9]" />;
    }

    if (!profile) {
        return (
            <div className="min-h-screen bg-[#5B8FB9] flex items-center justify-center p-6">
                <div className="bg-white rounded-[2.5rem] p-10 text-center shadow-2xl max-w-sm w-full">
                    <p className="text-gray-500 font-black uppercase tracking-widest text-xs">Perfil no encontrado</p>
                    <button onClick={() => router.back()} className="mt-6 w-full py-4 bg-[#5B8FB9] text-white rounded-2xl font-black uppercase text-xs tracking-widest">Volver</button>
                </div>
            </div>
        );
    }

    const fullName = `${profile.first_name} ${profile.last_name || ''}`.trim().toUpperCase();

    return (
        <div className="min-h-screen bg-[#5B8FB9] pb-24 p-4">
            <div className="max-w-2xl mx-auto">
                {/* Un solo contenedor: esquinas redondeadas, cabecera petróleo + contenido */}
                <div className="bg-white rounded-[1.5rem] shadow-xl overflow-hidden min-h-[60vh] flex flex-col">
                    {/* Cabecera petróleo */}
                    <div className="bg-[#36606F] text-white relative overflow-hidden shrink-0 pt-6 pb-4 px-4">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl pointer-events-none" />

                        <div className="relative z-10 flex items-center justify-between">
                            <button
                                onClick={viewMode === 'manager-employee' ? () => router.push('/dashboard') : () => router.back()}
                                className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-white/90 hover:bg-white/10 transition-all active:scale-95"
                                aria-label="Volver"
                            >
                                <ArrowLeft size={24} strokeWidth={2.5} />
                            </button>
                            <div className="flex items-center gap-2">
                                {viewMode === 'manager-self' && currentUser?.id === 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6' && (
                                    <button
                                        onClick={() => router.push('/dashboard/ledger')}
                                        className="h-12 px-4 flex items-center gap-2 bg-[#5B8FB9] shadow-xl rounded-xl hover:bg-blue-400 border border-white/20 text-white text-[10px] font-black uppercase tracking-widest"
                                    >
                                        <Receipt size={18} strokeWidth={2.5} />
                                        Facturas
                                    </button>
                                )}
                                {(viewMode === 'manager-self' || viewMode === 'manager-employee') && (
                                    <button
                                        onClick={() => setIsEditModalOpen(true)}
                                        className="min-h-[48px] min-w-[48px] flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 text-white"
                                    >
                                        <Settings size={20} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="relative z-10 flex flex-col items-center text-center mt-4">
                            <div className="w-20 h-20 rounded-2xl bg-white p-1 shadow-xl mb-3 flex-shrink-0 overflow-hidden">
                                {profile.avatar_url ? (
                                    <Image src={profile.avatar_url} alt={fullName} width={80} height={80} className="object-cover w-full h-full rounded-xl" />
                                ) : (
                                    <img src="/icons/staff-card.png" alt="" className="w-full h-full object-cover rounded-xl" />
                                )}
                            </div>
                            <h1 className="text-lg font-black uppercase tracking-tight px-2">{fullName}</h1>
                            {viewMode === 'staff' && <p className="text-[10px] text-white/70 uppercase tracking-widest mt-0.5">Mi cuenta</p>}
                            {viewMode === 'manager-employee' && (
                                <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full mt-1">
                                    {profile.role === 'manager' ? 'Manager' : profile.role === 'supervisor' ? 'Supervisor' : 'Staff'}
                                </span>
                            )}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-2 bg-white/10 rounded-t-full" />
                    </div>

                    {/* Contenido: iconos flotando sin marco ni fondo */}
                    <div className="flex-1 bg-white px-4 pt-6 pb-8">
                        <div className="grid grid-cols-2 gap-6">
                            {gridItems.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleGridAction(item.id)}
                                    className={cn(
                                        'min-h-[80px] flex flex-col items-center justify-center p-3 transition-all active:scale-[0.98]',
                                        item.id === 'cerrar-sesion' ? 'hover:opacity-80' : 'hover:opacity-90'
                                    )}
                                >
                                    <img src={item.icon} alt="" className="w-10 h-10 object-contain mb-2 shrink-0" />
                                    <span className={cn(
                                        'font-black text-[10px] uppercase tracking-widest text-center leading-tight',
                                        item.id === 'cerrar-sesion' ? 'text-rose-600' : 'text-zinc-700'
                                    )}>
                                        {item.label}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {viewMode === 'manager-employee' && (
                            <div className="mt-8">
                                <h2 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-3">Datos laborales</h2>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-zinc-50 rounded-2xl p-4">
                                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Código nóminas</p>
                                        <p className="text-zinc-800 font-black text-base">{profile.codigo_empleado || '—'}</p>
                                        {!profile.codigo_empleado && (
                                            <p className="text-[9px] text-amber-600 mt-1">Sin código → nóminas no se vinculan</p>
                                        )}
                                    </div>
                                    <div className="bg-zinc-50 rounded-2xl p-4">
                                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Horas contrato/sem</p>
                                        <p className="text-zinc-800 font-black text-base">{profile.contracted_hours_weekly ?? '—'}</p>
                                    </div>
                                    <div className="bg-zinc-50 rounded-2xl p-4">
                                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Banco horas</p>
                                        <p className="text-zinc-800 font-black text-base">{profile.hours_balance ?? '—'}</p>
                                    </div>
                                </div>
                                <a
                                    href="/registros"
                                    className="mt-4 flex items-center justify-center gap-2 w-full min-h-[48px] py-3 rounded-2xl bg-[#36606F] text-white font-black text-[10px] uppercase tracking-widest hover:bg-[#2d4d57]"
                                >
                                    Ver en Registros
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modales */}
            <DatosPersonalesModal isOpen={modalDatosPersonales} onClose={() => setModalDatosPersonales(false)} dni={profile.dni} email={profile.email} />
            <ContactoModal isOpen={modalContacto} onClose={() => setModalContacto(false)} phone={profile.phone} />
            <DatosBancariosModal isOpen={modalDatosBancarios} onClose={() => setModalDatosBancarios(false)} iban={profile.bank_account} />
            <NominasMenuModal isOpen={nominasMenuOpen} onClose={() => setNominasMenuOpen(false)} onSelect={handleNominasMenuSelect} />
            <NominasModal isOpen={nominasListOpen} onClose={() => setNominasListOpen(false)} targetUserId={viewingOtherProfile ? profile.id : undefined} />
            <ComunicadosModal isOpen={comunicadosOpen} onClose={() => setComunicadosOpen(false)} userId={profile.id} />
            <ContratoModal isOpen={contratoOpen} onClose={() => setContratoOpen(false)} userId={profile.id} />
            {isPasswordModalOpen && <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />}

            {isEditModalOpen && (
                <EditProfileModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    onSuccess={() => fetchInitialData()}
                    profile={profile}
                />
            )}

            {/* Confirmación cerrar sesión */}
            {logoutConfirm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4" onClick={() => setLogoutConfirm(false)}>
                    <div className="bg-white w-full max-w-sm rounded-3xl shadow-xl p-6 animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-black text-zinc-800 uppercase tracking-wider mb-2">Cerrar sesión</h3>
                        <p className="text-zinc-500 text-sm mb-6">¿Seguro que quieres cerrar sesión?</p>
                        <div className="flex gap-3">
                            <button onClick={() => setLogoutConfirm(false)} className="flex-1 min-h-[48px] rounded-2xl border border-zinc-200 font-black text-zinc-700 text-sm uppercase tracking-widest hover:bg-zinc-50">
                                Cancelar
                            </button>
                            <button onClick={handleLogout} className="flex-1 min-h-[48px] rounded-2xl bg-rose-500 text-white font-black text-sm uppercase tracking-widest hover:bg-rose-600">
                                Cerrar sesión
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function StaffProfilePage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#5B8FB9]" />}>
            <ProfileContent />
        </Suspense>
    );
}
