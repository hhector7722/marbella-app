import { NextResponse } from 'next/server';
import { fetchActivitiesForRangeAction } from '@/app/staff/actividades/actions';

export async function GET(request: Request) {
  const result = await fetchActivitiesForRangeAction({ startDate: '2026-07-01', endDate: '2026-07-31' });
  return NextResponse.json(result);
}
