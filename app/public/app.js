const state = {
  datasets: [],
  importedDatasets: [],
  activeDataset: "emi",
  rows: [],
  selectedId: null,
  targetPi: 8.5,
  search: "",
  patient: {
    patientId: "",
    disease: "",
    mutation: "",
    targetAntigen: ""
  },
  weights: {
    target: 0.42,
    specificity: 0.32,
    pI: 0.14,
    patient: 0.12
  },
  importReport: null
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

const FIELD_ALIASES = {
  sample: ["sample", "variant", "variant_id", "id", "name"],
  sequence: ["vh sequence", "sequence", "aa sequence", "protein_sequence", "amino_acid_sequence"],
  ant: ["ant binding", "target binding", "target_binding", "affinity", "affinity_score", "activity", "target"],
  ova: ["ova binding", "off-target binding", "off_target_binding", "nonspecific_binding", "specificity_penalty", "off_target"],
  pI: ["pi_seq", "pi", "pI", "isoelectric_point", "isoelectric point"],
  patientId: ["patient_id", "patient", "subject_id", "case_id"],
  disease: ["disease", "diagnosis", "condition", "cohort"],
  mutation: ["mutation", "patient_mutation", "genomic_variant", "variant_call"],
  targetAntigen: ["target_antigen", "antigen", "target protein", "target_protein", "tissue", "receptor"],
  source: ["source", "study", "dataset"]
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
  search: document.querySelector("#search"),
  dataProfile: document.querySelector("#dataProfile"),
  importReport: document.querySelector("#importReport"),
  rankExplanation: document.querySelector("#rankExplanation"),
  exportRanked: document.querySelector("#exportRanked"),
  customFile: document.querySelector("#customFile"),
  patientId: document.querySelector("#patientId"),
  disease: document.querySelector("#disease"),
  mutation: document.querySelector("#mutation"),
  targetAntigen: document.querySelector("#targetAntigen"),
  targetWeight: document.querySelector("#targetWeight"),
  specificityWeight: document.querySelector("#specificityWeight"),
  piWeight: document.querySelector("#piWeight"),
  patientWeight: document.querySelector("#patientWeight"),
  liveSample: document.querySelector("#liveSample"),
  liveSequence: document.querySelector("#liveSequence"),
  liveAnt: document.querySelector("#liveAnt"),
  liveOva: document.querySelector("#liveOva"),
  livePi: document.querySelector("#livePi"),
  addLiveVariant: document.querySelector("#addLiveVariant"),
  installCard: document.querySelector("#installCard"),
  installHelp: document.querySelector("#installHelp"),
  installApp: document.querySelector("#installApp"),
  installSteps: document.querySelector("#installSteps")
};

let plotPoints = [];
let deferredInstallPrompt = null;

function fmt(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return Number(value).toFixed(digits);
}

function compact(value) {
  return new Intl.NumberFormat().format(value || 0);
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
    restoreLocalImports();
    renderTabs();
    wireEvents();
    await loadDataset();
  } catch (error) {
    els.status.textContent = "Error";
    els.detail.innerHTML = `<h2>Load Error</h2><p class="muted">${escapeHtml(error.message)}</p>`;
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
    loadDataset();
  });

  els.search.addEventListener("input", () => {
    state.search = els.search.value.trim().toLowerCase();
    renderTable();
    drawPlot();
  });

  [els.patientId, els.disease, els.mutation, els.targetAntigen].forEach((input) => {
    input.addEventListener("input", () => {
      state.patient = {
        patientId: els.patientId.value.trim(),
        disease: els.disease.value.trim(),
        mutation: els.mutation.value.trim(),
        targetAntigen: els.targetAntigen.value.trim()
      };
      loadDataset();
    });
  });

  [
    [els.targetWeight, "target"],
    [els.specificityWeight, "specificity"],
    [els.piWeight, "pI"],
    [els.patientWeight, "patient"]
  ].forEach(([input, key]) => {
    input.addEventListener("input", () => {
      state.weights[key] = Number(input.value);
      loadDataset();
    });
  });

  els.customFile.addEventListener("change", handleCustomFile);
  els.addLiveVariant.addEventListener("click", addLiveVariant);
  els.exportRanked.addEventListener("click", exportRankedCsv);
  els.installApp.addEventListener("click", handleInstallClick);
  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);
  els.plot.addEventListener("mousemove", handlePlotHover);
  els.plot.addEventListener("click", handlePlotClick);
  window.addEventListener("resize", () => drawPlot());
  updateInstallUi();
}

