// consultar-puesto.js
// Uso: node consultar-puesto.js 0801199001234

const dni = process.argv[2];

if (!dni) {
  console.error("❌ Uso: node consultar-puesto.js <numero_cedula>");
  process.exit(1);
}

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
  // La respuesta viene en múltiples líneas "0:{...}" "1:{...}"
  // La que nos interesa es la línea que empieza con "1:"
  const lineas = raw.split("\n");

  for (const linea of lineas) {
    const match = linea.match(/^\d+:(\{.*\})$/);
    if (!match) continue;

    try {
      const json = JSON.parse(match[1]);

      if (json.success && json.data) {
        return json.data;
      }

      if (json.success === false) {
        throw new Error("Cédula no encontrada en el padrón electoral");
      }
    } catch (e) {
      if (e.message.includes("padrón")) throw e;
      // línea no parseable, continuar
    }
  }

  throw new Error("No se pudo parsear la respuesta del servidor");
}

function mostrarResultado(data) {
  console.log("\n✅ VOTANTE ENCONTRADO");
  console.log("─".repeat(40));
  console.log(`👤 Nombre:          ${data.nombre}`);
  console.log(`🪪 Identidad:       ${data.identidad}`);
  console.log(`⚥  Sexo:            ${data.sexo}`);
  console.log(`📍 Departamento:    ${data.departamento}`);
  console.log(`🏙️  Municipio:       ${data.municipio}`);
  console.log(`🏘️  Sector:          ${data.sectorElectoral}`);
  console.log(`🏫 Centro votación: ${data.centroVotacion}`);
  console.log(`🗳️  JRV:             ${data.jrv}`);
  console.log(`📋 Línea:           ${data.linea}`);
  console.log(`✔️  Habilitado:      ${data.habilitado ? "SÍ" : "NO"}`);
  console.log(`📌 Dirección:       ${data.fullAddress}`);
  console.log("─".repeat(40));
}

// ── MAIN ──────────────────────────────────────────────
consultarPuesto(dni)
  .then((data) => {
    mostrarResultado(data);
    // Si necesitas el objeto JSON puro:
    // console.log(JSON.stringify(data, null, 2));
  })
  .catch((err) => {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  });
