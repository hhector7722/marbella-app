export type StaffClockPreview = {
    userId: string;
    day: string;
    status: 'idle' | 'working' | 'finished';
    clockIn: string | null;
    clockOut: string | null;
};

const CLOCK_PREVIEW_PREFIX = 'marbella:staff-clock-preview:v1:';

export function createStaffClockPreview(
    userId: string,
    log: { clock_in: string; clock_out?: string | null } | null,
    day: string,
): StaffClockPreview {
    return {
        userId,
        day,
        status: log ? (log.clock_out ? 'finished' : 'working') : 'idle',
        clockIn: log?.clock_in ?? null,
        clockOut: log?.clock_out ?? null,
    };
}

/** Los datos locales solo son una pista visual; nunca autorizan fichar. */
export function parseStaffClockPreview(
    raw: string | null,
    userId: string,
    day: string,
): StaffClockPreview | null {
    if (!raw || !userId || !day) return null;
    try {
        const data = JSON.parse(raw) as Partial<StaffClockPreview>;
        if (data.userId !== userId || data.day !== day ||
            !['idle', 'working', 'finished'].includes(data.status ?? '')) return null;
        if (data.clockIn != null && (typeof data.clockIn !== 'string' || !Number.isFinite(Date.parse(data.clockIn)))) return null;
        if (data.clockOut != null && (typeof data.clockOut !== 'string' || !Number.isFinite(Date.parse(data.clockOut)))) return null;
        if (data.status === 'working' && !data.clockIn) return null;
        if (data.status === 'finished' && (!data.clockIn || !data.clockOut)) return null;
        return {
            userId, day, status: data.status as StaffClockPreview['status'],
            clockIn: data.clockIn ?? null,
            clockOut: data.clockOut ?? null,
        };
    } catch {
        return null;
    }
}

/** Snapshot primitivo estable: evita discrepancias durante hidratación SSR. */
export function readStaffClockPreviewSnapshot(userId: string): string | null {
    if (typeof window === 'undefined' || !userId) return null;
    try {
        return window.localStorage.getItem(CLOCK_PREVIEW_PREFIX + userId);
    } catch {
        return null;
    }
}

const CLOCK_PREVIEW_CHANGED_EVENT = 'marbella:staff-clock-preview-changed';

export function subscribeStaffClockPreview(onStoreChange: () => void): () => void {
    window.addEventListener('storage', onStoreChange);
    window.addEventListener(CLOCK_PREVIEW_CHANGED_EVENT, onStoreChange);
    return () => {
        window.removeEventListener('storage', onStoreChange);
        window.removeEventListener(CLOCK_PREVIEW_CHANGED_EVENT, onStoreChange);
    };
}

export function rememberStaffClockPreview(preview: StaffClockPreview): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(CLOCK_PREVIEW_PREFIX + preview.userId, JSON.stringify(preview));
        window.dispatchEvent(new Event(CLOCK_PREVIEW_CHANGED_EVENT));
    } catch {
        // Almacenamiento privado o bloqueado: el fichaje sigue funcionando.
    }
}
