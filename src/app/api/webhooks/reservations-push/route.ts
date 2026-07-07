import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import webpush from 'web-push';
import { NOTIFICATION_HECTOR_EMAIL } from '@/lib/notification-recipients';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@barmarbella.com';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader || authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { record } = body;

        if (!record || !record.id) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const supabase = await createClient();

        // Obtener correos permitidos (Alba, Hector, Pere, Hernan)
        const { data: managers, error: managerError } = await supabase
            .from('profiles')
            .select('id, first_name');
            
        if (managerError || !managers?.length) {
            return NextResponse.json({ error: 'No managers found' }, { status: 404 });
        }

        const allowedNames = ['alba', 'hector', 'pere', 'hernan'];
        const managerIds = managers
            .filter(m => m.first_name && allowedNames.includes(m.first_name.trim().toLowerCase()))
            .map(m => m.id);

        if (managerIds.length === 0) {
            return NextResponse.json({ success: true, message: 'No allowed managers found by name' });
        }

        const { data: subscriptions, error: subError } = await supabase
            .from('push_subscriptions')
            .select('subscription, user_id')
            .in('user_id', managerIds);

        if (subError) {
            return NextResponse.json({ error: subError.message }, { status: 500 });
        }

        if (!subscriptions || subscriptions.length === 0) {
            return NextResponse.json({ success: true, message: 'No active push subscriptions' });
        }

        // Construir la fecha legible (ej. 14/06/2026)
        let dateStr = record.reservation_date;
        if (dateStr) {
            const [y, m, d] = dateStr.split('-');
            dateStr = `${d}/${m}/${y}`;
        }
        
        // Construir la hora legible (ej. 20:30)
        let timeStr = record.reservation_time;
        if (timeStr) {
            timeStr = timeStr.substring(0, 5);
        }

        const payload = JSON.stringify({
            title: '📅 Nueva reserva',
            body: `${record.customer_name} · ${record.pax} pax · ${dateStr} ${timeStr}`,
            url: `/staff/reservas?id=${record.id}`,
        });

        const results = await Promise.allSettled(
            subscriptions.map(sub => webpush.sendNotification(sub.subscription as any, payload))
        );

        // Limpiar suscripciones caducadas
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

        const sentCount = results.filter(r => r.status === 'fulfilled').length;
        
        return NextResponse.json({ success: true, sentCount });

    } catch (err: any) {
        console.error('Error procesando webhook reservations-push:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
