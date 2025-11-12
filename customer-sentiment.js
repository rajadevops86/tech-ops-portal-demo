// customer-sentiment.js
// Overview (top) + details (below) with compact 0–1 speedometer.
// Data source: app-metrics.json (array or {apps:[...]})

const METRICS_URL = "app-metrics.json";

function classifySentiment(score) {
  if (score == null) return "neutral";
  if (score >= 0.75) return "good";
  if (score <= 0.45) return "bad";
  return "neutral";
}

function formatDelta(delta) {
  if (delta == null || isNaN(delta)) {
    return { text: "±0.00", cls: "delta-flat" };
  }
  const sign = delta > 0 ? "+" : delta < 0 ? "" : "±";
  const cls = delta > 0 ? "delta-up" : delta < 0 ? "delta-down" : "delta-flat";
  return { text: sign + Number(delta).toFixed(2), cls };
}

async function loadAppMetrics() {
  try {
    const resp = await fetch(METRICS_URL + "?v=" + Date.now(), { cache: "no-store" });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const json = await resp.json();
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.apps)) return json.apps;
    throw new Error("Unexpected app-metrics.json shape");
  } catch (e) {
    console.error("Failed to load app metrics:", e);
    return [];
  }
}

function sortApps(apps, key) {
  const arr = [...apps];
  if (key === "name") {
    arr.sort((a, b) => (a.appName || "").localeCompare(b.appName || ""));
  } else if (key === "ios") {
    arr.sort((a, b) => (b.ios?.rating || 0) - (a.ios?.rating || 0));
  } else if (key === "android") {
    arr.sort((a, b) => (b.android?.rating || 0) - (a.android?.rating || 0));
  } else {
    arr.sort((a, b) => (b.sentiment?.score || 0) - (a.sentiment?.score || 0));
  }
  return arr;
}

function buildRatingBadge(r) {
  const container = document.createElement("span");
  container.className = "cs-badge-rating";
  const star = document.createElement("span"); star.textContent = "★";
  const value = document.createElement("span"); value.className = "value";
  value.textContent = r?.rating != null ? Number(r.rating).toFixed(2) : "–";
  container.appendChild(star); container.appendChild(value);
  if (r && r.ratingDelta != null) {
    const d = formatDelta(r.ratingDelta);
    const delta = document.createElement("span");
    delta.className = "delta " + d.cls;
    delta.textContent = d.text;
    container.appendChild(delta);
  }
  return container;
}

function buildSentimentPill(sentiment) {
  const score = sentiment?.score ?? null;
  const delta = sentiment?.scoreDelta ?? null;
  const bucket = classifySentiment(score);
  const d = formatDelta(delta);

  const pill = document.createElement("span");
  pill.className =
    "cs-pill-sentiment " +
    (bucket === "good" ? "sent-good" : bucket === "bad" ? "sent-bad" : "sent-neutral");

  const scoreSpan = document.createElement("span");
  scoreSpan.textContent = score == null ? "–" : Number(score).toFixed(2);

  const labelSpan = document.createElement("span");
  labelSpan.textContent = bucket === "good" ? "Positive" : bucket === "bad" ? "Negative" : "Mixed";

  const deltaSpan = document.createElement("span");
  deltaSpan.className = d.cls;
  deltaSpan.textContent = d.text;

  pill.appendChild(scoreSpan);
  pill.appendChild(labelSpan);
  pill.appendChild(deltaSpan);
  return pill;
}

