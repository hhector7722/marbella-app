'use server';

import { createClient } from '@/utils/supabase/server';

const HECTOR_ID = 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6';
const HECTOR_EMAIL = 'hhector7722@gmail.com';
const MAX_NOTE_LENGTH = 1500;

type Result = { success: true; content: string | null } | { success: false; error: string };

function isWeekendDate(date: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const parsed = new Date(`${date}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime())
        && parsed.toISOString().slice(0, 10) === date
        && [0, 6].includes(parsed.getUTCDay());
}

async function authorize() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user || user.id !== HECTOR_ID || user.email?.trim().toLowerCase() !== HECTOR_EMAIL) return null;

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', user.id)
        .maybeSingle();
    if (profileError || profile?.email?.trim().toLowerCase() !== HECTOR_EMAIL) return null;
    return supabase;
}

/** Solo el usuario real autorizado puede guardar: validación de servidor y RLS. */
export async function saveWeekendPublicScheduleNote(date: string, rawContent: string): Promise<Result> {
    if (!isWeekendDate(date)) return { success: false, error: 'Solo se permiten notas los sábados y domingos.' };
    const content = rawContent.trim();
    if (!content || content.length > MAX_NOTE_LENGTH) {
        return { success: false, error: 'La nota debe tener entre 1 y 1500 caracteres.' };
    }
    const supabase = await authorize();
    if (!supabase) return { success: false, error: 'Solo Héctor puede editar la nota general.' };
    const { error } = await supabase
        .from('schedule_weekend_public_notes')
        .upsert({ note_date: date, content, updated_at: new Date().toISOString() }, { onConflict: 'note_date' });
    if (error) {
        console.error('Cannot save weekend public schedule note:', error);
        return { success: false, error: 'No se ha podido guardar la nota.' };
    }
    return { success: true, content };
}

export async function deleteWeekendPublicScheduleNote(date: string): Promise<Result> {
    if (!isWeekendDate(date)) return { success: false, error: 'Fecha incorrecta.' };
    const supabase = await authorize();
    if (!supabase) return { success: false, error: 'Solo Héctor puede eliminar la nota general.' };
    const { error } = await supabase.from('schedule_weekend_public_notes').delete().eq('note_date', date);
    if (error) {
        console.error('Cannot delete weekend public schedule note:', error);
        return { success: false, error: 'No se ha podido eliminar la nota.' };
    }
    return { success: true, content: null };
}
