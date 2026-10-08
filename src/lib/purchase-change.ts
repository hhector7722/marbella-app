export interface PurchaseChangeSource {
    id: string;
    amount: number;
}

/** El cambio solo puede volver a una caja que haya aportado dinero a esta compra. */
export function eligiblePurchaseChangeSources<T extends PurchaseChangeSource>(sources: T[]): T[] {
    return sources.filter(source => source.amount >= 0.005 && source.id !== 'tpv1' && source.id !== 'tpv2');
}

export function resolvePurchaseChangeDestination(
    eligibleSources: PurchaseChangeSource[],
    selectedId: string | null
): string | null {
    if (eligibleSources.length === 1) return eligibleSources[0].id;
    return eligibleSources.some(source => source.id === selectedId) ? selectedId : null;
}
