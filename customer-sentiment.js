// customer-sentiment.js
// Dashboard for: App Name, iOS Rating, Android Rating, Customer Sentiment (last 7 days)

const METRICS_URL = "app-metrics.json"; // static JSON file served by Vercel

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
  return { text: sign + delta.toFixed(2), cls };
}

async function loadAppMetrics() {
  try {
    const resp = await fetch(METRICS_URL + "?v=1", { cache: "no-store" });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const json = await resp.json();

    // Case 1: top-level array
    if (Array.isArray(json)) {
      return json;
    }

    // Case 2: { generated_utc, apps: [...] }  ← your current structure
    if (json && Array.isArray(json.apps)) {
      return json.apps;
    }

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
    // sentiment
    arr.sort((a, b) => (b.sentiment?.score || 0) - (a.sentiment?.score || 0));
  }
  return arr;
}

function buildRatingBadge(ratingObj) {
  const container = document.createElement("span");
  container.className = "cs-badge-rating";

  const star = document.createElement("span");
  star.textContent = "★";

  const value = document.createElement("span");
  value.className = "value";
  value.textContent =
    ratingObj && ratingObj.rating != null
      ? ratingObj.rating.toFixed(2)
      : "–";

  container.appendChild(star);
  container.appendChild(value);

  if (ratingObj && ratingObj.ratingDelta != null) {
    const d = formatDelta(ratingObj.ratingDelta);
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
    (bucket === "good"
      ? "sent-good"
      : bucket === "bad"
      ? "sent-bad"
      : "sent-neutral");

  const scoreSpan = document.createElement("span");
  scoreSpan.textContent = score == null ? "–" : score.toFixed(2);

  const labelSpan = document.createElement("span");
  labelSpan.textContent =
    bucket === "good" ? "Positive" : bucket === "bad" ? "Negative" : "Mixed";

  const deltaSpan = document.createElement("span");
  deltaSpan.className = d.cls;
  deltaSpan.textContent = d.text;

  pill.appendChild(scoreSpan);
  pill.appendChild(labelSpan);
  pill.appendChild(deltaSpan);
  return pill;
}

function renderDashboard(apps) {
  const root = document.getElementById("customer-sentiment-dashboard");
  if (!root) return;

  root.innerHTML = `
    <div class="cs-header">
      <div>
        <h3>App Ratings & Customer Sentiment</h3>
        <p class="cs-subtitle">
          iOS & Android ratings with last-week sentiment from app-store comments.
        </p>
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
    <div class="cs-layout">
      <section class="cs-card">
        <div class="cs-card-header">
          <h4>App Overview</h4>
          <span>Click a row to view comments & drivers</span>
        </div>
        <div class="cs-table-wrap">
          <table class="cs-table">
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
      <section class="cs-card">
        <div id="cs-details-panel" class="cs-details-empty">
          Select an app on the left to view detailed comments and attributing factors.
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
      if (idx === localState.selectedIndex) {
        tr.classList.add("cs-row-active");
      }

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
      });

      tbody.appendChild(tr);
    });
  }

  function renderDetails(app) {
    const panel = document.getElementById("cs-details-panel");
    if (!app) {
      panel.className = "cs-details-empty";
      panel.innerHTML =
        "Select an app on the left to view detailed comments and attributing factors from last week.";
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
        <div class="cs-chip">
          <span class="dot"></span>
          <span>Last 7 days</span>
        </div>
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
                    ${topPositive
                      .map(
                        (c) => `
                      <li class="comment-item">
                        <div class="comment-text">${c.text || ""}</div>
                        <div class="comment-meta">
                          <span>${c.rating != null ? `★${c.rating}` : "No rating"}</span>
                          <span>${c.platform || ""}</span>
                        </div>
                      </li>
                    `
                      )
                      .join("")}
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
                    ${topNegative
                      .map(
                        (c) => `
                      <li class="comment-item">
                        <div class="comment-text">${c.text || ""}</div>
                        <div class="comment-meta">
                          <span>${c.rating != null ? `★${c.rating}` : "No rating"}</span>
                          <span>${c.platform || ""}</span>
                        </div>
                      </li>
                    `
                      )
                      .join("")}
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
                  ${drivers
                    .map((d) => {
                      const t = (d.trend || "").toLowerCase();
                      let cls = "trend-steady";
                      let text = "Steady";
                      if (t === "improving") {
                        cls = "trend-improving";
                        text = "Improving";
                      } else if (t === "worsening") {
                        cls = "trend-worsening";
                        text = "Worsening";
                      }
                      return `
                        <li class="driver-item">
                          <span class="driver-label">${d.label || ""}</span>
                          <span class="driver-trend ${cls}">${text}</span>
                        </li>
                      `;
                    })
                    .join("")}
                </ul>`
              : `<div class="metric-sub">No drivers available from sentiment engine.</div>`
          }
        </div>
      </div>
    `;
  }

  renderTable(state);
  renderDetails(null);
}

// inject light-theme styles
function injectCustomerSentimentStyles() {
  if (document.getElementById("customer-sentiment-styles")) return;
  const style = document.createElement("style");
  style.id = "customer-sentiment-styles";
  style.textContent = `
    .cs-header {
      display:flex;justify-content:space-between;align-items:flex-start;
      gap:.75rem;margin-bottom:.75rem;font-size:14px;
    }
    .cs-header h3{margin:0;font-size:1rem;color:#111827;}
    .cs-subtitle{margin:2px 0 0;font-size:.8rem;color:#4b5563;}
    .cs-controls{display:flex;gap:.5rem;flex-wrap:wrap;font-size:.75rem;}
    .cs-pill{
      border-radius:999px;
      padding:4px 10px;
      border:1px solid #e5e7eb;
      background:#f9fafb;
      color:#4b5563;
      display:inline-flex;
      align-items:center;
      gap:6px;
    }
    .cs-pill strong{color:#111827;}
    .cs-pill select{
      background:transparent;
      border:none;
      color:#2563eb;
      font-size:.75rem;
      outline:none;
    }

    .cs-layout{
      display:grid;
      grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);
      gap:.75rem;
    }
    @media(max-width:900px){.cs-layout{grid-template-columns:1fr;}}

    .cs-card{
      background:#ffffff;
      border-radius:14px;
      border:1px solid #e5e7eb;
      padding:.75rem;
      box-shadow:0 10px 30px rgba(15,23,42,.06);
    }
    .cs-card-header{
      display:flex;
      justify-content:space-between;
      align-items:center;
      margin-bottom:.5rem;
    }
    .cs-card-header h4{
      margin:0;
      font-size:.9rem;
      color:#111827;
    }
    .cs-card-header span{
      font-size:.75rem;
      color:#6b7280;
    }

    .cs-table-wrap{overflow-x:auto;}
    .cs-table{
      width:100%;
      border-collapse:collapse;
      font-size:.75rem;
    }
    .cs-table th,.cs-table td{
      padding:6px 6px;
      border-bottom:1px solid #e5e7eb;
      white-space:nowrap;
    }
    .cs-table th{
      text-align:left;
      color:#4b5563;
      font-weight:500;
      background:#f9fafb;
    }
    .cs-table tbody tr{cursor:pointer;}
    .cs-table tbody tr:hover{background:#f3f4f6;}
    .cs-row-active{background:#e5f2ff;}
    .cs-app-name{font-weight:600;color:#111827;}

    .cs-badge-rating{
      display:inline-flex;
      align-items:center;
      gap:4px;
      font-size:.75rem;
      padding:3px 7px;
      border-radius:999px;
      background:#f9fafb;
      border:1px solid #e5e7eb;
      color:#111827;
    }
    .cs-badge-rating .value{font-weight:500;}
    .delta-up{color:#16a34a;}
    .delta-down{color:#dc2626;}
    .delta-flat{color:#6b7280;}

    .cs-pill-sentiment{
      display:inline-flex;
      align-items:center;
      gap:4px;
      padding:3px 7px;
      font-size:.75rem;
      border-radius:999px;
      border:1px solid #e5e7eb;
    }
    .sent-good{
      background:#ecfdf5;
      color:#166534;
      border-color:#a7f3d0;
    }
    .sent-bad{
      background:#fef2f2;
      color:#991b1b;
      border-color:#fecaca;
    }
    .sent-neutral{
      background:#fffbeb;
      color:#92400e;
      border-color:#fde68a;
    }

    .cs-details-empty{
      font-size:.8rem;
      color:#6b7280;
      padding:.5rem;
    }

    .cs-details-header{
      display:flex;
      justify-content:space-between;
      align-items:center;
      margin-bottom:.5rem;
    }
    .cs-details-header h4{
      margin:0;
      font-size:.9rem;
      color:#111827;
    }
    .cs-details-header p{
      margin:2px 0 0;
      font-size:.75rem;
      color:#6b7280;
    }

    .cs-chip{
      border-radius:999px;
      border:1px solid #e5e7eb;
      padding:3px 8px;
      font-size:.72rem;
      display:inline-flex;
      align-items:center;
      gap:4px;
      background:#f9fafb;
      color:#4b5563;
    }
    .cs-chip .dot{
      width:6px;height:6px;border-radius:999px;
      background:#22c55e;
    }

    .cs-metrics-row{
      display:grid;
      grid-template-columns:repeat(3,minmax(0,1fr));
      gap:.5rem;
      margin-bottom:.5rem;
      font-size:.75rem;
    }
    @media(max-width:800px){.cs-metrics-row{grid-template-columns:1fr;}}

    .metric-card{
      border-radius:10px;
      padding:8px;
      border:1px solid #e5e7eb;
      background:#f9fafb;
    }
    .metric-label{color:#6b7280;margin-bottom:3px;}
    .metric-value{
      display:flex;
      align-items:baseline;
      gap:6px;
      font-size:.9rem;
      font-weight:500;
      color:#111827;
    }
    .metric-sub{
      margin-top:2px;
      font-size:.7rem;
      color:#6b7280;
    }

    .cs-columns{
      display:grid;
      grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);
      gap:.5rem;
    }
    @media(max-width:800px){.cs-columns{grid-template-columns:1fr;}}

    .list-card{
      border-radius:10px;
      border:1px solid #e5e7eb;
      background:#ffffff;
      padding:7px 8px;
      font-size:.75rem;
    }
    .list-block{margin-bottom:.5rem;}
    .list-header{
      display:flex;
      justify-content:space-between;
      margin-bottom:2px;
    }
    .list-header strong{color:#111827;}
    .list-header span{font-size:.7rem;color:#6b7280;}

    .comment-list{
      list-style:none;
      padding:0;
      margin:0;
      max-height:140px;
      overflow-y:auto;
    }
    .comment-item{
      padding:4px 0;
      border-bottom:1px dashed #e5e7eb;
    }
    .comment-text{font-size:.74rem;color:#111827;}
    .comment-meta{
      margin-top:2px;
      display:flex;
      justify-content:space-between;
      font-size:.68rem;
      color:#6b7280;
    }

    .driver-list{list-style:none;padding:0;margin:0;}
    .driver-item{
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding:3px 0;
      font-size:.74rem;
    }
    .driver-label{color:#111827;}
    .driver-trend{
      font-size:.7rem;
      padding:2px 6px;
      border-radius:999px;
    }
    .trend-improving{
      background:#ecfdf5;
      color:#166534;
      border:1px solid #a7f3d0;
    }
    .trend-worsening{
      background:#fef2f2;
      color:#991b1b;
      border:1px solid #fecaca;
    }
    .trend-steady{
      background:#eff6ff;
      color:#1d4ed8;
      border:1px solid #bfdbfe;
    }
  `;
  document.head.appendChild(style);
}

document.addEventListener("DOMContentLoaded", async () => {
  injectCustomerSentimentStyles();
  const apps = await loadAppMetrics();
  renderDashboard(apps);
});
