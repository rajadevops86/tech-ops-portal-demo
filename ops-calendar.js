// ops-calendar.js v4 — resilient GVIZ + clean rendering (no freezes)

console.log("[OpsCalendar] v4 loaded");

// === Config ===
const OPS_SHEET_ID   = "1tIggu_-kutucmc-owxhr0bwWCQKiK1n-bDzdEy8u4Vw";
const OPS_SHEET_NAME = "November 2025";
const OPS_GVIZ_URL =
  `https://docs.google.com/spreadsheets/d/${OPS_SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(OPS_SHEET_NAME)}&tqx=out:json`;

const T_BODY_ID = "ops-calendar-body";
const FETCH_TIMEOUT_MS = 8000;     // never hang UI
const REFRESH_MS       = 5 * 60e3; // 5 min auto-refresh

// Fixed offsets (simple model; EST no DST)
const ZONE_OFFSETS_MIN = { IST: 330, MYT: 480, EST: -300 };

function todayLabelUS() {
  const d = new Date();
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
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
  const m = shiftText.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)\s*(IST|MYT|EST)/i);
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
    : nowLocal >= startMin || nowLocal < endMin; // overnight
}

async function fetchGViz(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal, mode: "cors" });
    if (!res.ok) throw new Error("HTTP_" + res.status);
    const text = await res.text();

    // Robust extraction of setResponse(...)
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]+?)\);?/);
    if (!match) throw new Error("GVIZ_WRAPPER_NOT_FOUND");
    return JSON.parse(match[1]);
  } finally {
    clearTimeout(t);
  }
}

// Find today's column index:
function findTodayColumn(gv) {
  const target = todayLabelUS();

  // 1) Preferred: look at table.cols[].label
  const cols = gv.table?.cols || [];
  for (let i = 1; i < cols.length; i++) {
    const lab = (cols[i]?.label || "").trim();
    if (lab === target) return i;
  }

  // 2) Fallback: first data row looks like a header row in the sheet
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

function renderMessage(html) {
  const tbody = document.getElementById(T_BODY_ID);
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="3">${html}</td></tr>`;
}

function renderOnShift(gv, todayCol) {
  const tbody = document.getElementById(T_BODY_ID);
  if (!tbody) return;

  const rows = gv.table?.rows || [];
  const out = [];

  // Start from r=1 (r=0 would be “header” row if your sheet has one)
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
  const tbody = document.getElementById(T_BODY_ID);
  if (!tbody) return;
  renderMessage("Loading schedule…");

  try {
    const gv = await fetchGViz(OPS_GVIZ_URL, FETCH_TIMEOUT_MS);
    const col = findTodayColumn(gv);

    if (col === -1) {
      const wanted = todayLabelUS();
      renderMessage(`Could not find a column for <strong>${wanted}</strong> in the sheet <em>${OPS_SHEET_NAME}</em>.`);
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
  if (REFRESH_MS > 0) setInterval(loadOpsCalendar, REFRESH_MS);
});
