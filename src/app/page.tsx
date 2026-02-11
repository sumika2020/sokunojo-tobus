'use client';

import React, { useEffect, useRef, useState } from 'react';
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
      return <span className={`${base} bg-rose-500/20 text-rose-200 ring-rose-400/60`}>混雑</span>;
    case 'medium':
      return <span className={`${base} bg-amber-400/20 text-amber-200 ring-amber-300/60`}>普通</span>;
    case 'low':
      return <span className={`${base} bg-emerald-400/20 text-emerald-200 ring-emerald-300/60`}>空き</span>;
    default:
      return <span className={`${base} bg-slate-400/20 text-slate-200 ring-slate-300/40`}>不明</span>;
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
  const originWrapRef = useRef<HTMLDivElement | null>(null);
  const destWrapRef = useRef<HTMLDivElement | null>(null);
  const showOriginSuggestions = originSuggestions.length > 0 && originFocused;
  const showDestSuggestions = destSuggestions.length > 0 && destFocused;

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const inOrigin = originWrapRef.current?.contains(target);
      const inDest = destWrapRef.current?.contains(target);
      if (!inOrigin) setOriginFocused(false);
      if (!inDest) setDestFocused(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, []);

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
        const url = `/api/bus/stops?query=${encodeURIComponent(origin)}${anchor ? `&anchor=${encodeURIComponent(anchor)}` : ''}`;
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
        const url = `/api/bus/stops?query=${encodeURIComponent(dest)}${anchor ? `&anchor=${encodeURIComponent(anchor)}` : ''}`;
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
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-slate-950/60 px-3 py-1 text-[11px] font-semibold text-cyan-200">
              個人開発・非公式アプリ
            </span>
            <h1 className="mt-2 text-3xl font-display font-semibold text-slate-50 tracking-tight">即乗都バス</h1>
            <p className="text-xs text-slate-300 mt-1">由来：「今すぐ」＋「乗れる」＋「都バス」</p>
            <p className="text-sm text-slate-200 mt-1">
              「どの系統が一番早いか？」という迷いを排除し、乗車から降車まで最短時間でつなぐ、都バス利用者のための特化型検索アプリ。
            </p>
            <div className="card-surface mt-3 rounded-xl px-4 py-3 text-[11px] text-slate-200">
              <p className="text-slate-100 font-semibold">
                混雑率は直近の車両データを便の時刻に近いものへ紐付けた目安です。
              </p>
              <div className="mt-3 rounded-lg border border-cyan-400/20 bg-slate-950/60">
                <div className="grid grid-cols-1 sm:grid-cols-[120px_110px_1fr] gap-1 sm:gap-3 px-3 py-2 text-[10px] uppercase tracking-[0.2em] font-bold text-cyan-200/80">
                  <span>区分</span>
                  <span>目安</span>
                  <span>体感</span>
                </div>
                <div className="border-t border-cyan-400/10">
                  <div className="grid grid-cols-1 sm:grid-cols-[120px_110px_1fr] gap-1 sm:gap-3 px-3 py-2">
                    <span className="inline-flex w-fit items-center rounded-full bg-emerald-400/20 px-2 py-0.5 text-emerald-200 font-bold">
                      空き
                    </span>
                    <span className="font-semibold text-slate-100">0-39%</span>
                    <span className="text-slate-200">座席に空きが目立つ。立ち客は少なめで移動しやすい</span>
                  </div>
                </div>
                <div className="border-t border-cyan-400/10">
                  <div className="grid grid-cols-1 sm:grid-cols-[120px_110px_1fr] gap-1 sm:gap-3 px-3 py-2">
                    <span className="inline-flex w-fit items-center rounded-full bg-amber-400/20 px-2 py-0.5 text-amber-200 font-bold">
                      普通
                    </span>
                    <span className="font-semibold text-slate-100">40-69%</span>
                    <span className="text-slate-200">座席は埋まりがち。立ち客が増え、場所によっては身動きが制限される</span>
                  </div>
                </div>
                <div className="border-t border-cyan-400/10">
                  <div className="grid grid-cols-1 sm:grid-cols-[120px_110px_1fr] gap-1 sm:gap-3 px-3 py-2">
                    <span className="inline-flex w-fit items-center rounded-full bg-rose-500/20 px-2 py-0.5 text-rose-200 font-bold">
                      混雑
                    </span>
                    <span className="font-semibold text-slate-100">70%以上</span>
                    <span className="text-slate-200">座席はほぼ埋まり、立ち客が密集。通路の移動が難しい</span>
                  </div>
                </div>
                <div className="border-t border-cyan-400/10">
                  <div className="grid grid-cols-1 sm:grid-cols-[120px_110px_1fr] gap-1 sm:gap-3 px-3 py-2">
                    <span className="inline-flex w-fit items-center rounded-full bg-slate-700/40 px-2 py-0.5 text-slate-200 font-bold">
                      不明
                    </span>
                    <span className="font-semibold text-slate-100">データなし</span>
                    <span className="text-slate-200">データ提供元からのデータがないため数値化できない</span>
                  </div>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-slate-400">（アプリ内の目安）</p>
            </div>
          </div>
          <div className="text-xs text-cyan-100 bg-slate-950/60 border border-cyan-400/30 px-3 py-1.5 rounded-full">
            2026年 運用中
          </div>
        </header>

        <form onSubmit={onSearch} className="card-surface rounded-2xl p-5 mb-6">
          <div className="relative flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex-1 relative" ref={originWrapRef}>
              <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">Departure</label>
              <input
                value={origin}
                onChange={(e) => {
                  const value = e.target.value;
                  setOrigin(value);
                  setOriginFocused(true);
                  if (!primaryField && value.trim()) setPrimaryField('origin');
                  if (!value.trim() && !dest.trim()) setPrimaryField(null);
                }}
                onFocus={() => setOriginFocused(true)}
                onClick={() => setOriginFocused(true)}
                onBlur={() => {
                  setTimeout(() => {
                    if (!originWrapRef.current?.contains(document.activeElement)) {
                      setOriginFocused(false);
                    }
                  }, 0);
                }}
                className="w-full rounded-lg border border-slate-700/70 bg-slate-950/60 px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none transition-all"
              />
              {showOriginSuggestions ? (
                <div className="absolute left-0 right-0 top-full mt-2 rounded-lg border border-cyan-400/40 bg-slate-900/95 shadow-lg shadow-cyan-500/20 max-h-56 overflow-auto z-40">
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
                      className="block w-full text-left px-3 py-2 text-sm text-slate-100 hover:bg-slate-800/60"
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
                className="p-2 rounded-full hover:bg-slate-800/70 transition-colors border border-slate-700 bg-slate-900/70 shadow-sm"
                aria-label="出発地と目的地を入れ替える"
              >
                <span className="text-cyan-200 text-lg leading-none">↔</span>
              </button>
            </div>
            <div className="flex-1 relative" ref={destWrapRef}>
              <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">Arrival</label>
              <input
                value={dest}
                onChange={(e) => {
                  const value = e.target.value;
                  setDest(value);
                  setDestFocused(true);
                  if (!primaryField && value.trim()) setPrimaryField('dest');
                  if (!value.trim() && !origin.trim()) setPrimaryField(null);
                }}
                onFocus={() => setDestFocused(true)}
                onClick={() => setDestFocused(true)}
                onBlur={() => {
                  setTimeout(() => {
                    if (!destWrapRef.current?.contains(document.activeElement)) {
                      setDestFocused(false);
                    }
                  }, 0);
                }}
                className="w-full rounded-lg border border-slate-700/70 bg-slate-950/60 px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400 focus:border-transparent outline-none transition-all"
              />
              {showDestSuggestions ? (
                <div className="absolute left-0 right-0 top-full mt-2 rounded-lg border border-cyan-400/40 bg-slate-900/95 shadow-lg shadow-cyan-500/20 max-h-56 overflow-auto z-40">
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
                      className="block w-full text-left px-3 py-2 text-sm text-slate-100 hover:bg-slate-800/60"
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
            className="w-full rounded-lg bg-cyan-400 text-slate-900 py-4 text-base font-bold hover:bg-cyan-300 disabled:opacity-50 transition-all shadow-lg shadow-cyan-500/30 active:scale-[0.98]"
          >
            {loading ? '検索中...' : 'バスを探す'}
          </button>
        </form>

        <section className="space-y-3">
          {error ? (
            <div className="rounded-xl bg-rose-500/20 p-4 border border-rose-400/40 text-sm text-rose-200 font-medium">
              ⚠️ {error}
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="card-surface rounded-xl p-12 text-center">
              <p className="text-slate-300 font-medium">運行情報が見つかりませんでした。</p>
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
                      item.isLast ? 'border-rose-400' : 'border-cyan-400/30'
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
                          <span className="text-sm font-bold text-slate-100 truncate max-w-[150px]">
                            {rawName.replace(displayId, '').trim()}
                          </span>
                        </div>
                        {item.originPoleName && item.originPoleName !== item.originStopName ? (
                          <div className="text-xs font-bold text-slate-300">乗り場: {item.originPoleName}</div>
                        ) : null}
                        {item.destStopName ? (
                          <div className="text-xs font-bold text-slate-300">行先: {item.destStopName}</div>
                        ) : null}
                      </div>

                      <div className="text-right">
                        <div className="flex items-baseline justify-end gap-2">
                          {dayOffset >= 1 ? (
                            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                              {dayOffset === 1 ? '翌日' : `${dayOffset}日後`}
                            </span>
                          ) : null}
                          <span className="text-3xl font-black text-slate-50 tabular-nums transition-all group-hover:text-4xl">
                            {item.departureTime}
                          </span>
                        </div>
                        <div className="text-[11px] font-bold text-slate-300">
                          定刻 {item.scheduledTime} / 遅れ {item.delayMinutes}分
                        </div>
                        <div className="flex items-center justify-end gap-2 mt-1 transition-all group-hover:scale-105">
                          <span className="text-xs font-bold text-slate-300 group-hover:text-slate-100">
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