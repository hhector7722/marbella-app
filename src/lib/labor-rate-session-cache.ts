/** Caché en memoria de tarifas ordinarias por sesión (userId + fecha). */

const rateCache = new Map<string, number>();

export function laborRateCacheKey(userId: string, onDate: string): string {
    return `${userId}:${onDate}`;
}

export function getCachedLaborRate(userId: string, onDate: string): number | undefined {
    const v = rateCache.get(laborRateCacheKey(userId, onDate));
    return v !== undefined ? v : undefined;
}

export function setCachedLaborRate(userId: string, onDate: string, rate: number): void {
    rateCache.set(laborRateCacheKey(userId, onDate), rate);
}
