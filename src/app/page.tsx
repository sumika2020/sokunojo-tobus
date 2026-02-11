'use client';

import React, { useEffect, useState } from 'react';
import { BUS_ROUTE_COLORS } from '../constants/busColors';

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

function occupancyBadge(level: BusArrival['occupancyLevel']) {
  const base = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ring-1 ring-inset';
  switch (level) {
    case 'high':
      return <span className={`${base} bg-red-50 text-red-700 ring-red-600/20`}>混雑</span>;
    case 'medium':
      return <span className={`${base} bg-yellow-50 text-yellow-700 ring-yellow-600/20`}>普通</span>;
    case 'low':
      return <span className={`${base} bg-green-50 text-green-700 ring-green-600/20`}>空き</span>;
    default:
      return <span className={`${base} bg-gray-50 text-gray-600 ring-gray-500/10`}>不明</span>;
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

  const onSearch = async (event?: React.FormEvent) => {
    event?.preventDefault();
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
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-3 py-1 text-[11px] font-semibold text-slate-600">
              個人開発・非公式アプリ
            </span>
            <h1 className="mt-2 text-3xl font-display font-semibold text-slate-900 tracking-tight">即乗都バス</h1>
            <p className="text-xs text-slate-500 mt-1">由来：「今すぐ」＋「乗れる」＋「都バス」</p>
            <p className="text-sm text-slate-600 mt-1">
              「どの系統が一番早いか？」という迷いを排除し、乗車から降車まで最短時間でつなぐ、都バス利用者のための特化型検索アプリ。
            </p>
            <div className="card-surface mt-3 rounded-xl px-4 py-3 text-[11px] text-slate-700">
              <p className="text-slate-800 font-semibold">
                混雑率は直近の車両データを便の時刻に近いものへ紐付けた目安です。
              </p>
              <div className="mt-3 rounded-lg border border-slate-200/70 bg-white/70">
                <div className="grid grid-cols-1 sm:grid-cols-[120px_110px_1fr] gap-1 sm:gap-3 px-3 py-2 text-[10px] uppercase tracking-[0.2em] font-bold text-slate-500">
                  <span>区分</span>
                  <span>目安</span>
                  <span>体感</span>
                </div>
                <div className="border-t border-slate-200/70">
                  <div className="grid grid-cols-1 sm:grid-cols-[120px_110px_1fr] gap-1 sm:gap-3 px-3 py-2">
                    <span className="inline-flex w-fit items-center rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 font-bold">
                      空き
                    </span>
                    <span className="font-semibold text-slate-700">0-39%</span>
                    <span className="text-slate-700">座席に空きが目立つ。立ち客は少なめで移動しやすい</span>
                  </div>
                </div>
                <div className="border-t border-slate-200/70">
                  <div className="grid grid-cols-1 sm:grid-cols-[120px_110px_1fr] gap-1 sm:gap-3 px-3 py-2">
                    <span className="inline-flex w-fit items-center rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 font-bold">
                      普通
                    </span>
                    <span className="font-semibold text-slate-700">40-69%</span>
                    <span className="text-slate-700">座席は埋まりがち。立ち客が増え、場所によっては身動きが制限される</span>
                  </div>
                </div>
                <div className="border-t border-slate-200/70">
                  <div className="grid grid-cols-1 sm:grid-cols-[120px_110px_1fr] gap-1 sm:gap-3 px-3 py-2">
                    <span className="inline-flex w-fit items-center rounded-full bg-rose-50 px-2 py-0.5 text-rose-700 font-bold">
                      混雑
                    </span>
                    <span className="font-semibold text-slate-700">70%以上</span>
                    <span className="text-slate-700">座席はほぼ埋まり、立ち客が密集。通路の移動が難しい</span>
                  </div>
                </div>
                <div className="border-t border-slate-200/70">
                  <div className="grid grid-cols-1 sm:grid-cols-[120px_110px_1fr] gap-1 sm:gap-3 px-3 py-2">
                    <span className="inline-flex w-fit items-center rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 font-bold">
                      不明
                    </span>
                    <span className="font-semibold text-slate-700">データなし</span>
                    <span className="text-slate-700">データ提供元からのデータがないため数値化できない</span>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-500">（アプリ内の目安）</p>
            </div>
          </div>
          <div className="text-xs text-slate-600 bg-white/70 border border-slate-200/70 px-3 py-1.5 rounded-full">
            2026年 運用中
          </div>
        </header>

        <form onSubmit={onSearch} className="card-surface rounded-2xl p-5 mb-6">
          <div className="relative flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Departure</label>
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
                className="w-full rounded-lg border border-slate-200/70 bg-white/70 px-4 py-3 text-base focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all"
              />
              {originFocused && originSuggestions.length > 0 ? (
                <div className="mt-2 rounded-lg border border-slate-200/70 bg-white/90 shadow-sm max-h-56 overflow-auto">
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
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-center pt-5">
              <button
                type="button"
                onClick={swapStops}
                className="p-2 rounded-full hover:bg-slate-100 transition-colors border border-slate-200 bg-white shadow-sm"
                aria-label="出発地と目的地を入れ替える"
              >
                <span className="text-slate-600 text-lg leading-none">↔</span>
              </button>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">Arrival</label>
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
                className="w-full rounded-lg border border-slate-200/70 bg-white/70 px-4 py-3 text-base focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all"
              />
              {destFocused && destSuggestions.length > 0 ? (
                <div className="mt-2 rounded-lg border border-slate-200/70 bg-white/90 shadow-sm max-h-56 overflow-auto">
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
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 text-white py-4 text-base font-bold hover:bg-slate-800 disabled:opacity-50 transition-all shadow-lg shadow-slate-200 active:scale-[0.98]"
          >
            {loading ? '検索中...' : 'バスを探す'}
          </button>
        </form>

        <section className="space-y-3">
          {error ? (
            <div className="rounded-xl bg-red-50/80 p-4 border border-red-100 text-sm text-red-600 font-medium">
              ⚠️ {error}
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="card-surface rounded-xl p-12 text-center">
              <p className="text-slate-400 font-medium">運行情報が見つかりませんでした。</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {results.map((item) => {
                const rawName = item.routeName || '';
                // 表示用（洗浄して系統名のみ抽出）
                const displayId = normalizeRouteKey(rawName);
                const dayOffset = getDayOffset(item.departureEpoch);
                
                const isSpecial = rawName.includes('出入') || rawName.includes('折返');
                const colors = getNormalizedColor(rawName);
                
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
                    className={`card-surface group p-4 rounded-xl border-l-4 transition-all hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.01] ${
                      item.isLast ? 'border-red-600' : 'border-slate-200/70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            style={{
                              backgroundColor: colors.bg,
                              color: colors.text,
                              backgroundImage: isSpecial
                                ? 'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,0.15) 8px, rgba(255,255,255,0.15) 16px)'
                                : 'none',
                            }}
                            className="inline-flex items-center justify-center min-w-[80px] px-3 py-1.5 rounded text-sm font-black tracking-tighter shadow-sm"
                          >
                            {displayId}
                          </span>
                          <span className="text-sm font-bold text-slate-700 truncate max-w-[150px]">
                            {rawName.replace(displayId, '').trim()}
                          </span>
                        </div>
                        {item.originPoleName && item.originPoleName !== item.originStopName ? (
                          <div className="text-xs font-bold text-slate-500">乗り場: {item.originPoleName}</div>
                        ) : null}
                        {item.destStopName ? (
                          <div className="text-xs font-bold text-slate-500">行先: {item.destStopName}</div>
                        ) : null}
                      </div>

                      <div className="text-right">
                        <div className="flex items-baseline justify-end gap-2">
                          {dayOffset >= 1 ? (
                            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                              {dayOffset === 1 ? '翌日' : `${dayOffset}日後`}
                            </span>
                          ) : null}
                          <span className="text-3xl font-black text-slate-900 tabular-nums transition-all group-hover:text-4xl">
                            {item.departureTime}
                          </span>
                        </div>
                        <div className="text-[11px] font-bold text-slate-400">
                          定刻 {item.scheduledTime} / 遅れ {item.delayMinutes}分
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-1 transition-all group-hover:scale-105">
                          <span className="text-xs font-bold text-slate-400 group-hover:text-slate-600">
                            {item.etaMinutes <= 1 ? 'まもなく到着' : `約${item.etaMinutes}分`}
                          </span>
                          {occupancyBadge(item.occupancyLevel)}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="mt-10 text-[10px] text-slate-400 text-center space-y-1">
          <p>データ提供: 公共交通オープンデータセンター (ODPT)</p>
          <p>© 2026 Bus Finder Project</p>
        </footer>
      </div>
    </main>
  );
}