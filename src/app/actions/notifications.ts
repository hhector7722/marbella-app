'use server';

import { createClient } from "@/utils/supabase/server";
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

export type UserShiftForNotification = { userId: string; start: string; end: string };

export async function sendScheduleNotifications(dateStr: string, userShifts: UserShiftForNotification[]) {
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
    if (subs.length === 0) {
        return {
            success: false,
            error: 'Ningún destinatario tiene notificaciones push activadas en este dispositivo.',
            sentCount: 0,
            targetCount: userIds.length,
            missingSubscriptionUserIds,
        };
    }

    const shiftByUser = new Map(userShifts.map(s => [s.userId, s]));

    const results = await Promise.allSettled(
        subs.map(sub => {
            const shift = shiftByUser.get(sub.user_id);
            const timeLine = shift ? `🟢 ${shift.start} - ${shift.end}` : '🟢 —';
            const body = `📅 ${dateStr}\n${timeLine}`;
            const payload = JSON.stringify({
                title: '',
                body,
                url: '/staff/dashboard/'
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

export async function sendClosingNotification(data: { totalSales: number, netSales: number, avgTicket: number }) {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        console.error('Push: VAPID keys not set.');
        return { success: false, error: 'Notificaciones push no configuradas (falta VAPID en el servidor)', sentCount: 0 };
    }

    const supabase = await createClient();

    // 1. Get manager(s) to notify (by email)
    const { data: managers, error: managerError } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'manager')
        .eq('email', 'hhector7722@gmail.com');

    if (managerError || !managers || managers.length === 0) {
        console.error('Specific manager not found or error:', managerError);
        return { success: false, error: 'Target manager not found' };
    }

    const managerIds = managers.map(m => m.id);

    // 2. Get subscriptions for these managers
    const { data: subscriptions, error: subError } = await supabase
        .from('push_subscriptions')
        .select('subscription, user_id')
        .in('user_id', managerIds);

    if (subError) {
        console.error('Error fetching subscriptions:', subError);
        return { error: subError.message };
    }

    if (!subscriptions || subscriptions.length === 0) {
        return { success: true, sentCount: 0, message: 'No active subscriptions found for managers' };
    }

    const payload = JSON.stringify({
        title: '📊 Cierre',
        body: `Ventas: ${data.totalSales.toFixed(2)}€\nVenta Neta: ${data.netSales.toFixed(2)}€`,
        url: '/dashboard/history'
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
