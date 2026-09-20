(() => {
  "use strict";

  // ---------------------------------------------------------------
  // Background neural-network canvas
  // ---------------------------------------------------------------
  const canvas = document.getElementById("bg-canvas");
  const ctx = canvas.getContext("2d");
  let particles = [];
  let mouse = { x: -9999, y: -9999 };

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const count = Math.min(90, Math.floor((canvas.width * canvas.height) / 22000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
    }));
  }

  function tickCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    }
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 140) {
          ctx.strokeStyle = `rgba(0,240,255,${0.12 * (1 - dist / 140)})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    for (const p of particles) {
      const dx = mouse.x - p.x, dy = mouse.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 160) {
        ctx.strokeStyle = `rgba(255,47,208,${0.18 * (1 - dist / 160)})`;
        ctx.beginPath(); ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      ctx.fillStyle = "rgba(0,240,255,0.55)";
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(tickCanvas);
  }

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
    const glow = document.getElementById("cursor-glow");
    glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%,-50%)`;
  });
  resizeCanvas();
  tickCanvas();

  // ---------------------------------------------------------------
  // Upload flow
  // ---------------------------------------------------------------
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const statusPanel = document.getElementById("status-panel");
  const statusLine = document.getElementById("status-line");
  const progressFill = document.getElementById("progress-fill");
  const statusPct = document.getElementById("status-pct");
  const errorPanel = document.getElementById("error-panel");
  const errorText = document.getElementById("error-text");
  const errorRetry = document.getElementById("error-retry");

  const STATUS_MESSAGES = [
    "ESTABLISHING UPLINK...",
    "SCANNING DOCUMENT STRUCTURE...",
    "EXTRACTING VECTOR GEOMETRY...",
    "DECODING TYPOGRAPHY MATRIX...",
    "RECONSTRUCTING ASSETS...",
    "CALIBRATING HOLOGRAM...",
  ];
  let statusTimer = null;

  function cycleStatus() {
    let i = 0;
    statusLine.textContent = STATUS_MESSAGES[0];
    statusTimer = setInterval(() => {
      i = (i + 1) % STATUS_MESSAGES.length;
      statusLine.textContent = STATUS_MESSAGES[i];
    }, 900);
  }

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("drag-over"); })
  );
  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleFile(file);
  });
  errorRetry.addEventListener("click", () => {
    errorPanel.classList.add("hidden");
    dropzone.classList.remove("hidden");
  });

  function handleFile(file) {
    if (!file.name.toLowerCase().endsWith(".pptx")) {
      showError("Unsupported file type. Please provide a .pptx file.");
      return;
    }
    errorPanel.classList.add("hidden");
    dropzone.classList.add("hidden");
    statusPanel.classList.remove("hidden");
    progressFill.style.width = "4%";
    statusPct.textContent = "0%";
    cycleStatus();

    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/parse");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.min(95, Math.round((e.loaded / e.total) * 95));
        progressFill.style.width = pct + "%";
        statusPct.textContent = pct + "%";
      }
    };
    xhr.onload = () => {
      clearInterval(statusTimer);
      if (xhr.status >= 200 && xhr.status < 300) {
        progressFill.style.width = "100%";
        statusPct.textContent = "100%";
        statusLine.textContent = "SYNTHESIS COMPLETE.";
        let data;
        try { data = JSON.parse(xhr.responseText); }
        catch (err) { showError("Malformed response from server."); return; }
        setTimeout(() => bootPresentation(data), 400);
      } else {
        let msg = "Upload failed.";
        try { msg = JSON.parse(xhr.responseText).detail || msg; } catch (_) {}
        showError(msg);
      }
    };
    xhr.onerror = () => { clearInterval(statusTimer); showError("Network error while uploading."); };
    xhr.send(form);
  }

  function showError(msg) {
    clearInterval(statusTimer);
    statusPanel.classList.add("hidden");
    dropzone.classList.add("hidden");
    errorText.textContent = msg;
    errorPanel.classList.remove("hidden");
  }

  // ---------------------------------------------------------------
  // Presentation rendering
  // ---------------------------------------------------------------
  let deck = null;
  let currentIndex = 0;

  const uploadScreen = document.getElementById("upload-screen");
  const viewer = document.getElementById("viewer");
  const stage = document.getElementById("stage");
  const stageWrap = document.getElementById("stage-wrap");
  const stageOuter = document.getElementById("stage-outer");
  const deckNameEl = document.getElementById("deck-name");
  const slideCounterEl = document.getElementById("slide-counter");
  const transitionSweep = document.getElementById("transition-sweep");
  const progressTrack = document.getElementById("progress-track");
  const minimap = document.getElementById("minimap");
  const minimapGrid = document.getElementById("minimap-grid");
  const notesPanel = document.getElementById("notes-panel");
  const notesBody = document.getElementById("notes-body");

  // Safety net: if the tab was hidden/backgrounded while a slide first
  // rendered, layout may have been deferred and the text-fit pass could
  // have measured a zero-size box. Re-run it once the tab is actually shown.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && deck) handleViewportChange();
  });

  function bootPresentation(data) {
    deck = data;
    currentIndex = 0;
    deckNameEl.textContent = data.filename || "UNTITLED_DECK";
    uploadScreen.classList.add("hidden");
    viewer.classList.remove("hidden");
    sizeStage();
    buildProgressTrack();
    buildMinimap();
    renderSlide(0, null);
  }

  function sizeStage() {
    if (!deck) return;
    const ar = deck.aspectRatio || (16 / 9);
    // clientWidth/clientHeight include #stage-outer's own padding (reserved
    // so the slide doesn't sit under the HUD top/bottom bars) — subtract it,
    // or the stage is sized too large and its top/bottom edges end up
    // pushed behind the HUD chrome (or hard-clipped by #viewer).
    const cs = getComputedStyle(stageOuter);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const availW = stageOuter.clientWidth - padX;
    const availH = stageOuter.clientHeight - padY;
    let w = availW, h = w / ar;
    if (h > availH) { h = availH; w = h * ar; }
    stage.style.width = w + "px";
    stage.style.height = h + "px";
    stage.style.setProperty("--sw", w + "px");
    stage.style.setProperty("--sh", h + "px");
  }
  // Re-run the text-fit pass whenever the stage is resized. Font size and
  // box size both scale with --sw, so a genuine overflow ratio is scale
  // invariant — but a shrink applied at a small/imprecise size (sub-pixel
  // rounding is more likely to falsely register as "overflow" the smaller
  // the box) must not stay stuck once the window grows; fitTextElement
  // resets --tscale to 1 before re-measuring, so this self-corrects.
  function handleViewportChange() {
    sizeStage();
    if (deck) fitAllText(stage);
  }
  window.addEventListener("resize", handleViewportChange);

  const ANCHOR_JUSTIFY = { top: "flex-start", middle: "center", bottom: "flex-end" };

  function ptFractionToPx(sizePt, isTitleFallback, fontScale) {
    const pt = sizePt || (isTitleFallback ? 36 : 18);
    const fraction = (pt * 12700) / (deck.slideWidthEmu || 9144000) * (fontScale || 1);
    // A purely proportional size can round to sub-pixel and render as
    // nothing at all in a small/cramped viewport (e.g. a preview panel that
    // hasn't been resized). Floor it at a legible minimum — the box's own
    // overflow:hidden clips any resulting overflow rather than spilling
    // into neighboring content, which is a better failure mode than
    // invisible text.
    return `max(7px, calc(var(--sw) * ${fraction} * var(--tscale, 1)))`;
  }

  function buildRunSpan(run, isTitle, fontScale, lineHeight) {
    const span = document.createElement("span");
    span.textContent = run.text;
    if (run.bold) span.style.fontWeight = "700";
    if (run.italic) span.style.fontStyle = "italic";
    if (run.underline) span.style.textDecoration = "underline";
    span.style.color = run.color || (isTitle ? "#1a1a2e" : "#222");
    span.style.fontFamily = run.font ? `"${run.font}", "Segoe UI", sans-serif` : `"Segoe UI", sans-serif`;
    span.style.fontSize = ptFractionToPx(run.sizePt, isTitle, fontScale);
    // A unitless line-height is a multiplier of the element's OWN font-size.
    // The <p> wrapping this span has no font-size of its own (only this
    // span does), so line-height must be set here — putting it on the <p>
    // resolves the multiplier against the inherited default (16px) instead
    // of the actual rendered size, inflating every line box and triggering
    // false "overflow" shrinks even when the text comfortably fits.
    span.style.lineHeight = String(lineHeight);
    return span;
  }

  function applyStroke(node, stroke) {
    if (!stroke || !stroke.color) return;
    const w = Math.max(0.5, stroke.widthPt || 1);
    node.style.border = `${w}px solid ${stroke.color}`;
  }

  function buildTextElement(el) {
    const wrap = document.createElement("div");
    wrap.className = "slide-el el-text";
    if (el.fill) wrap.style.background = el.fill;
    applyStroke(wrap, el.stroke);
    wrap.style.justifyContent = ANCHOR_JUSTIFY[el.anchor] || "flex-start";
    wrap.style.paddingLeft = `calc(var(--sw) * ${(el.marginLeftPct || 0) / 100})`;
    wrap.style.paddingRight = `calc(var(--sw) * ${(el.marginRightPct || 0) / 100})`;
    wrap.style.paddingTop = `calc(var(--sh) * ${(el.marginTopPct || 0) / 100})`;
    wrap.style.paddingBottom = `calc(var(--sh) * ${(el.marginBottomPct || 0) / 100})`;
    const lineHeight = Math.max(0.85, 1.25 * (1 - (el.lnSpcReduction || 0)));
    const fontScale = el.fontScale || 1;
    (el.paragraphs || []).forEach((para, pi) => {
      const p = document.createElement("p");
      if (para.align) p.style.textAlign = para.align;
      // Can't use `em` here — the <p> is deliberately font-size:0 (see
      // style.css) so it doesn't inflate line-box height, so indent is
      // expressed as a fraction of stage width instead.
      if (para.level) p.style.marginLeft = `calc(var(--sw) * ${para.level * 0.028})`;
      if (el.wordWrap === false) p.style.whiteSpace = "nowrap";
      p.style.setProperty("--pd", (pi * 0.1) + "s");
      para.runs.forEach((run) => p.appendChild(buildRunSpan(run, el.isTitle, fontScale, lineHeight)));
      wrap.appendChild(p);
    });
    return wrap;
  }

  function buildImageElement(el) {
    const wrap = document.createElement("div");
    wrap.className = "slide-el el-image";
    const anim = document.createElement("div");
    anim.className = "el-anim-img";
    const img = document.createElement("img");
    img.src = deck.assetBase + el.src;
    img.alt = "";
    anim.appendChild(img);
    wrap.appendChild(anim);
    return wrap;
  }

  function buildShapeElement(el) {
    const wrap = document.createElement("div");
    wrap.className = "slide-el el-shape";
    const anim = document.createElement("div");
    anim.className = "el-anim-shape";
    anim.style.background = el.fill || "transparent";
    applyStroke(anim, el.stroke);
    wrap.appendChild(anim);
    return wrap;
  }

  const THEME_PALETTE = ["#00c2ff", "#ff2fd0", "#ffb100", "#33e6a0", "#8a7dff", "#ff5e5e", "#5ad1ff", "#ffd23f"];
  const paletteColor = (i) => THEME_PALETTE[i % THEME_PALETTE.length];
  const SVG_NS = "http://www.w3.org/2000/svg";

  function svgEl(name, attrs) {
    const e = document.createElementNS(SVG_NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function truncateLabel(s, n) {
    s = String(s || "");
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  function seriesColor(s, i) {
    return (s && s.color) || paletteColor(i);
  }

  function buildLegend(svg, entries, x, yStart) {
    entries.forEach((entry, i) => {
      const y = yStart + i * 34;
      const g = svgEl("g", {});
      g.classList.add("chart-legend-item");
      g.style.setProperty("--d", (0.5 + i * 0.08) + "s");
      const swatch = svgEl("rect", { x, y: y - 14, width: 18, height: 18, rx: 3, fill: entry.color });
      const text = svgEl("text", { x: x + 26, y: y, class: "chart-legend-text" });
      text.textContent = truncateLabel(entry.label, 22);
      g.appendChild(swatch);
      g.appendChild(text);
      svg.appendChild(g);
    });
  }

  function buildBarChart(svg, categories, series, horizontal) {
    const n = Math.max(categories.length, ...series.map((s) => s.values.length), 1);
    let allVals = [];
    series.forEach((s) => allVals.push(...s.values));
    if (!allVals.length) allVals = [0];
    const minV = Math.min(0, ...allVals);
    const maxV = Math.max(0, ...allVals, 1e-6);
    const range = (maxV - minV) || 1;
    const sN = Math.max(series.length, 1);
    const hasLegend = series.length > 1;

    if (!horizontal) {
      const left = 64, right = hasLegend ? 190 : 30, top = 40, bottom = 76;
      const chartW = 1000 - left - right, chartH = 600 - top - bottom;
      const y0 = top + chartH - ((0 - minV) / range) * chartH;
      svg.appendChild(svgEl("line", { x1: left, y1: y0, x2: left + chartW, y2: y0, class: "chart-axis" }));
      const groupW = chartW / n;
      const barW = (groupW * 0.62) / sN;
      let idx = 0;
      categories.forEach((cat, ci) => {
        const t = svgEl("text", { x: left + ci * groupW + groupW / 2, y: top + chartH + 26, "text-anchor": "middle", class: "chart-label" });
        t.textContent = truncateLabel(cat, 14);
        svg.appendChild(t);
      });
      series.forEach((s, si) => {
        s.values.forEach((v, ci) => {
          const vy = top + chartH - ((v - minV) / range) * chartH;
          const barTop = Math.min(y0, vy), barH = Math.max(1, Math.abs(y0 - vy));
          const bx = left + ci * groupW + groupW * 0.19 + si * barW;
          const rect = svgEl("rect", { x: bx, y: barTop, width: Math.max(2, barW * 0.82), height: barH, fill: seriesColor(s, si), rx: 3 });
          rect.classList.add("chart-bar-v");
          rect.style.setProperty("--d", (idx * 0.05) + "s");
          svg.appendChild(rect);
          idx++;
        });
      });
      if (hasLegend) buildLegend(svg, series.map((s, i) => ({ label: s.name || `Series ${i + 1}`, color: seriesColor(s, i) })), left + chartW + 30, 60);
    } else {
      const left = 150, right = 40, top = 30, bottom = hasLegend ? 60 : 20;
      const chartW = 1000 - left - right, chartH = 600 - top - bottom;
      const x0 = left + ((0 - minV) / range) * chartW;
      svg.appendChild(svgEl("line", { x1: x0, y1: top, x2: x0, y2: top + chartH, class: "chart-axis" }));
      const rowH = chartH / n;
      const barH = (rowH * 0.62) / sN;
      let idx = 0;
      categories.forEach((cat, ci) => {
        const t = svgEl("text", { x: left - 14, y: top + ci * rowH + rowH / 2 + 6, "text-anchor": "end", class: "chart-label" });
        t.textContent = truncateLabel(cat, 18);
        svg.appendChild(t);
      });
      series.forEach((s, si) => {
        s.values.forEach((v, ci) => {
          const vx = left + ((v - minV) / range) * chartW;
          const barLeft = Math.min(x0, vx), barW = Math.max(1, Math.abs(x0 - vx));
          const by = top + ci * rowH + rowH * 0.19 + si * barH;
          const rect = svgEl("rect", { x: barLeft, y: by, width: barW, height: Math.max(2, barH * 0.82), fill: seriesColor(s, si), rx: 3 });
          rect.classList.add("chart-bar-h");
          rect.style.setProperty("--d", (idx * 0.05) + "s");
          svg.appendChild(rect);
          idx++;
        });
      });
      if (hasLegend) buildLegend(svg, series.map((s, i) => ({ label: s.name || `Series ${i + 1}`, color: seriesColor(s, i) })), left, top + chartH + 30);
    }
  }

  function buildLineChart(svg, categories, series, animLines) {
    const hasLegend = series.length > 1;
    const left = 60, right = hasLegend ? 190 : 40, top = 40, bottom = 68;
    const chartW = 1000 - left - right, chartH = 600 - top - bottom;
    const n = Math.max(categories.length, ...series.map((s) => s.values.length), 1);
    let allVals = [];
    series.forEach((s) => allVals.push(...s.values));
    if (!allVals.length) allVals = [0];
    const minV = Math.min(0, ...allVals);
    const maxV = Math.max(0, ...allVals, 1e-6);
    const range = (maxV - minV) || 1;
    const xAt = (i) => left + (n <= 1 ? chartW / 2 : (chartW * i) / (n - 1));
    const yAt = (v) => top + chartH - ((v - minV) / range) * chartH;

    svg.appendChild(svgEl("line", { x1: left, y1: yAt(0), x2: left + chartW, y2: yAt(0), class: "chart-axis" }));
    categories.forEach((cat, i) => {
      const t = svgEl("text", { x: xAt(i), y: top + chartH + 28, "text-anchor": "middle", class: "chart-label" });
      t.textContent = truncateLabel(cat, 12);
      svg.appendChild(t);
    });

    series.forEach((s, si) => {
      const pts = s.values.map((v, i) => [xAt(i), yAt(v)]);
      if (!pts.length) return;
      const d = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" ");
      const color = seriesColor(s, si);
      const path = svgEl("path", { d, stroke: color, class: "chart-line-path" });
      svg.appendChild(path);
      const seriesDelay = si * 220;
      animLines.push({ path, delay: seriesDelay });
      pts.forEach((p, pi) => {
        const c = svgEl("circle", { cx: p[0], cy: p[1], r: 7, fill: color, class: "chart-marker" });
        c.dataset.delay = String(seriesDelay + 900 * (pts.length <= 1 ? 0 : pi / (pts.length - 1)));
        c.style.opacity = "0";
        svg.appendChild(c);
      });
    });
    if (hasLegend) buildLegend(svg, series.map((s, i) => ({ label: s.name || `Series ${i + 1}`, color: seriesColor(s, i) })), left + chartW + 30, 60);
  }

  function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
  }

  function describeArcPath(cx, cy, r, startDeg, endDeg) {
    const startPt = polarToCartesian(cx, cy, r, startDeg);
    const endPt = polarToCartesian(cx, cy, r, endDeg);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${startPt.x} ${startPt.y} A ${r} ${r} 0 ${largeArc} 1 ${endPt.x} ${endPt.y} Z`;
  }

  function buildPieChart(svg, series, categories) {
    const s = series[0] || { values: [], colors: [] };
    const values = (s.values || []).map((v) => Math.max(0, v));
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = 360, cy = 300, r = 220;
    let angle = 0;
    const legendEntries = [];
    values.forEach((v, i) => {
      const sweep = (v / total) * 360;
      const color = (s.colors && s.colors[i]) || paletteColor(i);
      if (sweep > 0.001) {
        const path = svgEl("path", { d: describeArcPath(cx, cy, r, angle, angle + sweep), fill: color, class: "chart-pie-slice" });
        path.style.setProperty("--d", (i * 0.09) + "s");
        svg.appendChild(path);
      }
      legendEntries.push({ label: truncateLabel(categories[i], 20) || `Slice ${i + 1}`, color });
      angle += sweep;
    });
    buildLegend(svg, legendEntries, 660, 90);
  }

  function buildChartElement(el, animLines) {
    const wrap = document.createElement("div");
    wrap.className = "slide-el el-chart";
    const anim = document.createElement("div");
    anim.className = "el-anim-chart";
    const svg = svgEl("svg", { viewBox: "0 0 1000 600", preserveAspectRatio: "none" });
    svg.classList.add("chart-svg");

    const categories = el.categories || [];
    const series = el.series || [];
    if (el.chartType === "pie") {
      buildPieChart(svg, series, categories);
    } else if (el.chartType === "line") {
      buildLineChart(svg, categories, series, animLines);
    } else {
      buildBarChart(svg, categories, series, el.orientation === "horizontal");
    }

    anim.appendChild(svg);
    wrap.appendChild(anim);
    return wrap;
  }

  function buildTableElement(el) {
    const wrap = document.createElement("div");
    wrap.className = "slide-el el-table";
    const table = document.createElement("table");
    (el.rows || []).forEach((row, ri) => {
      const tr = document.createElement("tr");
      tr.style.setProperty("--pd", (ri * 0.09) + "s");
      row.forEach((cellParas) => {
        const td = document.createElement("td");
        cellParas.forEach((para) => {
          const p = document.createElement("p");
          if (para.align) p.style.textAlign = para.align;
          para.runs.forEach((run) => p.appendChild(buildRunSpan(run, false, 1, 1.25)));
          td.appendChild(p);
        });
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    return wrap;
  }

  function positionAndAppend(container, el, node, index) {
    node.style.left = el.leftPct + "%";
    node.style.top = el.topPct + "%";
    node.style.width = el.widthPct + "%";
    node.style.height = el.heightPct + "%";
    if (el.rotation) node.style.transform = `rotate(${el.rotation}deg)`;
    node.style.setProperty("--d", (index * 0.09) + "s");
    container.appendChild(node);
  }

  // Shrinks text to fit its box when browser font metrics overflow the
  // original PowerPoint box (mirrors PPT's own "shrink text on overflow").
  function fitTextElement(wrap) {
    wrap.style.setProperty("--tscale", "1");
    // Container has no real box yet (e.g. laid out in a still-hidden tab) —
    // bail rather than mistake a zero-size box for "infinite overflow" and
    // shrink text to the floor. A later fitAllText pass will retry.
    if (wrap.clientHeight === 0 && wrap.clientWidth === 0) return;
    // A flat 1px tolerance is too tight at small render sizes, where
    // sub-pixel layout rounding alone can look like overflow and trigger an
    // unwanted shrink; scale the tolerance with box size instead.
    const tolH = Math.max(2, wrap.clientHeight * 0.02);
    const tolW = Math.max(2, wrap.clientWidth * 0.02);
    let scale = 1;
    let guard = 14;
    while (guard-- > 0 && (wrap.scrollHeight > wrap.clientHeight + tolH || wrap.scrollWidth > wrap.clientWidth + tolW)) {
      scale -= 0.06;
      if (scale < 0.4) { wrap.style.setProperty("--tscale", "0.4"); break; }
      wrap.style.setProperty("--tscale", String(scale));
    }
  }

  // Reading scrollHeight/clientHeight forces layout synchronously, so this
  // does not need to wait for a paint (rAF) in a normal, visible tab. A
  // follow-up rAF pass is scheduled as a safety net for the rare case where
  // the tab's layout was deferred (e.g. still hidden/backgrounded) on the
  // first pass.
  function fitAllText(container) {
    const run = () => container.querySelectorAll(".el-text").forEach(fitTextElement);
    run();
    requestAnimationFrame(run);
  }

  // Line charts draw their stroke via the Web Animations API (needs a real
  // path length), not CSS `animation` — so the `.no-anim` stylesheet rule
  // can't cancel it; it's only run below when `animated` is true.
  function renderSlideInto(container, slideData, animated) {
    container.innerHTML = "";
    container.classList.toggle("no-anim", !animated);
    container.style.background = (slideData.background && slideData.background.value) || "#ffffff";
    const animLines = [];
    const markers = [];
    (slideData.elements || []).forEach((el, i) => {
      let node;
      if (el.type === "text") node = buildTextElement(el);
      else if (el.type === "image") node = buildImageElement(el);
      else if (el.type === "shape") node = buildShapeElement(el);
      else if (el.type === "table") node = buildTableElement(el);
      else if (el.type === "chart") node = buildChartElement(el, animLines);
      else return;
      positionAndAppend(container, el, node, i);
      if (el.type === "chart") node.querySelectorAll(".chart-marker").forEach((m) => markers.push(m));
    });
    fitAllText(container);
    if (animated) {
      animLines.forEach(({ path, delay }) => {
        const len = path.getTotalLength();
        path.style.strokeDasharray = String(len);
        path.style.strokeDashoffset = String(len);
        path.animate(
          [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
          { duration: 900, delay, easing: "cubic-bezier(.16,.8,.24,1)", fill: "forwards" }
        );
      });
      markers.forEach((c) => {
        const delay = Number(c.dataset.delay) || 0;
        c.animate(
          [{ opacity: 0, transform: "scale(0)" }, { opacity: 1, transform: "scale(1)" }],
          { duration: 260, delay, easing: "cubic-bezier(.2,.8,.3,1.2)", fill: "forwards" }
        );
      });
    } else {
      markers.forEach((c) => { c.style.opacity = "1"; });
    }
  }

  function renderSlide(index, direction) {
    if (!deck) return;
    const slideData = deck.slides[index];
    if (!slideData) return;

    const doTransition = direction !== null;
    if (doTransition) {
      stage.classList.remove("transitioning-in-next", "transitioning-in-prev");
      stage.classList.add(direction === "next" ? "transitioning-next" : "transitioning-prev");
      transitionSweep.classList.remove("sweep-next", "sweep-prev");
      void transitionSweep.offsetWidth;
      transitionSweep.classList.add(direction === "next" ? "sweep-next" : "sweep-prev");
    }

    const commit = () => {
      renderSlideInto(stage, slideData, true);
      stage.classList.remove("transitioning-next", "transitioning-prev");
      if (doTransition) {
        stage.classList.add(direction === "next" ? "transitioning-in-next" : "transitioning-in-prev");
        setTimeout(() => stage.classList.remove("transitioning-in-next", "transitioning-in-prev"), 550);
      }
    };

    if (doTransition) setTimeout(commit, 180);
    else commit();

    currentIndex = index;
    updateHud();
    updateNotes(slideData);
    updateMinimapActive();
  }

  function updateHud() {
    const total = deck.slides.length;
    slideCounterEl.textContent = String(currentIndex + 1).padStart(2, "0") + " / " + String(total).padStart(2, "0");
    const pct = ((currentIndex + 1) / total) * 100;
    const fill = progressTrack.querySelector(".progress-track-fill");
    if (fill) fill.style.width = pct + "%";
    const dot = progressTrack.querySelector(".progress-track-dot");
    if (dot) dot.style.left = pct + "%";
  }

  function buildProgressTrack() {
    progressTrack.innerHTML = '<div class="progress-track-fill"></div><div class="progress-track-dot"></div>';
    progressTrack.onclick = (e) => {
      const rect = progressTrack.getBoundingClientRect();
      const ratio = (e.clientX - rect.left) / rect.width;
      const idx = Math.min(deck.slides.length - 1, Math.max(0, Math.floor(ratio * deck.slides.length)));
      goTo(idx);
    };
  }

  function updateNotes(slideData) {
    notesBody.textContent = (slideData.notes && slideData.notes.trim()) || "No notes for this slide.";
  }

  function goTo(index) {
    if (!deck || index === currentIndex) return;
    if (index < 0 || index >= deck.slides.length) return;
    const direction = index > currentIndex ? "next" : "prev";
    renderSlide(index, direction);
  }
  function next() { if (deck && currentIndex < deck.slides.length - 1) goTo(currentIndex + 1); }
  function prev() { if (deck && currentIndex > 0) goTo(currentIndex - 1); }

  // ---------------------------------------------------------------
  // Minimap
  // ---------------------------------------------------------------
  const MINI_NATIVE_W = 1000;
  let minimapScaleFns = [];
  function refreshMinimapScales() {
    minimapScaleFns.forEach((fn) => fn());
  }
  function buildMinimap() {
    minimapGrid.innerHTML = "";
    minimapScaleFns = [];
    const ar = deck.aspectRatio || (16 / 9);
    const nativeH = MINI_NATIVE_W / ar;
    deck.slides.forEach((slideData, i) => {
      const tile = document.createElement("div");
      tile.className = "mini-tile";
      tile.style.aspectRatio = ar;
      tile.dataset.index = i;

      const inner = document.createElement("div");
      inner.className = "mini-inner";
      inner.style.width = MINI_NATIVE_W + "px";
      inner.style.height = nativeH + "px";
      inner.style.setProperty("--sw", MINI_NATIVE_W + "px");
      inner.style.setProperty("--sh", nativeH + "px");
      renderSlideInto(inner, slideData, false);

      tile.appendChild(inner);
      const num = document.createElement("div");
      num.className = "mini-num";
      num.textContent = String(i + 1).padStart(2, "0");
      tile.appendChild(num);

      const ro = () => {
        if (!tile.clientWidth) return;
        const scale = tile.clientWidth / MINI_NATIVE_W;
        inner.style.transform = `scale(${scale})`;
      };
      minimapScaleFns.push(ro);
      requestAnimationFrame(ro);
      window.addEventListener("resize", ro);

      tile.addEventListener("click", () => { goTo(i); toggleMinimap(false); });
      minimapGrid.appendChild(tile);
    });
  }
  function updateMinimapActive() {
    minimapGrid.querySelectorAll(".mini-tile").forEach((t) => {
      t.classList.toggle("active", Number(t.dataset.index) === currentIndex);
    });
  }

  function toggleMinimap(force) {
    const show = force !== undefined ? force : minimap.classList.contains("hidden");
    minimap.classList.toggle("hidden", !show);
    if (show) {
      notesPanel.classList.add("hidden");
      requestAnimationFrame(refreshMinimapScales);
    }
  }
  function toggleNotes(force) {
    const show = force !== undefined ? force : notesPanel.classList.contains("hidden");
    notesPanel.classList.toggle("hidden", !show);
    if (show) minimap.classList.add("hidden");
  }

  // ---------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------
  document.getElementById("prev-btn").addEventListener("click", prev);
  document.getElementById("next-btn").addEventListener("click", next);
  document.getElementById("minimap-btn").addEventListener("click", () => toggleMinimap());
  document.getElementById("minimap-close").addEventListener("click", () => toggleMinimap(false));
  document.getElementById("notes-btn").addEventListener("click", () => toggleNotes());
  document.getElementById("notes-close").addEventListener("click", () => toggleNotes(false));
  document.getElementById("fullscreen-btn").addEventListener("click", () => {
    if (!document.fullscreenElement) viewer.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  });
  document.getElementById("new-file-btn").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    viewer.classList.add("hidden");
    uploadScreen.classList.remove("hidden");
    dropzone.classList.remove("hidden");
    statusPanel.classList.add("hidden");
    errorPanel.classList.add("hidden");
    fileInput.value = "";
    deck = null;
  });

  document.addEventListener("keydown", (e) => {
    if (viewer.classList.contains("hidden")) return;
    if (["ArrowRight", " ", "PageDown"].includes(e.key)) { next(); e.preventDefault(); }
    else if (["ArrowLeft", "PageUp"].includes(e.key)) { prev(); e.preventDefault(); }
    else if (e.key.toLowerCase() === "f") document.getElementById("fullscreen-btn").click();
    else if (e.key.toLowerCase() === "g") toggleMinimap();
    else if (e.key.toLowerCase() === "n") toggleNotes();
    else if (e.key === "Escape") { toggleMinimap(false); toggleNotes(false); }
  });

  let touchStartX = null;
  stageOuter.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  stageOuter.addEventListener("touchend", (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); }
    touchStartX = null;
  }, { passive: true });
})();
