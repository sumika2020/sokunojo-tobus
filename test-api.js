// Toyosu -> Edagawa route extraction, timetable lookup, and occupancy merge
const TOKEN = "affcnqoxjnnavoo3zunh65vlg4lsxx8s7dj7sr4dbtqbvenw73aw36paxes59wq2";
const TOEI = "odpt.Operator:Toei";
const TOYOSU_UCODES = [
  "urn:ucode:_00001C0000000000000100000330C6EC",
];
const EDAGAWA_UCODES = [
  "urn:ucode:_00001C0000000000000100000330C755",
];
const ROUTE_LABELS = [
  { label: "海01", regex: /海0?1|海０?１/ },
  { label: "業10", regex: /業10|業１０/ },
  { label: "錦13", regex: /錦13|錦１３/ },
];

function buildUrl(path, params) {
  const url = new URL(`https://api.odpt.org/api/v4/${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
  }
  url.searchParams.set("acl:consumerKey", TOKEN);
  return url.toString();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, attempt = 0) {
  const res = await fetch(url);
  const text = await res.text();
  if (res.status === 429 && attempt < 5) {
    await wait(1500 + attempt * 500);
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function fetchText(url, attempt = 0) {
  const res = await fetch(url);
  const text = await res.text();
  if (res.status === 429 && attempt < 5) {
    await wait(1500 + attempt * 500);
    return fetchText(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 200)}`);
  return text;
}

