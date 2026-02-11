export type BusArrival = {
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

export type BusStopSuggestion = {
  id: string;
  title: string;
};

type TimetableStop = {
  pole: string;
  note: string;
  isMidnight: boolean;
  arrivalTime: string;
  departureTime: string;
};

const BASE = 'https://api.odpt.org/api/v4';
const TOKEN = process.env.ODPT_TOKEN || process.env.NEXT_PUBLIC_ODPT_TOKEN || '';
const TOEI_OPERATOR = 'odpt.Operator:Toei';
const PAGE_SIZE = 1000;
const OCCUPANCY_CACHE_TTL_MS = 30 * 1000;
const PATTERN_CACHE_TTL_MS = 10 * 60 * 1000;
const POLE_CACHE_TTL_MS = 10 * 60 * 1000;
const STOP_LIST_CACHE_TTL_MS = 10 * 60 * 1000;
const OCCUPANCY_MATCH_WINDOW_MS = 10 * 60 * 1000;

type CacheEntry<T> = {
  expires: number;
  value: T;
};

let occupancyCache: CacheEntry<OccupancyIndex> | null = null;
let patternCache: CacheEntry<any[]> | null = null;
const poleCache = new Map<string, CacheEntry<PoleMatch[]>>();
let stopListCache: CacheEntry<BusStopEntry[]> | null = null;

function buildUrl(path: string, params?: Record<string, string | number | boolean>) {
  const url = new URL(`${BASE}/${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }
  url.searchParams.set('acl:consumerKey', TOKEN);
  return url.toString();
}

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonUrl(url: string, attempt = 0) {
  const res = await fetch(url);
  if (res.status === 404) return [] as any[];
  if (res.status === 429 && attempt < 4) {
    await wait(800 + attempt * 400);
    return fetchJsonUrl(url, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ODPT fetch failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchAllPages(resource: string, params?: Record<string, string>) {
  const results: any[] = [];
  let skip = 0;
  let first = true;
  while (true) {
    const url = buildUrl(resource, { ...(params || {}), '$top': String(PAGE_SIZE), '$skip': String(skip) });
    const batch = await fetchJsonUrl(url);
    if (!Array.isArray(batch) || batch.length === 0) {
      if (first) {
        const fallback = await fetchJsonUrl(buildUrl(resource, params));
        return Array.isArray(fallback) ? fallback : [];
      }
      break;
    }
    results.push(...batch);
    skip += PAGE_SIZE;
    first = false;
  }
  return results;
}

function getStopName(note: string) {
  return String(note || '').split(':')[0];
}

function normalizeText(value: string) {
  return String(value || '').replace(/\s+/g, '');
}

function normalizeStopNameForMatch(value: string) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function noteMatchesNames(note: string, names: string[]) {
  const normalizedNote = normalizeText(note);
  return names.some((name) => normalizedNote === normalizeText(name));
}

function stopsFromTimetable(tt: any): TimetableStop[] {
  const objs = Array.isArray(tt['odpt:busTimetableObject']) ? tt['odpt:busTimetableObject'] : [];
  return objs.map((obj: any) => ({
    pole: String(obj['odpt:busstopPole'] || ''),
    note: getStopName(obj['odpt:note']),
    isMidnight: Boolean(obj['odpt:isMidnight']),
    arrivalTime: String(obj['odpt:arrivalTime'] || ''),
    departureTime: String(obj['odpt:departureTime'] || ''),
  }));
}

function findStopIndex(stops: TimetableStop[], ids: string[], names: string[]) {
  const hasIds = ids.length > 0;
  return stops.findIndex((s) => (hasIds ? ids.includes(s.pole) : noteMatchesNames(s.note, names)));
}

function parseTimeToDate(timeStr: string, isMidnight: boolean) {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const now = new Date();
  const date = new Date(now);
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (isMidnight) date.setDate(date.getDate() + 1);
  if (date.getTime() < now.getTime()) date.setDate(date.getDate() + 1);
  return date;
}

function formatTime(date: Date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function toJstDateKey(epochMs: number) {
  const jst = new Date(epochMs + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function extractStatusText(source: any) {
  const direct =
    source?.['odpt:note'] ||
    source?.['odpt:remark'] ||
    source?.['odpt:status'] ||
    source?.['odpt:busrouteStatus'] ||
    source?.['odpt:trainInformationStatus'] ||
    source?.['odpt:operationStatus'] ||
    '';
  if (direct) return String(direct);
  for (const [key, value] of Object.entries(source || {})) {
    if (!/status|note|remark/i.test(key)) continue;
    if (value === null || value === undefined) continue;
    const str = String(value).trim();
    if (str) return str;
  }
  return '';
}

function inferBusrouteId(pattern: string) {
  const match = pattern.match(/^odpt\.BusroutePattern:Toei\.([^.]+)\./);
  return match ? `odpt.Busroute:Toei.${match[1]}` : '';
}

function mapOccupancyLevel(occupancy?: string | null) {
  if (!occupancy) return 'unknown' as const;
  const s = String(occupancy).toLowerCase();
  if (s.includes('データなし')) return 'medium' as const;
  if (s.includes('満') || s.includes('full') || s.includes('high') || s.includes('crowd')) return 'high' as const;
  if (s.includes('多') || s.includes('medium') || s.includes('normal')) return 'medium' as const;
  if (s.includes('少') || s.includes('low') || s.includes('empty')) return 'low' as const;
  return 'medium' as const;
}

function parseOccupancyRatio(occupancy?: string | null) {
  if (!occupancy) return null;
  const match = String(occupancy).match(/(\d{1,3})/);
  if (!match) return null;
  const value = Number(match[1]);
  if (Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function buildNameVariants(input: string, poles: PoleMatch[]) {
  const names = new Set<string>();
  const trimmed = input.trim();
  if (trimmed) names.add(trimmed);
  poles.forEach((p) => {
    const title = String(p.title || '').trim();
    if (title) names.add(title);
  });
  return Array.from(names);
}

type PoleMatch = {
  id: string;
  title: string;
  patterns: string[];
};

type BusStopEntry = {
  id: string;
  title: string;
  patterns: string[];
  normalized: string;
};

async function getPoleMatchesByName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return [] as PoleMatch[];
  const cached = poleCache.get(trimmed);
  if (cached && cached.expires > Date.now()) return cached.value;
  const queries = new Set<string>();
  const push = (value: string) => {
    const v = value.trim();
    if (v) queries.add(v);
  };

  push(trimmed);
  if (!trimmed.endsWith('駅前')) push(`${trimmed}駅前`);
  if (!trimmed.endsWith('駅')) push(`${trimmed}駅`);
  if (trimmed.endsWith('駅前')) push(trimmed.slice(0, -2));
  if (trimmed.endsWith('駅')) push(trimmed.slice(0, -1));

  const matches = new Map<string, PoleMatch>();
  const normalized = trimmed.replace(/\s+/g, '');
  for (const q of queries) {
    const poles = await fetchAllPages('odpt:BusstopPole', {
      'odpt:operator': TOEI_OPERATOR,
      'dc:title': q,
    });
    poles.forEach((p: any) => {
      const title = String(p['dc:title'] || '').replace(/\s+/g, '');
      if (!title.includes(normalized)) return;
      const id = String(p['owl:sameAs'] || p['@id'] || '');
      if (!id) return;
      const patterns = Array.isArray(p['odpt:busroutePattern'])
        ? p['odpt:busroutePattern'].map((v: any) => String(v)).filter(Boolean)
        : [];
      if (!matches.has(id)) {
        matches.set(id, {
          id,
          title: String(p['dc:title'] || ''),
          patterns,
        });
      } else if (patterns.length > 0) {
        const existing = matches.get(id);
        existing?.patterns.push(...patterns);
      }
    });
  }

  if (matches.size === 0) {
    const list = await getStopList();
    const normalizedQuery = trimmed.replace(/\s+/g, '');
    list
      .filter((item) => item.normalized.includes(normalizeStopNameForMatch(normalizedQuery)))
      .slice(0, 50)
      .forEach((item) => {
        matches.set(item.id, {
          id: item.id,
          title: item.title,
          patterns: item.patterns,
        });
      });
  }

  const result = Array.from(matches.values()).map((m) => ({
    ...m,
    patterns: Array.from(new Set(m.patterns)),
  }));
  poleCache.set(trimmed, { expires: Date.now() + POLE_CACHE_TTL_MS, value: result });
  return result;
}

async function getStopList(): Promise<BusStopEntry[]> {
  if (stopListCache && stopListCache.expires > Date.now()) return stopListCache.value;
  if (!TOKEN) return [];
  const poles = await fetchAllPages('odpt:BusstopPole', { 'odpt:operator': TOEI_OPERATOR });
  const list = poles
    .map((p: any) => {
      const id = String(p['owl:sameAs'] || p['@id'] || '');
      const title = String(p['dc:title'] || '').trim();
      const patterns = Array.isArray(p['odpt:busroutePattern'])
        ? p['odpt:busroutePattern'].map((v: any) => String(v)).filter(Boolean)
        : [];
      if (!id || !title) return null;
      return {
        id,
        title,
        patterns: Array.from(new Set(patterns)),
        normalized: normalizeStopNameForMatch(title),
      } as BusStopEntry;
    })
    .filter(Boolean) as BusStopEntry[];
  stopListCache = { expires: Date.now() + STOP_LIST_CACHE_TTL_MS, value: list };
  return list;
}

export async function getBusStopSuggestions(
  query: string,
  anchor?: string,
  limit = 20
): Promise<BusStopSuggestion[]> {
  if (!TOKEN) return [];
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const list = await getStopList();
  let filtered = list;

  const anchorTrimmed = String(anchor || '').trim();
  if (anchorTrimmed) {
    const anchorPatterns = new Set<string>();
    const anchorNormalized = normalizeStopNameForMatch(anchorTrimmed);

    list.forEach((item) => {
      if (item.normalized.includes(anchorNormalized)) {
        item.patterns.forEach((p) => anchorPatterns.add(p));
      }
    });

    const anchorMatches = await getPoleMatchesByName(anchorTrimmed);
    anchorMatches.forEach((match) => match.patterns.forEach((p) => anchorPatterns.add(p)));

    if (anchorPatterns.size > 0) {
      filtered = filtered.filter((item) => item.patterns.some((p) => anchorPatterns.has(p)));
    }
  }

  const normalizedQuery = normalizeStopNameForMatch(trimmedQuery);
  const scored = filtered
    .map((item) => {
      const name = item.normalized;
      if (!name.includes(normalizedQuery)) return null;
      const starts = name.startsWith(normalizedQuery);
      const score = starts ? 0 : 1;
      return { item, score };
    })
    .filter(Boolean) as Array<{ item: BusStopEntry; score: number }>;

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.item.title.length !== b.item.title.length) return a.item.title.length - b.item.title.length;
    return a.item.title.localeCompare(b.item.title, 'ja');
  });

  const seen = new Set<string>();
  const results: BusStopSuggestion[] = [];
  for (const entry of scored) {
    if (results.length >= limit) break;
    if (seen.has(entry.item.title)) continue;
    seen.add(entry.item.title);
    results.push({ id: entry.item.id, title: entry.item.title });
  }

  return results;
}

function extractRouteName(tt: any, patternId: string, routeId: string, fallback?: string) {
  return String(tt['dc:title'] || fallback || routeId || patternId || '');
}

function stripBranchFromPattern(patternId: string) {
  return String(patternId || '').replace(/\.[^.]+$/, '');
}

function stripBranchFromRouteName(routeName: string) {
  const trimmed = String(routeName || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/[-‐‑–—]?\d+$/, '');
}

function buildRouteKey(routeName: string, routeId: string, patternId: string) {
  const baseName = stripBranchFromRouteName(routeName);
  if (baseName) return baseName;
  const basePattern = stripBranchFromPattern(patternId);
  if (basePattern) return basePattern;
  if (routeId) return routeId;
  return routeName || patternId;
}

type OccupancyIndex = {
  byRouteSamples: Map<string, OccupancySample[]>;
  sampleBuses: any[];
  delayByRoute: Map<string, number>;
  turnaroundByRouteStop: Map<string, { epoch: number; ts: number }>;
};

type OccupancySample = {
  ts: number;
  text: string | null;
  ratio: number | null;
};

function extractDestinationCandidate(bus: any) {
  const direct =
    bus['odpt:destinationSign'] ||
    bus['odpt:destination'] ||
    bus['odpt:destinationSignText'] ||
    '';
  if (direct !== null && direct !== undefined && direct !== '') return String(direct);
  for (const [key, value] of Object.entries(bus || {})) {
    if (!/destination/i.test(key)) continue;
    if (value === null || value === undefined) continue;
    const str = String(value).trim();
    if (str) return str;
  }
  return '';
}

function extractPredictedArrivalEpoch(bus: any) {
  const candidate =
    bus['odpt:predictedArrivalTime'] ||
    bus['odpt:predictedDepartureTime'] ||
    bus['odpt:arrivalTime'] ||
    bus['odpt:departureTime'] ||
    '';
  const ts = Date.parse(String(candidate || ''));
  return Number.isNaN(ts) ? 0 : ts;
}

function formatRouteNameWithDestination(routeName: string, destStopName: string) {
  const base = String(routeName || '').trim();
  const dest = String(destStopName || '').trim();
  if (!dest) return base;
  if (!base) return dest;
  const normalizedBase = normalizeText(base);
  const normalizedDest = normalizeText(dest);
  if (normalizedBase.includes(normalizedDest)) return base;
  return `${base} (${dest})`;
}

function extractOccupancyCandidate(bus: any) {
  const direct =
    bus['odpt:occupancy'] ||
    bus['odpt:occupancyStatus'] ||
    bus['odpt:ext:occupancy'] ||
    bus['odpt:ext:occupancyStatus'] ||
    '';
  if (direct !== null && direct !== undefined && direct !== '') return String(direct);

  for (const [key, value] of Object.entries(bus || {})) {
    if (!/occupancy|crowd|congestion/i.test(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      const str = String(value).trim();
      if (str) return str;
    }
  }
  return '';
}

function extractBusTimestamp(bus: any) {
  const candidate =
    bus['dc:date'] ||
    bus['dcterms:created'] ||
    bus['dcterms:modified'] ||
    bus['odpt:date'] ||
    bus['odpt:time'] ||
    '';
  const ts = Date.parse(String(candidate || ''));
  return Number.isNaN(ts) ? 0 : ts;
}

function occupancyRatioFromText(value: string) {
  const match = String(value || '').match(/(\d{1,3})/);
  if (match) {
    const num = Number(match[1]);
    if (!Number.isNaN(num)) return Math.max(0, Math.min(100, num));
  }
  const lower = String(value || '').toLowerCase();
  if (lower.includes('満') || lower.includes('full') || lower.includes('high') || lower.includes('crowd')) return 85;
  if (lower.includes('多') || lower.includes('medium') || lower.includes('normal')) return 55;
  if (lower.includes('少') || lower.includes('low') || lower.includes('empty')) return 25;
  return null;
}

function occupancyLevelFromRatio(ratio: number | null) {
  if (ratio === null || Number.isNaN(ratio)) return 'unknown' as const;
  if (ratio >= 70) return 'high' as const;
  if (ratio >= 40) return 'medium' as const;
  return 'low' as const;
}

async function buildOccupancyIndex() {
  if (occupancyCache && occupancyCache.expires > Date.now()) return occupancyCache.value;
  const buses = await fetchAllPages('odpt:Bus', { 'odpt:operator': TOEI_OPERATOR });
  const byRouteSamples = new Map<string, OccupancySample[]>();
  const delayByRoute = new Map<string, { delaySec: number; ts: number }>();
  const turnaroundByRouteStop = new Map<string, { epoch: number; ts: number }>();
  buses.forEach((b: any) => {
    const routeId = String(b['odpt:busroute'] || '');
    const patternId = String(b['odpt:busroutePattern'] || '');
    if (!routeId && !patternId) return;
    const ts = extractBusTimestamp(b);
    const predictedEpoch = extractPredictedArrivalEpoch(b);
    const destinationText = extractDestinationCandidate(b);
    const delayRaw = Number(b['odpt:delay'] ?? 0);
    const delaySec = Number.isFinite(delayRaw) ? Math.max(0, delayRaw) : 0;
    const delayKey = routeId || patternId;
    const delayExisting = delayByRoute.get(delayKey);
    if (!delayExisting || ts >= delayExisting.ts) {
      delayByRoute.set(delayKey, { delaySec, ts });
    }
    if (predictedEpoch && destinationText) {
      const normalizedDest = normalizeStopNameForMatch(destinationText);
      const turnKey = `${delayKey}__${normalizedDest}`;
      const existing = turnaroundByRouteStop.get(turnKey);
      if (!existing || ts >= existing.ts) {
        turnaroundByRouteStop.set(turnKey, { epoch: predictedEpoch, ts });
      }
    }
    const occupancy = extractOccupancyCandidate(b);
    if (!occupancy) return;
    const ratio = occupancyRatioFromText(occupancy);
    if (routeId) {
      if (!byRouteSamples.has(routeId)) byRouteSamples.set(routeId, []);
      byRouteSamples.get(routeId)?.push({ ts, text: occupancy, ratio });
    }
    if (patternId) {
      if (!byRouteSamples.has(patternId)) byRouteSamples.set(patternId, []);
      byRouteSamples.get(patternId)?.push({ ts, text: occupancy, ratio });
    }
  });

  byRouteSamples.forEach((samples) => samples.sort((a, b) => a.ts - b.ts));
  const result = {
    byRouteSamples,
    sampleBuses: buses.slice(0, 5),
    delayByRoute: new Map(
      Array.from(delayByRoute.entries()).map(([key, value]) => [key, value.delaySec])
    ),
    turnaroundByRouteStop,
  } as OccupancyIndex;
  occupancyCache = { expires: Date.now() + OCCUPANCY_CACHE_TTL_MS, value: result };
  return result;
}

export async function getOccupancySampleStats(routeIds: string[], patternIds: string[]) {
  const index = await buildOccupancyIndex();
  const uniqRouteIds = Array.from(new Set(routeIds.filter(Boolean)));
  const uniqPatternIds = Array.from(new Set(patternIds.filter(Boolean)));

  const routeCounts: Record<string, number> = {};
  uniqRouteIds.forEach((id) => {
    routeCounts[id] = index.byRouteSamples.get(id)?.length || 0;
  });

  const patternCounts: Record<string, number> = {};
  uniqPatternIds.forEach((id) => {
    patternCounts[id] = index.byRouteSamples.get(id)?.length || 0;
  });

  return {
    routeCounts,
    patternCounts,
    totalSamples: Array.from(index.byRouteSamples.values()).reduce((sum, items) => sum + items.length, 0),
  };
}

type InternalArrival = BusArrival & {
  routeKey: string;
  statusIsLast: boolean;
};

function dedupeDepartures(departures: InternalArrival[]) {
  const byRoute = new Map<string, InternalArrival[]>();
  departures.forEach((d) => {
    if (!byRoute.has(d.routeKey)) byRoute.set(d.routeKey, []);
    byRoute.get(d.routeKey)?.push(d);
  });

  const merged: InternalArrival[] = [];
  byRoute.forEach((items) => {
    items.sort((a, b) => a.departureEpoch - b.departureEpoch);
    const reduced: InternalArrival[] = [];
    items.forEach((item) => {
      const prev = reduced[reduced.length - 1];
      if (prev && item.departureEpoch - prev.departureEpoch <= 3 * 60 * 1000) {
        reduced[reduced.length - 1] = item;
      } else {
        reduced.push(item);
      }
    });
    merged.push(...reduced);
  });

  return merged;
}

export async function getNextBuses(originStopName: string, destStopName: string): Promise<BusArrival[]> {
  if (!TOKEN) throw new Error('ODPT_TOKEN is not set');

  const [originPoles, destPoles] = await Promise.all([
    getPoleMatchesByName(originStopName),
    getPoleMatchesByName(destStopName),
  ]);
  const originPoleNameMap = new Map(originPoles.map((p) => [p.id, p.title]));
  const originIds = originPoles.map((p) => p.id);
  const destIds = destPoles.map((p) => p.id);
  if (originIds.length === 0 || destIds.length === 0) return [];

  const originNames = buildNameVariants(originStopName, originPoles);
  const destNames = buildNameVariants(destStopName, destPoles);

  const cachedPatterns = patternCache && patternCache.expires > Date.now() ? patternCache.value : null;
  const [patterns, occupancyIndex] = await Promise.all([
    cachedPatterns ? Promise.resolve(cachedPatterns) : fetchAllPages('odpt:BusroutePattern', { 'odpt:operator': TOEI_OPERATOR }),
    buildOccupancyIndex(),
  ]);
  if (!cachedPatterns) {
    patternCache = { expires: Date.now() + PATTERN_CACHE_TTL_MS, value: patterns };
  }
  const candidatePatterns: Array<{ patternId: string; busroute: string; title: string }> = [];
  patterns.forEach((p: any) => {
    const patternId = String(p['owl:sameAs'] || p['@id'] || '');
    if (!patternId) return;
    const orders = Array.isArray(p['odpt:busstopPoleOrder']) ? p['odpt:busstopPoleOrder'] : [];
    let originIdx = -1;
    let destIdx = -1;
    orders.forEach((o: any, idx: number) => {
      const pole = String(o['odpt:busstopPole'] || '');
      const note = getStopName(String(o['odpt:note'] || ''));
      if (originIdx < 0 && (originIds.length > 0 ? originIds.includes(pole) : noteMatchesNames(note, originNames))) {
        originIdx = idx;
      }
      if (destIdx < 0 && (destIds.length > 0 ? destIds.includes(pole) : noteMatchesNames(note, destNames))) {
        destIdx = idx;
      }
    });
    if (originIdx >= 0 && destIdx >= 0 && originIdx < destIdx) {
      candidatePatterns.push({
        patternId,
        busroute: String(p['odpt:busroute'] || ''),
        title: String(p['dc:title'] || ''),
      });
    }
  });
  if (candidatePatterns.length === 0) return [];

  const departures: InternalArrival[] = [];

  for (const pattern of candidatePatterns) {
    const patternId = pattern.patternId;
    const routeId = pattern.busroute || inferBusrouteId(patternId);
    let timetables = await fetchAllPages('odpt:BusTimetable', {
      'odpt:busroutePattern': patternId,
    });
    if (timetables.length === 0 && routeId) {
      timetables = await fetchAllPages('odpt:BusTimetable', {
        'odpt:busroute': routeId,
      });
    }

    for (const tt of timetables) {
      const stops = stopsFromTimetable(tt);
      const originIdx = findStopIndex(stops, originIds, originNames);
      const destIdx = findStopIndex(stops, destIds, destNames);
      if (originIdx < 0 || destIdx < 0 || originIdx >= destIdx) continue;

      const stop = stops[originIdx];
      const originPoleName = originPoleNameMap.get(stop.pole) || stop.note || originStopName;
      const timeStr = stop.departureTime || stop.arrivalTime;
      if (!timeStr) continue;
      const scheduledDate = parseTimeToDate(timeStr, stop.isMidnight);
      if (!scheduledDate) continue;

      const delaySec =
        (routeId && occupancyIndex.delayByRoute.get(routeId)) ||
        occupancyIndex.delayByRoute.get(patternId) ||
        0;
      const adjustedDate = new Date(scheduledDate.getTime() + delaySec * 1000);
      const turnKey = `${(routeId || patternId)}__${normalizeStopNameForMatch(originStopName)}`;
      const turnInfo = occupancyIndex.turnaroundByRouteStop.get(turnKey);
      if (turnInfo && turnInfo.epoch > adjustedDate.getTime()) {
        adjustedDate.setTime(turnInfo.epoch);
      }
      const adjustedTimeStr = formatTime(adjustedDate);
      const etaMinutes = Math.max(0, Math.round((adjustedDate.getTime() - Date.now()) / 60000));
      const scheduledTimeStr = formatTime(scheduledDate);
      const delayMinutes = Math.max(0, Math.round((adjustedDate.getTime() - scheduledDate.getTime()) / 60000));
      let occupancy: string | null = null;
      let occupancyRatio: number | null = null;
      if (routeId || patternId) {
        const samples =
          (routeId && occupancyIndex.byRouteSamples.get(routeId)) ||
          occupancyIndex.byRouteSamples.get(patternId) ||
          [];
        const targetTs = adjustedDate.getTime();
        let best: OccupancySample | null = null;
        let bestDiff = Number.POSITIVE_INFINITY;
        for (const sample of samples) {
          const diff = Math.abs(sample.ts - targetTs);
          if (diff <= OCCUPANCY_MATCH_WINDOW_MS && diff < bestDiff) {
            best = sample;
            bestDiff = diff;
          }
        }
        if (best) {
          occupancy = best.text;
          occupancyRatio = best.ratio;
          if (occupancyRatio === null && occupancy) {
            occupancyRatio = parseOccupancyRatio(occupancy) ?? occupancyRatioFromText(occupancy);
          }
        }
      }
      const occupancyLevel =
        occupancyRatio !== null ? occupancyLevelFromRatio(occupancyRatio) : mapOccupancyLevel(occupancy);
      const rawRouteName = extractRouteName(tt, patternId, routeId, pattern.title);
      const routeName = rawRouteName;
      const routeKey = buildRouteKey(rawRouteName, routeId, patternId);
      const normalizedDest = normalizeText(destStopName);
      const normalizedRoute = normalizeText(routeName);
      const adjustedDestStopName = normalizedRoute.includes(normalizedDest) ? '' : destStopName;
      const statusText = extractStatusText(tt);
      const statusIsLast = statusText.includes('終');

      departures.push({
        id: `${routeKey}-${adjustedTimeStr}`,
        routeName,
        routeId: routeId || undefined,
        patternId: patternId || undefined,
        originStopName,
        originPoleName,
        destStopName: adjustedDestStopName,
        scheduledTime: scheduledTimeStr,
        scheduledEpoch: scheduledDate.getTime(),
        delayMinutes,
        departureTime: adjustedTimeStr,
        departureEpoch: adjustedDate.getTime(),
        etaMinutes,
        occupancy,
        occupancyLevel,
        occupancyRatio,
        routeKey,
        statusIsLast,
      });
    }
  }

  const now = Date.now();
  const upcoming = departures.filter((d) => d.departureEpoch >= now);
  const deduped = dedupeDepartures(upcoming);
  deduped.sort((a, b) => a.departureEpoch - b.departureEpoch);
  const todayKey = toJstDateKey(Date.now());
  const lastTodayByRoute = new Map<string, number>();
  deduped.forEach((item) => {
    if (toJstDateKey(item.departureEpoch) !== todayKey) return;
    const current = lastTodayByRoute.get(item.routeKey);
    if (!current || item.departureEpoch > current) lastTodayByRoute.set(item.routeKey, item.departureEpoch);
  });

  const byRoute = new Map<string, InternalArrival[]>();
  deduped.forEach((item) => {
    if (!byRoute.has(item.routeKey)) byRoute.set(item.routeKey, []);
    byRoute.get(item.routeKey)?.push(item);
  });

  const perRoute: InternalArrival[] = [];
  byRoute.forEach((items) => {
    items.sort((a, b) => a.departureEpoch - b.departureEpoch);
    perRoute.push(...items.slice(0, 2));
  });

  perRoute.sort((a, b) => a.departureEpoch - b.departureEpoch);

  return perRoute.map(({ statusIsLast, routeKey, ...rest }) => ({
    ...rest,
    isLast: statusIsLast || rest.departureEpoch === lastTodayByRoute.get(routeKey),
  }));
}

export async function getNextBusesSafe(originStopName: string, destStopName: string): Promise<BusArrival[]> {
  try {
    if (!TOKEN) {
      console.error('[busApi] ODPT_TOKEN is not set');
      return [];
    }
    return await getNextBuses(originStopName, destStopName);
  } catch (e) {
    console.error('[busApi] Error:', e instanceof Error ? e.message : String(e));
    return [];
  }
}
