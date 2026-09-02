'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { Avatar } from '@/components/ui/Avatar';
import { Surface } from '@/components/ui/Surface';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { CreditCard } from 'lucide-react';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import NominasModal from '@/components/NominasModal';
import DatosPersonalesModal from '@/components/profile/DatosPersonalesModal';
import ContactoModal from '@/components/profile/ContactoModal';
import DatosBancariosModal from '@/components/profile/DatosBancariosModal';
import NominasMenuModal, { NominasMenuAction } from '@/components/profile/NominasMenuModal';
import CompanyPdfDocumentModal, { CompanyPdfDocumentKind } from '@/components/profile/CompanyPdfDocumentModal';
import ComunicadosModal from '@/components/profile/ComunicadosModal';
import ContratoModal from '@/components/profile/ContratoModal';
import { AvatarCropModal } from '@/components/profile/AvatarCropModal';
import { getHomeHrefForUser, isMasterDashboardUser } from '@/lib/master-dashboard';
import {
    PLANTILLA_EMPLOYEE_SELECT,
    filterVisiblePlantillaEmployees,
} from '@/lib/staff/plantilla-employees';
import { withAppIconRev } from '@/lib/app-icons';
import {
    StaffSelectionModal,
    type PlantillaEmployee,
} from '@/components/modals/StaffSelectionModal';
import type { User } from '@supabase/supabase-js';

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
    joining_date?: string | null;
    end_date?: string | null;
    role: string;
    avatar_url: string | null;
}

const PROFILE_GRID = [
    { id: 'datos-personales', label: 'Datos personales', icon: '/icons/staff-card.png' },
    { id: 'contacto', label: 'Contacto', icon: '/icons/phone.png' },
    { id: 'datos-bancarios', label: 'Datos bancarios', icon: '/icons/visa.png' },
    { id: 'nominas', label: 'Documentos', icon: '/icons/admin2.png' },
    { id: 'cambiar-password', label: 'Cambiar contraseña', icon: '/icons/password.png' },
    { id: 'cerrar-sesion', label: 'Cerrar sesión', icon: '/icons/log-out.png' },
] as const;