function renderTabs() {
  const allDatasets = [...state.datasets, ...state.importedDatasets];
  els.datasetTabs.innerHTML = allDatasets.map((dataset) => (
    `<button type="button" class="${dataset.id === state.activeDataset ? "active" : ""}" data-id="${dataset.id}">
      <span>${escapeHtml(dataset.label)}</span>
      <small>${escapeHtml(dataset.file || "browser import")}</small>
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
  els.status.textContent = "Scoring";
  let data;
  const imported = state.importedDatasets.find((dataset) => dataset.id === state.activeDataset);

  if (imported) {
    data = datasetResponseFromRows(imported, state.targetPi);
  } else {
    try {
      const url = `/api/dataset/${state.activeDataset}?targetPi=${state.targetPi.toFixed(2)}&limit=10000`;
      data = await fetchJson(url);
      data.rows = scoreRows(data.rows.map(enrichBuiltInRow), state.targetPi);
      data.summary = {
        ...summarize(data.rows),
        paretoCount: data.rows.filter((row) => row.pareto).length,
        targetPi: state.targetPi
      };
    } catch (error) {
      data = await staticDatasetResponse(state.activeDataset, state.targetPi, 10000);
    }
  }

  state.rows = data.rows;
  state.summary = data.summary;
  state.label = data.label;
  state.description = data.description;
  if (!state.rows.some((row) => row.id === state.selectedId)) {
    state.selectedId = state.rows[0] ? state.rows[0].id : null;
  }
  els.status.textContent = imported ? "Imported" : "Ready";
  renderMetrics();
  renderDataProfile();
  renderImportReport();
  renderRankExplanation();
  renderDetail();
  renderTable();
  drawPlot();
}

function enrichBuiltInRow(row) {
  return {
    ...row,
    patientId: row.patientId || "",
    disease: row.disease || "",
    mutation: row.mutation || "",
    targetAntigen: row.targetAntigen || "HGFR / c-Met",
    source: row.source || "Tessier Lab"
  };
}

async function loadStaticDataset(id) {
  if (staticCache.has(id)) return staticCache.get(id);
  const config = DATASET_CONFIGS[id];
  if (!config) throw new Error(`Unknown dataset: ${id}`);

  const response = await fetch(config.file);
  if (!response.ok) throw new Error(`Could not load ${config.file}`);

  const parsed = parseDelimited(await response.text());
  const rows = recordsFromTable(parsed, id).map(enrichBuiltInRow);

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
      ...summarize(rows),
      paretoCount: rows.filter((row) => row.pareto).length,
      targetPi
    },
    rows: rows.slice(0, limit)
  };
}

function datasetResponseFromRows(dataset, targetPi) {
  const rows = scoreRows(dataset.rows, targetPi);
  return {
    id: dataset.id,
    label: dataset.label,
    description: dataset.description,
    file: dataset.file,
    summary: {
      ...summarize(rows),
      paretoCount: rows.filter((row) => row.pareto).length,
      targetPi
    },
    rows
  };
}

function parseDelimited(text) {
  const delimiter = text.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const cleanText = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < cleanText.length; i += 1) {
    const ch = cleanText[i];
    const next = cleanText[i + 1];

    if (ch === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
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

function recordsFromTable(table, id) {
  if (!table.length) return [];
  const headers = table.shift().map((header) => header.trim());
  const normalized = headers.map((header) => normalizeHeader(header));

  return table.map((values, index) => {
    const record = {};
    headers.forEach((header, headerIndex) => {
      record[header] = values[headerIndex] || "";
    });

    const row = {
      id: `${id}-${index + 1}`,
      index: index + 1,
      sample: pick(record, normalized, "sample") || `Variant ${index + 1}`,
      sequence: pick(record, normalized, "sequence"),
      ant: toNumber(pick(record, normalized, "ant")),
      ova: toNumber(pick(record, normalized, "ova")),
      pI: toNumber(pick(record, normalized, "pI")),
      patientId: pick(record, normalized, "patientId"),
      disease: pick(record, normalized, "disease"),
      mutation: pick(record, normalized, "mutation"),
      targetAntigen: pick(record, normalized, "targetAntigen"),
      source: pick(record, normalized, "source"),
      dataset: id
    };

    return row;
  }).filter((row) => row.sequence && row.ant !== null && row.ova !== null && row.pI !== null);
}

function pick(record, normalizedHeaders, field) {
  const aliases = FIELD_ALIASES[field].map(normalizeHeader);
  const headers = Object.keys(record);
  const index = normalizedHeaders.findIndex((header) => aliases.includes(header));
  return index >= 0 ? String(record[headers[index]] || "").trim() : "";
}

function detectMappings(headers) {
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));
  return Object.keys(FIELD_ALIASES).reduce((result, field) => {
    const aliases = FIELD_ALIASES[field].map(normalizeHeader);
    const index = normalizedHeaders.findIndex((header) => aliases.includes(header));
    result[field] = index >= 0 ? headers[index] : null;
    return result;
  }, {});
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function toNumber(value) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function summarize(rows) {
  const antValues = rows.map((row) => row.ant).filter(Number.isFinite);
  const ovaValues = rows.map((row) => row.ova).filter(Number.isFinite);
  const pIValues = rows.map((row) => row.pI).filter(Number.isFinite);

  return {
    count: rows.length,
    ant: describe(antValues),
    ova: describe(ovaValues),
    pI: describe(pIValues),
    specificCount: rows.filter((row) => row.ant > row.ova).length,
    patientMatched: rows.filter((row) => patientMatch(row) > 0.66).length
  };
}

function describe(values) {
  if (!values.length) {
    return { min: null, max: null, mean: null, median: null, q1: null, q3: null, unique: 0 };
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
    median: quantile(sorted, 0.5),
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
    unique: new Set(values.map((value) => String(value))).size
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
  if (!rows.length) return [];
  const ant = describe(rows.map((row) => row.ant));
  const ova = describe(rows.map((row) => row.ova));
  const pIDistanceMax = Math.max(...rows.map((row) => Math.abs(row.pI - targetPi))) || 1;
  const weights = normalizedWeights();

  const scored = rows.map((row) => {
    const target = normalize(row.ant, ant.min, ant.max);
    const specificity = 1 - normalize(row.ova, ova.min, ova.max);
    const pIMatch = 1 - Math.min(Math.abs(row.pI - targetPi) / pIDistanceMax, 1);
    const patient = patientMatch(row);
    const score = (weights.target * target)
      + (weights.specificity * specificity)
      + (weights.pI * pIMatch)
      + (weights.patient * patient);

    return {
      ...row,
      score,
      specificityDelta: row.ant - row.ova,
      patientMatch: patient,
      objectives: [target, specificity, pIMatch, patient]
    };
  });

  markPareto(scored);
  return scored.sort((a, b) => {
    if (b.pareto !== a.pareto) return Number(b.pareto) - Number(a.pareto);
    return b.score - a.score;
  });
}

function normalizedWeights() {
  const total = Object.values(state.weights).reduce((sum, value) => sum + value, 0) || 1;
  return {
    target: state.weights.target / total,
    specificity: state.weights.specificity / total,
    pI: state.weights.pI / total,
    patient: state.weights.patient / total
  };
}

function patientMatch(row) {
  const checks = [
    [state.patient.patientId, row.patientId],
    [state.patient.disease, row.disease],
    [state.patient.mutation, row.mutation],
    [state.patient.targetAntigen, row.targetAntigen]
  ].filter(([query]) => query);

  if (!checks.length) return 0.5;

  const matches = checks.filter(([query, value]) => {
    const left = normalizeText(query);
    const right = normalizeText(value);
    return right && (right.includes(left) || left.includes(right));
  }).length;

  return matches / checks.length;
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function markPareto(rows) {
  const representatives = [...rows.reduce((groups, row) => {
    const key = row.objectives.map((value) => value.toFixed(6)).join("|");
    if (!groups.has(key)) groups.set(key, row);
    return groups;
  }, new Map()).values()];

  const paretoKeys = new Set();
  for (let i = 0; i < representatives.length; i += 1) {
    let dominated = false;
    for (let j = 0; j < representatives.length; j += 1) {
      if (i !== j && dominates(representatives[j], representatives[i])) {
        dominated = true;
        break;
      }
    }
    if (!dominated) paretoKeys.add(representatives[i].objectives.map((value) => value.toFixed(6)).join("|"));
  }

  rows.forEach((row) => {
    const key = row.objectives.map((value) => value.toFixed(6)).join("|");
    row.pareto = paretoKeys.has(key);
  });
}

function dominates(a, b) {
  let better = false;
  for (let i = 0; i < a.objectives.length; i += 1) {
    if (a.objectives[i] < b.objectives[i]) return false;
    if (a.objectives[i] > b.objectives[i]) better = true;
  }
  return better;
}

async function handleCustomFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    els.status.textContent = "Importing";
    const text = await file.text();
    const parsed = parseDelimited(text);
    const headers = parsed[0] || [];
    const rawRows = Math.max(parsed.length - 1, 0);
    const rows = recordsFromTable(parsed, importId(file.name));
    if (!rows.length) {
      throw new Error("No usable rows found. Include sequence, target binding, off-target binding, and pI columns.");
    }

    const dataset = {
      id: importId(file.name),
      label: file.name.replace(/\.[^.]+$/, ""),
      description: "Browser-imported MLDE/patient variant file.",
      file: file.name,
      rows
    };

    state.importReport = {
      file: file.name,
      rawRows,
      usableRows: rows.length,
      droppedRows: rawRows - rows.length,
      mappings: detectMappings(headers),
      columns: headers
    };
    state.importedDatasets = state.importedDatasets.filter((existing) => existing.id !== dataset.id);
    state.importedDatasets.push(dataset);
    persistLocalImports();
    state.activeDataset = dataset.id;
    state.selectedId = null;
    renderTabs();
    await loadDataset();
  } catch (error) {
    els.status.textContent = "Import error";
    els.detail.innerHTML = `<h2>Import Error</h2><p class="muted">${escapeHtml(error.message)}</p>`;
  } finally {
    event.target.value = "";
  }
}

function addLiveVariant() {
  const sequence = els.liveSequence.value.trim();
  const ant = toNumber(els.liveAnt.value);
  const ova = toNumber(els.liveOva.value);
  const pI = toNumber(els.livePi.value);

  if (!sequence || ant === null || ova === null || pI === null) {
    els.status.textContent = "Live row needs values";
    return;
  }

  let live = state.importedDatasets.find((dataset) => dataset.id === "live-intake");
  if (!live) {
    live = {
      id: "live-intake",
      label: "Live intake",
      description: "Variants entered during this session.",
      file: "manual entry",
      rows: []
    };
    state.importedDatasets.push(live);
  }

  live.rows.push({
    id: `live-intake-${Date.now()}`,
    index: live.rows.length + 1,
    sample: els.liveSample.value.trim() || `Live ${live.rows.length + 1}`,
    sequence,
    ant,
    ova,
    pI,
    patientId: state.patient.patientId,
    disease: state.patient.disease,
    mutation: state.patient.mutation,
    targetAntigen: state.patient.targetAntigen,
    source: "manual",
    dataset: "live-intake"
  });

  persistLocalImports();
  state.activeDataset = live.id;
  state.selectedId = live.rows[live.rows.length - 1].id;
  [els.liveSample, els.liveSequence, els.liveAnt, els.liveOva, els.livePi].forEach((input) => {
    input.value = "";
  });
  renderTabs();
  loadDataset();
}

function exportRankedCsv() {
  const rows = filteredRows();
  if (!rows.length) {
    els.status.textContent = "No rows to export";
    return;
  }

  const headers = [
    "rank",
    "sample",
    "sequence",
    "target_binding",
    "off_target_binding",
    "pI",
    "score",
    "pareto",
    "patient_match",
    "specificity_delta",
    "patient_id",
    "disease",
    "mutation",
    "target_antigen",
    "source"
  ];

  const lines = [headers.join(",")];
  rows.forEach((row, index) => {
    lines.push([
      index + 1,
      row.sample,
      row.sequence,
      row.ant,
      row.ova,
      row.pI,
      row.score,
      row.pareto ? "yes" : "no",
      row.patientMatch,
      row.specificityDelta,
      row.patientId,
      row.disease,
      row.mutation,
      row.targetAntigen,
      row.source
    ].map(csvCell).join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.activeDataset}-ranked.csv`;
  link.click();
  URL.revokeObjectURL(url);
  els.status.textContent = "Exported";
}

function handleBeforeInstallPrompt(event) {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallUi();
}

async function handleInstallClick() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    els.installHelp.textContent = choice?.outcome === "accepted"
      ? "Installed. You can open it from your phone or computer home screen."
      : platformInstallMessage();
    updateInstallUi();
    return;
  }

  els.installCard.classList.toggle("show-steps");
  els.installHelp.textContent = platformInstallMessage();
}

