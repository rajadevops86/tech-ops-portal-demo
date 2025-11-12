// ops-calendar.js v5 — GID-based GViz, resilient parsing, on-shift filter

console.log("[OpsCalendar] v5 loaded");

// === Sheet config (use gid to avoid name mismatches) ===
const OPS_SHEET_ID  = "1tIggu_-kutucmc-owxhr0bwWCQKiK1n-bDzdEy8u4Vw";
const OPS_SHEET_GID = "2113548477"; // <-- from your link
const OPS_GVIZ_URL  =
  `https://docs.google.com/spreadsheets/d/${OPS_SHEET_ID}/gviz/tq?gid=${OPS_SHEET_GID}&tqx=out:json&tq=`; // empty query returns whole sheet

// DOM + timing
const T_BODY_ID = "ops-calendar-body";
const FETCH_TIMEOUT_MS = 10000;
const REFRESH_MS       = 5 * 60 * 1000; // 5 minutes

// Fixed UTC offsets (simple model; no DST for EST). Add as needed.
const ZONE_OFFSETS_MIN = {
  IST: 330,  // UTC+5:30
  MYT: 480,  // UTC+8
  EST: -300, // UTC-5
  GST: 240,  // UTC+4 (Dubai)
};

// ---------- helpers ----------
function todayLabelUS() {
  const d = new Date();
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(d);
}
function cleanCellText(str) {
  if (!str) return "";
  return String(str)
    .replace(/[\u2600-\u26FF\u{1F300}-\u{1FAFF}]/gu, "") // emojis/dingbats
    .replace(/\s+/g, " ")
    .trim();
}
function parseTimeToMinutes(str) {
  if (!str) return null;
  const m = str.trim().match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return null;
  let h = +m[1], mm = +m[2], ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12)  h = 0;
  return h * 60 + mm;
}
function classifyShift(txt) {
  const v = (txt || "").toLowerCase();
  if (!v) return { label: "—", css: "status-off" };
  if (v.includes("sick")) return { label: "Sick", css: "status-sick" };
  if (v.includes("pto"))  return { label: "PTO",  css: "status-pto"  };
  if (v.includes("off"))  return { label: "Off",  css: "status-off"  };
  return { label: "Working", css: "status-working" };
}
function isCurrentlyOnShift(shiftText) {
  if (!shiftText) return false;
  const m = shiftText.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)\s*(IST|MYT|EST|GST)/i);
  if (!m) return false;
  const startMin = parseTimeToMinutes(m[1]);
  const endMin   = parseTimeToMinutes(m[2]);
  const tz       = m[3].toUpperCase();
  const offset   = ZONE_OFFSETS_MIN[tz];
  if (startMin == null || endMin == null || offset == null) return false;

  const now = new Date();
  const nowUtc = now.getUTCHours() * 60 + now.getUTCMinutes();
  const nowLocal = (nowUtc + offset + 1440) % 1440;

  return (startMin <= endMin)
    ? nowLocal >= startMin && nowLocal < endMin
    : nowLocal >= startMin || nowLocal < endMin; // overnight window
}
function renderMessage(html) {
  const tbody = document.getElementById(T_BODY_ID);
  if (tbody) tbody.innerHTML = `<tr><td colspan="3">${html}</td></tr>`;
}

async function fetchGViz(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // cache-bust to avoid any stale auth redirect caches
    const bust = (url.includes("?") ? "&" : "?") + "_ts=" + Date.now();
    const res = await fetch(url + bust, { cache: "no-store", signal: ctrl.signal, mode: "cors" });
    if (!res.ok) throw new Error("HTTP_" + res.status);
    const text = await res.text();

    // Expected: google.visualization.Query.setResponse({...});
    const m = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]+?)\);?\s*$/);
    if (!m) throw new Error("GVIZ_WRAPPER_NOT_FOUND");
    return JSON.parse(m[1]);
  } finally {
    clearTimeout(t);
  }
}

// Prefer header in table.cols; fallback to first row (sheet header)
function findTodayColumn(gv) {
  const target = todayLabelUS();
  const cols = gv.table?.cols || [];
  for (let i = 1; i < cols.length; i++) {
    const label = (cols[i]?.label || "").trim();
    if (label === target) return i;
  }
  const rows = gv.table?.rows || [];
  if (rows[0]?.c) {
    for (let i = 1; i < rows[0].c.length; i++) {
      const cell = rows[0].c[i];
      const formatted = (cell?.f || cell?.v || "").toString().trim();
      if (formatted === target) return i;
    }
  }
  return -1;
}

function renderOnShift(gv, todayCol) {
  const tbody = document.getElementById(T_BODY_ID);
  if (!tbody) return;

  const rows = gv.table?.rows || [];
  const out = [];

  // r=1 onwards (skip any literal header row in the sheet)
  for (let r = 1; r < rows.length; r++) {
    const rCells = rows[r].c || [];
    const name = rCells[0]?.v;
    if (!name) continue;

    const cell = rCells[todayCol] || {};
    const raw  = cell.f ?? cell.v ?? "";
    const shiftText = cleanCellText(raw);
    if (!shiftText) continue;

    const base = classifyShift(shiftText);
    if (base.label !== "Working") continue;
    if (!isCurrentlyOnShift(shiftText)) continue;

    out.push(
      `<tr>
        <td>${name}</td>
        <td><span class="pill-on">ON SHIFT</span></td>
        <td>${shiftText}</td>
      </tr>`
    );
  }

  tbody.innerHTML = out.length
    ? out.join("")
    : `<tr><td colspan="3">No engineers currently on shift for this time.</td></tr>`;
}

async function loadOpsCalendar() {
  renderMessage("Loading schedule…");
  try {
    const gv = await fetchGViz(OPS_GVIZ_URL, FETCH_TIMEOUT_MS);

    // Basic sanity check: must have a table
    if (!gv?.table?.rows?.length) {
      renderMessage("No schedule data found in this sheet/tab.");
      return;
    }

    const col = findTodayColumn(gv);
    if (col === -1) {
      const wanted = todayLabelUS();
      renderMessage(`Could not find a date column for <strong>${wanted}</strong> in this tab.`);
      return;
    }

    renderOnShift(gv, col);
  } catch (e) {
    console.error("[OpsCalendar] load error:", e);
    renderMessage("Error loading schedule from Google Sheets (network/format).");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadOpsCalendar();
  setInterval(loadOpsCalendar, REFRESH_MS);
});
