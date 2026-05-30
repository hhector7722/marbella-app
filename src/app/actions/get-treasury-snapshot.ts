'use server';

import { createClient } from '@/utils/supabase/server';

function parseNumericToCents(value: unknown): number {
    if (value === null || value === undefined) return 0;
    const s = String(value).trim();
    if (!s) return 0;

    const neg = s.startsWith('-');
    const clean = neg || s.startsWith('+') ? s.slice(1) : s;
    const [intPartRaw, fracPartRaw = ''] = clean.split('.');
    const intPart = parseInt(intPartRaw || '0', 10);

    const frac3 = (fracPartRaw || '').padEnd(3, '0').slice(0, 3);
    const frac2 = frac3.slice(0, 2);
    const thirdDigit = frac3[2] ?? '0';

    const third = parseInt(thirdDigit, 10) || 0;
    let roundedFrac = parseInt(frac2 || '0', 10) || 0;
    let roundedInt = intPart;
    if (third >= 5) {
        roundedFrac += 1;
        if (roundedFrac >= 100) {
            roundedFrac = 0;
            roundedInt += 1;
        }
    }

    const cents = roundedInt * 100 + roundedFrac;
    return neg ? -cents : cents;
}

export async function getTreasurySnapshot() {
    const supabase = await createClient();

    const [{ data: allBoxes }, { data: opBoxStatusRows }] = await Promise.all([
        supabase.from('cash_boxes').select('*').order('name'),
        supabase.rpc('get_operational_box_status'),
    ]);

    let actualBalance = 0;
    const opStatus = Array.isArray(opBoxStatusRows) ? opBoxStatusRows[0] : opBoxStatusRows;
    if (opStatus?.box_id != null) {
        const physicalCents = parseNumericToCents(opStatus.physical_balance ?? 0);
        actualBalance = physicalCents / 100;
    }

    let boxes: NonNullable<typeof allBoxes> = [];
    if (allBoxes) {
        boxes = [...allBoxes].sort((a, b) => {
            if (a.type === 'operational' && b.type !== 'operational') return -1;
            if (a.type !== 'operational' && b.type === 'operational') return 1;
            return (a.name || '').localeCompare(b.name || '');
        });
    }

    return { actualBalance, boxes };
}
