import crypto from "node:crypto";
import express from "express";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.PORT || 3000);
const API_TOKEN = String(process.env.HN_API_TOKEN || "");
const UPSTREAM_URL = String(process.env.HN_UPSTREAM_URL || "https://dondemetocavotar.com/");
const CONFIGURED_ACTION = String(process.env.HN_UPSTREAM_NEXT_ACTION || "");
const UPSTREAM_TIMEOUT_MS = Number(process.env.HN_UPSTREAM_TIMEOUT_MS || 20_000);
const CACHE_TTL_MS = Number(process.env.HN_CACHE_TTL_MS || 12 * 60 * 60 * 1_000);
const MAX_CACHE_ENTRIES = Number(process.env.HN_MAX_CACHE_ENTRIES || 10_000);
const MAX_CONCURRENT = Number(process.env.HN_MAX_CONCURRENT || 8);
const MAX_QUEUED = Number(process.env.HN_MAX_QUEUED || 200);
const RATE_LIMIT_PER_MINUTE = Number(process.env.HN_RATE_LIMIT_PER_MINUTE || 600);
const ACTION_TTL_MS = 30 * 60 * 1_000;

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "2kb", strict: true }));
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cache-Control": "no-store",
  });
  next();
});

class ApiError extends Error {
  constructor(code, status, message) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

class TaskQueue {
  constructor(maxConcurrent, maxQueued) {
    this.maxConcurrent = Math.max(1, maxConcurrent);
    this.maxQueued = Math.max(1, maxQueued);
    this.active = 0;
    this.queue = [];
  }

  run(task) {
    if (this.active >= this.maxConcurrent && this.queue.length >= this.maxQueued) {
      throw new ApiError("BUSY", 503, "El servicio está ocupado. Intenta de nuevo en unos segundos.");
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.drain();
    });
  }

