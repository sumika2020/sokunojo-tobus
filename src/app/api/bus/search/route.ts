import { NextRequest, NextResponse } from 'next/server';
import { getNextBusesSafe, getOccupancySampleStats } from '../../../../lib/busApi';

const RESPONSE_CACHE_TTL_MS = 30 * 1000;
const responseCache = new Map<string, { expires: number; value: any }>();

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

  const cacheKey = `${origin}__${dest}`;
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.value, {
      headers: { 'Cache-Control': 'private, max-age=30', 'X-Cache': 'HIT' },
    });
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
  const payload = debugInfo ? { origin, dest, results, debug: debugInfo } : { origin, dest, results };
  responseCache.set(cacheKey, { expires: Date.now() + RESPONSE_CACHE_TTL_MS, value: payload });
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'private, max-age=30', 'X-Cache': 'MISS' },
  });
}
