const state = {
  datasets: [],
  activeDataset: "emi",
  rows: [],
  selectedId: null,
  targetPi: 8.5,
  search: ""
};

const DATASET_CONFIGS = {
  emi: {
    id: "emi",
    label: "EMI library",
    file: "emi_binding.csv",
    description: "Training library with binary ANT and OVA binding labels."
  },
  iso: {
    id: "iso",
    label: "Isolated variants",
    file: "iso_binding.csv",
    description: "Out-of-library isolated sequences with continuous binding values."
  },
  igg: {
    id: "igg",
    label: "IgG variants",
    file: "igg_binding.csv",
    description: "IgG-format sequences with continuous binding values."
  }
};

const staticCache = new Map();

const els = {
  status: document.querySelector("#status"),
  datasetTabs: document.querySelector("#datasetTabs"),
  metrics: document.querySelector("#metrics"),
  detail: document.querySelector("#detail"),
  piSlider: document.querySelector("#piSlider"),
  piValue: document.querySelector("#piValue"),
  plot: document.querySelector("#plot"),
  plotSubtitle: document.querySelector("#plotSubtitle"),
  rankingBody: document.querySelector("#rankingBody"),
  search: document.querySelector("#search")
};

let plotPoints = [];

function fmt(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return Number(value).toFixed(digits);
}

function compact(value) {
  return new Intl.NumberFormat().format(value);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

async function init() {
  try {
    const { datasets } = await loadDatasets();
    state.datasets = datasets;
    renderTabs();
    wireEvents();
    await loadDataset();
  } catch (error) {
    els.status.textContent = "Error";
    els.detail.innerHTML = `<h2>Load Error</h2><p class="muted">${error.message}</p>`;
  }
}

async function loadDatasets() {
  try {
    return await fetchJson("/api/datasets");
  } catch (error) {
    const datasets = await Promise.all(Object.keys(DATASET_CONFIGS).map(async (id) => {
      const data = await loadStaticDataset(id);
      return {
        id: data.id,
        label: data.label,
        description: data.description,
        file: data.file,
        summary: data.summary
      };
    }));
    return { datasets };
  }
}

function wireEvents() {
  els.piSlider.addEventListener("input", () => {
    state.targetPi = Number(els.piSlider.value);
    els.piValue.textContent = fmt(state.targetPi, 2);
  });

  els.piSlider.addEventListener("change", () => loadDataset());

  els.search.addEventListener("input", () => {
    state.search = els.search.value.trim().toLowerCase();
    renderTable();
  });

  els.plot.addEventListener("mousemove", handlePlotHover);
  els.plot.addEventListener("click", handlePlotClick);
  window.addEventListener("resize", () => drawPlot());
}

function renderTabs() {
  els.datasetTabs.innerHTML = state.datasets.map((dataset) => (
    `<button type="button" class="${dataset.id === state.activeDataset ? "active" : ""}" data-id="${dataset.id}">
      ${dataset.label}
    </button>`
  )).join("");

  els.datasetTabs.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeDataset = button.dataset.id;
      state.selectedId = null;
      renderTabs();
      loadDataset();
    });
  });
}

async function loadDataset() {
  els.status.textContent = "Loading";
  let data;
  try {
    const url = `/api/dataset/${state.activeDataset}?targetPi=${state.targetPi.toFixed(2)}&limit=10000`;
    data = await fetchJson(url);
  } catch (error) {
    data = await staticDatasetResponse(state.activeDataset, state.targetPi, 10000);
  }
  state.rows = data.rows;
  state.summary = data.summary;
  state.label = data.label;
  state.description = data.description;
  if (!state.selectedId && state.rows[0]) state.selectedId = state.rows[0].id;
  els.status.textContent = "Ready";
  renderMetrics();
  renderDetail();
  renderTable();
  drawPlot();
}

async function loadStaticDataset(id) {
  if (staticCache.has(id)) return staticCache.get(id);
  const config = DATASET_CONFIGS[id];
  if (!config) throw new Error(`Unknown dataset: ${id}`);

  const response = await fetch(config.file);
  if (!response.ok) throw new Error(`Could not load ${config.file}`);

  const parsed = parseCsv(await response.text());
  const headers = parsed.shift().map((header) => header.trim());
  const rows = parsed.map((values, index) => {
    const record = {};
    headers.forEach((header, headerIndex) => {
      record[header] = values[headerIndex];
    });

    return {
      id: `${id}-${index + 1}`,
      index: index + 1,
      sample: record.Sample || `Variant ${index + 1}`,
      sequence: record["VH Sequence"] || "",
      ant: toNumber(record["ANT Binding"]),
      ova: toNumber(record["OVA Binding"]),
      pI: toNumber(record.pI_seq),
      dataset: id
    };
  }).filter((row) => row.sequence && row.ant !== null && row.ova !== null && row.pI !== null);

  const data = {
    ...config,
    rows,
    summary: summarize(rows)
  };
  staticCache.set(id, data);
  return data;
}