function handleAppInstalled() {
  deferredInstallPrompt = null;
  els.installCard.classList.add("installed");
  els.installHelp.textContent = "Installed. Open it from your home screen like a regular app.";
  els.installApp.textContent = "Installed";
  els.installApp.disabled = true;
}

function updateInstallUi() {
  if (isStandalone()) {
    handleAppInstalled();
    return;
  }

  if (deferredInstallPrompt) {
    els.installHelp.textContent = "This app is ready to install on this device.";
    els.installApp.textContent = "Install App";
    els.installCard.classList.add("install-ready");
    return;
  }

  els.installHelp.textContent = platformInstallMessage();
  els.installApp.textContent = "Show Phone Steps";
}

function platformInstallMessage() {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) {
    return "On iPhone, use Safari: tap Share, then Add to Home Screen.";
  }
  if (/android/.test(ua)) {
    return "On Android, use Chrome: open the menu, then tap Install app or Add to Home screen.";
  }
  return "On your phone, open the live site and use the browser menu to install or add it to your home screen.";
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function importId(name) {
  const base = String(name || "custom").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `import-${base || "custom"}`;
}

function persistLocalImports() {
  try {
    localStorage.setItem("mlde-imports", JSON.stringify(state.importedDatasets));
  } catch (error) {
    // Large files can exceed localStorage. The current session still works.
  }
}

