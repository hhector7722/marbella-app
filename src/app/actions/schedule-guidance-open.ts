'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { isSandboxRequest } from '@/lib/sandbox/server';
import { NOTIFICATION_HECTOR_EMAIL, normalizeNotificationEmail } from '@/lib/notification-recipients';
import { staffDashboardScheduleUrl } from '@/lib/notification-routes';
import { isScheduleGuidanceDate, scheduleGuidanceStaffName } from '@/lib/schedule-guidance-campaign';

const HECTOR_ID = 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6';

type OpenPushResult = { success: boolean; sentCount: number };

/** Push exclusivamente por aperturas de día de Bali, Martí y Pau.
 * La identidad se obtiene de la sesión autenticada, NUNCA del cliente.
 * No crea notificaciones repetidas por renders: el componente llamante
 * hace una sola llamada por montaje del modal/día seleccionado.
 */
export async function notifyScheduleGuidanceOpen(date: string): Promise<OpenPushResult> {
    if (!isScheduleGuidanceDate(date) || await isSandboxRequest()) {
        return { success: false, sentCount: 0 };
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, sentCount: 0 };
    const firstName = scheduleGuidanceStaffName(user.id);
    if (!firstName) return { success: false, sentCount: 0 };

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    if (!url || !serviceKey || !vapidPublic || !vapidPrivate) {
        console.error('Schedule guidance push: missing Supabase service or VAPID configuration');
        return { success: false, sentCount: 0 };
    }

    const admin = createServiceClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: recipient, error: recipientError } = await admin
        .from('profiles')
        .select('id, email')
        .eq('id', HECTOR_ID)
        .maybeSingle();
    if (recipientError || !recipient
        || normalizeNotificationEmail(recipient.email) !== NOTIFICATION_HECTOR_EMAIL) {
        console.error('Schedule guidance push: recipient profile mismatch', recipientError);
        return { success: false, sentCount: 0 };
    }

    const { data: subscriptions, error: subscriptionsError } = await admin
        .from('push_subscriptions')
        .select('id, subscription')
        .eq('user_id', recipient.id);
    if (subscriptionsError || !subscriptions?.length) {
        if (subscriptionsError) console.error('Schedule guidance push: subscriptions unavailable', subscriptionsError);
        return { success: false, sentCount: 0 };
    }

    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:info@barmarbella.com',
        vapidPublic,
        vapidPrivate,
    );
    const label = date === '2026-11-21' ? 'sábado 21' : 'domingo 22';
    const payload = JSON.stringify({
        title: 'Horario consultado',
        body: `${firstName} ha abierto el horario del ${label} de noviembre de 2026.`,
        url: staffDashboardScheduleUrl(date),
    });

    const results = await Promise.allSettled(subscriptions.map((sub) =>
        webpush.sendNotification(sub.subscription as webpush.PushSubscription, payload),
    ));
    const expiredIds = results.flatMap((result, idx) => {
        if (result.status !== 'rejected') return [];
        const statusCode = (result.reason as { statusCode?: number })?.statusCode;
        return statusCode === 404 || statusCode === 410 ? [subscriptions[idx].id] : [];
    });
    if (expiredIds.length) {
        const { error: cleanError } = await admin.from('push_subscriptions').delete().in('id', expiredIds);
        if (cleanError) console.error('Schedule guidance push: expired subscription cleanup failed', cleanError);
    }
    const sentCount = results.filter((result) => result.status === 'fulfilled').length;
    if (sentCount === 0) console.error('Schedule guidance push: failed to send to any Hector device');
    return { success: sentCount > 0, sentCount };
}
