'use server';

import { createClient } from "@/utils/supabase/server";
import {
    NOTIFICATION_HECTOR_EMAIL,
    normalizeNotificationEmail,
} from '@/lib/notification-recipients';
import {
    cashClosingHistoryUrl,
    staffDashboardScheduleUrl,
} from '@/lib/notification-routes';
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

const SCHEDULE_NOTIFY_ROLES = new Set(['manager', 'admin', 'supervisor']);

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
            error: 'Solo manager, admin o supervisor pueden enviar avisos de horario.',
            sentCount: 0,
            targetCount: userIds.length,
            missingSubscriptionUserIds: userIds,
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
    };
}

export async function sendClosingNotification(data: {
    dateStr: string;
    totalSales: number;
    netSales: number;
    avgTicket?: number;
    closingId?: string;
}) {
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
