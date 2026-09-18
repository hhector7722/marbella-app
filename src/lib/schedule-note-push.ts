import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { staffDashboardScheduleUrl } from './notification-routes.ts';

const CIVIL_YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const NOTE_BODY_MAX = 180;

export function isCivilYmd(value: string): boolean {
    return CIVIL_YMD.test(value);
}

function firstName(name: string | null | undefined): string {
    const first = (name ?? '').trim().split(/\s+/)[0];
    return first || 'Sin nombre';
}

/** Día del horario, no el instante de creación. Se construye por componentes. */
export function formatScheduleNoteDayLabel(ymd: string): string {
    const match = CIVIL_YMD.exec(ymd);
    if (!match) return ymd;
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const label = format(new Date(y, m - 1, d), 'EEEE d MMM', { locale: es });
    return label.charAt(0).toUpperCase() + label.slice(1);
}

export function buildScheduleNotePushPayload(input: {
    authorFirstName: string | null | undefined;
    dateYmd: string;
    content: string;
}): { title: string; body: string; url: string } {
    const author = firstName(input.authorFirstName);
    const day = formatScheduleNoteDayLabel(input.dateYmd);
    const note = input.content.trim();
    const clipped =
        note.length > NOTE_BODY_MAX ? `${note.slice(0, NOTE_BODY_MAX - 1)}…` : note;
    return {
        title: `Nota de ${author}`,
        body: `${day} · ${clipped}`,
        url: staffDashboardScheduleUrl(input.dateYmd),
    };
}
