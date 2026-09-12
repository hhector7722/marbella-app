'use client';

import { useCallback, useEffect, useState } from 'react';
import { getTreasurySnapshot } from '@/app/actions/get-treasury-snapshot';
import {
    createHomeTreasuryCache,
    type HomeTreasuryBox,
    type HomeTreasurySnapshot,
} from '@/lib/treasury/home-treasury-cache';

const homeTreasuryCache = createHomeTreasuryCache({
    fetch: () => getTreasurySnapshot(),
});

export type HomeTreasuryState = {
    actualBalance: number;
    boxes: HomeTreasuryBox[];
    loading: boolean;
    refresh: () => Promise<void>;
};

function seedFrom(
    initial?: { actualBalance?: number; boxes?: HomeTreasuryBox[] },
): { snapshot: HomeTreasurySnapshot | null; loading: boolean } {
    const cached = homeTreasuryCache.peek();
    if (cached) return { snapshot: cached, loading: false };
    if (initial?.boxes) {
        return {
            snapshot: {
                actualBalance: initial.actualBalance ?? 0,
                boxes: initial.boxes,
                fetchedAt: 0,
            },
            loading: false,
        };
    }
    return { snapshot: null, loading: true };
}

/**
 * Productor de lectura de C Inicial y Cajas Cambio en las homes Admin y Master.
 * Reutiliza el snapshot en memoria; el spinner solo aparece si aún no hay dato.
 */
export function useHomeTreasury(initial?: {
    actualBalance?: number;
    boxes?: HomeTreasuryBox[];
}): HomeTreasuryState {
    const [actualBalance, setActualBalance] = useState(() => seedFrom(initial).snapshot?.actualBalance ?? 0);
    const [boxes, setBoxes] = useState<HomeTreasuryBox[]>(() => seedFrom(initial).snapshot?.boxes ?? []);
    const [loading, setLoading] = useState(() => seedFrom(initial).loading);

    const applySnapshot = useCallback((snapshot: HomeTreasurySnapshot) => {
        setActualBalance(snapshot.actualBalance);
        setBoxes(snapshot.boxes);
        setLoading(false);
    }, []);

    const refresh = useCallback(async () => {
        try {
            const snapshot = await homeTreasuryCache.read({ force: true });
            applySnapshot(snapshot);
        } catch (err) {
            console.error('Error refreshing treasury:', err);
            if (!homeTreasuryCache.peek()) setLoading(false);
        }
    }, [applySnapshot]);

    useEffect(() => {
        const unsubscribe = homeTreasuryCache.subscribe(applySnapshot);

        void homeTreasuryCache.read({ force: false }).then(
            applySnapshot,
            (err) => {
                console.error('Error refreshing treasury:', err);
                if (!homeTreasuryCache.peek()) setLoading(false);
            },
        );

        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            void homeTreasuryCache.read({ force: false }).then(applySnapshot).catch((err) => {
                console.error('Error refreshing treasury:', err);
            });
        };
        const onFocus = () => {
            void homeTreasuryCache.read({ force: false }).then(applySnapshot).catch((err) => {
                console.error('Error refreshing treasury:', err);
            });
        };

        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onFocus);

        return () => {
            unsubscribe();
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onFocus);
        };
    }, [applySnapshot]);

    return { actualBalance, boxes, loading, refresh };
}
