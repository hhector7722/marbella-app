/**
 * Un toque ligeramente impreciso sigue siendo una pulsación.
 * Un gesto de arrastre (o un pointercancel del navegador) nunca abre la card.
 */
export type WeekendCardTouchPoint = {
    pointerId: number;
    x: number;
    y: number;
};

export function isWeekendCardTap(
    start: WeekendCardTouchPoint | null,
    end: WeekendCardTouchPoint,
    maxMovementPx = 14,
): boolean {
    if (!start || start.pointerId !== end.pointerId) return false;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return dx * dx + dy * dy <= maxMovementPx * maxMovementPx;
}
