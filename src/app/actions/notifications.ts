'use server';

import { createClient } from "@/utils/supabase/server";
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { isSandboxRequest } from '@/lib/sandbox/server';
import {
    NOTIFICATION_HECTOR_EMAIL,
    normalizeNotificationEmail,
} from '@/lib/notification-recipients';
import {
    cashClosingHistoryUrl,
    staffDashboardScheduleUrl,
} from '@/lib/notification-routes';
import {
    buildScheduleNotePushPayload,
    isCivilYmd,
} from '@/lib/schedule-note-push';
import webpush from 'web-push';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@barmarbella.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        VAPID_SUBJECT,
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY
    );
}

export async function saveSubscription(subscription: any) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { error: 'No authenticated user' };

    const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
            user_id: user.id,
            subscription: subscription,
        }, { onConflict: 'user_id' });

    if (error) {
        console.error('Error saving subscription:', error);
        return { error: error.message };
    }

    return { success: true };
}

export async function getPushSubscriptionStatus(): Promise<{ hasSubscription: boolean }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { hasSubscription: false };

    const { data, error } = await supabase
        .from('push_subscriptions')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

    if (error) {
        console.error('Error checking push subscription:', error);
        return { hasSubscription: false };
    }

    return { hasSubscription: !!data };
}

export type UserShiftForNotification = { userId: string; start: string; end: string };

const SCHEDULE_NOTIFY_ROLES = new Set(['manager', 'admin']);

export async function sendScheduleNotifications(
    dateStr: string,
    userShifts: UserShiftForNotification[],
    scheduleDateIso?: string,
) {
    const userIds = [...new Set(userShifts.map(s => s.userId))];
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        console.error('Push: VAPID keys not set. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Vercel env.');
        return {
            success: false,
            error: 'Notificaciones push no configuradas (falta VAPID en el servidor)',
            sentCount: 0,
            targetCount: userIds.length,
            missingSubscriptionUserIds: userIds,
            sentUserIds: [],
            failedUserIds: userIds,
        };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return {
            success: false,
            error: 'Sesión no válida',
            sentCount: 0,
            targetCount: userIds.length,
            missingSubscriptionUserIds: userIds,
            sentUserIds: [],
            failedUserIds: userIds,
        };
    }
    const { data: callerProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    if (!callerProfile?.role || !SCHEDULE_NOTIFY_ROLES.has(callerProfile.role)) {
        return {
            success: false,
            error: 'Solo manager o admin pueden enviar avisos de horario.',
            sentCount: 0,
            targetCount: userIds.length,
            missingSubscriptionUserIds: userIds,
            sentUserIds: [],
            failedUserIds: userIds,
        };
    }

    const { data: subscriptions, error } = await supabase
        .from('push_subscriptions')
        .select('subscription, user_id')
        .in('user_id', userIds);

    if (error) {
        console.error('Error fetching subscriptions:', error);
        return {
            success: false,
            error: error.message,
            sentCount: 0,
            targetCount: userIds.length,
            missingSubscriptionUserIds: userIds,
            sentUserIds: [],
            failedUserIds: userIds,
        };
    }

    const subs = subscriptions ?? [];
    const subscriptionUserIds = new Set(subs.map(s => s.user_id));
    const missingSubscriptionUserIds = userIds.filter(id => !subscriptionUserIds.has(id));

    const actionUrl = scheduleDateIso
        ? staffDashboardScheduleUrl(scheduleDateIso)
        : '/staff/dashboard';
    const pushUrl = actionUrl;

    const shiftByUser = new Map(userShifts.map(s => [s.userId, s]));
    for (const uid of userIds) {
        const shift = shiftByUser.get(uid);
        const body = shift ? `${shift.start} - ${shift.end}` : null;
        const { error: inAppScheduleErr } = await supabase.rpc('create_user_notifications_bulk', {
            p_user_ids: [uid],
            p_type: 'schedule',
            p_title: `Horario - ${dateStr}`,
            p_body: body,
            p_action_url: actionUrl,
        });
        if (inAppScheduleErr) {
            console.error('In-app schedule notification:', inAppScheduleErr, uid);
        }
    }

    if (subs.length === 0) {
        return {
            success: true,
            message: 'Aviso en campana. Ningún destinatario tiene push activo en este dispositivo.',
            sentCount: 0,
            targetCount: userIds.length,
            missingSubscriptionUserIds,
            sentUserIds: [],
            failedUserIds: [],
        };
    }

    const results = await Promise.allSettled(
        subs.map(sub => {
            const shift = shiftByUser.get(sub.user_id);
            const body = shift ? `🕒 ${shift.start} - ${shift.end}` : '🕒 —';
            const payload = JSON.stringify({
                title: `📅 Horario - ${dateStr}`,
                body,
                url: pushUrl,
            });
            return webpush.sendNotification(sub.subscription as any, payload);
        })
    );

    const sentCount = results.filter(r => r.status === 'fulfilled').length;
    const failures = results.filter(r => r.status === 'rejected');
    const sentUserIds = results
        .map((r, idx) => (r.status === 'fulfilled' ? subs[idx].user_id : null))
        .filter((id): id is string => id !== null);
    const failedUserIds = results
        .map((r, idx) => (r.status === 'rejected' ? subs[idx].user_id : null))
        .filter((id): id is string => id !== null);

    // Clean up expired subscriptions
    const expiredSubIds = failures
        .map((f: any, idx) => {
            if (f.reason?.statusCode === 404 || f.reason?.statusCode === 410) {
                return subs[idx].user_id;
            }
            return null;
        })
        .filter(Boolean);

    if (expiredSubIds.length > 0) {
        await supabase
            .from('push_subscriptions')
            .delete()
            .in('user_id', expiredSubIds);
    }

    return {
        success: true,
        sentCount,
        targetCount: userIds.length,
        missingSubscriptionUserIds,
        sentUserIds,
        failedUserIds,
    };
}

