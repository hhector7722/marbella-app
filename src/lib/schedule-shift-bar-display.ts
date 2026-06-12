/** Ancho estimado por carácter en etiquetas 9px font-black + px-2 */
const CHAR_WIDTH_PX = 5.5;
const LABEL_PADDING_PX = 16;

export function formatShiftBarTimeLabel(time: string, showMinutes: boolean): string {
    if (!time) return '';
    if (showMinutes) return time;
    const [hours] = time.split(':');
    return hours ?? time;
}

export function estimateShiftBarLabelWidthPx(time: string, showMinutes: boolean): number {
    const label = formatShiftBarTimeLabel(time, showMinutes);
    return label.length * CHAR_WIDTH_PX + LABEL_PADDING_PX;
}

/** ¿Caben inicio y fin con minutos sin solaparse en esta barra? */
export function shouldShowMinutesForBarWidthPx(
    barWidthPx: number,
    start: string,
    end: string,
): boolean {
    if (barWidthPx <= 0) return false;
    const withMinutes =
        estimateShiftBarLabelWidthPx(start, true) + estimateShiftBarLabelWidthPx(end, true);
    return barWidthPx >= withMinutes;
}
