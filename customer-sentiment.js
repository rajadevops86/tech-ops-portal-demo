// Compact 0–1 speedometer (left-aligned)
function renderGauge(container, score) {
  container.innerHTML = "";
  const pct = Math.max(0, Math.min(1, Number(score ?? 0)));

  const svgNS = "http://www.w3.org/2000/svg";
  const W = 260, H = 140;      // smaller canvas
  const cx = 130, cy = 130;    // center near bottom
  const r  = 115;              // smaller radius
  const len = 90;              // shorter needle
  const circumference = Math.PI * r; // half-circle length

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
  arc.setAttribute("stroke-linecap","round");
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
