import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { MASTER_VIEW_AS_COOKIE } from '@/lib/master-view-as';
import type { HistoryAccessScope } from '@/lib/staff/history-access';

/** Resuelve permisos de lectura de historial en servidor (incluye cookie view-as). */
export async function resolveHistoryAccessScope(
    supabase: SupabaseClient,
    actorUserId: string,
    actorEmail: string,
): Promise<HistoryAccessScope | null> {
    const { data: actorProfile } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', actorUserId)
        .maybeSingle();

    const actorRole = actorProfile?.role ?? 'staff';
    const actorProfileEmail = actorProfile?.email ?? actorEmail;

    let viewAsUserId: string | null = null;
    if (isMasterDashboardUser(actorEmail)) {
        const cookieStore = await cookies();
        viewAsUserId = cookieStore.get(MASTER_VIEW_AS_COOKIE)?.value?.trim() || null;
    }

    if (!viewAsUserId || viewAsUserId === actorUserId) {
        return {
            actorUserId,
            effectiveUserId: actorUserId,
            effectiveRole: actorRole,
            effectiveEmail: actorProfileEmail,
            isViewingAs: false,
        };
    }

    const { data: viewedProfile } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', viewAsUserId)
        .maybeSingle();

    if (!viewedProfile) {
        return {
            actorUserId,
            effectiveUserId: actorUserId,
            effectiveRole: actorRole,
            effectiveEmail: actorProfileEmail,
            isViewingAs: false,
        };
    }

    return {
        actorUserId,
        effectiveUserId: viewAsUserId,
        effectiveRole: viewedProfile.role ?? 'staff',
        effectiveEmail: viewedProfile.email ?? actorProfileEmail,
        isViewingAs: true,
    };
}
