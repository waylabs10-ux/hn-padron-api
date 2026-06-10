// server.js
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

// ── CORE: consulta a dondemetocavotar ─────────────────────────────────────
async function consultarPuesto(cedula) {
  const boundary = "----WebKitFormBoundaryABC123";

  const body = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="1_idNumber"`,
    ``,
    cedula,
    `--${boundary}`,
    `Content-Disposition: form-data; name="0"`,
    ``,
    `["$K1"]`,
    `--${boundary}--`,
  ].join("\r\n");

  const res = await fetch("https://dondemetocavotar.com/", {
    method: "POST",
    headers: {
      accept: "text/x-component",
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "next-action": "40b38dbcf7e6f08afa5fc160cfef38a744c61ef567",
      "next-router-state-tree":
        "%5B%22%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2Cnull%2Cnull%5D%7D%2Cnull%2Cnull%2Ctrue%5D",
    },
    body,
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const text = await res.text();
  return parsearRespuesta(text);
}

function parsearRespuesta(raw) {
  const lineas = raw.split("\n");

  for (const linea of lineas) {
    const match = linea.match(/^\d+:(\{.*\})$/);
    if (!match) continue;

    try {
      const json = JSON.parse(match[1]);
      if (json.success && json.data) return json.data;
      if (json.success === false)
        throw new Error("Cédula no encontrada en el padrón electoral");
    } catch (e) {
      if (e.message.includes("padrón")) throw e;
    }
  }

  throw new Error("No se pudo parsear la respuesta");
}

// ── VALIDACIÓN ────────────────────────────────────────────────────────────
function validarCedula(cedula) {
  // Cédula hondureña: 13 dígitos numéricos
  return /^\d{13}$/.test(cedula);
}

// ── RATE LIMITING simple en memoria ──────────────────────────────────────
const requestMap = new Map();
const LIMITE_POR_MINUTO = 10;

function rateLimiter(req, res, next) {
  const ip = req.ip;
  const ahora = Date.now();
  const ventana = 60 * 1000; // 1 minuto

  const registro = requestMap.get(ip) || { count: 0, inicio: ahora };

  if (ahora - registro.inicio > ventana) {
    // Reset ventana
    requestMap.set(ip, { count: 1, inicio: ahora });
    return next();
  }

  if (registro.count >= LIMITE_POR_MINUTO) {
    return res.status(429).json({
      success: false,
      error: "Demasiadas solicitudes. Espera un momento.",
    });
  }

  registro.count++;
  requestMap.set(ip, registro);
  next();
}

// ── RUTAS ─────────────────────────────────────────────────────────────────

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Consulta por cédula
app.get("/consulta/:dni", rateLimiter, async (req, res) => {
  const { dni } = req.params;

  // Validar formato
  if (!validarCedula(dni)) {
    return res.status(400).json({
      success: false,
      error: "Cédula inválida. Debe tener 13 dígitos numéricos.",
    });
  }

  try {
    const data = await consultarPuesto(dni);
    return res.json({ success: true, data });
  } catch (err) {
    const esNotFound = err.message.includes("padrón");
    return res.status(esNotFound ? 404 : 502).json({
      success: false,
      error: err.message,
    });
  }
});

// 404 para rutas no existentes
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Ruta no encontrada" });
});

// ── START ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 API corriendo en http://localhost:${PORT}`);
  console.log(`📡 Endpoint: GET /consulta/:dni`);
});