/* ---------- Compact gauge (0–1), left-aligned ---------- */
function renderGauge(container, score) {
  container.innerHTML = "";
  const pct = Math.max(0, Math.min(1, Number(score ?? 0)));

  const svgNS = "http://www.w3.org/2000/svg";
  const W = 260, H = 140;
  const cx = 130, cy = 130, r = 115, len = 90;
  const circumference = Math.PI * r;

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.classList.add("cs-gauge", "cs-gauge--compact");

  const defs = document.createElementNS(svgNS, "defs");
  const grad = document.createElementNS(svgNS, "linearGradient");
  grad.setAttribute("id", "cs-ggrad");
  grad.setAttribute("x1", "0%"); grad.setAttribute("y1", "0%");
  grad.setAttribute("x2", "100%"); grad.setAttribute("y2", "0%");
  [["0%","#ef4444"],["50%","#f59e0b"],["100%","#22c55e"]].forEach(([o,c])=>{
    const s = document.createElementNS(svgNS,"stop");
    s.setAttribute("offset",o); s.setAttribute("stop-color",c); grad.appendChild(s);
  });
  defs.appendChild(grad); svg.appendChild(defs);

  const bg = document.createElementNS(svgNS, "path");
  bg.setAttribute("d", `M15,${cy} A${r},${r} 0 0 1 ${W-15},${cy}`);
  bg.setAttribute("stroke", "rgba(148,163,184,.28)");
  bg.setAttribute("stroke-width", "14");
  bg.setAttribute("fill", "none");
  svg.appendChild(bg);

  const arc = document.createElementNS(svgNS, "path");
  arc.setAttribute("d", `M15,${cy} A${r},${r} 0 0 1 ${W-15},${cy}`);
  arc.setAttribute("stroke", "url(#cs-ggrad)");
  arc.setAttribute("stroke-width", "14");
  arc.setAttribute("stroke-linecap", "round");
  arc.setAttribute("fill", "none");
  arc.setAttribute("stroke-dasharray", `${pct * circumference} ${circumference - pct * circumference}`);
  svg.appendChild(arc);

  const needle = document.createElementNS(svgNS, "line");
  const deg = 180 - pct * 180;
  const rad = (deg * Math.PI) / 180;
  const x2 = cx + len * Math.cos(rad), y2 = cy - len * Math.sin(rad);
  needle.setAttribute("x1", cx); needle.setAttribute("y1", cy);
  needle.setAttribute("x2", x2); needle.setAttribute("y2", y2);
  const theme = (document.documentElement.getAttribute("data-theme") || "dark");
  needle.setAttribute("stroke", theme === "dark" ? "#ffffff" : "#111827");
  needle.setAttribute("stroke-width", "3.5");
  needle.setAttribute("stroke-linecap", "round");
  svg.appendChild(needle);

  container.appendChild(svg);

  const readout = document.createElement("div");
  readout.className = "cs-gauge-label cs-gauge-label--left";
  readout.textContent = pct.toFixed(2);
  container.appendChild(readout);
}

