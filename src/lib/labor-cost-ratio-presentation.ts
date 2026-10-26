/** Rangos visuales amplios para el coste de personal respecto a ventas netas.
 * El dato es informativo; no clasificar días sin ventas o sin nómina. */
export type LaborRatioBand = 'good' | 'attention' | 'high' | 'critical' | 'unavailable';

export function laborRatioBand(pct: number | null): LaborRatioBand {
    if (pct === null || !Number.isFinite(pct) || pct < 0) return 'unavailable';
    if (pct <= 55) return 'good';
    if (pct <= 70) return 'attention';
    if (pct <= 90) return 'high';
    return 'critical';
}
