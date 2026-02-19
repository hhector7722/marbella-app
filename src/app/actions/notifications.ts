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

export async function sendScheduleNotifications(userIds: string[], dateStr: string) {
    const supabase = await createClient();

    // Get subscriptions for these users
    const { data: subscriptions, error } = await supabase
        .from('push_subscriptions')
        .select('subscription, user_id')
        .in('user_id', userIds);

    if (error) {
        console.error('Error fetching subscriptions:', error);
        return { error: error.message };
    }

    if (!subscriptions || subscriptions.length === 0) {
        return { success: true, sentCount: 0, message: 'No active subscriptions found for these users' };
    }

    const payload = JSON.stringify({
        title: '🗓️ Nuevo Horario Disponible',
        body: `Se ha publicado el horario para el ${dateStr}. ¡Consúltalo ya!`,
        url: '/staff/schedule'
    });

    const results = await Promise.allSettled(
        subscriptions.map(sub =>
            webpush.sendNotification(sub.subscription as any, payload)
        )
    );

    const sentCount = results.filter(r => r.status === 'fulfilled').length;
    const failures = results.filter(r => r.status === 'rejected');

    // Clean up expired subscriptions
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

export async function sendClosingNotification(data: { totalSales: number, netSales: number, avgTicket: number }) {
    const supabase = await createClient();

    // 1. Get specific manager (requested: hhector7722@gmail.com)
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
        title: '📊 Cierre de Caja Realizado',
        body: `Ventas: ${data.totalSales.toFixed(2)}€ | Neta: ${data.netSales.toFixed(2)}€ | Ticket Medio: ${data.avgTicket.toFixed(2)}€`,
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
