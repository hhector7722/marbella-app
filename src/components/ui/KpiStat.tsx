import type { ReactNode } from 'react';
import { KPI_STAT_COMPONENT_ID, type KpiStatTone } from '@/lib/design-system';

export type KpiStatProps = {
    instance: string;
    label: string;
    children: ReactNode;
    tone?: KpiStatTone;
    trailing?: ReactNode;
};

/**
 * Cifra protagonista de dashboard. La cifra la aporta el consumidor (p. ej. PremiumCountUp).
 */
export function KpiStat({ instance, label, children, tone = 'neutral', trailing }: KpiStatProps) {
    return (
        <div
            data-component={KPI_STAT_COMPONENT_ID}
            data-tone={tone}
            data-instance={instance}
        >
            <div data-element="value">{children}</div>
            <span data-element="label">
                {label}
                {trailing}
            </span>
        </div>
    );
}
