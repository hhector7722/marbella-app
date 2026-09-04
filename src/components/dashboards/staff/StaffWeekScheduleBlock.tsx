'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { StaffWeekScheduleWidget } from '@/components/dashboards/staff/StaffWeekScheduleWidget';
import { StaffScheduleModal } from '@/components/modals/StaffScheduleModal';

interface ShiftMock {
    date: Date;
    startTime: string;
    endTime: string;
    activity?: string;
}

type StaffWeekScheduleBlockProps = {
    userId: string | null;
    userRole: 'staff' | 'manager' | 'supervisor';
    userEmail?: string;
    /** `yyyy-MM-dd` desde un deep link (notificación): abre el modal de ese día al montar. */
    initialFocusDate?: string | null;
    /** Al cerrar un modal abierto por deep link, para limpiar el query param. */
    onClearFocus?: () => void;
};

/**
 * Horario del mosaico: el widget de mes (StaffWeekScheduleWidget) y el modal de
 * día (StaffScheduleModal) van juntos. Lo montan Staff y Master con la misma
 * configuración, de modo que la apertura de un día se comporta igual en ambos.
 */
export function StaffWeekScheduleBlock({
    userId,
    userRole,
    userEmail,
    initialFocusDate,
    onClearFocus,
}: StaffWeekScheduleBlockProps) {
    const [monthShifts, setMonthShifts] = useState<ShiftMock[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [focusDate, setFocusDate] = useState<string | null>(null);
    const deepLinkHandledRef = useRef(false);

    useEffect(() => {
        if (!userId) {
            return;
        }
        let cancelled = false;
        const today = new Date();
        const startOfMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);
        (async () => {
            try {
                const { data } = await createClient()
                    .from('shifts')
                    .select('start_time, end_time, activity, activity_2')
                    .eq('user_id', userId)
                    .eq('is_published', true)
                    .gte('start_time', startOfMonthDate.toISOString())
                    .order('start_time', { ascending: true });
                if (cancelled) return;
                setMonthShifts(
                    (data ?? []).map((s) => {
                        const start = new Date(s.start_time);
                        const end = new Date(s.end_time);
                        return {
                            date: start,
                            startTime: start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                            endTime: end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                            activity: s.activity || s.activity_2 || undefined,
                        };
                    }),
                );
            } catch (e) {
                console.error(e);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [userId]);

    useEffect(() => {
        if (!initialFocusDate || deepLinkHandledRef.current) return;
        deepLinkHandledRef.current = true;
        setFocusDate(initialFocusDate);
        setIsOpen(true);
    }, [initialFocusDate]);

    const handleOpenNote = useCallback((ymd: string) => {
        setFocusDate(ymd);
        setIsOpen(true);
    }, []);

    const handleClose = useCallback(() => {
        setIsOpen(false);
        setFocusDate(null);
        if (deepLinkHandledRef.current && onClearFocus) {
            onClearFocus();
        }
    }, [onClearFocus]);

    return (
        <>
            <StaffWeekScheduleWidget userId={userId} onOpenNote={handleOpenNote} />
            <StaffScheduleModal
                isOpen={isOpen}
                onClose={handleClose}
                shifts={monthShifts}
                userRole={userRole}
                userEmail={userEmail}
                initialFocusDate={focusDate}
            />
        </>
    );
}