import { NextRequest, NextResponse } from 'next/server';
import { getBusStopSuggestions } from '../../../../src/lib/busApi';

const SUGGESTION_TTL_SECONDS = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('query') || '').trim();
  const anchor = (searchParams.get('anchor') || '').trim();
  const limitParam = Number(searchParams.get('limit') || 20);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 20;

  if (!query) {
    return NextResponse.json({ items: [] }, { headers: { 'Cache-Control': 'private, max-age=30' } });
  }

  const items = await getBusStopSuggestions(query, anchor || undefined, limit);
  return NextResponse.json(
    { items: items.map((item) => item.title) },
    { headers: { 'Cache-Control': `private, max-age=${SUGGESTION_TTL_SECONDS}` } }
  );
}