  drain() {
    while (this.active < this.maxConcurrent && this.queue.length) {
      const item = this.queue.shift();
      this.active += 1;
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }
}

const upstreamQueue = new TaskQueue(MAX_CONCURRENT, MAX_QUEUED);
const resultCache = new Map();
const rateBuckets = new Map();
let actionCache = { value: CONFIGURED_ACTION || null, expiresAt: CONFIGURED_ACTION ? Number.MAX_SAFE_INTEGER : 0 };

function timingSafeEqualText(actual, expected) {
  const a = Buffer.from(String(actual || ""));
  const b = Buffer.from(String(expected || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function bearerToken(req) {
  const authorization = String(req.get("authorization") || "");
  if (/^Bearer\s+/i.test(authorization)) return authorization.replace(/^Bearer\s+/i, "").trim();
  return String(req.get("x-api-key") || "").trim();
}

function requireApiToken(req, res, next) {
  if (!API_TOKEN || !timingSafeEqualText(bearerToken(req), API_TOKEN)) {
    return res.status(401).json({ success: false, code: "UNAUTHORIZED", error: "No autorizado" });
  }
  next();
}

function rateLimiter(req, res, next) {
  const minute = Math.floor(Date.now() / 60_000);
  const key = crypto.createHash("sha256")
    .update(`${req.ip}|${bearerToken(req).slice(0, 12)}|${minute}`)
    .digest("hex");
  const count = (rateBuckets.get(key) || 0) + 1;
  rateBuckets.set(key, count);
  if (rateBuckets.size > 2_000) {
    for (const bucketKey of rateBuckets.keys()) {
      if (bucketKey !== key) rateBuckets.delete(bucketKey);
      if (rateBuckets.size <= 1_000) break;
    }
  }
  if (count > RATE_LIMIT_PER_MINUTE) {
    res.set("Retry-After", "60");
    return res.status(429).json({ success: false, code: "RATE_LIMITED", error: "Límite temporal de consultas alcanzado" });
  }
  next();
}

function validarDni(dni) {
  return /^\d{13}$/.test(String(dni || ""));
}

function dniCacheKey(dni) {
  return crypto.createHash("sha256").update(String(dni)).digest("hex");
}

function getCached(dni) {
  const key = dniCacheKey(dni);
  const entry = resultCache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) resultCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(dni, data) {
  if (resultCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = resultCache.keys().next().value;
    if (oldestKey) resultCache.delete(oldestKey);
  }
  resultCache.set(dniCacheKey(dni), { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function parsearRespuesta(raw) {
  for (const line of String(raw || "").split("\n")) {
    const match = line.match(/^\d+:(\{.*\})$/);
    if (!match) continue;
    try {
      const payload = JSON.parse(match[1]);
      if (payload?.success === true && payload?.data) return payload.data;
      if (payload?.success === false) {
        throw new ApiError("NOT_FOUND", 404, "DNI no encontrado en el padrón electoral");
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
    }
  }
  throw new ApiError("UPSTREAM_INVALID_RESPONSE", 502, "La fuente electoral devolvió una respuesta inesperada");
}

function extractLookupAction(source) {
  const named = String(source || "").match(/createServerReference\)\(\"([0-9a-f]{40,64})\"[^;]{0,220}\"lookupVotingCenter\"\)/i);
  return named?.[1] || null;
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new ApiError("UPSTREAM_TIMEOUT", 504, "La fuente electoral agotó el tiempo de respuesta");
    throw new ApiError("UPSTREAM_UNAVAILABLE", 502, "No fue posible conectar con la fuente electoral");
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverLookupAction() {
  if (actionCache.value && actionCache.expiresAt > Date.now()) return actionCache.value;
  const page = await fetchWithTimeout(UPSTREAM_URL, { headers: { Accept: "text/html", "User-Agent": "VOTOMAP-HN/2.0" } });
  if (!page.ok) throw new ApiError("UPSTREAM_UNAVAILABLE", 502, "La fuente electoral no está disponible");
  const html = await page.text();
  const scripts = [...html.matchAll(/<script[^>]+src=[\"']([^\"']+\.js[^\"']*)[\"']/gi)]
    .map((match) => new URL(match[1].replaceAll("&amp;", "&"), UPSTREAM_URL).toString());
  for (const scriptUrl of [...new Set(scripts)].slice(-12).reverse()) {
    const response = await fetchWithTimeout(scriptUrl, { headers: { Accept: "application/javascript", "User-Agent": "VOTOMAP-HN/2.0" } });
    if (!response.ok) continue;
    const action = extractLookupAction(await response.text());
    if (action) {
      actionCache = { value: action, expiresAt: Date.now() + ACTION_TTL_MS };
      return action;
    }
  }
  throw new ApiError("UPSTREAM_ACTION_NOT_FOUND", 502, "No se pudo localizar el servicio de consulta electoral");
}

function normalizeResult(data, dni) {
  const clean = (value, max = 220) => value == null ? null : String(value).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) || null;
  return {
    identidad: dni,
    nombre: clean(data.nombre, 180),
    sexo: clean(data.sexo, 30),
    departamento: clean(data.departamento, 100),
    municipio: clean(data.municipio, 120),
    sectorElectoral: clean(data.sectorElectoral, 180),
    centroVotacion: clean(data.centroVotacion, 220),
    jrv: clean(data.jrv, 30),
    linea: clean(data.linea, 30),
    habilitado: typeof data.habilitado === "boolean" ? data.habilitado : null,
    fullAddress: clean(data.fullAddress, 420),
  };
}

async function callUpstream(dni, refreshAction = false) {
  if (refreshAction && !CONFIGURED_ACTION) actionCache = { value: null, expiresAt: 0 };
  const action = await discoverLookupAction();
  const boundary = `----VOTOMAP${crypto.randomBytes(12).toString("hex")}`;
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="1_idNumber"',
    "",
    dni,
    `--${boundary}`,
    'Content-Disposition: form-data; name="0"',
    "",
    '["$K1"]',
    `--${boundary}--`,
  ].join("\r\n");
  const response = await fetchWithTimeout(UPSTREAM_URL, {
    method: "POST",
    headers: {
      Accept: "text/x-component",
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Next-Action": action,
      "Next-Router-State-Tree": encodeURIComponent('["",{"children":["__PAGE__",{},null,null]},null,null,true]'),
      "User-Agent": "VOTOMAP-HN/2.0",
    },
    body,
  });
  if (!response.ok) {
    if (!refreshAction && !CONFIGURED_ACTION && [404, 409, 500].includes(response.status)) return callUpstream(dni, true);
    throw new ApiError("UPSTREAM_ERROR", 502, `La fuente electoral respondió con estado ${response.status}`);
  }
  return normalizeResult(parsearRespuesta(await response.text()), dni);
}

async function consultarPuesto(dni) {
  const cached = getCached(dni);
  if (cached) return { data: cached, source: "cache" };
  const data = await upstreamQueue.run(() => callUpstream(dni));
  setCached(dni, data);
  return { data, source: "electoral-source" };
}

app.get("/health", (_req, res) => {
  res.json({
    status: API_TOKEN ? "ok" : "misconfigured",
    service: "hn-padron-api",
    version: "2.0.0",
    queue: { active: upstreamQueue.active, pending: upstreamQueue.queue.length },
    timestamp: new Date().toISOString(),
  });
});

app.post("/v1/consulta", requireApiToken, rateLimiter, async (req, res, next) => {
  const dni = String(req.body?.dni || "").replace(/[-\s]/g, "");
  if (!validarDni(dni)) return res.status(400).json({ success: false, code: "INVALID_DNI", error: "El DNI debe tener 13 dígitos numéricos" });
  try {
    const result = await consultarPuesto(dni);
    res.json({ success: true, source: result.source, data: result.data });
  } catch (error) {
    next(error);
  }
});

// Compatibilidad temporal. VOTOMAP usa POST para evitar que el DNI quede
// expuesto en URLs y logs del proxy.
app.get("/consulta/:dni", requireApiToken, rateLimiter, async (req, res, next) => {
  const dni = String(req.params.dni || "").replace(/[-\s]/g, "");
  if (!validarDni(dni)) return res.status(400).json({ success: false, code: "INVALID_DNI", error: "El DNI debe tener 13 dígitos numéricos" });
  try {
    const result = await consultarPuesto(dni);
    res.json({ success: true, source: result.source, data: result.data });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error instanceof ApiError ? error.status : 500;
  const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
  if (status >= 500) console.error(`[hn-padron-api] ${code}`);
  res.status(status).json({ success: false, code, error: status >= 500 ? "El servicio electoral no está disponible temporalmente" : error.message });
});

app.use((_req, res) => res.status(404).json({ success: false, code: "NOT_FOUND", error: "Ruta no encontrada" }));

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  if (!API_TOKEN) {
    console.error("HN_API_TOKEN es obligatorio");
    process.exit(1);
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`hn-padron-api v2 listening on :${PORT}`));
}

export { app, extractLookupAction, normalizeResult, parsearRespuesta, timingSafeEqualText, validarDni };
