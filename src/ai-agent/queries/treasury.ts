import { createClient } from '@/utils/supabase/server';
import { verifyUserAction } from '@/lib/ai/rbac';

function parseNumericToCents(value: any): number {
  if (value === null || value === undefined) return 0;
  const s = String(value).trim();
  if (!s) return 0;

  const neg = s.startsWith('-');
  const clean = neg || s.startsWith('+') ? s.slice(1) : s;
  const [intPartRaw, fracPartRaw = ''] = clean.split('.');
  const intPart = parseInt(intPartRaw || '0', 10);

  // Normalizamos el decimal a 3 dígitos, luego redondeamos al céntimo con el 3er dígito.
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

export async function fetchOperationalTreasury(): Promise<{
  theoretical: number;
  physical: number;
  difference: number;
}> {
  await verifyUserAction('view_treasury');
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_operational_box_status');
  if (error) throw new Error(`Error consultando get_operational_box_status: ${error.message}`);

  const row: any = Array.isArray(data) ? data[0] : data;
  const boxId = row?.box_id ?? null;
  if (boxId == null) {
    return { theoretical: 0, physical: 0, difference: 0 };
  }

  const theoreticalCents = parseNumericToCents(row.theoretical_balance ?? 0);
  const physicalCents = parseNumericToCents(row.physical_balance ?? 0);

  const theoretical = theoreticalCents / 100;
  const physical = physicalCents / 100;
  const difference = physical - theoretical;

  return { theoretical, physical, difference };
}