function restoreLocalImports() {
  try {
    const saved = JSON.parse(localStorage.getItem("mlde-imports") || "[]");
    if (Array.isArray(saved)) state.importedDatasets = saved;
  } catch (error) {
    state.importedDatasets = [];
  }
}

function renderMetrics() {
  const summary = state.summary || {};
  els.metrics.innerHTML = [
    metric("Variants", compact(summary.count)),
    metric("Pareto front", compact(summary.paretoCount)),
    metric("Target median", fmt(summary.ant?.median, 2)),
    metric("Off-target median", fmt(summary.ova?.median, 2)),
    metric("pI median", fmt(summary.pI?.median, 2)),
    metric("Patient matches", compact(summary.patientMatched))
  ].join("");
}

function renderDataProfile() {
  const rows = state.rows || [];
  const summary = state.summary || {};
  if (!rows.length) {
    els.dataProfile.innerHTML = `<h2>Data Profile</h2><p class="muted">No rows loaded.</p>`;
    return;
  }

  const sequenceLengths = rows.map((row) => row.sequence.length);
  const lengthStats = describe(sequenceLengths);
  const bindingMode = summary.ant?.unique <= 2 && summary.ova?.unique <= 2
    ? "Binary screen labels"
    : "Continuous measurements";
  const interpretation = bindingMode === "Binary screen labels"
    ? "This dataset is best read as sorted screening gates: 1 means enriched/present and 0 means not enriched."
    : "This dataset contains measured or predicted continuous values, so rank differences are more graded.";
  const topRows = rows.slice(0, 3).map((row, index) => (
    `<li><strong>${index + 1}. ${escapeHtml(row.sample)}</strong> score ${fmt(row.score * 100, 1)}; target ${fmt(row.ant, 2)}, off-target ${fmt(row.ova, 2)}, pI ${fmt(row.pI, 2)}</li>`
  )).join("");

  els.dataProfile.innerHTML = `
    <h2>Data Profile</h2>
    <div class="output-list">
      <div><span>Dataset</span><strong>${escapeHtml(state.label || state.activeDataset)}</strong></div>
      <div><span>Rows scored</span><strong>${compact(summary.count)}</strong></div>
      <div><span>Binding type</span><strong>${bindingMode}</strong></div>
      <div><span>Target range</span><strong>${fmt(summary.ant?.min, 2)} to ${fmt(summary.ant?.max, 2)}</strong></div>
      <div><span>Off-target range</span><strong>${fmt(summary.ova?.min, 2)} to ${fmt(summary.ova?.max, 2)}</strong></div>
      <div><span>pI range</span><strong>${fmt(summary.pI?.min, 2)} to ${fmt(summary.pI?.max, 2)}</strong></div>
      <div><span>Sequence length</span><strong>${fmt(lengthStats.min, 0)} to ${fmt(lengthStats.max, 0)} aa</strong></div>
    </div>
    <p class="muted">${interpretation}</p>
    <h3>Top Scored Candidates</h3>
    <ol class="tight-list">${topRows}</ol>
  `;
}