function parseTimeToDate(timeStr, isMidnight) {
  const match = String(timeStr || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const now = new Date();
  const date = new Date(now);
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (isMidnight) date.setDate(date.getDate() + 1);
  if (date.getTime() < now.getTime()) date.setDate(date.getDate() + 1);
  return date;
}

function extractRouteLabel(text) {
  const value = String(text || "");
  for (const entry of ROUTE_LABELS) {
    if (entry.regex.test(value)) return entry.label;
  }
  return null;
}

function inferBusrouteFromPattern(pattern) {
  const text = String(pattern || "");
  const m = text.match(/^odpt\.BusroutePattern:Toei\.([^.]+)\./);
  if (!m) return null;
  return `odpt.Busroute:Toei.${m[1]}`;
}

async function buildOccupancyMap() {
  const buses = await fetchJson(buildUrl("odpt:Bus", { "odpt:operator": TOEI }));
  const byRoute = new Map();
  const byPattern = new Map();
  if (Array.isArray(buses)) {
    buses.forEach((b) => {
      const occupancy = String(
        b["odpt:occupancy"] || b["odpt:occupancyStatus"] || b["odpt:ext:occupancy"] || ""
      );
      const routeId = String(b["odpt:busroute"] || "");
      const patternId = String(b["odpt:busroutePattern"] || "");
      if (routeId && occupancy) byRoute.set(routeId, occupancy);
      if (patternId && occupancy) byPattern.set(patternId, occupancy);
    });
  }
  return { byRoute, byPattern };
}

async function main() {
  const polesUrl = buildUrl("odpt:BusstopPole", { "odpt:operator": TOEI });
  const polesText = await fetchText(polesUrl);
  const poles = JSON.parse(polesText);
  const poleList = Array.isArray(poles) ? poles : [];

  const mapUcodeToSameAs = new Map();
  poleList.forEach((p) => {
    const ucode = String(p["@id"] || "");
    const sameAs = String(p["owl:sameAs"] || "");
    if (ucode && sameAs) mapUcodeToSameAs.set(ucode, sameAs);
  });

  const toyosuIds = new Set(
    TOYOSU_UCODES.map((id) => mapUcodeToSameAs.get(id)).filter(Boolean)
  );
  const edagawaIds = new Set(
    EDAGAWA_UCODES.map((id) => mapUcodeToSameAs.get(id)).filter(Boolean)
  );
  poleList.forEach((p) => {
    const title = String(p["dc:title"] || "");
    const sameAs = String(p["owl:sameAs"] || "");
    if (title.includes("豊洲駅前") && sameAs) toyosuIds.add(sameAs);
    if (title.includes("枝川") && sameAs) edagawaIds.add(sameAs);
  });

  const allPatterns = new Map();
  const timetableCache = new Map();

  const busrouteTitleMap = new Map();
  const busrouteLabelMap = new Map();
  try {
    const busrouteUrl = buildUrl("odpt:Busroute", { "odpt:operator": TOEI });
    const busrouteText = await fetchText(busrouteUrl);
    const busrouteData = JSON.parse(busrouteText);
    const busrouteList = Array.isArray(busrouteData) ? busrouteData : [];
    busrouteList.forEach((r) => {
      const id = String(r["owl:sameAs"] || r["@id"] || "");
      const title = String(r["dc:title"] || "");
      if (id) busrouteTitleMap.set(id, title);
      const label = extractRouteLabel(`${title} ${id}`);
      if (id && label) busrouteLabelMap.set(id, label);
    });
  } catch (err) {
    // Busroute endpoint is unavailable for this operator; proceed without it.
  }

  const byOperatorUrl = buildUrl("odpt:BusroutePattern", { "odpt:operator": TOEI });
  const byOperatorText = await fetchText(byOperatorUrl);
  const byOperator = JSON.parse(byOperatorText);
  const opList = Array.isArray(byOperator) ? byOperator : [];
  opList.forEach((p) => {
    const patternId = String(p["owl:sameAs"] || p["@id"] || "");
    if (!patternId) return;
    const title = String(p["dc:title"] || "");
    const busroute = String(p["odpt:busroute"] || "");
    const note = String(p["odpt:note"] || "");
    const identifier = String(p["dc:identifier"] || "");
    const busrouteTitle = busrouteTitleMap.get(busroute) || "";
    const routeLabel = extractRouteLabel(
      `${title} ${note} ${identifier} ${patternId} ${busroute} ${busrouteTitle}`
    );
    if (!routeLabel) return;

    const orders = Array.isArray(p["odpt:busstopPoleOrder"]) ? p["odpt:busstopPoleOrder"] : [];
    let originIndex = -1;
    let destIndex = -1;
    orders.forEach((o, idx) => {
      const poleId = String(o["odpt:busstopPole"] || "");
      const note = String(o["odpt:note"] || "");
      if ((toyosuIds.has(poleId) || note.includes("豊洲駅前")) && originIndex < 0) originIndex = idx;
      if ((edagawaIds.has(poleId) || note.includes("枝川")) && destIndex < 0) destIndex = idx;
    });

    if (originIndex >= 0 && destIndex >= 0 && originIndex < destIndex) {
      allPatterns.set(patternId, {
        patternId,
        poleId: String(orders[originIndex]?.["odpt:busstopPole"] || ""),
        title,
        busroute,
        routeLabel,
      });
    }
  });

  const occupancyMap = await buildOccupancyMap();
  const departures = [];
  const rawErrors = [];
  const candidatePatterns = [];

  for (const p of allPatterns.values()) {
    candidatePatterns.push(p);
    const patternId = p.patternId;
    const inferred = inferBusrouteFromPattern(patternId);
    let timetables = timetableCache.get(patternId);
    if (!timetables) {
      const ttUrl = buildUrl("odpt:BusTimetable", { "odpt:busroutePattern": patternId });
      const ttText = await fetchText(ttUrl);
      const tt = JSON.parse(ttText);
      timetables = Array.isArray(tt) ? tt : [];
      timetableCache.set(patternId, timetables);
      if (timetables.length === 0) rawErrors.push({ url: ttUrl, text: ttText });
    }
    if (timetables.length === 0 && inferred) {
      const byRouteUrl = buildUrl("odpt:BusTimetable", { "odpt:busroute": inferred });
      const byRouteText = await fetchText(byRouteUrl);
      const byRoute = JSON.parse(byRouteText);
      timetables = Array.isArray(byRoute) ? byRoute : [];
      if (timetables.length === 0) rawErrors.push({ url: byRouteUrl, text: byRouteText });
    }

    for (const item of timetables) {
      const title = String(item["dc:title"] || p.title || "");
      const stops = Array.isArray(item["odpt:busTimetableObject"]) ? item["odpt:busTimetableObject"] : [];
      for (const s of stops) {
        const poleId = String(s["odpt:busstopPole"] || "");
        const note = String(s["odpt:note"] || "");
        if (!toyosuIds.has(poleId) && !note.includes("豊洲駅前")) continue;
        const timeStr = String(s["odpt:arrivalTime"] || s["odpt:departureTime"] || "");
        const date = parseTimeToDate(timeStr, Boolean(s["odpt:isMidnight"]));
        if (!date) continue;
        const routeId = p.busroute || inferred;
        const occupancy =
          (routeId && occupancyMap.byRoute.get(routeId)) ||
          occupancyMap.byPattern.get(patternId) ||
          "不明";
        departures.push({
          timeStr,
          date,
          title,
          routeLabel: p.routeLabel || extractRouteLabel(title),
          occupancy,
        });
      }
    }
  }

  const earliestByRoute = new Map();
  departures.forEach((d) => {
    if (!d.routeLabel) return;
    const current = earliestByRoute.get(d.routeLabel);
    if (!current || d.date.getTime() < current.date.getTime()) {
      earliestByRoute.set(d.routeLabel, d);
    }
  });

  const sorted = Array.from(earliestByRoute.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  const top3 = sorted.slice(0, 3);
  if (top3.length > 0) {
    top3.forEach((d, idx) => {
      console.log(`系統名：${d.routeLabel || d.title}`);
      console.log(`発車時刻：${d.timeStr}`);
      console.log("目的地：枝川");
      console.log(`混雑率：${d.occupancy}`);
      if (idx < top3.length - 1) console.log("");
    });
  } else {
    if (rawErrors.length > 0) {
      rawErrors.forEach((e) => {
        console.log(e.url);
        console.log(e.text);
      });
      return;
    }

    for (const p of candidatePatterns) {
      const inferred = inferBusrouteFromPattern(p.patternId);
      const ttUrl = buildUrl("odpt:BusTimetable", { "odpt:busroutePattern": p.patternId });
      const ttText = await fetchText(ttUrl);
      console.log(ttUrl);
      console.log(ttText);
      if (inferred) {
        const byRouteUrl = buildUrl("odpt:BusTimetable", { "odpt:busroute": inferred });
        const byRouteText = await fetchText(byRouteUrl);
        console.log(byRouteUrl);
        console.log(byRouteText);
      }
    }
  }
}

main().catch((err) => {
  console.error("Error:", err.message || String(err));
});
