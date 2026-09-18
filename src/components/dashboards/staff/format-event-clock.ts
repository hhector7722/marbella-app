/**
 * Horario del evento en las cards sáb/dom: minutos solo si son exactamente :30;
 * si no, la hora lleva `h`. Sin cero inicial. «08:00» → «8h» · «08:30» → «8:30».
 */
export function formatEventClock(time: string): string {
    const parts = time.split(':');
    if (parts.length < 2) return time;
    const h = parseInt(parts[0] ?? '', 10);
    if (!Number.isFinite(h)) return time;
    const mins = (parts[1] ?? '').slice(0, 2);
    if (mins === '30') return `${h}:30`;
    return `${h}h`;
}
