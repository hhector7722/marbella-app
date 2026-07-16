import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import webpush from 'web-push';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:info@barmarbella.com';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Mismos destinatarios que fn_notify_reservation_insert / save_client_event_order_by_token */
const ALLOWED_FIRST_NAMES = ['alba', 'hector', 'pere', 'hernan'] as const;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function formatDateEs(isoDate: string | null | undefined): string {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-');
    if (!y || !m || !d) return isoDate;
    return `${d}/${m}/${y}`;
}

function formatTimeHm(time: string | null | undefined): string {
    if (!time) return '';
    return time.substring(0, 5);
}

type PushPayload = {
    title: string;
    body: string;
    url: string;
};

function buildPushFromBody(body: {
    table?: string;
    kind?: string;
    record?: Record<string, unknown>;
}): PushPayload | null {
    const record = body.record;
    if (!record || !record.id) return null;

    const isClientOrder =
        body.kind === 'client_order_submitted' || body.table === 'events';

    if (isClientOrder) {
        const name = String(record.customer_name ?? 'Cliente');
        const dateStr = formatDateEs(
            typeof record.event_date === 'string' ? record.event_date : undefined
        );
        const timeStr = formatTimeHm(
            typeof record.event_time === 'string' ? record.event_time : undefined
        );
        const kindLine =
            typeof record.kind_line === 'string' && record.kind_line
                ? record.kind_line
                : 'Pedido';
        const when = [dateStr, timeStr].filter(Boolean).join(' ');
        return {
            title: '🛒 Nuevo pedido recibido',
            body: [name, when, kindLine].filter(Boolean).join(' · '),
            url: `/staff/reservas?eventId=${record.id}`,
        };
    }

    // Default: nueva reserva
    const dateStr = formatDateEs(
        typeof record.reservation_date === 'string'
            ? record.reservation_date
            : undefined
    );
    const timeStr = formatTimeHm(
        typeof record.reservation_time === 'string'
            ? record.reservation_time
            : undefined
    );
    const pax = record.pax != null ? `${record.pax} pax` : '';
    return {
        title: '📅 Nueva reserva',
        body: [record.customer_name, pax, `${dateStr} ${timeStr}`.trim()]
            .filter(Boolean)
            .join(' · '),
        url: `/staff/reservas?id=${record.id}`,
    };
}

export async function POST(req: Request) {
    try {
        // Las llamadas desde pg_net (trigger BD) llevan X-Pgnet: true y no tienen
        // token de autorización. Se aceptan sin WEBHOOK_SECRET.
        // Si viene de otro origen sin WEBHOOK_SECRET, se rechaza.
        if (WEBHOOK_SECRET && req.headers.get('x-pgnet') !== 'true') {
            const authHeader = req.headers.get('authorization');
            if (!authHeader || authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        const body = await req.json();
        const push = buildPushFromBody(body);

        if (!push) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
            return NextResponse.json({ error: 'Missing database credentials' }, { status: 500 });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        const { data: managers, error: managerError } = await supabase
            .from('profiles')
            .select('id, first_name');

        if (managerError || !managers?.length) {
            return NextResponse.json({ error: 'No managers found' }, { status: 404 });
        }

        const managerIds = managers
            .filter(
                (m) =>
                    m.first_name &&
                    ALLOWED_FIRST_NAMES.includes(
                        m.first_name.trim().toLowerCase() as (typeof ALLOWED_FIRST_NAMES)[number]
                    )
            )
            .map((m) => m.id);

        if (managerIds.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No allowed managers found by name',
            });
        }

        const { data: subscriptions, error: subError } = await supabase
            .from('push_subscriptions')
            .select('subscription, user_id')
            .in('user_id', managerIds);

        if (subError) {
            return NextResponse.json({ error: subError.message }, { status: 500 });
        }

        if (!subscriptions || subscriptions.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No active push subscriptions',
            });
        }

        const payload = JSON.stringify(push);

        const results = await Promise.allSettled(
            subscriptions.map((sub) =>
                webpush.sendNotification(sub.subscription as webpush.PushSubscription, payload)
            )
        );

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
            await supabase
                .from('push_subscriptions')
                .delete()
                .in('user_id', expiredSubIds as string[]);
        }

        const sentCount = results.filter((r) => r.status === 'fulfilled').length;

        return NextResponse.json({ success: true, sentCount });
    } catch (err: unknown) {
        console.error('Error procesando webhook reservations-push:', err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
