import test from "node:test";
import assert from "node:assert/strict";
import {
  extractLookupAction,
  normalizeResult,
  parsearRespuesta,
  timingSafeEqualText,
  validarDni,
} from "../server.js";

test("valida exclusivamente DNI hondureño de 13 dígitos", () => {
  assert.equal(validarDni("0801199000000"), true);
  assert.equal(validarDni("0501-1985-00001"), false);
  assert.equal(validarDni("123"), false);
});

test("extrae dinámicamente la acción Next sin fijarla al despliegue", () => {
  const source = 'x=createServerReference)("40b38dbcf7e6f08afa5fc160cfef38a744c61ef567",call,void 0,map,"lookupVotingCenter");';
  assert.equal(extractLookupAction(source), "40b38dbcf7e6f08afa5fc160cfef38a744c61ef567");
});

test("interpreta y normaliza la respuesta electoral", () => {
  const raw = '0:{"success":true,"data":{"identidad":"0801199000000","nombre":" PERSONA PRUEBA ","municipio":"SAN PEDRO SULA","habilitado":true}}';
  const data = normalizeResult(parsearRespuesta(raw), "0801199000000");
  assert.equal(data.nombre, "PERSONA PRUEBA");
  assert.equal(data.municipio, "SAN PEDRO SULA");
  assert.equal(data.habilitado, true);
});

test("conserva coordenadas planas válidas del centro en Honduras", () => {
  const data = normalizeResult({
    nombre: "PERSONA PRUEBA",
    centroVotacion: "CURN",
    coordenadas_lat: "15.52210",
    coordenadas_lng: "-88.03120",
  }, "0501198500001");
  assert.equal(data.coordenadasLat, 15.5221);
  assert.equal(data.coordenadasLng, -88.0312);
  assert.equal(data.coordenadasFuente, "electoral-source");
});

test("admite GeoJSON [longitud, latitud] y descarta puntos fuera de Honduras", () => {
  const inside = normalizeResult({ coordinates: [-87.2068, 14.0723] }, "0801199000000");
  assert.equal(inside.coordenadasLat, 14.0723);
  assert.equal(inside.coordenadasLng, -87.2068);

  const outside = normalizeResult({ latitud: 4.7, longitud: -74.1 }, "0801199000000");
  assert.equal(outside.coordenadasLat, null);
  assert.equal(outside.coordenadasLng, null);
});

test("comparación de token falla de forma cerrada", () => {
  assert.equal(timingSafeEqualText("secreto", "secreto"), true);
  assert.equal(timingSafeEqualText("secreto", "otro"), false);
  assert.equal(timingSafeEqualText("", "secreto"), false);
});