async function staticDatasetResponse(id, targetPi, limit) {
  const data = await loadStaticDataset(id);
  const rows = scoreRows(data.rows, targetPi);
  return {
    id: data.id,
    label: data.label,
    description: data.description,
    file: data.file,
    summary: {
      ...data.summary,
      paretoCount: rows.filter((row) => row.pareto).length,
      targetPi
    },
    rows: rows.slice(0, limit)
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function toNumber(value) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function summarize(rows) {
  const antValues = rows.map((row) => row.ant);
  const ovaValues = rows.map((row) => row.ova);
  const pIValues = rows.map((row) => row.pI);

  return {
    count: rows.length,
    ant: describe(antValues),
    ova: describe(ovaValues),
    pI: describe(pIValues),
    specificCount: rows.filter((row) => row.ant > row.ova).length
  };
}

function describe(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    median: quantile(sorted, 0.5)
  };
}

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function scoreRows(rows, targetPi) {
  const ant = describe(rows.map((row) => row.ant));
  const ova = describe(rows.map((row) => row.ova));
  const pIDistanceMax = Math.max(...rows.map((row) => Math.abs(row.pI - targetPi))) || 1;

  const scored = rows.map((row) => {
    const antigen = normalize(row.ant, ant.min, ant.max);
    const offTarget = 1 - normalize(row.ova, ova.min, ova.max);
    const pIMatch = 1 - Math.min(Math.abs(row.pI - targetPi) / pIDistanceMax, 1);
    const specificity = row.ant - row.ova;
    const score = (0.48 * antigen) + (0.37 * offTarget) + (0.15 * pIMatch);

    return {
      ...row,
      score,
      specificity,
      objectives: [antigen, offTarget, pIMatch]
    };
  });

  markPareto(scored);
  return scored.sort((a, b) => {
    if (b.pareto !== a.pareto) return Number(b.pareto) - Number(a.pareto);
    return b.score - a.score;
  });
}

function markPareto(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    let dominated = false;
    for (let j = 0; j < rows.length; j += 1) {
      if (i !== j && dominates(rows[j], rows[i])) {
        dominated = true;
        break;
      }
    }
    rows[i].pareto = !dominated;
  }
}

function dominates(a, b) {
  let better = false;
  for (let i = 0; i < a.objectives.length; i += 1) {
    if (a.objectives[i] < b.objectives[i]) return false;
    if (a.objectives[i] > b.objectives[i]) better = true;
  }
  return better;
}