function renderImportReport() {
  const imported = state.importedDatasets.find((dataset) => dataset.id === state.activeDataset);
  if (!state.importReport || !imported) {
    els.importReport.innerHTML = `
      <h2>Input Check</h2>
      <p class="muted">Built-in ${escapeHtml(state.label || "dataset")} loaded. Columns are already mapped from the Tessier Lab files.</p>
    `;
    return;
  }

  const required = ["sample", "sequence", "ant", "ova", "pI"];
  const optional = ["patientId", "disease", "mutation", "targetAntigen", "source"];
  const mappingRows = required.concat(optional).map((field) => {
    const mapped = state.importReport.mappings[field];
    return `<div><span>${fieldLabel(field)}</span><strong>${mapped ? escapeHtml(mapped) : "missing"}</strong></div>`;
  }).join("");

  els.importReport.innerHTML = `
    <h2>Input Check</h2>
    <div class="output-list">
      <div><span>File</span><strong>${escapeHtml(state.importReport.file)}</strong></div>
      <div><span>Raw rows</span><strong>${compact(state.importReport.rawRows)}</strong></div>
      <div><span>Usable rows</span><strong>${compact(state.importReport.usableRows)}</strong></div>
      <div><span>Dropped rows</span><strong>${compact(state.importReport.droppedRows)}</strong></div>
      ${mappingRows}
    </div>
  `;
}

