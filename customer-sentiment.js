// customer-sentiment.js
// Top table (App / iOS / Android / Sentiment) + details below with 0–1 speedometer.
// Fully self-contained: fetches app-metrics.json, injects styles, renders into #customer-sentiment-dashboard

const METRICS_URL = "app-metrics.json"; // static JSON file served by Vercel

// --- helpers ---------------------------------------------------------------
function classifySentiment(score) {
  if (score == null) return "neutral";
  if (score >= 0.75) return "good";
  if (score <= 0.45) return "bad";
  return "neutral";
}
function formatDelta(delta) {
  if (delta == null || isNaN(delta)) {
    return { text: "±0.00", cls: "cs-delta-flat" };
  }
  const sign = delta > 0 ? "+" : delta < 0 ? "" : "±";
  const cls = delta > 0 ? "cs-delta-up" : delta < 0 ? "cs-delta-down" : "cs-delta-flat";
  return { text: sign + delta.toFixed(2), cls };
}
async function loadAppMetrics() {
  try {
    const resp = await fetch(METRICS_URL + "?v=1", { cache: "no-store" });
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
  const el = document.createElement("span");
  el.className = "cs-badge-rating";
  const star = document.createElement("span"); star.textContent = "★";
  const v = document.createElement("span"); v.className = "value";
  v.textContent = r && r.rating != null ? r.rating.toFixed(2) : "–";
  el.appendChild(star); el.appendChild(v);
  if (r && r.ratingDelta != null) {
    const d = formatDelta(r.ratingDelta);
    const delta = document.createElement("span");
    delta.className = "delta " + d.cls;
    delta.textContent = d.text;
    el.appendChild(delta);
  }
  return el;
}
function buildSentimentPill(sentiment) {
  const score = sentiment?.score ?? null;
  const delta = sentiment?.scoreDelta ?? null;
  const bucket = classifySentiment(score);
  const d = formatDelta(delta);
  const pill = document.createElement("span");
  pill.className = "cs-pill-sent " + (bucket === "good" ? "good" : bucket === "bad" ? "bad" : "neutral");
  const s = document.createElement("span"); s.textContent = score == null ? "–" : score.toFixed(2);
  const lbl = document.createElement("span");
  lbl.textContent = bucket === "good" ? "Positive" : bucket === "bad" ? "Negative" : "Mixed";
  const ds = document.createElement("span"); ds.className = d.cls; ds.textContent = d.text;
  pill.appendChild(s); pill.appendChild(lbl); pill.appendChild(ds);
  return pill;
}

// --- speedometer -----------------------------------------------------------
function renderGauge(container, score) {
  container.innerHTML = "";
  const pct = Math.max(0, Math.min(1, Number(score ?? 0)));
  const svgNS = "http://www.w3.org/2000/svg";
  const W = 360, H = 200, cx = 180, cy = 180, r = 160, len = 120;

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 360 200"); svg.classList.add("cs-gauge");

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
  bg.setAttribute("d", `M20,${cy} A${r},${r} 0 0 1 340,${cy}`);
  bg.setAttribute("stroke", "rgba(148,163,184,.28)");
  bg.setAttribute("stroke-width", "18");
  bg.setAttribute("fill", "none");
  svg.appendChild(bg);

  const arc = document.createElementNS(svgNS, "path");
  arc.setAttribute("id","csArc");
  arc.setAttribute("d", `M20,${cy} A${r},${r} 0 0 1 340,${cy}`);
  arc.setAttribute("stroke", "url(#cs-ggrad)");
  arc.setAttribute("stroke-width", "18");
  arc.setAttribute("stroke-linecap","round");
  arc.setAttribute("fill", "none");
  const circumference = 503;
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
  needle.setAttribute("stroke-width", "4");
  needle.setAttribute("stroke-linecap", "round");
  svg.appendChild(needle);

  container.appendChild(svg);

  const readout = document.createElement("div");
  readout.className = "cs-gauge-label";
  readout.textContent = (pct).toFixed(2);
  container.appendChild(readout);
}

// --- main renderer ----------------------------------------------------------
function renderDashboard(apps) {
  const root = document.getElementById("customer-sentiment-dashboard");
  if (!root) return;

  root.innerHTML = `
    <div class="cs-root">
      <div class="cs-header">
        <div>
          <h3>App Ratings & Customer Sentiment</h3>
          <p class="cs-subtitle">iOS & Android ratings with last-week sentiment from app-store comments.</p>
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

      <!-- Top: full-width table -->
      <section class="cs-card">
        <div class="cs-card-header">
          <h4>App Overview</h4>
          <span>Click a row to view details</span>
        </div>
        <div class="cs-table-wrap cs-table-max">
          <table class="cs-table">
            <thead>
              <tr>
                <th style="min-width:220px">App</th>
                <th style="min-width:140px">iOS Rating</th>
                <th style="min-width:150px">Android Rating</th>
                <th style="min-width:220px">Customer Sentiment</th>
              </tr>
            </thead>
            <tbody id="cs-table-body"></tbody>
          </table>
        </div>
      </section>

      <!-- Bottom: details for selected app -->
      <section class="cs-card">
        <div id="cs-details-panel" class="cs-details-empty">
          Select an app above to view customer sentiment (speedometer), top & worst comments, and attributing factors.
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
    renderTable();
    renderDetails(null);
  });

  function renderTable() {
    const tbody = document.getElementById("cs-table-body");
    tbody.innerHTML = "";
    state.apps.forEach((app, idx) => {
      const tr = document.createElement("tr");
      tr.className = idx === state.selectedIndex ? "cs-row-active" : "";

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
        renderTable();
        renderDetails(app);
        // Smooth scroll to details block on small screens
        document.getElementById("cs-details-panel").scrollIntoView({ behavior: "smooth", block: "start" });
      });

      tbody.appendChild(tr);
    });
  }

  function renderDetails(app) {
    const panel = document.getElementById("cs-details-panel");
    if (!app) {
      panel.className = "cs-details-empty";
      panel.innerHTML = "Select an app above to view detailed comments and attributing factors from last week.";
      return;
    }
    panel.className = "cs-details";

    const sentimentScore = app.sentiment?.score ?? null;
    const sentimentDelta = app.sentiment?.scoreDelta ?? null;
    const sentimentDeltaObj = formatDelta(sentimentDelta);
    const iosDelta = formatDelta(app.ios?.ratingDelta ?? null);
    const androidDelta = formatDelta(app.android?.ratingDelta ?? null);
    const topPositive = app.sentiment?.topPositive || [];
    const topNegative = app.sentiment?.topNegative || [];
    const drivers = app.sentiment?.drivers || [];

    panel.innerHTML = `
      <div class="cs-details-header">
        <div>
          <h4>${app.appName}</h4>
          <p>Ratings & sentiment from app-store reviews (last 7 days).</p>
        </div>
        <div class="cs-chip"><span class="dot"></span><span>Last 7 days</span></div>
      </div>

      <div class="cs-metrics-row">
        <div class="metric-card">
          <div class="metric-label">iOS rating</div>
          <div class="metric-value">
            <span>${app.ios?.rating != null ? app.ios.rating.toFixed(2) : "–"}</span>
            <span class="${iosDelta.cls}">${iosDelta.text}</span>
          </div>
          <div class="metric-sub">App Store</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Android rating</div>
          <div class="metric-value">
            <span>${app.android?.rating != null ? app.android.rating.toFixed(2) : "–"}</span>
            <span class="${androidDelta.cls}">${androidDelta.text}</span>
          </div>
          <div class="metric-sub">Google Play</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Customer sentiment</div>
          <div class="metric-value">
            <span>${sentimentScore != null ? sentimentScore.toFixed(2) : "–"}</span>
            <span class="${sentimentDeltaObj.cls}">${sentimentDeltaObj.text}</span>
          </div>
          <div class="metric-sub">0 = very negative, 1 = very positive</div>
        </div>
      </div>

      <div class="cs-gauge-wrap">
        <div class="cs-gauge-title">Customer sentiment (0–1)</div>
        <div id="csGauge"></div>
      </div>

      <div class="cs-columns">
        <div class="list-card">
          <div class="list-block">
            <div class="list-header"><strong>Top positive comments</strong><span>Best (last 7 days)</span></div>
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
            <div class="list-header"><strong>Top negative comments</strong><span>Worst (last 7 days)</span></div>
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
          <div class="list-header"><strong>Attributing factors</strong><span>Themes from last-week comments</span></div>
          ${
            drivers.length
              ? `<ul class="driver-list">
                  ${drivers.map(d => {
                    const t = (d.trend || "").toLowerCase();
                    let cls = "trend-steady", text = "Steady";
                    if (t === "improving") { cls = "trend-improving"; text = "Improving"; }
                    else if (t === "worsening") { cls = "trend-worsening"; text = "Worsening"; }
                    return `<li class="driver-item"><span class="driver-label">${d.label || ""}</span><span class="driver-trend ${cls}">${text}</span></li>`;
                  }).join("")}
                </ul>`
              : `<div class="metric-sub">No drivers available from sentiment engine.</div>`
          }
        </div>
      </div>
    `;

    // draw gauge
    const gaugeHost = document.getElementById("csGauge");
    renderGauge(gaugeHost, sentimentScore);
  }

  renderTable();
  renderDetails(null);
}

// --- styles (scoped, responsive, no overflow) ------------------------------
function injectCustomerSentimentStyles() {
  if (document.getElementById("customer-sentiment-styles")) return;
  const style = document.createElement("style");
  style.id = "customer-sentiment-styles";
  style.textContent = `
    .cs-root,*[class^="cs-"],*[class*=" cs-"]{box-sizing:border-box;font-family:var(--qp-font, Inter, system-ui, -apple-system,'Segoe UI',sans-serif)}
    .cs-header{display:flex;justify-content:space-between;align-items:flex-start;gap:.75rem;margin-bottom:.75rem;font-size:14px}
    .cs-header h3{margin:0;font-size:1rem}
    .cs-subtitle{margin:2px 0 0;font-size:.8rem}
    .cs-controls{display:flex;gap:.5rem;flex-wrap:wrap;font-size:.75rem}
    .cs-pill{border-radius:999px;padding:4px 10px;display:inline-flex;align-items:center;gap:6px;border-width:1px;border-style:solid;font-size:.75rem}
    .cs-pill strong{font-weight:600}
    .cs-pill select{background:transparent;border:none;font-size:.75rem;outline:none;cursor:pointer}

    .cs-card{border-radius:14px;padding:.75rem;border-width:1px;border-style:solid;box-shadow:0 10px 30px rgba(0,0,0,.22);margin-bottom:.75rem}
    .cs-card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem}
    .cs-card-header h4{margin:0;font-size:.9rem}
    .cs-card-header span{font-size:.75rem}

    .cs-table-wrap{overflow-x:auto}
    .cs-table-max{max-height:420px;overflow:auto}
    .cs-table{width:100%;border-collapse:collapse;font-size:.85rem}
    .cs-table th,.cs-table td{padding:8px 10px;border-bottom-width:1px;border-bottom-style:solid;white-space:nowrap}
    .cs-table th{text-align:left;font-weight:600}
    .cs-table tbody tr{cursor:pointer}
    .cs-app-name{font-weight:600}

    .cs-badge-rating{display:inline-flex;align-items:center;gap:6px;font-size:.82rem;padding:4px 9px;border-radius:999px;border-width:1px;border-style:solid}
    .cs-badge-rating .value{font-weight:600}
    .cs-delta-up{color:#16a34a}.cs-delta-down{color:#dc2626}.cs-delta-flat{color:#6b7280}

    .cs-pill-sent{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;font-size:.82rem;border-radius:999px;border-width:1px;border-style:solid}
    .cs-pill-sent.good{background:rgba(16,185,129,.12);color:#10b981;border-color:rgba(16,185,129,.35)}
    .cs-pill-sent.bad{background:rgba(239,68,68,.10);color:#ef4444;border-color:rgba(239,68,68,.35)}
    .cs-pill-sent.neutral{background:rgba(234,179,8,.12);color:#eab308;border-color:rgba(234,179,8,.35)}

    .cs-details-empty{font-size:.85rem;padding:.5rem}
    .cs-details-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem}
    .cs-details-header h4{margin:0;font-size:.95rem}
    .cs-details-header p{margin:2px 0 0;font-size:.78rem}
    .cs-chip{border-radius:999px;padding:3px 8px;font-size:.72rem;display:inline-flex;align-items:center;gap:4px;border-width:1px;border-style:solid}
    .cs-chip .dot{width:6px;height:6px;border-radius:999px}

    .cs-metrics-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.5rem;margin-bottom:.65rem;font-size:.8rem}
    @media(max-width:800px){.cs-metrics-row{grid-template-columns:1fr}}

    .metric-card{border-radius:10px;padding:8px;border-width:1px;border-style:solid}
    .metric-label{margin-bottom:3px}
    .metric-value{display:flex;align-items:baseline;gap:6px;font-size:.95rem;font-weight:600}
    .metric-sub{margin-top:2px;font-size:.72rem}

    .cs-gauge-wrap{margin:.4rem 0 0.8rem 0}
    .cs-gauge-title{font-size:.8rem;margin-bottom:.25rem;color:inherit;opacity:.8}
    .cs-gauge{width:100%;height:auto;display:block}
    .cs-gauge-label{text-align:center;margin-top:-4px;font-weight:700;font-size:1rem}

    .cs-columns{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:.6rem}
    @media(max-width:900px){.cs-columns{grid-template-columns:1fr}}

    .list-card{border-radius:10px;border-width:1px;border-style:solid;padding:8px;font-size:.82rem}
    .list-block{margin-bottom:.55rem}
    .list-header{display:flex;justify-content:space-between;margin-bottom:2px}
    .list-header span{font-size:.72rem;opacity:.9}
    .comment-list{list-style:none;padding:0;margin:0;max-height:220px;overflow:auto}
    .comment-item{padding:5px 0;border-bottom-width:1px;border-bottom-style:dashed}
    .comment-text{font-size:.82rem;line-height:1.25}
    .comment-meta{margin-top:2px;display:flex;justify-content:space-between;font-size:.7rem;opacity:.8}

    .driver-list{list-style:none;padding:0;margin:0}
    .driver-item{display:flex;align-items:center;justify-content:space-between;padding:4px 0;font-size:.84rem}
    .driver-trend{font-size:.72rem;padding:2px 6px;border-radius:999px;border-width:1px;border-style:solid}
    .trend-improving{background:#ecfdf5;color:#166534;border-color:#a7f3d0}
    .trend-worsening{background:#fef2f2;color:#991b1b;border-color:#fecaca}
    .trend-steady{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}

    /* LIGHT / DARK palette sync with your page */
    body.light-mode .cs-card{background:#fff;border-color:#e5e7eb;box-shadow:0 10px 30px rgba(15,23,42,.06)}
    body.light-mode .cs-table th{background:#f9fafb;color:#4b5563;border-color:#e5e7eb}
    body.light-mode .cs-table td{color:#111827;border-color:#e5e7eb}
    body.light-mode .comment-item{border-bottom-color:#e5e7eb}
    body.light-mode .cs-badge-rating{background:#f9fafb;border-color:#e5e7eb;color:#111827}
    body.light-mode .cs-pill{border-color:#e5e7eb;background:#f9fafb;color:#4b5563}
    body.light-mode .cs-chip{border-color:#e5e7eb;background:#f9fafb;color:#4b5563}
    body.light-mode .cs-gauge-label{color:#111827}

    body:not(.light-mode) .cs-card{background:#020617;border-color:#1f2937;box-shadow:0 10px 30px rgba(0,0,0,.7)}
    body:not(.light-mode) .cs-table th{background:#020617;color:#9ca3af;border-color:#1f2937}
    body:not(.light-mode) .cs-table td{color:#e5e5e5;border-color:#1f2937}
    body:not(.light-mode) .comment-item{border-bottom-color:#1f2937}
    body:not(.light-mode) .cs-badge-rating{background:#020617;border-color:#1f2937;color:#e5e7eb}
    body:not(.light-mode) .cs-pill{border-color:#374151;background:#111827;color:#e5e7eb}
    body:not(.light-mode) .cs-chip{border-color:#1f2937;background:#020617;color:#e5e7eb}
    body:not(.light-mode) .cs-gauge-label{color:#e5e5e5}
  `;
  document.head.appendChild(style);
}

// --- boot -------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  injectCustomerSentimentStyles();
  const apps = await loadAppMetrics();
  renderDashboard(apps);
});
