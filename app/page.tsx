'use client';

import React, { useEffect, useState } from 'react';
import { BUS_ROUTE_COLORS } from '../src/constants/busColors';

type BusArrival = {
  id: string;
  routeName: string;
  routeId?: string;
  patternId?: string;
  originStopName: string;
  originPoleName?: string;
  destStopName: string;
  scheduledTime: string;
  scheduledEpoch: number;
  delayMinutes: number;
  departureTime: string;
  departureEpoch: number;
  etaMinutes: number;
  occupancy?: string | null;
  occupancyLevel: 'low' | 'medium' | 'high' | 'unknown';
  occupancyRatio?: number | null;
  isLast?: boolean;
};

type ApiResponse = {
  origin: string;
  dest: string;
  results: BusArrival[];
  error?: string;
};

function occupancyBadge(level: BusArrival['occupancyLevel'], occupancy?: string | null) {
  const base = 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium';
  switch (level) {
    case 'high':
      return <span className={`${base} bg-red-100 text-red-800`}>混雑</span>;
    case 'medium':
      return <span className={`${base} bg-yellow-100 text-yellow-800`}>普通</span>;
    case 'low':
      return <span className={`${base} bg-green-100 text-green-800`}>空き</span>;
    default:
      return <span className={`${base} bg-gray-100 text-gray-800`}>不明</span>;
  }
}

const normalizeRouteKey = (name: string) => {
  if (!name) return '';
  const normalized = name
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFee0))
    .replace(/\u3000/g, ' ')
    .replace(/[－―ー‐]/g, '-')
    .toUpperCase()
    .trim();
  const match = normalized.match(/^([A-Z0-9]+-\d+|[A-Z0-9]+|[\u4E00-\u9FFF]+\d+(?:-\d+)?)/);
  if (match?.[1]) return match[1];
  return normalized.split(/[\s（(]/)[0];
};

const NORMALIZED_COLOR_MAP = new Map(
  Object.entries(BUS_ROUTE_COLORS).map(([key, value]) => [normalizeRouteKey(key), value])
);
const NORMALIZED_KEYS = Array.from(NORMALIZED_COLOR_MAP.keys()).filter(Boolean);

const getNormalizedColor = (displayName: string) => {
  const routeId = normalizeRouteKey(displayName);
  if (!routeId) return { bg: '#008542', text: '#FFFFFF' };
  const direct = NORMALIZED_COLOR_MAP.get(routeId);
  if (direct) return direct;
  const matchKey = NORMALIZED_KEYS.find((key) => routeId.startsWith(key));
  return matchKey ? NORMALIZED_COLOR_MAP.get(matchKey)! : { bg: '#008542', text: '#FFFFFF' };
};

