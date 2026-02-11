import { NextRequest, NextResponse } from 'next/server';
import { getNextBusesSafe, getOccupancySampleStats } from '@/lib/busApi';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = (searchParams.get('origin') || '').trim();
  const dest = (searchParams.get('dest') || '').trim();
  const debug = searchParams.get('debug') === '1';

  if (!origin || !dest) {
    return NextResponse.json(
      { error: 'origin and dest are required' },
      { status: 400 }
    );
  }

  const results = await getNextBusesSafe(origin, dest);
  let debugInfo: any = undefined;
  if (debug) {
    const routeIds = results.map((item) => item.routeId || '').filter(Boolean);
    const patternIds = results.map((item) => item.patternId || '').filter(Boolean);
    debugInfo = {
      sampleStats: await getOccupancySampleStats(routeIds, patternIds),
      sampleWindowMinutes: { commute: 10, offPeak: 30, fallbackMax: 120 },
      sampleWindowHours: Array.from([7, 8, 17, 18, 19]),
    };
  }
  return NextResponse.json(debugInfo ? { origin, dest, results, debug: debugInfo } : { origin, dest, results });
}
