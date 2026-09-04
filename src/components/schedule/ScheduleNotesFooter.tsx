'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { useMasterViewAs } from '@/components/master/MasterViewAsProvider';

type NoteRow = {
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    updated_at: string;
    authorName?: string | null;
};

type RawNoteRow = {
    id: string;
    user_id: string;
    content: string;
    created_at: string;
    updated_at: string;
    profiles?: { first_name?: string | null } | null;
};

type ScheduleNotesFooterProps = {
    /** yyyy-MM-dd del día visible en el modal. */
    date: string | null;
    /** manager/supervisor: ve las notas de todos y el nombre de cada autor. */
    isManager: boolean;
};

function formatNoteTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** Nombre de pila: solo la primera palabra del nombre. */
function firstNameOnly(name: string | null | undefined): string {
    if (!name) return '—';
    return name.trim().split(/\s+/)[0] ?? '—';
}

export function ScheduleNotesFooter({ date, isManager }: ScheduleNotesFooterProps) {
    const supabase = createClient();
    const { identity } = useMasterViewAs();
    const [authUserId, setAuthUserId] = useState<string | null>(null);
    const [notes, setNotes] = useState<NoteRow[]>([]);
    const [composing, setComposing] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        supabase.auth
            .getUser()
            .then(({ data }) => {
                if (!cancelled) setAuthUserId(data.user?.id ?? null);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [supabase]);

    // Con "ver como" (master), el usuario actual es la identidad efectiva, no la sesión real.
    const effectiveUserId = identity?.isViewingAs ? identity.effectiveUserId : authUserId;

    const fetchNotes = useCallback(async (): Promise<NoteRow[]> => {
        if (!date) return [];
        let query = supabase
            .from('schedule_day_notes')
            .select(isManager ? '*, profiles(first_name)' : '*')
            .eq('date', date)
            .order('created_at', { ascending: true });
        if (!isManager && effectiveUserId) {
            query = query.eq('user_id', effectiveUserId);
        }
        const { data, error: loadError } = await query;
        if (loadError) return [];
        return ((data ?? []) as unknown as RawNoteRow[]).map((row) => ({
            id: row.id,
            user_id: row.user_id,
            content: row.content,
            created_at: row.created_at,
            updated_at: row.updated_at,
            authorName: row.profiles?.first_name ?? null,
        }));
    }, [date, isManager, effectiveUserId, supabase]);

    useEffect(() => {
        fetchNotes().then((rows) => {
            setNotes(rows);
            setError(null);
        });
    }, [fetchNotes]);

    const myNote = effectiveUserId
        ? notes.find((n) => n.user_id === effectiveUserId) ?? null
        : null;

    const handleSave = async () => {
        if (!date || !effectiveUserId) return;
        const content = draft.trim();
        if (!content) return;
        setSaving(true);
        setError(null);
        try {
            if (myNote) {
                const { error: updateError } = await supabase
                    .from('schedule_day_notes')
                    .update({ content, updated_at: new Date().toISOString() })
                    .eq('id', myNote.id);
                if (updateError) throw updateError;
            } else {
                const { error: insertError } = await supabase
                    .from('schedule_day_notes')
                    .insert({ user_id: effectiveUserId, date, content });
                if (insertError) throw insertError;
            }
            setComposing(false);
            setDraft('');
            const rows = await fetchNotes();
            setNotes(rows);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error al guardar la nota');
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setComposing(false);
        setDraft('');
        setError(null);
    };

    const startCompose = () => {
        setDraft(myNote?.content ?? '');
        setComposing(true);
        setError(null);
    };

    const handleDelete = async (id: string) => {
        setError(null);
        try {
            const { error: deleteError } = await supabase
                .from('schedule_day_notes')
                .delete()
                .eq('id', id);
            if (deleteError) throw deleteError;
            const rows = await fetchNotes();
            setNotes(rows);
            if (myNote?.id === id) setComposing(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error al eliminar la nota');
        }
    };

    if (!date) return null;

    return (
        <div className="flex w-full min-w-0 flex-col" data-schedule-notes-footer>
            <div className="flex w-full items-center justify-center">
                {!composing && !myNote ? (
                    <Button
                        type="button"
                        variant="tertiary"
                        instance="schedule-note-toggle"
                        onClick={startCompose}
                    >
                        Añadir nota
                    </Button>
                ) : null}
            </div>

            {composing ? (
                <div className="mt-2 flex flex-col gap-2">
                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Escribe una nota…"
                        className="w-full resize-none rounded-ds-control border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-[var(--color-envolvente-alto)] min-h-9 md:min-h-10"
                    />
                    {error ? (
                        <p className="text-[10px] font-medium text-rose-600">{error}</p>
                    ) : null}
                    <div className="flex items-center justify-center gap-2">
                        <Button
                            type="button"
                            variant="secondary"
                            instance="schedule-note-cancel"
                            onClick={handleCancel}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            instance="schedule-note-save"
                            onClick={() => void handleSave()}
                            loading={saving}
                            loadingLabel="Guardar"
                            disabled={!draft.trim()}
                        >
                            Guardar
                        </Button>
                    </div>
                </div>
            ) : null}

            {notes.length > 0 ? (
                <div className="mt-2 flex w-full flex-col items-stretch gap-1.5">
                    {notes.map((note) => {
                        const isOwn = effectiveUserId === note.user_id;
                        return (
                            <div
                                key={note.id}
                                className="flex w-full max-w-full min-w-0 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-1.5 text-left"
                            >
                                {isManager ? (
                                    <span className="shrink-0 text-[11px] font-normal leading-none text-white/70">
                                        {firstNameOnly(note.authorName)}
                                    </span>
                                ) : null}
                                <span className="min-w-0 flex-1 text-[12px] leading-snug text-white">
                                    {note.content}
                                </span>
                                <span className="shrink-0 text-[9px] font-medium text-white/40 tabular-nums">
                                    {formatNoteTime(note.created_at)}
                                </span>
                                {isOwn ? (
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        <Button
                                            type="button"
                                            variant="tertiary"
                                            instance="schedule-note-row-edit"
                                            onClick={startCompose}
                                        >
                                            Editar
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            instance="schedule-note-row-delete"
                                            onClick={() => void handleDelete(note.id)}
                                        >
                                            Eliminar
                                        </Button>
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
    );
}