function renderMetrics() {
  const summary = state.summary;
  els.metrics.innerHTML = [
    metric("Variants", compact(summary.count)),
    metric("Pareto front", compact(summary.paretoCount)),
    metric("ANT median", fmt(summary.ant.median, 2)),
    metric("OVA median", fmt(summary.ova.median, 2)),
    metric("pI median", fmt(summary.pI.median, 2)),
    metric("ANT > OVA", compact(summary.specificCount))
  ].join("");
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function filteredRows() {
  if (!state.search) return state.rows;
  return state.rows.filter((row) => {
    const haystack = `${row.sample} ${row.sequence}`.toLowerCase();
    return haystack.includes(state.search);
  });
}

function renderTable() {
  const rows = filteredRows().slice(0, 300);
  els.rankingBody.innerHTML = rows.map((row, index) => `
    <tr data-id="${row.id}" class="${row.id === state.selectedId ? "selected" : ""}">
      <td>${index + 1}</td>
      <td>${row.sample}</td>
      <td>${fmt(row.ant, 3)}</td>
      <td>${fmt(row.ova, 3)}</td>
      <td>${fmt(row.pI, 2)}</td>
      <td>${fmt(row.score * 100, 1)}</td>
      <td><span class="badge ${row.pareto ? "" : "off"}">${row.pareto ? "Pareto" : "Ranked"}</span></td>
    </tr>
  `).join("");

  els.rankingBody.querySelectorAll("tr").forEach((rowEl) => {
    rowEl.addEventListener("click", () => {
      state.selectedId = rowEl.dataset.id;
      renderDetail();
      renderTable();
      drawPlot();
    });
  });
}

function selectedRow() {
  return state.rows.find((row) => row.id === state.selectedId) || state.rows[0];
}

function renderDetail() {
  const row = selectedRow();
  if (!row) {
    els.detail.innerHTML = `<h2>Selected Variant</h2><p class="muted">No rows available.</p>`;
    return;
  }

  els.detail.innerHTML = `
    <h2>${row.sample}</h2>
    <div class="detail-grid">
      ${metric("ANT", fmt(row.ant, 3))}
      ${metric("OVA", fmt(row.ova, 3))}
      ${metric("pI", fmt(row.pI, 2))}
      ${metric("Score", fmt(row.score * 100, 1))}
    </div>
    <div class="sequence">${row.sequence}</div>
  `;
}

function drawPlot() {
  const canvas = els.plot;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const rows = filteredRows();
  const padding = { left: 62, right: 24, top: 24, bottom: 54 };
  const width = rect.width - padding.left - padding.right;
  const height = rect.height - padding.top - padding.bottom;
  if (!rows.length || width <= 0 || height <= 0) return;

  const extents = {
    antMin: Math.min(...rows.map((row) => row.ant)),
    antMax: Math.max(...rows.map((row) => row.ant)),
    ovaMin: Math.min(...rows.map((row) => row.ova)),
    ovaMax: Math.max(...rows.map((row) => row.ova))
  };

  const xFor = (ova) => padding.left + normalize(ova, extents.ovaMin, extents.ovaMax) * width;
  const yFor = (ant) => padding.top + (1 - normalize(ant, extents.antMin, extents.antMax)) * height;

  ctx.strokeStyle = "#d9d0c3";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + height);
  ctx.lineTo(padding.left + width, padding.top + height);
  ctx.stroke();

  drawAxisLabels(ctx, rect, padding, width, height, extents);

  plotPoints = rows.map((row) => ({
    row,
    x: xFor(row.ova),
    y: yFor(row.ant),
    r: row.pareto ? 5.5 : 3.5
  }));

  plotPoints.forEach(({ row, x, y, r }) => {
    const selected = row.id === state.selectedId;
    ctx.beginPath();
    ctx.arc(x, y, selected ? r + 3 : r, 0, Math.PI * 2);
    ctx.fillStyle = selected ? "#b73d4a" : row.pareto ? "#c98516" : "rgba(22, 115, 107, 0.58)";
    ctx.fill();
    if (selected || row.pareto) {
      ctx.strokeStyle = selected ? "#69212a" : "#704806";
      ctx.lineWidth = selected ? 2 : 1;
      ctx.stroke();
    }
  });

  els.plotSubtitle.textContent = `${state.label}: ${compact(rows.length)} visible sequences`;
}

function drawAxisLabels(ctx, rect, padding, width, height, extents) {
  ctx.fillStyle = "#68706d";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("OVA Binding", padding.left + width / 2, rect.height - 16);

  ctx.save();
  ctx.translate(17, padding.top + height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("ANT Binding", 0, 0);
  ctx.restore();

  ctx.textAlign = "right";
  ctx.fillText(fmt(extents.antMax, 2), padding.left - 10, padding.top + 4);
  ctx.fillText(fmt(extents.antMin, 2), padding.left - 10, padding.top + height + 4);
  ctx.textAlign = "center";
  ctx.fillText(fmt(extents.ovaMin, 2), padding.left, padding.top + height + 22);
  ctx.fillText(fmt(extents.ovaMax, 2), padding.left + width, padding.top + height + 22);
}

function normalize(value, min, max) {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
}

function plotEventPoint(event) {
  const rect = els.plot.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function nearestPoint(event) {
  const point = plotEventPoint(event);
  let best = null;
  let bestDistance = Infinity;
  plotPoints.forEach((plotPoint) => {
    const distance = Math.hypot(plotPoint.x - point.x, plotPoint.y - point.y);
    if (distance < bestDistance) {
      best = plotPoint;
      bestDistance = distance;
    }
  });
  return bestDistance <= 14 ? best : null;
}

function handlePlotHover(event) {
  els.plot.style.cursor = nearestPoint(event) ? "pointer" : "crosshair";
}

function handlePlotClick(event) {
  const hit = nearestPoint(event);
  if (!hit) return;
  state.selectedId = hit.row.id;
  renderDetail();
  renderTable();
  drawPlot();
}

init();
