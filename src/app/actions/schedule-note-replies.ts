'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { NOTIFICATION_HECTOR_EMAIL, normalizeNotificationEmail } from '@/lib/notification-recipients';
import { staffDashboardScheduleUrl } from '@/lib/notification-routes';
import { formatScheduleNoteDayLabel } from '@/lib/schedule-note-push';
import { isSandboxRequest } from '@/lib/sandbox/server';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REPLY_LENGTH = 1000;

export type ScheduleNoteReplyResult = {
    success: boolean;
    error?: string;
    pushSent?: boolean;
    pushWarning?: string;
};

function serviceClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createServiceClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

/**
 * Una respuesta privada, escrita exclusivamente por la sesión real de Héctor.
 * El INSERT está protegido además por RLS; el trigger SQL crea el aviso en
 * la campana del autor en la MISMA transacción. La push solo va a ese autor.
 */
export async function createPrivateScheduleNoteReply(input: {
    noteId: string;
    content: string;
}): Promise<ScheduleNoteReplyResult> {
    if (await isSandboxRequest()) {
        return { success: false, error: 'Las respuestas privadas no se envían en el entorno de pruebas.' };
    }
    const noteId = String(input.noteId ?? '').trim();
    const content = String(input.content ?? '').trim();
    if (!UUID_PATTERN.test(noteId) || !content || content.length > MAX_REPLY_LENGTH) {
        return { success: false, error: 'Escribe una respuesta válida (máximo 1000 caracteres).' };
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'Debes iniciar sesión.' };

    const { data: caller } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', user.id)
        .maybeSingle();
    if (normalizeNotificationEmail(caller?.email) !== NOTIFICATION_HECTOR_EMAIL) {
        return { success: false, error: 'Solo Héctor puede responder a las notas.' };
    }

    const { data: note, error: noteError } = await supabase
        .from('schedule_day_notes')
        .select('id, user_id, date')
        .eq('id', noteId)
        .maybeSingle();
    if (noteError || !note) return { success: false, error: 'No se ha encontrado la nota original.' };
    if (note.user_id === user.id) {
        return { success: false, error: 'Esta acción está reservada para responder a las notas del equipo.' };
    }

    // RLS, autor real y UNIQUE(note_id) evitan suplantación y respuestas duplicadas.
    const { error: insertError } = await supabase
        .from('schedule_day_note_replies')
        .insert({ note_id: noteId, author_id: user.id, content });
    if (insertError) {
        if (insertError.code === '23505') {
            return { success: false, error: 'Esta nota ya tiene una respuesta. Actualiza el día para verla.' };
        }
        console.error('Error saving schedule note reply:', insertError);
        return { success: false, error: 'No se ha podido guardar la respuesta privada.' };
    }

    // Llegados aquí ya está guardada la respuesta y su aviso in-app.
    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    const admin = serviceClient();
    if (!vapidPublic || !vapidPrivate || !admin) {
        return {
            success: true,
            pushSent: false,
            pushWarning: 'Respuesta guardada y aviso en la campana. Push no configurada.',
        };
    }

    try {
        webpush.setVapidDetails(
            process.env.VAPID_SUBJECT || 'mailto:info@barmarbella.com',
            vapidPublic,
            vapidPrivate,
        );
        const { data: subscriptions, error } = await admin
            .from('push_subscriptions')
            .select('subscription, user_id')
            .eq('user_id', note.user_id);
        if (error) throw error;
        if (!subscriptions?.length) {
            return {
                success: true, pushSent: false,
                pushWarning: 'Respuesta guardada. El empleado no tiene una suscripción push activa.',
            };
        }

        const day = formatScheduleNoteDayLabel(note.date);
        const payload = JSON.stringify({
            title: '💬 Héctor ha respondido a tu nota',
            body: `${day} · ${content.length > 150 ? `${content.slice(0, 149)}…` : content}`,
            url: staffDashboardScheduleUrl(note.date),
        });

        const settled = await Promise.allSettled(
            subscriptions.map((sub) => webpush.sendNotification(sub.subscription as webpush.PushSubscription, payload)),
        );
        const delivered = settled.filter((result) => result.status === 'fulfilled').length;
        const expiredIds = settled.flatMap((result, index) => (
            result.status === 'rejected'
                && [404, 410].includes((result.reason as { statusCode?: number })?.statusCode ?? 0)
                ? [subscriptions[index].user_id] : []
        ));
        if (expiredIds.length) {
            await admin.from('push_subscriptions').delete().in('user_id', expiredIds);
        }
        return {
            success: true,
            pushSent: delivered > 0,
            ...(!delivered ? { pushWarning: 'Respuesta guardada; no se ha podido entregar la push.' } : {}),
        };
    } catch (error) {
        console.error('Schedule note reply push failed:', error);
        return { success: true, pushSent: false, pushWarning: 'Respuesta guardada, pero ha fallado el envío push.' };
    }
}
