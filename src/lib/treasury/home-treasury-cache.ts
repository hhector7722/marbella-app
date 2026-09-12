export type HomeTreasuryBox = {
    id: string;
    name: string;
    type: string;
    current_balance: number | null;
    image_url?: string | null;
};

export type HomeTreasurySnapshot = {
    actualBalance: number;
    boxes: HomeTreasuryBox[];
    fetchedAt: number;
};

export type HomeTreasuryFetchResult = {
    actualBalance: number;
    boxes: HomeTreasuryBox[];
};

export const HOME_TREASURY_TTL_MS = 30_000;

type HomeTreasuryCacheOptions = {
    fetch: () => Promise<HomeTreasuryFetchResult>;
    ttlMs?: number;
    now?: () => number;
};

/**
 * Caché de módulo para C Inicial y Cajas Cambio.
 * Sobrevive al desmontaje de /dashboard ↔ /master/dashboard.
 * No es fuente de verdad: el productor sigue siendo getTreasurySnapshot.
 */
export function createHomeTreasuryCache(options: HomeTreasuryCacheOptions) {
    const ttlMs = options.ttlMs ?? HOME_TREASURY_TTL_MS;
    const now = options.now ?? Date.now;

    let cache: HomeTreasurySnapshot | null = null;
    let inFlight: Promise<HomeTreasurySnapshot> | null = null;
    let generation = 0;
    const listeners = new Set<(snapshot: HomeTreasurySnapshot) => void>();

    function emit(snapshot: HomeTreasurySnapshot) {
        for (const listener of listeners) listener(snapshot);
    }

    function peek(): HomeTreasurySnapshot | null {
        return cache;
    }

    function subscribe(listener: (snapshot: HomeTreasurySnapshot) => void): () => void {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }

    async function read(opts?: { force?: boolean }): Promise<HomeTreasurySnapshot> {
        const force = opts?.force === true;
        const t = now();
        if (!force && cache && t - cache.fetchedAt < ttlMs) {
            return cache;
        }
        if (!force && inFlight) {
            return inFlight;
        }

        const myGeneration = ++generation;
        const pending = (async (): Promise<HomeTreasurySnapshot> => {
            try {
                const data = await options.fetch();
                if (myGeneration !== generation) {
                    return cache ?? {
                        actualBalance: data.actualBalance ?? 0,
                        boxes: data.boxes ?? [],
                        fetchedAt: now(),
                    };
                }
                const snapshot: HomeTreasurySnapshot = {
                    actualBalance: data.actualBalance ?? 0,
                    boxes: data.boxes ?? [],
                    fetchedAt: now(),
                };
                cache = snapshot;
                emit(snapshot);
                return snapshot;
            } catch (error) {
                if (cache) return cache;
                throw error;
            }
        })();

        inFlight = pending;
        try {
            return await pending;
        } finally {
            if (inFlight === pending) inFlight = null;
        }
    }

    function reset() {
        cache = null;
        inFlight = null;
        generation = 0;
        listeners.clear();
    }

    return { peek, read, subscribe, reset };
}

export type HomeTreasuryCache = ReturnType<typeof createHomeTreasuryCache>;