function renderRankExplanation() {
  const row = selectedRow();
  if (!row) {
    els.rankExplanation.innerHTML = `<h2>Rank Explanation</h2><p class="muted">Select a row to see score components.</p>`;
    return;
  }

  const weights = normalizedWeights();
  const components = [
    ["Target binding", row.objectives[0], weights.target],
    ["Specificity", row.objectives[1], weights.specificity],
    ["pI match", row.objectives[2], weights.pI],
    ["Patient match", row.objectives[3], weights.patient]
  ];

  els.rankExplanation.innerHTML = `
    <h2>Rank Explanation</h2>
    <p><strong>${escapeHtml(row.sample)}</strong> ranks by a weighted score across four objectives.</p>
    <div class="component-list">
      ${components.map(([label, value, weight]) => componentBar(label, value, weight)).join("")}
    </div>
    <p class="muted">Pareto means no other loaded variant is at least as good across all objectives and better in one.</p>
  `;
}

function componentBar(label, value, weight) {
  const percent = Math.max(0, Math.min(value * 100, 100));
  return `
    <div class="component">
      <div><span>${escapeHtml(label)}</span><strong>${fmt(percent, 0)}% x ${fmt(weight * 100, 0)}%</strong></div>
      <i style="--value:${percent}%"></i>
    </div>
  `;
}

