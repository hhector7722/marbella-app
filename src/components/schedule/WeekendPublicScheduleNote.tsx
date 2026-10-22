'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { useMasterViewAs } from '@/components/master/MasterViewAsProvider';
import {
    saveWeekendPublicScheduleNote,
    deleteWeekendPublicScheduleNote,
} from '@/app/actions/schedule-weekend-public-note';

const HECTOR_ID = 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6';
const HECTOR_EMAIL = 'hhector7722@gmail.com';

export function WeekendPublicScheduleNote({ date }: { date: string }) {
    const { identity } = useMasterViewAs();
    const [canEdit, setCanEdit] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const supabase = createClient();
        const load = async () => {
            const [{ data: { user } }, { data, error: loadError }] = await Promise.all([
                supabase.auth.getUser(),
                supabase.from('schedule_weekend_public_notes').select('content').eq('note_date', date).maybeSingle(),
            ]);
            if (cancelled) return;
            setCanEdit(user?.id === HECTOR_ID && user.email?.trim().toLowerCase() === HECTOR_EMAIL);
            setNote(loadError ? null : data?.content ?? null);
            setError(loadError ? 'No se ha podido cargar la nota general.' : null);
            setLoading(false);
        };
        void load().catch(() => {
            if (cancelled) return;
            setError('No se ha podido cargar la nota general.');
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [date]);

    const mayEdit = canEdit && !identity?.isViewingAs;

    const save = async () => {
        if (!mayEdit || !draft.trim() || saving) return;
        setSaving(true);
        setError(null);
        try {
            const result = await saveWeekendPublicScheduleNote(date, draft);
            if (!result.success) {
                setError(result.error);
                return;
            }
            setNote(result.content);
            setEditing(false);
        } catch {
            setError('No se ha podido guardar la nota.');
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!mayEdit || saving) return;
        setSaving(true);
        setError(null);
        try {
            const result = await deleteWeekendPublicScheduleNote(date);
            if (!result.success) {
                setError(result.error);
                return;
            }
            setNote(null);
            setDraft('');
            setEditing(false);
        } catch {
            setError('No se ha podido eliminar la nota.');
        } finally {
            setSaving(false);
        }
    };

    if (loading || (!note && !mayEdit && !error)) return null;

    return (
        <section data-instance="schedule-weekend-public-note"
            className="mx-2 mt-2 flex min-w-0 shrink-0 flex-col gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-white">
            <div className="flex min-w-0 items-center justify-between gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-white/80">Nota general</h3>
                {mayEdit && !editing ? (
                    <Button type="button" instance="schedule-weekend-public-note-toggle"
                        variant="tertiary"
                        onClick={() => { setDraft(note ?? ''); setEditing(true); setError(null); }}>
                        {note ? 'Editar' : 'Añadir nota'}
                    </Button>
                ) : null}
            </div>
            {!editing && note ? (
                <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed">{note}</p>
            ) : null}
            {editing && mayEdit ? (
                <div className="flex min-w-0 flex-col gap-2">
                    <textarea
                        aria-label="Nota general visible para todos los usuarios"
                        className="min-h-20 w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-sky-500"
                        value={draft}
                        maxLength={1500}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="Información para todo el equipo…"
                    />
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        {note ? (
                            <Button type="button" variant="destructive" instance="schedule-weekend-public-note-delete"
                                disabled={saving} onClick={() => void remove()}>Eliminar</Button>
                        ) : null}
                        <Button type="button" variant="secondary" instance="schedule-weekend-public-note-cancel"
                            disabled={saving} onClick={() => { setEditing(false); setError(null); }}>Cancelar</Button>
                        <Button type="button" variant="primary" instance="schedule-weekend-public-note-save"
                            disabled={!draft.trim() || saving} loading={saving} loadingLabel="Guardando"
                            onClick={() => void save()}>Guardar</Button>
                    </div>
                </div>
            ) : null}
            {error ? <p role="alert" className="text-xs text-rose-300">{error}</p> : null}
        </section>
    );
}
