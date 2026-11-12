'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const ANNOUNCEMENT_KEY = 'horarios-2026-11-12';

export function StaffScheduleAnnouncement() {
    const supabase = useMemo(() => createClient(), []);
    const [userId, setUserId] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (cancelled) return;
            setUserId(user?.id ?? null);
            if (!user) { setMessage(null); return; }
            const { data, error } = await supabase.from('staff_one_time_announcements')
                .select('body')
                .eq('user_id', user.id)
                .eq('announcement_key', ANNOUNCEMENT_KEY)
                .is('acknowledged_at', null)
                .maybeSingle();
            if (!cancelled && !error) setMessage(data?.body ?? null);
        };
        void load();
        const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { void load(); });
        return () => { cancelled = true; subscription.unsubscribe(); };
    }, [supabase]);

    const acknowledge = async () => {
        if (!userId || saving) return;
        setSaving(true);
        const { error } = await supabase.from('staff_one_time_announcements')
            .update({ acknowledged_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('announcement_key', ANNOUNCEMENT_KEY)
            .is('acknowledged_at', null);
        setSaving(false);
        if (error) { toast.error('No se ha podido confirmar el aviso'); return; }
        setMessage(null);
    };

    return (
        <Modal open={!!message} onClose={() => {}} title="Aviso sobre los horarios"
            variant="standard" layer="base" instance="staff-schedule-announcement-20261112">
            <div className="space-y-5">
                <p className="text-base leading-relaxed">{message}</p>
                <Button variant="primary" instance="staff-schedule-announcement-ack"
                    className="w-full" disabled={saving} onClick={() => void acknowledge()}>
                    Entendido
                </Button>
            </div>
        </Modal>
    );
}
