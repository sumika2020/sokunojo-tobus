// src/constants/busColors.ts

export type RouteColorConfig = { bg: string; text: string; };

export const BUS_ROUTE_COLORS: { [key: string]: RouteColorConfig } = {
  // --- 深川・江東（正確な色指定・幹線） ---
  "陽12-1": { bg: "#FF69B4", text: "#FFFFFF" }, "陽12-2": { bg: "#008000", text: "#FFFFFF" }, "陽12-3": { bg: "#000080", text: "#FFFFFF" },
  "業10": { bg: "#00BFFF", text: "#FFFFFF" }, "錦13": { bg: "#E60012", text: "#FFFFFF" },
  "都01": { bg: "#008542", text: "#FFFFFF" }, "都02": { bg: "#008542", text: "#FFFFFF" }, "都02乙": { bg: "#008542", text: "#FFFFFF" },
  "都03": { bg: "#008542", text: "#FFFFFF" }, "都04": { bg: "#008542", text: "#FFFFFF" }, "都05": { bg: "#008542", text: "#FFFFFF" },
  "都06": { bg: "#800080", text: "#FFFFFF" }, "都07": { bg: "#008542", text: "#FFFFFF" }, "都08": { bg: "#008542", text: "#FFFFFF" },
  "海01": { bg: "#FFD700", text: "#000000" }, "波01": { bg: "#FFD700", text: "#000000" }, "豊洲01": { bg: "#FFD700", text: "#000000" },
  "東15": { bg: "#008000", text: "#FFFFFF" }, "東16": { bg: "#008000", text: "#FFFFFF" }, "門19": { bg: "#8B4513", text: "#FFFFFF" },
  "木11": { bg: "#4682B4", text: "#FFFFFF" }, "錦11": { bg: "#FF69B4", text: "#FFFFFF" }, "錦18": { bg: "#E60012", text: "#FFFFFF" },
  "急行05": { bg: "#FF4500", text: "#FFFFFF" }, "急行06": { bg: "#FF4500", text: "#FFFFFF" }, "陽20": { bg: "#00BFFF", text: "#FFFFFF" },

  // --- 江戸川・葛西 ---
  "葛西21": { bg: "#FF69B4", text: "#FFFFFF" }, "葛西22": { bg: "#DDA0DD", text: "#000000" }, "葛西24": { bg: "#800080", text: "#FFFFFF" },
  "葛西26": { bg: "#DDA0DD", text: "#000000" }, "臨海22": { bg: "#2E8B57", text: "#FFFFFF" }, "臨海28": { bg: "#2E8B57", text: "#FFFFFF" },
  "西葛20": { bg: "#DDA0DD", text: "#000000" }, "西葛26": { bg: "#DDA0DD", text: "#000000" }, "西葛27": { bg: "#DDA0DD", text: "#000000" },
  "船28": { bg: "#DDA0DD", text: "#000000" }, "秋26": { bg: "#4682B4", text: "#FFFFFF" }, "両28": { bg: "#2E8B57", text: "#FFFFFF" },
  "亀26": { bg: "#2E8B57", text: "#FFFFFF" }, "亀29": { bg: "#2E8B57", text: "#FFFFFF" }, "新小21": { bg: "#CD853F", text: "#FFFFFF" },
  "新小22": { bg: "#CD853F", text: "#FFFFFF" }, "平23": { bg: "#CD853F", text: "#FFFFFF" }, "FL01": { bg: "#FF4500", text: "#FFFFFF" },

  // --- 学バス ---
  "学01": { bg: "#FF4500", text: "#FFFFFF" }, "学02": { bg: "#FF4500", text: "#FFFFFF" }, "学03": { bg: "#FF4500", text: "#FFFFFF" },
  "学05": { bg: "#FF4500", text: "#FFFFFF" }, "学06": { bg: "#FF4500", text: "#FFFFFF" }, "学07": { bg: "#FF4500", text: "#FFFFFF" },
  "学08": { bg: "#FF4500", text: "#FFFFFF" }, "学09": { bg: "#FF4500", text: "#FFFFFF" },

  // --- 深夜 ---
  "深夜01": { bg: "#000000", text: "#FFFFFF" }, "深夜02": { bg: "#000000", text: "#FFFFFF" }, "深夜03": { bg: "#000000", text: "#FFFFFF" },
  "深夜04": { bg: "#000000", text: "#FFFFFF" }, "深夜05": { bg: "#000000", text: "#FFFFFF" }, "深夜06": { bg: "#000000", text: "#FFFFFF" },
  "深夜07": { bg: "#000000", text: "#FFFFFF" }, "深夜08": { bg: "#000000", text: "#FFFFFF" }, "深夜09": { bg: "#000000", text: "#FFFFFF" },
  "深夜10": { bg: "#000000", text: "#FFFFFF" }, "深夜11": { bg: "#000000", text: "#FFFFFF" }, "深夜12": { bg: "#000000", text: "#FFFFFF" },
  "深夜13": { bg: "#000000", text: "#FFFFFF" }, "深夜14": { bg: "#000000", text: "#FFFFFF" },

  // --- その他地域系統 ---
  "王40": { bg: "#FF8C00", text: "#FFFFFF" }, "王57": { bg: "#FF8C00", text: "#FFFFFF" }, "北47": { bg: "#FF8C00", text: "#FFFFFF" },
  "里48": { bg: "#FF8C00", text: "#FFFFFF" }, "上23": { bg: "#2E8B57", text: "#FFFFFF" }, "上69": { bg: "#FF1493", text: "#FFFFFF" },
  "田87": { bg: "#4169E1", text: "#FFFFFF" }, "反96": { bg: "#4169E1", text: "#FFFFFF" }, "品91": { bg: "#00008B", text: "#FFFFFF" },
  "品97": { bg: "#00008B", text: "#FFFFFF" }, "池86": { bg: "#FF1493", text: "#FFFFFF" }, "早77": { bg: "#FF1493", text: "#FFFFFF" },
  "練42": { bg: "#228B22", text: "#FFFFFF" }, "青梅": { bg: "#4169E1", text: "#FFFFFF" }, "S-1": { bg: "#D4AF37", text: "#FFFFFF" },
  "default": { bg: "#008542", text: "#FFFFFF" }
};

export const getRouteColor = (displayName: string) => {
  if (!displayName) return BUS_ROUTE_COLORS["default"];

  // 1. 文字列を極限までクリーンにする
  const normalized = displayName
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFee0)) // 全角英数を半角に
    .replace(/[－―ー‐]/g, '-') // あらゆる種類のハイフンを半角マイナスに統一
    .replace(/[\s\u3000]/g, '') // 全角・半角スペースを完全に削除
    .split(/[（(]/)[0];         // 括弧（KM01など）以降を削除

  // 2. マッチング
  // A. 完全一致をまず探す (陽12-2などの枝番を優先するため)
  if (BUS_ROUTE_COLORS[normalized]) {
    return BUS_ROUTE_COLORS[normalized];
  }

  // B. 前方一致を探す (業10出入などの派生をカバーするため)
  // ただし、キーが長い順にソートして検索することで「陽12」が「陽12-2」を誤爆するのを防ぐ
  const sortedKeys = Object.keys(BUS_ROUTE_COLORS).sort((a, b) => b.length - a.length);
  const matchedKey = sortedKeys.find(k => normalized.startsWith(k));

  return matchedKey ? BUS_ROUTE_COLORS[matchedKey] : BUS_ROUTE_COLORS["default"];
};