export async function sendClosingNotification(data: {
    dateStr: string;
    totalSales: number;
    netSales: number;
    avgTicket?: number;
    closingId?: string;
}) {
    if (await isSandboxRequest()) return { success: true, sentCount: 0, simulated: true };
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        console.error('Push: VAPID keys not set.');
        return { success: false, error: 'Notificaciones push no configuradas (falta VAPID en el servidor)', sentCount: 0 };
    }

    const supabase = await createClient();

    const { data: hectorProfile, error: hectorError } = await supabase
        .from('profiles')
        .select('id, email')
        .ilike('email', NOTIFICATION_HECTOR_EMAIL)
        .maybeSingle();

    if (hectorError || !hectorProfile?.id) {
        console.error('Hector profile not found for closing notify:', hectorError);
        return { success: false, error: 'No se encontró el perfil de Hector para el cierre' };
    }

    if (normalizeNotificationEmail(hectorProfile.email) !== NOTIFICATION_HECTOR_EMAIL) {
        return { success: false, error: 'Perfil de Hector no coincide con el email esperado' };
    }

    const managerIds = [hectorProfile.id];

    // 2. Get subscriptions for these managers
    const { data: subscriptions, error: subError } = await supabase
        .from('push_subscriptions')
        .select('subscription, user_id')
        .in('user_id', managerIds);

    if (subError) {
        console.error('Error fetching subscriptions:', subError);
        return { error: subError.message };
    }

    const closingBody = `Ventas: ${data.totalSales.toFixed(2)}€ · Venta neta: ${data.netSales.toFixed(2)}€`;
    const actionUrl = data.closingId
        ? cashClosingHistoryUrl(data.closingId)
        : '/dashboard/history';
    const { error: inAppClosingErr } = await supabase.rpc('create_user_notifications_system', {
        p_user_ids: managerIds,
        p_type: 'cash_closing',
        p_title: `Cierre ${data.dateStr}`,
        p_body: closingBody,
        p_action_url: actionUrl,
    });
    if (inAppClosingErr) {
        console.error('In-app closing notifications:', inAppClosingErr);
    }

    if (!subscriptions || subscriptions.length === 0) {
        return { success: true, sentCount: 0, message: 'Sin push activo; aviso en campana para managers' };
    }

    const payload = JSON.stringify({
        title: `✅ Cierre ${data.dateStr}`,
        body: `Ventas: ${data.totalSales.toFixed(2)}€\nVenta Neta: ${data.netSales.toFixed(2)}€`,
        url: actionUrl,
    });

    const results = await Promise.allSettled(
        subscriptions.map(sub =>
            webpush.sendNotification(sub.subscription as any, payload)
        )
    );

    const sentCount = results.filter(r => r.status === 'fulfilled').length;

    // Clean up expired subscriptions (copy of logic from schedule notifications)
    const failures = results.filter(r => r.status === 'rejected');
    const expiredSubIds = failures
        .map((f: any, idx) => {
            if (f.reason?.statusCode === 404 || f.reason?.statusCode === 410) {
                return subscriptions[idx].user_id;
            }
            return null;
        })
        .filter(Boolean);

    if (expiredSubIds.length > 0) {
        await supabase
            .from('push_subscriptions')
            .delete()
            .in('user_id', expiredSubIds);
    }

    return { success: true, sentCount };
}

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createServiceClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

