import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { writeProjectionFromWeek } from '@/lib/hours-engine/recalculate-and-persist-all';

export const dynamic = 'force-dynamic';

const USER_ID = '2a45bdcd-8850-4dc2-bd1e-50be0196106c';
const FROM_WEEK = '2026-07-27';
const TOKEN_SHA256 = '01564f445bddaa8a4e7fffe7f75885cff89f76438db9163497205aab9c48dc07';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function GET(request: NextRequest) {
  if (
    process.env.VERCEL_ENV !== 'preview' ||
    process.env.VERCEL_GIT_COMMIT_REF !== 'fix/august-debt-proration'
  ) {
    return NextResponse.json({ error: 'preview-only' }, { status: 404 });
  }

  const token = request.nextUrl.searchParams.get('token') ?? '';
  if (!token || sha256(token) !== TOKEN_SHA256) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json(
      { error: 'missing Supabase server configuration' },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRole);

  const load = async () => {
    const { data, error } = await supabase
      .from('weekly_snapshots')
      .select(
        'week_start,total_hours,ordinary_hours,extra_hours,contracted_hours_snapshot,balance_hours,pending_balance,final_balance,carry_out,prefer_stock_hours_override',
      )
      .eq('user_id', USER_ID)
      .gte('week_start', FROM_WEEK)
      .lte('week_start', '2026-09-21')
      .order('week_start', { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  };

  try {
    const before = await load();

    const result = await writeProjectionFromWeek(
      supabase,
      USER_ID,
      FROM_WEEK,
      'recalc',
    );

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error, before },
        { status: 500 },
      );
    }

    const after = await load();

    return NextResponse.json({
      ok: true,
      weeksWritten: result.weeksWritten,
      fromWeekStart: FROM_WEEK,
      before,
      after,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
