'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/Avatar';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import NominasModal from '@/components/NominasModal';
import DatosPersonalesModal from '@/components/profile/DatosPersonalesModal';
import ContactoModal from '@/components/profile/ContactoModal';
import DatosBancariosModal from '@/components/profile/DatosBancariosModal';
import NominasMenuModal, { NominasMenuAction } from '@/components/profile/NominasMenuModal';
import ComunicadosModal from '@/components/profile/ComunicadosModal';
import ContratoModal from '@/components/profile/ContratoModal';
import { AvatarCropModal } from '@/components/profile/AvatarCropModal';

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
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [modalDatosPersonales, setModalDatosPersonales] = useState(false);
    const [modalContacto, setModalContacto] = useState(false);
    const [modalDatosBancarios, setModalDatosBancarios] = useState(false);
    const [nominasMenuOpen, setNominasMenuOpen] = useState(false);
    const [nominasListOpen, setNominasListOpen] = useState(false);
    const [comunicadosOpen, setComunicadosOpen] = useState(false);
    const [contratoOpen, setContratoOpen] = useState(false);
    const [logoutConfirm, setLogoutConfirm] = useState(false);
    const [cropModalImageSrc, setCropModalImageSrc] = useState<string | null>(null);
    const [avatarUploading, setAvatarUploading] = useState(false);

    useEffect(() => {
        fetchInitialData();
    }, [targetId]);

    const handleAvatarCropSave = useCallback(
        async (blob: Blob) => {
            if (!profile || currentUser?.id !== profile.id) {
                toast.error('No se puede actualizar el avatar');
                return;
            }
            setAvatarUploading(true);
            try {
                const formData = new FormData();
                formData.append('avatar', new File([blob], 'avatar.png', { type: 'image/png' }));
                const res = await fetch('/api/profile/avatar', {
                    method: 'POST',
                    body: formData,
                    credentials: 'same-origin',
                });
                let data: { success?: boolean; error?: string; avatarUrl?: string } = {};
                try {
                    data = await res.json();
                } catch {
                    toast.error(res.statusText || 'Error al subir');
                    return;
                }
                if (!res.ok) {
                    const msg = data.error || res.statusText || 'Error al subir';
                    toast.error(msg);
                    console.error('Avatar upload failed:', res.status, msg);
                    return;
                }
                toast.success('Imagen actualizada');
                if (data.avatarUrl) {
                    const urlWithCache = data.avatarUrl + '?t=' + Date.now();
                    setProfile((p) => (p ? { ...p, avatar_url: urlWithCache } : null));
                    window.dispatchEvent(new CustomEvent('avatar-updated', { detail: { avatarUrl: urlWithCache } }));
                }
                fetchInitialData();
                if (cropModalImageSrc) URL.revokeObjectURL(cropModalImageSrc);
                setCropModalImageSrc(null);
            } catch (e) {
                console.error(e);
                toast.error('Error al subir');
            } finally {
                setAvatarUploading(false);
            }
        },
        [profile, currentUser?.id, cropModalImageSrc]
    );

    const handleAvatarCropCancel = useCallback(() => {
        if (cropModalImageSrc) URL.revokeObjectURL(cropModalImageSrc);
        setCropModalImageSrc(null);
    }, [cropModalImageSrc]);

    const handleAvatarFileSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file || !profile || currentUser?.id !== profile.id) return;
            const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            if (!allowed.includes(file.type)) {
                toast.error('Formato no permitido. Usa JPG, PNG, WebP o GIF.');
                return;
            }
            if (file.size > 2 * 1024 * 1024) {
                toast.error('La imagen no puede superar 2 MB');
                return;
            }
            setCropModalImageSrc(URL.createObjectURL(file));
        },
        [profile, currentUser?.id]
    );

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
                    {/* Cabecera petróleo (compacta) */}
                    <div className="bg-[#36606F] text-white relative overflow-hidden shrink-0 pt-3 pb-3 px-4">
                        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl pointer-events-none" />

                        <div className="relative z-10 flex items-start gap-3 min-h-0">
                            <div className="shrink-0 flex flex-col items-center gap-1 w-[4.75rem]">
                                <Avatar
                                    src={profile.avatar_url}
                                    alt={fullName}
                                    size="md"
                                    className="shadow-lg bg-white ring-2 ring-white"
                                />
                                {showAccountSection && (
                                    <label className="min-h-[48px] px-2 py-1.5 rounded-lg border border-white/80 text-white text-[8px] font-black uppercase tracking-widest hover:border-white hover:bg-white/5 transition-colors cursor-pointer active:scale-95 inline-flex items-center justify-center text-center leading-tight">
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp,image/gif"
                                            onChange={handleAvatarFileSelect}
                                            disabled={avatarUploading}
                                            className="hidden"
                                        />
                                        {avatarUploading ? 'Subiendo…' : 'Editar'}
                                    </label>
                                )}
                            </div>

                            <div className="flex-1 min-w-0 flex flex-col items-center justify-center self-stretch pt-0.5 pb-0.5">
                                <h1
                                    className="w-full text-center font-black uppercase tracking-tight leading-tight line-clamp-3 text-[clamp(0.65rem,3.2vw,1rem)] px-1"
                                    title={fullName}
                                >
                                    {fullName}
                                </h1>
                                {viewMode === 'staff' && (
                                    <p className="text-[10px] text-white/70 uppercase tracking-widest mt-1">Mi cuenta</p>
                                )}
                                {viewMode === 'manager-employee' && (
                                    <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full mt-1">
                                        {profile.role === 'manager' ? 'Manager' : profile.role === 'supervisor' ? 'Supervisor' : 'Staff'}
                                    </span>
                                )}
                            </div>
                        </div>
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
                                <button
                                    type="button"
                                    onClick={() => router.push(`/staff/history?id=${encodeURIComponent(profile.id)}`)}
                                    className="flex items-center justify-center gap-2 w-full min-h-[48px] py-3 rounded-2xl bg-[#36606F] text-white font-black text-[10px] uppercase tracking-widest hover:bg-[#2d4d57]"
                                >
                                    Ver registros
                                </button>
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
            <NominasModal isOpen={nominasListOpen} onClose={() => setNominasListOpen(false)} targetUserId={viewingOtherProfile ? profile.id : undefined} isManager={isManager} />
            <ComunicadosModal isOpen={comunicadosOpen} onClose={() => setComunicadosOpen(false)} userId={profile.id} isManager={isManager} />
            <ContratoModal isOpen={contratoOpen} onClose={() => setContratoOpen(false)} userId={profile.id} isManager={isManager} />
            {isPasswordModalOpen && <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />}

            {cropModalImageSrc && (
                <AvatarCropModal
                    imageSrc={cropModalImageSrc}
                    onSave={handleAvatarCropSave}
                    onCancel={handleAvatarCropCancel}
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
