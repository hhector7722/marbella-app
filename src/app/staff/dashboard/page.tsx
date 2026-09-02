import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from "@/utils/supabase/server";
import DashboardSwitcher from '@/components/dashboards/DashboardSwitcher';
import { withTimeout } from '@/lib/with-timeout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { resolveSessionUser } from '@/lib/auth/resolve-session-user';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import {
    MASTER_VIEW_AS_COOKIE,
    resolveDashboardIdentityFromViewAs,
} from '@/lib/master-view-as';

async function StaffDashboardContent() {
    const supabase = await createClient();
    const user = await resolveSessionUser(supabase, 2000);

    if (!user) {
        redirect('/login');
    }

    const profileResult = await withTimeout(
        (async () => {
            try {
                return await supabase
                    .from('profiles')
                    .select('role, email')
                    .eq('id', user.id)
                    .maybeSingle();
            } catch {
                return { data: null, error: null };
            }
        })(),
        2000,
        { data: null, error: null },
    );

    const profile = profileResult.data;
    const email = profile?.email ?? user.email ?? '';
    const role = profile?.role || 'staff';

    let viewAsUserId: string | null = null;
    let viewAsProfile: { role?: string | null; email?: string | null } | null = null;

    if (isMasterDashboardUser(user.email ?? '')) {
        const cookieStore = await cookies();
        viewAsUserId = cookieStore.get(MASTER_VIEW_AS_COOKIE)?.value?.trim() || null;

        if (viewAsUserId && viewAsUserId !== user.id) {
            const viewAsResult = await withTimeout(
                (async () => {
                    try {
                        return await supabase
                            .from('profiles')
                            .select('id, role, email')
                            .eq('id', viewAsUserId!)
                            .maybeSingle();
                    } catch {
                        return { data: null, error: null };
                    }
                })(),
                2000,
                { data: null, error: null },
            );
            viewAsProfile = viewAsResult.data;
        }
    }

    const effective = resolveDashboardIdentityFromViewAs({
        realUserId: user.id,
        realEmail: user.email ?? '',
        realRole: role,
        realProfileEmail: email,
        viewAsUserId,
        viewAsProfile,
    });

    return (
        <DashboardSwitcher
            userRole={effective.role}
            userEmail={effective.email}
            initialView="staff"
        />
    );
}

export default function StaffDashboardPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-[50dvh] items-center justify-center">
                    <LoadingSpinner size="xl" className="text-white" />
                </div>
            }
        >
            <StaffDashboardContent />
        </Suspense>
    );
}