/* ---------- Main renderer ---------- */
function renderDashboard(apps) {
  const root = document.getElementById("customer-sentiment-dashboard");
  if (!root) return;

  root.innerHTML = `
    <div class="cs-root">
      <div class="cs-header">
        <div>
          <h3>App Ratings &amp; Customer Sentiment</h3>
          <p class="cs-subtitle">iOS &amp; Android ratings with last-week sentiment from app-store comments.</p>
        </div>
        <div class="cs-controls">
          <div class="cs-pill">Window: <strong>Last 7 days</strong></div>
          <div class="cs-pill">
            <span>Sort by</span>
            <select id="cs-sort-select">
              <option value="sentiment">Sentiment score</option>
              <option value="ios">iOS rating</option>
              <option value="android">Android rating</option>
              <option value="name">App name</option>
            </select>
          </div>
        </div>
      </div>

      <section class="cs-card">
        <div class="cs-card-header">
          <h4>App Overview</h4>
          <span>Click a row to view comments &amp; drivers</span>
        </div>
        <div class="cs-table-wrap">
          <table class="cs-table" id="cs-overview-table">
            <thead>
              <tr>
                <th>App</th>
                <th>iOS Rating</th>
                <th>Android Rating</th>
                <th>Customer Sentiment</th>
              </tr>
            </thead>
            <tbody id="cs-table-body"></tbody>
          </table>
        </div>
      </section>

      <section class="cs-card" id="cs-details-card">
        <div id="cs-details-panel" class="cs-details-empty">
          Select an app above to view detailed comments and attributing factors from last week.
        </div>
      </section>
    </div>
  `;

  const state = {
    apps: sortApps(apps, "sentiment"),
    sortKey: "sentiment",
    selectedIndex: null,
  };

  const sortSelect = document.getElementById("cs-sort-select");
  sortSelect.addEventListener("change", () => {
    state.sortKey = sortSelect.value;
    state.apps = sortApps(state.apps, state.sortKey);
    state.selectedIndex = null;
    renderTable(state);
    renderDetails(null);
  });

  function renderTable(localState) {
    const tbody = document.getElementById("cs-table-body");
    tbody.innerHTML = "";
    localState.apps.forEach((app, idx) => {
      const tr = document.createElement("tr");
      if (idx === localState.selectedIndex) tr.classList.add("cs-row-active");

      const nameTd = document.createElement("td");
      nameTd.className = "cs-app-name";
      nameTd.textContent = app.appName || "App";
      tr.appendChild(nameTd);

      const iosTd = document.createElement("td");
      iosTd.appendChild(buildRatingBadge(app.ios));
      tr.appendChild(iosTd);

      const androidTd = document.createElement("td");
      androidTd.appendChild(buildRatingBadge(app.android));
      tr.appendChild(androidTd);

      const sentimentTd = document.createElement("td");
      sentimentTd.appendChild(buildSentimentPill(app.sentiment));
      tr.appendChild(sentimentTd);

      tr.addEventListener("click", () => {
        state.selectedIndex = idx;
        renderTable(state);
        renderDetails(app);
        // Scroll the details card into view on small screens
        document.getElementById("cs-details-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      tbody.appendChild(tr);
    });
  }

  function renderDetails(app) {
    const panel = document.getElementById("cs-details-panel");
    if (!app) {
      panel.className = "cs-details-empty";
      panel.innerHTML =
        "Select an app above to view detailed comments and attributing factors from last week.";
      return;
    }
    panel.className = "cs-details";

    const s = app.sentiment || {};
    const iosDelta = formatDelta(app.ios?.ratingDelta ?? null);
    const androidDelta = formatDelta(app.android?.ratingDelta ?? null);
    const sentimentDeltaObj = formatDelta(s.scoreDelta ?? null);

    const topPositive = s.topPositive || [];
    const topNegative = s.topNegative || [];
    const drivers = s.drivers || [];

    panel.innerHTML = `
      <div class="cs-details-header">
        <div>
          <h4>${app.appName}</h4>
          <p>Ratings &amp; sentiment from app-store reviews (last 7 days).</p>
        </div>
        <div class="cs-chip"><span class="dot"></span><span>Last 7 days</span></div>
      </div>

      <div class="cs-details-top">
        <div class="cs-gauge-wrap" id="cs-gauge"></div>

        <div class="cs-metrics-compact">
          <div class="metric-line">
            <span class="metric-label">iOS rating</span>
            <span class="metric-val">${app.ios?.rating != null ? Number(app.ios.rating).toFixed(2) : "–"}</span>
            <span class="metric-delta ${iosDelta.cls}">${iosDelta.text}</span>
            <span class="metric-sub">App Store</span>
          </div>
          <div class="metric-line">
            <span class="metric-label">Android rating</span>
            <span class="metric-val">${app.android?.rating != null ? Number(app.android.rating).toFixed(2) : "–"}</span>
            <span class="metric-delta ${androidDelta.cls}">${androidDelta.text}</span>
            <span class="metric-sub">Google Play</span>
          </div>
          <div class="metric-line">
            <span class="metric-label">Customer sentiment</span>
            <span class="metric-val">${s.score != null ? Number(s.score).toFixed(2) : "–"}</span>
            <span class="metric-delta ${sentimentDeltaObj.cls}">${sentimentDeltaObj.text}</span>
            <span class="metric-sub">0 = very negative, 1 = very positive</span>
          </div>
        </div>
      </div>

      <div class="cs-columns">
        <div class="list-card">
          <div class="list-block">
            <div class="list-header">
              <strong>Top positive comments</strong>
              <span>Best (last 7 days)</span>
            </div>
            ${
              topPositive.length
                ? `<ul class="comment-list">
                    ${topPositive.map(c => `
                      <li class="comment-item">
                        <div class="comment-text">${c.text || ""}</div>
                        <div class="comment-meta">
                          <span>${c.rating != null ? `★${c.rating}` : "No rating"}</span>
                          <span>${c.platform || ""}</span>
                        </div>
                      </li>`).join("")}
                  </ul>`
                : `<div class="metric-sub">No positive comments in this window.</div>`
            }
          </div>
          <div class="list-block">
            <div class="list-header">
              <strong>Top negative comments</strong>
              <span>Worst (last 7 days)</span>
            </div>
            ${
              topNegative.length
                ? `<ul class="comment-list">
                    ${topNegative.map(c => `
                      <li class="comment-item">
                        <div class="comment-text">${c.text || ""}</div>
                        <div class="comment-meta">
                          <span>${c.rating != null ? `★${c.rating}` : "No rating"}</span>
                          <span>${c.platform || ""}</span>
                        </div>
                      </li>`).join("")}
                  </ul>`
                : `<div class="metric-sub">No negative comments in this window.</div>`
            }
          </div>
        </div>

        <div class="list-card">
          <div class="list-header">
            <strong>Attributing factors</strong>
            <span>Themes from last-week comments</span>
          </div>
          ${
            drivers.length
              ? `<ul class="driver-list">
                  ${drivers.map(d => {
                    const t = (d.trend || "").toLowerCase();
                    let cls = "trend-steady", text = "Steady";
                    if (t === "improving") { cls = "trend-improving"; text = "Improving"; }
                    else if (t === "worsening") { cls = "trend-worsening"; text = "Worsening"; }
                    return `
                      <li class="driver-item">
                        <span class="driver-label">${d.label || ""}</span>
                        <span class="driver-trend ${cls}">${text}</span>
                      </li>`;
                  }).join("")}
                </ul>`
              : `<div class="metric-sub">No drivers available from sentiment engine.</div>`
          }
        </div>
      </div>
    `;

    // draw compact gauge (left)
    renderGauge(document.getElementById("cs-gauge"), s.score ?? 0);
  }

  renderTable(state);
  renderDetails(null);
}

/* ---------- Styles (theme-aware) ---------- */
function injectCustomerSentimentStyles() {
  if (document.getElementById("customer-sentiment-styles")) return;
  const style = document.createElement("style");
  style.id = "customer-sentiment-styles";
  style.textContent = `
    .cs-root, .cs-root * { font-family: var(--qp-font, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); box-sizing: border-box; }

    .cs-header{display:flex;justify-content:space-between;align-items:flex-start;gap:.75rem;margin-bottom:.75rem;font-size:14px;}
    .cs-header h3{margin:0;font-size:1rem;}
    .cs-subtitle{margin:2px 0 0;font-size:.8rem;}
    .cs-controls{display:flex;gap:.5rem;flex-wrap:wrap;font-size:.75rem;}
    .cs-pill{border-radius:999px;padding:4px 10px;display:inline-flex;align-items:center;gap:6px;border-width:1px;border-style:solid;font-size:.75rem;}
    .cs-pill strong{font-weight:600;}
    .cs-pill select{background:transparent;border:none;font-size:.75rem;outline:none;cursor:pointer;}

    .cs-card{border-radius:14px;padding:.75rem;border-width:1px;border-style:solid;box-shadow:0 10px 30px rgba(0,0,0,.22);margin-bottom:.75rem;}
    .cs-card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;}
    .cs-card-header h4{margin:0;font-size:.9rem;}
    .cs-card-header span{font-size:.75rem;}

    .cs-table-wrap{overflow-x:auto;}
    .cs-table{width:100%;border-collapse:collapse;font-size:.75rem;}
    .cs-table th, .cs-table td{padding:6px 6px;border-bottom-width:1px;border-bottom-style:solid;white-space:nowrap;}
    .cs-table th{text-align:left;font-weight:500;}
    .cs-table tbody tr{cursor:pointer;}
    .cs-app-name{font-weight:600;}
    .cs-row-active{outline:2px solid rgba(59,130,246,.5);outline-offset:-2px;border-radius:4px;}

    .cs-badge-rating{display:inline-flex;align-items:center;gap:4px;font-size:.75rem;padding:3px 7px;border-radius:999px;border-width:1px;border-style:solid;}
    .cs-badge-rating .value{font-weight:500;}
    .delta-up{color:#16a34a;} .delta-down{color:#dc2626;} .delta-flat{color:#6b7280;}

    .cs-pill-sentiment{display:inline-flex;align-items:center;gap:4px;padding:3px 7px;font-size:.75rem;border-radius:999px;border-width:1px;border-style:solid;}

    .cs-details-empty{font-size:.8rem;padding:.5rem;}

    .cs-details-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;}
    .cs-details-header h4{margin:0;font-size:.9rem;}
    .cs-details-header p{margin:2px 0 0;font-size:.75rem;}
    .cs-chip{border-radius:999px;padding:3px 8px;font-size:.72rem;display:inline-flex;align-items:center;gap:4px;border-width:1px;border-style:solid;}
    .cs-chip .dot{width:6px;height:6px;border-radius:999px;}

    /* compact top section (gauge left + quick metrics right) */
    .cs-details-top{display:flex;gap:.75rem;align-items:flex-start;margin-bottom:.5rem;}
    .cs-gauge-wrap{margin:.25rem 0 .5rem 0;display:block;max-width:260px;}
    .cs-gauge--compact{width:220px;height:auto;display:block;}
    .cs-gauge-label--left{text-align:left;margin-top:-4px;font-weight:700;font-size:.9rem;}

    .cs-metrics-compact{display:grid;gap:.25rem;align-content:start;}
    .metric-line{display:grid;grid-template-columns:auto auto auto 1fr;gap:.5rem;align-items:baseline;}
    .metric-label{font-size:.8rem;}
    .metric-val{font-weight:600;}
    .metric-delta{font-size:.78rem;}
    .metric-sub{font-size:.7rem;opacity:.8;}

    .cs-columns{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:.5rem;}
    @media(max-width:900px){
      .cs-columns{grid-template-columns:1fr;}
      .cs-gauge--compact{width:200px;}
      .cs-gauge-wrap{max-width:220px;}
      .metric-line{grid-template-columns:auto auto auto;}
    }

    .list-card{border-radius:10px;border-width:1px;border-style:solid;padding:7px 8px;font-size:.75rem;}
    .list-block{margin-bottom:.5rem;}
    .list-header{display:flex;justify-content:space-between;margin-bottom:2px;}
    .list-header span{font-size:.7rem;}
    .comment-list{list-style:none;padding:0;margin:0;max-height:160px;overflow-y:auto;}
    .comment-item{padding:4px 0;border-bottom-width:1px;border-bottom-style:dashed;}
    .comment-text{font-size:.74rem;}
    .comment-meta{margin-top:2px;display:flex;justify-content:space-between;font-size:.68rem;}

    .driver-list{list-style:none;padding:0;margin:0;}
    .driver-item{display:flex;align-items:center;justify-content:space-between;padding:3px 0;font-size:.74rem;}
    .driver-trend{font-size:.7rem;padding:2px 6px;border-radius:999px;border-width:1px;border-style:solid;}

    /* LIGHT */
    body.light-mode .cs-header h3{color:#111827;} body.light-mode .cs-subtitle{color:#4b5563;}
    body.light-mode .cs-pill{border-color:#e5e7eb;background:#f9fafb;color:#4b5563;}
    body.light-mode .cs-pill strong{color:#111827;} body.light-mode .cs-pill select{color:#2563eb;}
    body.light-mode .cs-card{background:#ffffff;border-color:#e5e7eb;box-shadow:0 10px 30px rgba(15,23,42,.06);}
    body.light-mode .cs-card-header h4{color:#111827;} body.light-mode .cs-card-header span{color:#6b7280;}
    body.light-mode .cs-table th{background:#f9fafb;color:#4b5563;border-color:#e5e7eb;}
    body.light-mode .cs-table td{color:#111827;border-color:#e5e7eb;}
    body.light-mode .cs-table tbody tr:hover{background:#f3f4f6;}
    body.light-mode .cs-badge-rating{background:#f9fafb;border-color:#e5e7eb;color:#111827;}
    body.light-mode .cs-pill-sentiment{border-color:#e5e7eb;}
    body.light-mode .sent-good{background:#ecfdf5;color:#166534;border-color:#a7f3d0;}
    body.light-mode .sent-bad{background:#fef2f2;color:#991b1b;border-color:#fecaca;}
    body.light-mode .sent-neutral{background:#fffbeb;color:#92400e;border-color:#fde68a;}
    body.light-mode .cs-details-empty{color:#6b7280;}
    body.light-mode .cs-details-header h4{color:#111827;} body.light-mode .cs-details-header p{color:#6b7280;}
    body.light-mode .cs-chip{border-color:#e5e7eb;background:#f9fafb;color:#4b5563;}
    body.light-mode .cs-chip .dot{background:#22c55e;}
    body.light-mode .list-card{border-color:#e5e7eb;background:#ffffff;}
    body.light-mode .comment-item{border-bottom-color:#e5e7eb;}
    body.light-mode .comment-text{color:#111827;} body.light-mode .comment-meta{color:#6b7280;}
    body.light-mode .driver-label{color:#111827;}
    body.light-mode .trend-improving{background:#ecfdf5;color:#166534;border-color:#a7f3d0;}
    body.light-mode .trend-worsening{background:#fef2f2;color:#991b1b;border-color:#fecaca;}
    body.light-mode .trend-steady{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe;}

    /* DARK */
    body:not(.light-mode) .cs-header h3{color:#e5e5e5;} body:not(.light-mode) .cs-subtitle{color:#9ca3af;}
    body:not(.light-mode) .cs-pill{border-color:#374151;background:#111827;color:#e5e7eb;}
    body:not(.light-mode) .cs-pill strong{color:#f9fafb;} body:not(.light-mode) .cs-pill select{color:#93c5fd;}
    body:not(.light-mode) .cs-card{background:#020617;border-color:#1f2937;box-shadow:0 10px 30px rgba(0,0,0,.7);}
    body:not(.light-mode) .cs-card-header h4{color:#e5e5e5;} body:not(.light-mode) .cs-card-header span{color:#9ca3af;}
    body:not(.light-mode) .cs-table th{background:#020617;color:#9ca3af;border-color:#1f2937;}
    body:not(.light-mode) .cs-table td{color:#e5e5e5;border-color:#1f2937;}
    body:not(.light-mode) .cs-table tbody tr:hover{background:#111827;}
    body:not(.light-mode) .cs-badge-rating{background:#020617;border-color:#1f2937;color:#e5e7eb;}
    body:not(.light-mode) .cs-pill-sentiment{border-color:#1f2937;}
    body:not(.light-mode) .sent-good{background:#022c22;color:#6ee7b7;border-color:#0f766e;}
    body:not(.light-mode) .sent-bad{background:#450a0a;color:#fecaca;border-color:#b91c1c;}
    body:not(.light-mode) .sent-neutral{background:#78350f;color:#fed7aa;border-color:#f97316;}
    body:not(.light-mode) .cs-details-empty{color:#9ca3af;}
    body:not(.light-mode) .cs-details-header h4{color:#f9fafb;} body:not(.light-mode) .cs-details-header p{color:#9ca3af;}
    body:not(.light-mode) .cs-chip{border-color:#1f2937;background:#020617;color:#e5e7eb;}
    body:not(.light-mode) .cs-chip .dot{background:#22c55e;}
    body:not(.light-mode) .list-card{border-color:#1f2937;background:#020617;}
    body:not(.light-mode) .comment-item{border-bottom-color:#1f2937;}
    body:not(.light-mode) .comment-text{color:#e5e5e5;} body:not(.light-mode) .comment-meta{color:#9ca3af;}
    body:not(.light-mode) .driver-label{color:#e5e5e5;}
    body:not(.light-mode) .trend-improving{background:#052e16;color:#bbf7d0;border-color:#16a34a;}
    body:not(.light-mode) .trend-worsening{background:#450a0a;color:#fecaca;border-color:#ef4444;}
    body:not(.light-mode) .trend-steady{background:#020617;color:#93c5fd;border-color:#1d4ed8;}
  `;
  document.head.appendChild(style);
}

document.addEventListener("DOMContentLoaded", async () => {
  injectCustomerSentimentStyles();
  const apps = await loadAppMetrics();
  renderDashboard(apps);
});
