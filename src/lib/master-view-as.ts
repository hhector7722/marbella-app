import { isMasterDashboardUser } from '@/lib/master-dashboard';

export const MASTER_VIEW_AS_COOKIE = 'marbella_view_as';

export type MasterViewAsProfile = {
    id: string;
    first_name: string;
    last_name: string;
    role?: string | null;
    email?: string | null;
    avatar_url?: string | null;
    end_date?: string | null;
    visible_in_plantilla?: boolean | null;
    is_supervisor?: boolean | null;
};

export type MasterViewAsIdentity = {
    realUserId: string;
    realEmail: string;
    effectiveUserId: string;
    effectiveName: string;
    effectiveRole: string;
    effectiveEmail: string;
    isSupervisor: boolean;
    isViewingAs: boolean;
};

export function canUseMasterViewAs(email: string | null | undefined): boolean {
    return isMasterDashboardUser(email);
}

export function readMasterViewAsCookieFromDocument(): string | null {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(
        new RegExp(`(?:^|;\\s*)${MASTER_VIEW_AS_COOKIE}=([^;]*)`),
    );
    const value = match?.[1]?.trim();
    return value || null;
}
