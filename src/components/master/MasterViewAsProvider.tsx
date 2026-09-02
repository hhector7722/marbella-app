'use client';

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { createClient } from '@/utils/supabase/client';
import { getHomeHrefForUser, isMasterDashboardUser } from '@/lib/master-dashboard';
import {
    filterVisiblePlantillaEmployees,
    PLANTILLA_EMPLOYEE_SELECT,
} from '@/lib/staff/plantilla-employees';
import {
    StaffSelectionModal,
    type PlantillaEmployee,
} from '@/components/modals/StaffSelectionModal';
import { toast } from 'sonner';
import {
    canUseMasterViewAs,
    readMasterViewAsCookieFromDocument,
    type MasterViewAsIdentity,
} from '@/lib/master-view-as';

type MasterViewAsContextValue = {
    identity: MasterViewAsIdentity | null;
    isMaster: boolean;
    /** false hasta que loadIdentity termina (evita permisos master prematuros). */
    sessionReady: boolean;
    openViewAsPicker: () => void;
    clearViewAs: () => Promise<void>;
};

const MasterViewAsContext = createContext<MasterViewAsContextValue | null>(null);

export function useMasterViewAs(): MasterViewAsContextValue {
    const ctx = useContext(MasterViewAsContext);
    return (
        ctx ?? {
            identity: null,
            isMaster: false,
            sessionReady: true,
            openViewAsPicker: () => {},
            clearViewAs: async () => {},
        }
    );
}

/** Identidad efectiva para pantallas que deben comportarse como el usuario simulado. */
export function useEffectiveIdentity(): MasterViewAsIdentity | null {
    return useContext(MasterViewAsContext)?.identity ?? null;
}