function ProfileContent() {
    const supabase = createClient();
    const router = useRouter();
    const searchParams = useSearchParams();
    const targetId = searchParams.get('id');

    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isManager, setIsManager] = useState(false);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [isRecoveryFlow, setIsRecoveryFlow] = useState(false);
    const [isRecoveryPending, setIsRecoveryPending] = useState(false);
    const [shouldRedirectToLogin, setShouldRedirectToLogin] = useState(false);
    const [modalDatosPersonales, setModalDatosPersonales] = useState(false);
    const [modalContacto, setModalContacto] = useState(false);
    const [modalDatosBancarios, setModalDatosBancarios] = useState(false);
    const [nominasMenuOpen, setNominasMenuOpen] = useState(false);
    const [nominasListOpen, setNominasListOpen] = useState(false);
    const [comunicadosOpen, setComunicadosOpen] = useState(false);
    const [contratoOpen, setContratoOpen] = useState(false);
    const [companyPdfDoc, setCompanyPdfDoc] = useState<CompanyPdfDocumentKind | null>(null);
    const [logoutConfirm, setLogoutConfirm] = useState(false);

    useModalUsageTracking({
        open: logoutConfirm,
        usageId: 'profile-logout-confirm',
        usageLabel: 'Confirmar cierre de sesión',
    });

    const [cropModalImageSrc, setCropModalImageSrc] = useState<string | null>(null);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [joiningDateYmd, setJoiningDateYmd] = useState<string>('');
    const [endDateYmd, setEndDateYmd] = useState<string>('');
    const [plantillaOpen, setPlantillaOpen] = useState(false);
    const [plantillaEmployees, setPlantillaEmployees] = useState<PlantillaEmployee[]>([]);
    const [plantillaLoading, setPlantillaLoading] = useState(false);
    const [viewerRole, setViewerRole] = useState<string | null>(null);

    const fullName = profile
        ? `${profile.first_name} ${profile.last_name || ''}`.trim()
        : '';

    const handledRecoveryRef = useRef(false);

    const clearRecoveryUrl = useCallback(() => {
        if (typeof window === 'undefined') return;
        const url = new URL(window.location.href);
        const recoveryParams = [
            'type',
            'code',
            'access_token',
            'refresh_token',
            'token',
            'token_hash',
            'expires_at',
            'expires_in',
        ];

        recoveryParams.forEach((param) => {
            url.searchParams.delete(param);
        });

        window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
    }, []);

    const hasRecoveryParams = useCallback(() => {
        if (typeof window === 'undefined') return false;

        const url = new URL(window.location.href);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const searchHasTypeRecovery = url.searchParams.get('type') === 'recovery';
        const hashHasTypeRecovery = hashParams.get('type') === 'recovery';
        const hasTokens =
            hashParams.has('access_token') ||
            hashParams.has('refresh_token') ||
            hashParams.has('token') ||
            hashParams.has('token_hash') ||
            url.searchParams.has('code');

        return searchHasTypeRecovery || hashHasTypeRecovery || hasTokens;
    }, []);

    const openRecoveryModal = useCallback((shouldClearUrl = false) => {
        handledRecoveryRef.current = true;
        setIsRecoveryFlow(true);
        setIsPasswordModalOpen(true);
        if (shouldClearUrl) {
            clearRecoveryUrl();
        }
    }, [clearRecoveryUrl]);

    useEffect(() => {
        fetchInitialData();
    }, [targetId]);

    useEffect(() => {
        if (handledRecoveryRef.current || typeof window === 'undefined') return;
        if (!hasRecoveryParams()) return;

        setIsRecoveryPending(true);
        // Si llegamos con tokens/hash de recovery, esperamos a que Supabase materialice la sesión.
        openRecoveryModal(false);
    }, [hasRecoveryParams, openRecoveryModal]);

    useEffect(() => {
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setIsRecoveryPending(false);
                setShouldRedirectToLogin(false);
                openRecoveryModal(true);
                fetchInitialData();
                return;
            }

            if (event === 'SIGNED_IN' && !handledRecoveryRef.current && hasRecoveryParams()) {
                setIsRecoveryPending(false);
                setShouldRedirectToLogin(false);
                openRecoveryModal(true);
                fetchInitialData();
                return;
            }

            if (event === 'SIGNED_OUT') {
                setIsRecoveryPending(false);
                if (!hasRecoveryParams()) {
                    setShouldRedirectToLogin(true);
                }
            }
        });

        return () => subscription.unsubscribe();
    }, [hasRecoveryParams, openRecoveryModal, supabase]);

    useEffect(() => {
        if (!shouldRedirectToLogin) return;
        router.replace('/login');
    }, [router, shouldRedirectToLogin]);

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
                if (hasRecoveryParams()) {
                    setIsRecoveryPending(true);
                    return;
                }
                setIsRecoveryPending(false);
                setShouldRedirectToLogin(true);
                setLoading(false);
                return;
            }
            setIsRecoveryPending(false);
            setShouldRedirectToLogin(false);
            setCurrentUser(user);
            const { data: currentProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            const managerStatus = currentProfile?.role === 'manager';
            setIsManager(managerStatus);
            setViewerRole(currentProfile?.role ?? null);
            const effectiveId = (targetId && managerStatus) ? targetId : user.id;
            const { data, error } = await supabase.from('profiles').select('*').eq('id', effectiveId).single();
            if (error) throw error;
            const typedProfile = data as UserProfile;
            setProfile(typedProfile);
            setJoiningDateYmd(typedProfile.joining_date ?? '');
            setEndDateYmd(typedProfile.end_date ?? '');
        } catch (error) {
            console.error('Error loading profile:', error);
            toast.error('Error al cargar el perfil');
        } finally {
            setLoading(false);
        }
    };

    const viewingOtherProfile = isManager && !!targetId && currentUser?.id !== profile?.id;
    const showAccountSection = !viewingOtherProfile;
    type ViewMode = 'staff' | 'manager-self' | 'manager-employee';
    const viewMode: ViewMode = !isManager ? 'staff' : viewingOtherProfile ? 'manager-employee' : 'manager-self';

    const openPlantillaFromProfile = useCallback(async () => {
        if (!isManager) return;
        setPlantillaOpen(true);
        if (plantillaEmployees.length > 0) return;
        setPlantillaLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select(PLANTILLA_EMPLOYEE_SELECT)
                .eq('visible_in_plantilla', true)
                .order('first_name');
            if (error) {
                toast.error('No se pudo cargar la plantilla');
                setPlantillaOpen(false);
                return;
            }
            setPlantillaEmployees(
                filterVisiblePlantillaEmployees((data || []) as PlantillaEmployee[]),
            );
        } catch (e) {
            console.error(e);
            toast.error('No se pudo cargar la plantilla');
            setPlantillaOpen(false);
        } finally {
            setPlantillaLoading(false);
        }
    }, [isManager, plantillaEmployees.length, supabase]);

    const goHomeFromPlantilla = useCallback(() => {
        setPlantillaOpen(false);
        router.push(getHomeHrefForUser(currentUser?.email, viewerRole));
    }, [currentUser?.email, viewerRole, router]);

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
        if (action === 'convenio' || action === 'conducta') setCompanyPdfDoc(action);
    };
    const showPersonalPurchasesAccountsButton =
        String(profile?.email || '').toLowerCase() === 'hhector7722@gmail.com';
    const canManageLaborConditions = isMasterDashboardUser(currentUser?.email);

    const gridItems = showAccountSection
        ? PROFILE_GRID
        : PROFILE_GRID.filter(i => i.id !== 'cambiar-password' && i.id !== 'cerrar-sesion');

    if (loading) {
        return <div className="min-h-screen" />;
    }

    if (isRecoveryPending) {
        return <div className="min-h-screen" />;
    }

    if (!profile) {
        return (
            <DashboardDetailLayout
                title="Perfil"
                showBackButton
                template="detail"
                maxWidthClass="max-w-2xl"
            >
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-gray-500 font-black uppercase tracking-widest text-xs">Perfil no encontrado</p>
                    <Button
                        type="button"
                        variant="secondary"
                        instance="profile-not-found-back"
                        onClick={() => router.back()}
                        className="mt-6"
                    >
                        Volver
                    </Button>
                </div>
            </DashboardDetailLayout>
        );
    }

    return (
        <>
            <DashboardDetailLayout
                title={fullName}
                titleAlign="center"
                className="page-profile"
                subtitle={
                    viewMode === 'staff'
                        ? 'Mi cuenta'
                        : viewMode === 'manager-employee'
                          ? (profile.role === 'manager' ? 'Manager' : profile.role === 'supervisor' ? 'Supervisor' : 'Staff')
                          : undefined
                }
                showBackButton={isManager}
                onBack={isManager ? () => void openPlantillaFromProfile() : undefined}
                titleLeading={
                    showAccountSection ? (
                        <label className="relative block h-full w-full cursor-pointer">
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                onChange={handleAvatarFileSelect}
                                disabled={avatarUploading}
                                className="hidden"
                                aria-label={avatarUploading ? 'Subiendo foto' : 'Editar foto'}
                            />
                            <Avatar
                                src={profile.avatar_url}
                                alt={fullName}
                                size="sm"
                                className="h-full w-full bg-white"
                            />
                        </label>
                    ) : (
                        <Avatar
                            src={profile.avatar_url}
                            alt={fullName}
                            size="sm"
                            className="h-full w-full bg-white"
                        />
                    )
                }
                template="detail"
                maxWidthClass="max-w-2xl"
                rightSlot={
                    showPersonalPurchasesAccountsButton ? (
                        <Button
                            type="button"
                            variant="tertiary"
                            instance="profile-cuentas-personales"
                            onClick={() => router.push('/dashboard/ledger')}
                            aria-label="Cuentas de compras personales"
                            icon={<CreditCard size={20} strokeWidth={2.25} />}
                        />
                    ) : null
                }
            >
                <Surface variant="block" instance="profile-menu">
                    <div data-element="profile-actions">
                        {gridItems.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                data-element="profile-action"
                                data-instance={`profile-${item.id}`}
                                onClick={() => handleGridAction(item.id)}
                            >
                                <span data-element="icon-wrap">
                                    <img src={withAppIconRev(item.icon)} alt="" />
                                </span>
                                <span data-element="label">{item.label}</span>
                            </button>
                        ))}
                    </div>
                </Surface>

                        {canManageLaborConditions ? (
                            <div className="mt-8">
                                <button
                                    type="button"
                                    onClick={() =>
                                        router.push(
                                            `/profile/contrato?id=${encodeURIComponent(profile.id)}`,
                                        )
                                    }
                                    className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white py-3 font-black text-[10px] uppercase tracking-widest text-zinc-800 hover:bg-zinc-50 active:scale-[0.98]"
                                >
                                    Condiciones laborales
                                </button>
                            </div>
                        ) : null}

                        {isManager && (
                            <div className="mt-8">
                                <h2 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-3">
                                    {viewingOtherProfile ? 'Datos laborales' : 'Mi contrato'}
                                </h2>
                                <div className="bg-white rounded-xl border border-zinc-100 shadow-sm p-4 mb-4">
                                    <div className="grid grid-cols-1 gap-3">
                                        <div className="min-h-[48px] flex flex-col justify-center gap-1">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                                Fecha inicio contrato
                                            </p>
                                            <p className="text-sm font-bold text-zinc-800">
                                                {joiningDateYmd ? joiningDateYmd : ' '}
                                            </p>
                                        </div>
                                        <div className="min-h-[48px] flex flex-col justify-center gap-1">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                                Finalización trabajador
                                            </p>
                                            <p className="text-sm font-bold text-zinc-800">
                                                {endDateYmd ? endDateYmd : 'Activo'}
                                            </p>
                                        </div>
                                        <p className="text-[11px] text-zinc-500 leading-snug">
                                            Si un empleado empieza a mitad de semana, los días anteriores se computan como{' '}
                                            <span className="font-black">extras</span>.
                                        </p>
                                        {canManageLaborConditions ? (
                                            <p className="text-[11px] text-zinc-500 leading-snug">
                                                Para editar fechas, jornada o régimen usa{' '}
                                                <span className="font-black">Condiciones laborales</span>.
                                            </p>
                                        ) : null}
                                    </div>
                                </div>
                                {viewingOtherProfile ? (
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                    <Button
                                        type="button"
                                        variant="primary"
                                        instance="profile-view-records"
                                        onClick={() => router.push(`/staff/history?id=${encodeURIComponent(profile.id)}`)}
                                    >
                                        Ver registros
                                    </Button>
                                    </div>
                                ) : null}
                            </div>
                        )}
            </DashboardDetailLayout>

            {/* Modales */}
            <DatosPersonalesModal
                isOpen={modalDatosPersonales}
                onClose={() => setModalDatosPersonales(false)}
                dni={profile.dni}
                email={profile.email}
                ownerUserId={profile.id}
                canManageDniImage={viewMode === 'manager-employee'}
            />
            <ContactoModal isOpen={modalContacto} onClose={() => setModalContacto(false)} phone={profile.phone} />
            <DatosBancariosModal isOpen={modalDatosBancarios} onClose={() => setModalDatosBancarios(false)} iban={profile.bank_account} />
            <NominasMenuModal isOpen={nominasMenuOpen} onClose={() => setNominasMenuOpen(false)} onSelect={handleNominasMenuSelect} />
            <NominasModal isOpen={nominasListOpen} onClose={() => setNominasListOpen(false)} targetUserId={viewingOtherProfile ? profile.id : undefined} isManager={isManager} />
            <ComunicadosModal isOpen={comunicadosOpen} onClose={() => setComunicadosOpen(false)} userId={profile.id} isManager={isManager} />
            <ContratoModal isOpen={contratoOpen} onClose={() => setContratoOpen(false)} userId={profile.id} isManager={isManager} />
            <CompanyPdfDocumentModal
                isOpen={companyPdfDoc !== null}
                onClose={() => setCompanyPdfDoc(null)}
                documentKind={companyPdfDoc}
            />
            {isPasswordModalOpen && (
                <ChangePasswordModal
                    isOpen={isPasswordModalOpen}
                    isRecoveryMode={isRecoveryFlow}
                    onClose={() => {
                        setIsPasswordModalOpen(false);
                        setIsRecoveryFlow(false);
                    }}
                    onSuccess={() => {
                        clearRecoveryUrl();
                        setIsRecoveryFlow(false);
                    }}
                />
            )}

            {cropModalImageSrc && (
                <AvatarCropModal
                    imageSrc={cropModalImageSrc}
                    onSave={handleAvatarCropSave}
                    onCancel={handleAvatarCropCancel}
                />
            )}

            {isManager ? (
                <StaffSelectionModal
                    isOpen={plantillaOpen}
                    onClose={() => setPlantillaOpen(false)}
                    employees={plantillaEmployees}
                    onSelect={(emp) => router.push(`/profile?id=${emp.id}`)}
                    title="Plantilla"
                    variant="profile-list"
                    hideHeaderClose
                    onBack={goHomeFromPlantilla}
                    usageId="profile-plantilla"
                    usageLabel="Plantilla desde perfil"
                >
                    {plantillaLoading && plantillaEmployees.length === 0 ? (
                        <p className="py-6 text-center text-[10px] font-black uppercase tracking-widest text-zinc-400">
                            Cargando…
                        </p>
                    ) : null}
                </StaffSelectionModal>
            ) : null}

            <Modal
                open={logoutConfirm}
                onClose={() => setLogoutConfirm(false)}
                title="Cerrar sesión"
                variant="compact"
                layer="system"
                instance="profile-logout-confirm"
                usageId="profile-logout-confirm"
                usageLabel="Confirmar cerrar sesión"
                footer={
                    <div className="flex w-full flex-wrap items-center justify-end gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            instance="profile-logout-cancel"
                            onClick={() => setLogoutConfirm(false)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            instance="profile-logout-confirm-action"
                            onClick={handleLogout}
                        >
                            Cerrar sesión
                        </Button>
                    </div>
                }
            >
                <p className="px-6 pb-4 text-sm text-zinc-500">¿Seguro que quieres cerrar sesión?</p>
            </Modal>
        </>
    );
}

export default function StaffProfilePage() {
    return (
        <Suspense fallback={<div className="min-h-screen" />}>
            <ProfileContent />
        </Suspense>
    );
}