export default function Page() {
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/+$/, '');
  const [origin, setOrigin] = useState('');
  const [dest, setDest] = useState('');
  const [primaryField, setPrimaryField] = useState<'origin' | 'dest' | null>(null);
  const [originSuggestions, setOriginSuggestions] = useState<string[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<string[]>([]);
  const [originFocused, setOriginFocused] = useState(false);
  const [destFocused, setDestFocused] = useState(false);
  const [results, setResults] = useState<BusArrival[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getDayOffset = (epochMs: number) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(epochMs);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
  };

  useEffect(() => {
    if (!origin.trim()) {
      setOriginSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const anchor = primaryField === 'dest' && dest.trim() ? dest : '';
    const timer = setTimeout(async () => {
      try {
        const url = `${apiBase}/api/bus/stops?query=${encodeURIComponent(origin)}${anchor ? `&anchor=${encodeURIComponent(anchor)}` : ''}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        setOriginSuggestions(Array.isArray(data.items) ? data.items : []);
      } catch {
        setOriginSuggestions([]);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [origin, dest, primaryField]);

  useEffect(() => {
    if (!dest.trim()) {
      setDestSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const anchor = primaryField === 'origin' && origin.trim() ? origin : '';
    const timer = setTimeout(async () => {
      try {
        const url = `${apiBase}/api/bus/stops?query=${encodeURIComponent(dest)}${anchor ? `&anchor=${encodeURIComponent(anchor)}` : ''}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        setDestSuggestions(Array.isArray(data.items) ? data.items : []);
      } catch {
        setDestSuggestions([]);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [dest, origin, primaryField]);

  const onSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `${apiBase}/api/bus/search?origin=${encodeURIComponent(origin)}&dest=${encodeURIComponent(dest)}`
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ApiResponse;
      setResults(Array.isArray(data.results) ? data.results : []);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const swapStops = () => {
    setOrigin(dest);
    setDest(origin);
    setPrimaryField((prev) => (prev === 'origin' ? 'dest' : prev === 'dest' ? 'origin' : prev));
  };

  return (
    <main className="min-h-screen px-4 pb-12 pt-6">
      <div className="max-w-3xl mx-auto">
        <header className="mb-4">
          <span className="inline-flex items-center gap-2 rounded-full border border-gray-200/70 bg-white/70 px-3 py-1 text-[11px] font-semibold text-gray-600">
            個人開発・非公式アプリ
          </span>
          <h1 className="mt-2 text-3xl font-display font-semibold text-gray-900">即乗都バス</h1>
          <p className="text-xs text-gray-500 mt-1">由来：「今すぐ」＋「乗れる」＋「都バス」</p>
          <p className="text-sm text-gray-600">
            「どの系統が一番早いか？」という迷いを排除し、乗車から降車まで最短時間でつなぐ、都バス利用者のための特化型検索アプリ。
          </p>
          <div className="card-surface mt-2 rounded-md px-4 py-3 text-[11px] text-gray-700">
            <p className="text-gray-800 font-semibold">
              混雑率は直近の車両データを便の時刻に近いものへ紐付けた目安です。
            </p>
            <div className="mt-3 rounded-md border border-gray-200/70 bg-white/70">
              <div className="grid grid-cols-1 sm:grid-cols-[120px_110px_1fr] gap-1 sm:gap-3 px-3 py-2 text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500">
                <span>区分</span>
                <span>目安</span>
                <span>体感</span>
              </div>
              <div className="border-t border-gray-200/70">
                <div className="grid grid-cols-1 sm:grid-cols-[120px_110px_1fr] gap-1 sm:gap-3 px-3 py-2">
                  <span className="inline-flex w-fit items-center rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 font-bold">
                    空き
                  </span>
                  <span className="font-semibold text-gray-700">0-39%</span>
                  <span className="text-gray-700">座席に空きが目立つ。立ち客は少なめで移動しやすい</span>
                </div>
              </div>
              <div className="border-t border-gray-200/70">
                <div className="grid grid-cols-1 sm:grid-cols-[120px_110px_1fr] gap-1 sm:gap-3 px-3 py-2">
                  <span className="inline-flex w-fit items-center rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 font-bold">
                    普通
                  </span>
                  <span className="font-semibold text-gray-700">40-69%</span>
                  <span className="text-gray-700">座席は埋まりがち。立ち客が増え、場所によっては身動きが制限される</span>
                </div>
              </div>
              <div className="border-t border-gray-200/70">
                <div className="grid grid-cols-1 sm:grid-cols-[120px_110px_1fr] gap-1 sm:gap-3 px-3 py-2">
                  <span className="inline-flex w-fit items-center rounded-full bg-rose-50 px-2 py-0.5 text-rose-700 font-bold">
                    混雑
                  </span>
                  <span className="font-semibold text-gray-700">70%以上</span>
                  <span className="text-gray-700">座席はほぼ埋まり、立ち客が密集。通路の移動が難しい</span>
                </div>
              </div>
              <div className="border-t border-gray-200/70">
                <div className="grid grid-cols-1 sm:grid-cols-[120px_110px_1fr] gap-1 sm:gap-3 px-3 py-2">
                  <span className="inline-flex w-fit items-center rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 font-bold">
                    不明
                  </span>
                  <span className="font-semibold text-gray-700">データなし</span>
                  <span className="text-gray-700">データ提供元からのデータがないため数値化できない</span>
                </div>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-gray-500">（アプリ内の目安）</p>
          </div>
        </header>

        <form onSubmit={onSearch} className="card-surface rounded-2xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-gray-700">
              乗車バス停
              <input
                value={origin}
                onChange={(e) => {
                  const value = e.target.value;
                  setOrigin(value);
                  if (!primaryField && value.trim()) setPrimaryField('origin');
                  if (!value.trim() && !dest.trim()) setPrimaryField(null);
                }}
                onFocus={() => setOriginFocused(true)}
                onBlur={() => setTimeout(() => setOriginFocused(false), 0)}
                className="mt-1 w-full rounded-md border border-gray-200/70 bg-white/70 px-3 py-2 text-sm"
              />
              {originFocused && originSuggestions.length > 0 ? (
                <div className="mt-2 rounded-md border border-gray-200/70 bg-white/90 shadow-sm max-h-56 overflow-auto">
                  {originSuggestions.map((item) => (
                    <button
                      type="button"
                      key={item}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setOrigin(item);
                        if (!primaryField) setPrimaryField('origin');
                        setOriginFocused(false);
                      }}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
            <label className="text-sm text-gray-700">
              降車バス停
              <input
                value={dest}
                onChange={(e) => {
                  const value = e.target.value;
                  setDest(value);
                  if (!primaryField && value.trim()) setPrimaryField('dest');
                  if (!value.trim() && !origin.trim()) setPrimaryField(null);
                }}
                onFocus={() => setDestFocused(true)}
                onBlur={() => setTimeout(() => setDestFocused(false), 0)}
                className="mt-1 w-full rounded-md border border-gray-200/70 bg-white/70 px-3 py-2 text-sm"
              />
              {destFocused && destSuggestions.length > 0 ? (
                <div className="mt-2 rounded-md border border-gray-200/70 bg-white/90 shadow-sm max-h-56 overflow-auto">
                  {destSuggestions.map((item) => (
                    <button
                      type="button"
                      key={item}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setDest(item);
                        if (!primaryField) setPrimaryField('dest');
                        setDestFocused(false);
                      }}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
          </div>
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={swapStops}
              className="text-xs text-gray-500"
            >
              入れ替え
            </button>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-slate-900 text-white py-2 text-sm font-medium disabled:opacity-50"
          >
            {loading ? '検索中...' : '検索'}
          </button>
        </form>

        <section className="space-y-2">
          {error ? (
            <div className="rounded-lg bg-red-50/80 p-4 border border-red-100 text-sm text-red-600">{error}</div>
          ) : results.length === 0 ? (
            <div className="card-surface rounded-lg p-4">
              <p className="text-center text-gray-600">検索結果がありません。</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {results.map((item) => {
                const rawName = item.routeName || '';
                const displayId = normalizeRouteKey(rawName);
                const isSpecial = rawName.includes('出入') || rawName.includes('折返');
                const colors = getNormalizedColor(rawName);
                const dayOffset = getDayOffset(item.departureEpoch);

                return (
                  <li
                    key={item.id}
                    style={
                      item.isLast
                        ? {
                            backgroundImage:
                              'repeating-linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.18) 10px, rgba(255,255,255,0.6) 10px, rgba(255,255,255,0.6) 20px)',
                          }
                        : undefined
                    }
                    className={`card-surface group p-4 rounded-lg border-l-4 transition-all hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.01] ${
                      item.isLast ? 'border-red-600' : 'border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-semibold">
                          <span
                            style={{
                              backgroundColor: colors.bg,
                              color: colors.text,
                              backgroundImage: isSpecial
                                ? 'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,0.15) 8px, rgba(255,255,255,0.15) 16px)'
                                : 'none',
                            }}
                            className="inline-flex items-center justify-center min-w-[80px] px-3 py-1 rounded text-sm font-semibold"
                          >
                            {displayId}
                          </span>
                          <span className="ml-2 text-sm text-gray-600">{rawName.replace(displayId, '').trim()}</span>
                        </div>
                        {item.originPoleName && item.originPoleName !== item.originStopName ? (
                          <div className="text-sm text-gray-500">乗り場: {item.originPoleName}</div>
                        ) : null}
                        {item.destStopName ? (
                          <div className="text-sm text-gray-500">行先: {item.destStopName}</div>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold transition-all group-hover:text-3xl">
                          {dayOffset >= 1 ? (
                            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded mr-1">
                              {dayOffset === 1 ? '翌日' : `${dayOffset}日後`}
                            </span>
                          ) : null}
                          {item.departureTime}
                        </div>
                        <div className="text-[11px] font-semibold text-gray-400">
                          定刻 {item.scheduledTime} / 遅れ {item.delayMinutes}分
                        </div>
                        <div className="mt-1 transition-all group-hover:scale-105">
                          {occupancyBadge(item.occupancyLevel, item.occupancy)}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="mt-6 text-xs text-gray-500 text-center">
          <div>データ提供: 公共交通オープンデータセンター (ODPT)</div>
        </footer>
      </div>
    </main>
  );
}