export function MasterViewAsProvider({ children }: { children: React.ReactNode }) {
    const supabase = createClient();
    const [identity, setIdentity] = useState<MasterViewAsIdentity | null>(null);
    const [isMaster, setIsMaster] = useState(false);
    const [sessionReady, setSessionReady] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [showAllEmployees, setShowAllEmployees] = useState(false);
    const [activeEmployees, setActiveEmployees] = useState<PlantillaEmployee[]>([]);
    const [allEmployees, setAllEmployees] = useState<PlantillaEmployee[] | null>(null);
    const [loadingEmployees, setLoadingEmployees] = useState(false);

    const loadIdentity = useCallback(async () => {
        setSessionReady(false);
        try {
            const {
                data: { session },
            } = await supabase.auth.getSession();
            const user = session?.user;
            if (!user?.email) {
                setIdentity(null);
                setIsMaster(false);
                return;
            }

            const master = canUseMasterViewAs(user.email);
            setIsMaster(master);
            if (!master) {
                setIdentity(null);
                return;
            }

            const viewAsId = readMasterViewAsCookieFromDocument();
        const realProfileRes = await supabase
            .from('profiles')
            .select('first_name, role, email, is_supervisor')
            .eq('id', user.id)
            .maybeSingle();

        const realProfile = realProfileRes.data;
        const realName = realProfile?.first_name ?? user.user_metadata?.first_name ?? 'Héctor';
        const realRole = realProfile?.role ?? 'staff';

        if (!viewAsId || viewAsId === user.id) {
            setIdentity({
                realUserId: user.id,
                realEmail: user.email,
                effectiveUserId: user.id,
                effectiveName: realName,
                effectiveRole: realRole,
                effectiveEmail: realProfile?.email ?? user.email,
                isSupervisor: Boolean(realProfile?.is_supervisor),
                isViewingAs: false,
            });
            return;
        }

        const { data: viewedProfile, error } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, role, email, is_supervisor')
            .eq('id', viewAsId)
            .maybeSingle();

        if (error || !viewedProfile) {
            await fetch('/api/master/view-as', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: null }),
            });
            setIdentity({
                realUserId: user.id,
                realEmail: user.email,
                effectiveUserId: user.id,
                effectiveName: realName,
                effectiveRole: realRole,
                effectiveEmail: realProfile?.email ?? user.email,
                isSupervisor: Boolean(realProfile?.is_supervisor),
                isViewingAs: false,
            });
            return;
        }

        setIdentity({
            realUserId: user.id,
            realEmail: user.email,
            effectiveUserId: viewedProfile.id,
            effectiveName: viewedProfile.first_name || 'Empleado',
            effectiveRole: viewedProfile.role || 'staff',
            effectiveEmail: viewedProfile.email ?? '',
            isSupervisor: Boolean(viewedProfile.is_supervisor),
            isViewingAs: true,
        });
        } finally {
            setSessionReady(true);
        }
    }, [supabase]);

    useEffect(() => {
        void loadIdentity();
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange(() => {
            void loadIdentity();
        });
        return () => subscription.unsubscribe();
    }, [loadIdentity, supabase]);

    const ensureActiveEmployees = useCallback(async () => {
        if (activeEmployees.length > 0) return activeEmployees;
        setLoadingEmployees(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select(PLANTILLA_EMPLOYEE_SELECT)
                .order('first_name');
            if (error) throw error;
            const cleaned = filterVisiblePlantillaEmployees((data ?? []) as PlantillaEmployee[]);
            setActiveEmployees(cleaned);
            return cleaned;
        } catch (err) {
            console.error(err);
            toast.error('No se pudo cargar la plantilla');
            return [];
        } finally {
            setLoadingEmployees(false);
        }
    }, [activeEmployees.length, supabase]);

    const ensureAllEmployees = useCallback(async () => {
        if (allEmployees) return allEmployees;
        setLoadingEmployees(true);
        try {
            const { data, error } = await supabase.from('profiles').select(PLANTILLA_EMPLOYEE_SELECT);
            if (error) throw error;
            const cleaned = (data ?? []).filter((p) => {
                const name = (p.first_name || '').trim().toLowerCase();
                return name !== 'ramon' && name !== 'ramón' && name !== 'empleado';
            }) as PlantillaEmployee[];
            setAllEmployees(cleaned);
            return cleaned;
        } catch (err) {
            console.error(err);
            toast.error('No se pudo cargar la plantilla completa');
            return [];
        } finally {
            setLoadingEmployees(false);
        }
    }, [allEmployees, supabase]);

    const applyViewAs = useCallback(
        async (employee: PlantillaEmployee) => {
            const targetId =
                !employee.id || employee.id === identity?.realUserId ? null : employee.id;

            const res = await fetch('/api/master/view-as', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: targetId }),
            });

            if (!res.ok) {
                toast.error('No se pudo cambiar de usuario');
                return;
            }

            const home = targetId
                ? getHomeHrefForUser(employee.email ?? null, employee.role ?? 'staff')
                : '/master/dashboard';

            window.location.assign(home);
        },
        [identity?.realUserId],
    );

    const openViewAsPicker = useCallback(() => {
        if (!isMaster) return;
        setPickerOpen(true);
        void ensureActiveEmployees();
    }, [ensureActiveEmployees, isMaster]);

    const clearViewAs = useCallback(async () => {
        await fetch('/api/master/view-as', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: null }),
        });
        window.location.assign('/master/dashboard');
    }, []);

    const contextValue = useMemo(
        () => ({
            identity,
            isMaster,
            sessionReady,
            openViewAsPicker,
            clearViewAs,
        }),
        [identity, isMaster, sessionReady, openViewAsPicker, clearViewAs],
    );

    return (
        <MasterViewAsContext value={contextValue}>
            {children}
            {isMaster ? (
                <StaffSelectionModal
                    isOpen={pickerOpen}
                    onClose={() => setPickerOpen(false)}
                    employees={showAllEmployees ? (allEmployees ?? activeEmployees) : activeEmployees}
                    onSelect={(emp) => void applyViewAs(emp)}
                    title="Ver como"
                    variant="profile-list"
                    usageId="master-view-as"
                    usageLabel="Ver aplicación como trabajador"
                    listEndAction={{
                        label: showAllEmployees ? 'Ver activos' : 'Ver todos',
                        onClick: async () => {
                            if (!showAllEmployees) {
                                await ensureAllEmployees();
                                setShowAllEmployees(true);
                                return;
                            }
                            setShowAllEmployees(false);
                        },
                    }}
                >
                    {loadingEmployees && activeEmployees.length === 0 ? (
                        <p className="py-6 text-center text-[10px] font-black uppercase tracking-widest text-zinc-400">
                            Cargando…
                        </p>
                    ) : null}
                </StaffSelectionModal>
            ) : null}
        </MasterViewAsContext>
    );
}