function fieldLabel(field) {
  return {
    ant: "target",
    ova: "off-target",
    pI: "pI",
    patientId: "patient ID",
    targetAntigen: "target antigen"
  }[field] || field;
}

function metric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function filteredRows() {
  if (!state.search) return state.rows;
  return state.rows.filter((row) => {
    const haystack = [
      row.sample,
      row.sequence,
      row.patientId,
      row.disease,
      row.mutation,
      row.targetAntigen,
      row.source
    ].join(" ").toLowerCase();
    return haystack.includes(state.search);
  });
}

function renderTable() {
  const rows = filteredRows().slice(0, 300);
  els.rankingBody.innerHTML = rows.map((row, index) => `
    <tr data-id="${escapeHtml(row.id)}" class="${row.id === state.selectedId ? "selected" : ""}">
      <td>${index + 1}</td>
      <td>${escapeHtml(row.sample)}</td>
      <td>${fmt(row.ant, 3)}</td>
      <td>${fmt(row.ova, 3)}</td>
      <td>${fmt(row.pI, 2)}</td>
      <td>${fmt(row.patientMatch * 100, 0)}%</td>
      <td>${fmt(row.score * 100, 1)}</td>
      <td><span class="badge ${row.pareto ? "" : "off"}">${row.pareto ? "Pareto" : "Ranked"}</span></td>
    </tr>
  `).join("");

  els.rankingBody.querySelectorAll("tr").forEach((rowEl) => {
    rowEl.addEventListener("click", () => {
      state.selectedId = rowEl.dataset.id;
      renderDetail();
      renderRankExplanation();
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
    <h2>${escapeHtml(row.sample)}</h2>
    <div class="detail-grid">
      ${metric("Target", fmt(row.ant, 3))}
      ${metric("Off-target", fmt(row.ova, 3))}
      ${metric("pI", fmt(row.pI, 2))}
      ${metric("Patient", `${fmt(row.patientMatch * 100, 0)}%`)}
    </div>
    <dl class="context-list">
      <div><dt>Target</dt><dd>${escapeHtml(row.targetAntigen || "not supplied")}</dd></div>
      <div><dt>Disease</dt><dd>${escapeHtml(row.disease || "not supplied")}</dd></div>
      <div><dt>Mutation</dt><dd>${escapeHtml(row.mutation || "not supplied")}</dd></div>
      <div><dt>Source</dt><dd>${escapeHtml(row.source || row.dataset || "not supplied")}</dd></div>
    </dl>
    <div class="sequence">${escapeHtml(row.sequence)}</div>
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
  const padding = { left: 70, right: 28, top: 24, bottom: 58 };
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

  ctx.strokeStyle = "#d6dce5";
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
    ctx.fillStyle = selected ? "#c2415b" : row.pareto ? "#d49319" : "rgba(20, 120, 119, 0.62)";
    ctx.fill();
    if (selected || row.pareto) {
      ctx.strokeStyle = selected ? "#7a1f33" : "#7a5108";
      ctx.lineWidth = selected ? 2 : 1;
      ctx.stroke();
    }
  });

  els.plotSubtitle.textContent = `${state.label}: ${compact(rows.length)} visible variants`;
}

function drawAxisLabels(ctx, rect, padding, width, height, extents) {
  ctx.fillStyle = "#5b6573";
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Off-target binding", padding.left + width / 2, rect.height - 18);

  ctx.save();
  ctx.translate(18, padding.top + height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Target binding", 0, 0);
  ctx.restore();

  ctx.textAlign = "right";
  ctx.fillText(fmt(extents.antMax, 2), padding.left - 10, padding.top + 4);
  ctx.fillText(fmt(extents.antMin, 2), padding.left - 10, padding.top + height + 4);
  ctx.textAlign = "center";
  ctx.fillText(fmt(extents.ovaMin, 2), padding.left, padding.top + height + 24);
  ctx.fillText(fmt(extents.ovaMax, 2), padding.left + width, padding.top + height + 24);
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
  renderRankExplanation();
  renderTable();
  drawPlot();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

init();
