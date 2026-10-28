/** La venta neta provisional usa el mismo cálculo que el widget de Ventas. */
export function liveNetSales(grossSales: number): number {
    return Number.isFinite(grossSales) && grossSales > 0 ? grossSales / 1.1 : 0;
}

/** En el día abierto prevalece el dato en directo; los días cerrados conservan
 * el neto registrado en el cierre. La vista previa histórica mantiene su
 * estimación cuando todavía no hay cierre. */
export function displayedNetSales({ isCurrentDay, liveGross, closingNet, previewGross }: {
    isCurrentDay: boolean;
    liveGross: number | null;
    closingNet: number | null;
    previewGross: number | null;
}): number | null {
    if (isCurrentDay && liveGross !== null) return liveNetSales(liveGross);
    if (closingNet !== null) return closingNet;
    return previewGross !== null ? liveNetSales(previewGross) : null;
}
