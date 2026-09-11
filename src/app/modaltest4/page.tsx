'use client';

import { useEffect, useState } from 'react';
import { StaffScheduleModal } from '@/components/modals/StaffScheduleModal';
import { GestureProbe } from '@/components/debug/GestureProbe';

export default function ModalTest4Page() {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        setOpen(true);
    }, []);
    return (
        <>
            <GestureProbe />
            {open ? (
                <StaffScheduleModal
                    isOpen
                    onClose={() => setOpen(false)}
                    shifts={[]}
                    userEmail="hhector7722@gmail.com"
                    userRole="admin"
                    initialFocusDate="2026-09-11"
                />
            ) : null}
        </>
    );
}
