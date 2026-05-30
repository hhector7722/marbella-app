'use client';

import { useCallback, useEffect, useState } from 'react';
import { getTreasurySnapshot } from '@/app/actions/get-treasury-snapshot';

export type MasterTreasuryState = {
    actualBalance: number;
    boxes: any[];
    loading: boolean;
    refresh: () => Promise<void>;
};

export function useMasterTreasuryLive(initial?: { actualBalance?: number; boxes?: any[] }): MasterTreasuryState {
    const [actualBalance, setActualBalance] = useState(initial?.actualBalance ?? 0);
    const [boxes, setBoxes] = useState<any[]>(initial?.boxes ?? []);
    const [loading, setLoading] = useState(!initial?.boxes);

    const refresh = useCallback(async () => {
        try {
            const data = await getTreasurySnapshot();
            if (data) {
                setActualBalance(data.actualBalance ?? 0);
                setBoxes(data.boxes ?? []);
            }
        } catch (err) {
            console.error('Error refreshing treasury:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!initial?.boxes) {
            void refresh();
        }
        const interval = setInterval(() => {
            void refresh();
        }, 30000);
        return () => clearInterval(interval);
    }, [initial?.boxes, refresh]);

    return { actualBalance, boxes, loading, refresh };
}
