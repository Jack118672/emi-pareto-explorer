const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(__dirname, "public");
const START_PORT = Number(process.env.PORT || 3000);

const DATASETS = {
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

const cache = new Map();

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

function loadDataset(id) {
  const config = DATASETS[id];
  if (!config) {
    const error = new Error(`Unknown dataset: ${id}`);
    error.statusCode = 404;
    throw error;
  }

  const filePath = path.join(ROOT, config.file);
  const stat = fs.statSync(filePath);
  const cached = cache.get(id);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.data;

  const csv = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const parsed = parseCsv(csv);
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

  cache.set(id, { mtimeMs: stat.mtimeMs, data });
  return data;
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

function normalize(value, min, max) {
  if (max === min) return 0.5;
  return (value - min) / (max - min);
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

function dominates(a, b) {
  let better = false;
  for (let i = 0; i < a.objectives.length; i += 1) {
    if (a.objectives[i] < b.objectives[i]) return false;
    if (a.objectives[i] > b.objectives[i]) better = true;
  }
  return better;
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

function datasetResponse(id, searchParams) {
  const targetPi = Number(searchParams.get("targetPi") || 8.5);
  const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 5000), 10000));
  const data = loadDataset(id);
  const rows = scoreRows(data.rows, Number.isFinite(targetPi) ? targetPi : 8.5);

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

function sendJson(res, data, statusCode = 200) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500);
      res.end(err.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/datasets") {
      const datasets = Object.keys(DATASETS).map((id) => {
        const data = loadDataset(id);
        return {
          id: data.id,
          label: data.label,
          description: data.description,
          file: data.file,
          summary: data.summary
        };
      });
      sendJson(res, { datasets });
      return;
    }

    if (url.pathname.startsWith("/api/dataset/")) {
      const id = url.pathname.split("/").pop();
      sendJson(res, datasetResponse(id, url.searchParams));
      return;
    }

    const datasetFile = Object.values(DATASETS).find((dataset) => `/${dataset.file}` === url.pathname);
    if (datasetFile) {
      sendFile(res, path.join(ROOT, datasetFile.file));
      return;
    }

    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const safePath = path.normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(PUBLIC_DIR, safePath);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    sendFile(res, filePath);
  } catch (error) {
    sendJson(res, { error: error.message }, error.statusCode || 500);
  }
}

function listen(port) {
  const server = http.createServer(handleRequest);
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      listen(port + 1);
      return;
    }
    throw error;
  });
  server.listen(port, () => {
    console.log(`EMI Pareto app running at http://localhost:${port}`);
  });
}

listen(START_PORT);
