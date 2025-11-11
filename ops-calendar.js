<script>
  // ===== Operations Calendar – Google Sheet integration =====

  // Your sheet info
  const OPS_SHEET_ID   = "1tIggu_-kutucmc-owxhr0bwWCQKiK1n-bDzdEy8u4Vw";
  const OPS_SHEET_NAME = "Tab";          // sheet tab name with the schedule
  const OPS_GVIZ_URL =
    `https://docs.google.com/spreadsheets/d/${OPS_SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(OPS_SHEET_NAME)}&tqx=out:json`;

  // Format today exactly like the header row: "Monday, November 10, 2025"
  function getTodayLabel() {
    const today = new Date();
    const fmt = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    });
    return fmt.format(today);
  }

  // Strip emojis (⛔ etc) and trim
  function cleanCellText(str) {
    if (!str) return "";
    return str
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, "") // emojis
      .replace(/\s+/g, " ")
      .trim();
  }

  // Turn a shift string into { label, cssClass }
  function classifyShift(text) {
    const v = text.toLowerCase();
    if (!v || v === "") {
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
    // Anything else is assumed to be a working shift like "11:00 AM - 08:00 PM EST"
    return { label: "Working", css: "status-working" };
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

      // First row is header row with dates in columns 1..N
      const header = rows[0].c || [];
      let todayColIndex = -1;
      for (let i = 1; i < header.length; i++) {
        const v = header[i]?.v;
        if (typeof v === "string" && v.trim() === todayLabel) {
          todayColIndex = i;
          break;
        }
      }

      if (todayColIndex === -1) {
        tbody.innerHTML = `<tr><td colspan="3">Could not find a column for "${todayLabel}" in the schedule.</td></tr>`;
        return;
      }

      // Build table rows from each engineer row (rows[1+] since rows[0] is header)
      const out = [];
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r].c || [];
        const engineerName = row[0]?.v;
        if (!engineerName) continue; // skip blank rows

        const rawCell = row[todayColIndex]?.v || "";
        const cleaned = cleanCellText(rawCell);
        const status = classifyShift(cleaned);

        out.push(`
          <tr>
            <td>${engineerName}</td>
            <td class="${status.css}">${status.label}</td>
            <td>${cleaned || "—"}</td>
          </tr>
        `);
      }

      if (!out.length) {
        tbody.innerHTML = `<tr><td colspan="3">No engineers found for today.</td></tr>`;
      } else {
        tbody.innerHTML = out.join("");
      }
    } catch (err) {
      console.error("Failed to load ops calendar:", err);
      tbody.innerHTML = `<tr><td colspan="3">Error loading schedule from Google Sheets.</td></tr>`;
    }
  }

  // Kick it off after DOM is ready
  document.addEventListener("DOMContentLoaded", () => {
    loadOpsCalendar();
      // refresh every 5 min (adjust if needed)
  setInterval(loadOpsCalendar, 5 * 60 * 1000);
  });
</script>
