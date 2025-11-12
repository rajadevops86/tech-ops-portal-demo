// ops-calendar.js v3
// ================= Operations Calendar – Google Sheet integration =================

console.log("[OpsCalendar] v3 loaded");

// Your sheet info
const OPS_SHEET_ID   = "1tIggu_-kutucmc-owxhr0bwWCQKiK1n-bDzdEy8u4Vw";
const OPS_SHEET_NAME = "November 2025";
const OPS_GVIZ_URL =
  `https://docs.google.com/spreadsheets/d/${OPS_SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(
    OPS_SHEET_NAME
  )}&tqx=out:json`;

// Fixed offsets in minutes from UTC for schedule timezones
// (simple model, ignores DST for EST – OK for this dashboard)
const ZONE_OFFSETS_MIN = {
  IST: 5 * 60 + 30,  // UTC+5:30
  MYT: 8 * 60,       // UTC+8
  EST: -5 * 60       // UTC-5
};

// Format today exactly like the header row: "Monday, November 10, 2025"
function getTodayLabel() {
  const today = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return fmt.format(today);
}

// Strip emojis (⛔ etc) and trim
function cleanCellText(str) {
  if (!str) return "";
  return (
    str
      // emoji + dingbats etc
      .replace(/[\u2600-\u26FF\u{1F300}-\u{1FAFF}]/gu, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

// Parse "11:00 AM" → minutes since midnight (0–1439) or null
function parseTimeToMinutes(str) {
  if (!str) return null;
  const m = str.trim().match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();

  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;

  return hour * 60 + min;
}

// High-level status (Working / Off / PTO / Sick / —)
function classifyShift(text) {
  const v = text.toLowerCase();
  if (!v) {
    return { label: "—", css: "status-off" };
  }
  if (v.includes("sick")) {
    return { label: "Sick", css: "status-sick" };
  }
  if (v.includes("pto")) {
    return { label: "PTO", css: "status-pto" };
  }
  if (v.includes("off")) {
    return { label: "Off", css: "status-off" };
  }
  // Anything else is assumed to be a working shift like "11:00 AM - 08:00 PM IST"
  return { label: "Working", css: "status-working" };
}

// Check if the current time falls inside the shift window.
// Expect shift like "11:00 AM - 08:00 PM IST"
function isCurrentlyOnShift(shiftText) {
  if (!shiftText) return false;

  const regex =
    /(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)\s*(IST|MYT|EST)/i;
  const m = shiftText.match(regex);
  if (!m) {
    console.log("[OpsCalendar] Could not parse shift:", shiftText);
    return false;
  }

  const startStr = m[1];
  const endStr = m[2];
  const tzAbbrev = m[3].toUpperCase();

  const offsetMin = ZONE_OFFSETS_MIN[tzAbbrev];
  if (offsetMin == null) return false;

  const startMin = parseTimeToMinutes(startStr);
  const endMin = parseTimeToMinutes(endStr);
  if (startMin == null || endMin == null) return false;

  // Convert "now" to minutes-of-day in that timezone
  const now = new Date();
  const nowUtcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const nowLocalMin =
    (nowUtcMin + offsetMin + 24 * 60) % (24 * 60); // wrap 0–1439

  let onShift;
  if (startMin <= endMin) {
    onShift = nowLocalMin >= startMin && nowLocalMin < endMin;
  } else {
    // Overnight shift
    onShift = nowLocalMin >= startMin || nowLocalMin < endMin;
  }

  console.log(
    `[OpsCalendar] shift "${shiftText}" in ${tzAbbrev}: start=${startMin}, end=${endMin}, nowLocal=${nowLocalMin}, onShift=${onShift}`
  );

  return onShift;
}

async function loadOpsCalendar() {
  const tbody = document.getElementById("ops-calendar-body");
  if (!tbody) return;

  try {
    tbody.innerHTML = `<tr><td colspan="3">Loading schedule…</td></tr>`;

    const res = await fetch(OPS_GVIZ_URL, { cache: "no-store" });
    const text = await res.text();

    // gviz wraps JSON in "google.visualization.Query.setResponse(...);"
    const jsonStr = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const data = JSON.parse(jsonStr);

    const rows = data.table.rows || [];
    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="3">No schedule data found.</td></tr>`;
      return;
    }

    const todayLabel = getTodayLabel();
    console.log("[OpsCalendar] Today label:", todayLabel);

    // First row is header row with dates in columns 1..N
    const headerRow = rows[0].c || [];
    let todayColIndex = -1;

    for (let i = 1; i < headerRow.length; i++) {
      const cell = headerRow[i];
      if (!cell) continue;

      const formatted = (cell.f || cell.v || "").toString().trim();
      console.log(`[OpsCalendar] header col ${i}: "${formatted}"`);

      if (formatted === todayLabel) {
        todayColIndex = i;
        break;
      }
    }

    if (todayColIndex === -1) {
      console.warn(
        "[OpsCalendar] Could not find column for today. Header row:",
        headerRow
      );
      tbody.innerHTML = `<tr><td colspan="3">Could not find a column for "<strong>${todayLabel}</strong>" in the schedule sheet.</td></tr>`;
      return;
    }

    console.log("[OpsCalendar] Using column index:", todayColIndex);

    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r].c || [];
      const engineerName = row[0]?.v;
      if (!engineerName) continue; // skip blank rows

      const cell = row[todayColIndex] || {};
      const rawCell = cell.v || cell.f || "";
      const cleaned = cleanCellText(rawCell);
      if (!cleaned) continue; // nothing scheduled today

      const baseStatus = classifyShift(cleaned);

      // Only consider Working status
      if (baseStatus.label !== "Working") {
        continue;
      }

      // Only keep engineers whose local time is currently within the shift
      if (!isCurrentlyOnShift(cleaned)) {
        continue;
      }

      out.push(`
        <tr>
          <td>${engineerName}</td>
          <td class="status-working">Working now</td>
          <td>${cleaned}</td>
        </tr>
      `);
    }

    if (!out.length) {
      tbody.innerHTML = `<tr><td colspan="3">No engineers currently on shift for this time.</td></tr>`;
    } else {
      tbody.innerHTML = out.join("");
    }
  } catch (err) {
    console.error("Failed to load ops calendar:", err);
    tbody.innerHTML = `<tr><td colspan="3">Error loading schedule from Google Sheets.</td></tr>`;
  }
}

// Run once on load + refresh every 5 minutes
document.addEventListener("DOMContentLoaded", () => {
  console.log("[OpsCalendar] DOMContentLoaded – loading now");
  loadOpsCalendar();
  setInterval(loadOpsCalendar, 5 * 60 * 1000); // refresh every 5 minutes
});