/** Push a Héctor cuando alguien añade una nota nueva en el modal de un día del horario. */
export async function sendScheduleNoteNotification(input: {
    date: string;
    authorUserId: string;
}): Promise<{ success: boolean; sentCount?: number; error?: string }> {
    if (await isSandboxRequest()) return { success: true, sentCount: 0 };
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        return { success: false, error: 'Notificaciones push no configuradas (falta VAPID en el servidor)' };
    }

    const date = input.date?.trim() ?? '';
    const authorUserId = input.authorUserId?.trim() ?? '';
    if (!isCivilYmd(date) || !authorUserId) {
        return { success: false, error: 'Datos de nota no válidos' };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'Sesión no válida' };
    }

    if (authorUserId !== user.id) {
        const { data: callerProfile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
        if (!callerProfile?.role || !SCHEDULE_NOTIFY_ROLES.has(callerProfile.role)) {
            return { success: false, error: 'Sin permiso para avisar de esta nota' };
        }
    }

    const [noteResult, authorResult] = await Promise.all([
        supabase
            .from('schedule_day_notes')
            .select('content')
            .eq('user_id', authorUserId)
            .eq('date', date)
            .maybeSingle(),
        supabase
            .from('profiles')
            .select('first_name')
            .eq('id', authorUserId)
            .maybeSingle(),
    ]);

    if (noteResult.error || !noteResult.data) {
        return { success: false, error: 'No se encontró la nota' };
    }

    const admin = getServiceSupabase();
    if (!admin) {
        return { success: false, error: 'Faltan credenciales de servicio para el aviso' };
    }

    const { data: hectorProfile, error: hectorError } = await admin
        .from('profiles')
        .select('id, email')
        .ilike('email', NOTIFICATION_HECTOR_EMAIL)
        .maybeSingle();

    if (hectorError || !hectorProfile?.id) {
        console.error('Hector profile not found for schedule note notify:', hectorError);
        return { success: false, error: 'No se encontró el perfil de Hector para el aviso' };
    }

    if (normalizeNotificationEmail(hectorProfile.email) !== NOTIFICATION_HECTOR_EMAIL) {
        return { success: false, error: 'Perfil de Hector no coincide con el email esperado' };
    }

    const { data: subscriptions, error: subError } = await admin
        .from('push_subscriptions')
        .select('subscription, user_id')
        .eq('user_id', hectorProfile.id);

    if (subError) {
        console.error('Error fetching Hector push subscription for schedule note:', subError);
        return { success: false, error: subError.message };
    }

    if (!subscriptions || subscriptions.length === 0) {
        return { success: true, sentCount: 0 };
    }

    const payload = JSON.stringify(
        buildScheduleNotePushPayload({
            authorFirstName: authorResult.data?.first_name,
            dateYmd: date,
            content: String(noteResult.data.content ?? ''),
        }),
    );

    const results = await Promise.allSettled(
        subscriptions.map((sub) =>
            webpush.sendNotification(sub.subscription as any, payload),
        ),
    );

    const sentCount = results.filter((r) => r.status === 'fulfilled').length;
    const expiredSubIds = results
        .map((r, idx) => {
            if (r.status !== 'rejected') return null;
            const statusCode = (r.reason as { statusCode?: number })?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
                return subscriptions[idx].user_id;
            }
            return null;
        })
        .filter(Boolean);

    if (expiredSubIds.length > 0) {
        await admin
            .from('push_subscriptions')
            .delete()
            .in('user_id', expiredSubIds as string[]);
    }

    return { success: true, sentCount };
}
