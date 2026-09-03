'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
    const [authUserId, setAuthUserId] = useState<string | null>(null);
    const [notes, setNotes] = useState<NoteRow[]>([]);
    const [composing, setComposing] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
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

    const fetchNotes = useCallback(async (): Promise<NoteRow[]> => {
        if (!date) return [];
        let query = supabase
            .from('schedule_day_notes')
            .select(isManager ? '*, profiles(first_name)' : '*')
            .eq('date', date)
            .order('created_at', { ascending: true });
        if (!isManager && authUserId) {
            query = query.eq('user_id', authUserId);
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
    }, [date, isManager, authUserId, supabase]);

    useEffect(() => {
        fetchNotes().then((rows) => {
            setNotes(rows);
            setError(null);
        });
    }, [fetchNotes]);

    const myNote = authUserId
        ? notes.find((n) => n.user_id === authUserId) ?? null
        : null;

    const handleSave = async () => {
        if (!date || !authUserId) return;
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
                    .insert({ user_id: authUserId, date, content });
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

    if (!date) return null;

    return (
        <div className="flex w-full min-w-0 flex-col">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    Notas del día
                </span>
                <Button
                    type="button"
                    variant="tertiary"
                    instance="schedule-note-toggle"
                    onClick={composing ? handleCancel : startCompose}
                >
                    {composing ? 'Cancelar' : myNote ? 'Editar nota' : 'Añadir nota'}
                </Button>
            </div>

            {composing ? (
                <div className="mt-2 flex flex-col gap-2">
                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={3}
                        placeholder="Escribe una nota…"
                        className="w-full min-h-12 resize-none rounded-ds-control border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-[var(--color-envolvente-alto)]"
                    />
                    {error ? (
                        <p className="text-[10px] font-medium text-rose-600">{error}</p>
                    ) : null}
                    <div className="flex items-center justify-end gap-2">
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

            <div className="mt-2 flex flex-col gap-1.5">
                {notes.length === 0 ? (
                    <p className="text-[11px] font-medium text-zinc-400">
                        No hay notas para este día.
                    </p>
                ) : (
                    notes.map((note) => {
                        const expanded = expandedId === note.id;
                        const needsToggle = note.content.length > 80;
                        return (
                            <button
                                key={note.id}
                                type="button"
                                onClick={() => setExpandedId(expanded ? null : note.id)}
                                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-left transition-colors hover:bg-zinc-100"
                            >
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                                        {isManager ? firstNameOnly(note.authorName) : 'Tu nota'}
                                    </span>
                                    <span className="text-[9px] font-medium text-zinc-400 tabular-nums">
                                        {formatNoteTime(note.created_at)}
                                    </span>
                                </div>
                                <p
                                    className={cn(
                                        'mt-1 text-[11px] leading-snug text-zinc-700',
                                        !expanded && 'line-clamp-2',
                                    )}
                                >
                                    {note.content}
                                </p>
                                {needsToggle ? (
                                    <span className="mt-1 inline-block text-[9px] font-bold uppercase tracking-wide text-[var(--color-envolvente-alto)]">
                                        {expanded ? 'Ver menos' : 'Leer más'}
                                    </span>
                                ) : null}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );
}