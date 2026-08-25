/**
 * Contrato KpiStat — cifra protagonista de dashboard (T1).
 * No cubre la tira densa de calendario (P3 / Labor).
 */

export const KPI_STAT_COMPONENT_ID = 'KpiStat' as const;

export const KPI_STAT_TONES = ['neutral', 'positive', 'negative', 'info'] as const;

export type KpiStatTone = (typeof KPI_STAT_TONES)[number];
