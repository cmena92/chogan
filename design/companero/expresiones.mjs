// The companion's expressions (#9, #18, #33): contento (the face as drawn), feliz, antojado,
// dormido, sorprendido, guino (a wink), sonrojado (blushing), mareado (dizzy) and nam (chewing). Only the eyes and the mouth change: the face's own eyes and mouth are
// taken out and new ones, marked data-expr, are drawn at the same coordinates (expresiones.json).
// Run on its own, it writes the 72 animal and expression pairs to expresiones/ and checks them:
// valid SVG in headless Chrome, and nothing but the eyes, the mouth and the sleeping «z» differs
// from the contento face.
// Usage: node design/companero/expresiones.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { chrome } from "./prendas.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const datos = JSON.parse(fs.readFileSync(path.join(here, "expresiones.json"), "utf8"));
const anclajes = JSON.parse(fs.readFileSync(path.join(here, "anclajes.json"), "utf8")).animales;
export const expresiones = datos.expresiones;

// The logic itself lives in the app (www/games/companero/expresiones.js), so the browser and this
// check share one source; this script only feeds it the data.
const require = createRequire(import.meta.url);
const app = require("../../www/games/companero/expresiones.js");
export const datosExpresiones = {
  animales: datos.animales,
  cabeza: Object.fromEntries(Object.entries(anclajes).map(([id, a]) => [id, a.cabeza.y])),
};
const quitarRasgos = app.quitarRasgos;
const sinExpresion = app.sinExpresion;
export function expresar(svg, animal, e) {
  return app.expresar(svg, animal, e, datosExpresiones);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const salida = path.join(here, "expresiones");
  fs.rmSync(salida, { recursive: true, force: true });
  fs.mkdirSync(salida);
  const fallas = [], archivos = [];
  for (const animal of Object.keys(datos.animales)) {
    const cuerpo = fs.readFileSync(path.join(here, "cuerpos", animal + ".svg"), "utf8");
    const a = datos.animales[animal];
    // the face really has the eyes and mouth expresiones.json describes
    const quitado = quitarRasgos(cuerpo, a);
    const esperados = [...a.ojos, ...(a.pupilas || [])].length + (a.boca ? 1 : 0);
    const encontrados = (cuerpo.match(/<(circle|path)\b/g) || []).length - (quitado.match(/<(circle|path)\b/g) || []).length;
    if (encontrados !== esperados) fallas.push(`${animal}: se esperaban ${esperados} rasgos en la cara y se encontraron ${encontrados}`);
    for (const e of expresiones) {
      const svg = expresar(cuerpo, animal, e);
      const nombre = `${animal}-${e}.svg`;
      fs.writeFileSync(path.join(salida, nombre), svg);
      archivos.push(nombre);
      if (e !== "contento" && sinExpresion(quitarRasgos(svg, a)) !== quitado) fallas.push(`${animal} + ${e}: cambia algo fuera de ojos y boca`);
    }
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "expresiones-"));
  const pagina = path.join(dir, "v.html");
  fs.writeFileSync(
    pagina,
    `<!doctype html><pre id="r"></pre><script>const t=${JSON.stringify(archivos.map((f) => fs.readFileSync(path.join(salida, f), "utf8")))};const n=${JSON.stringify(archivos)};
document.getElementById("r").textContent=JSON.stringify(t.map((s,i)=>new DOMParser().parseFromString(s,"image/svg+xml").querySelector("parsererror")?n[i]:null).filter(Boolean));</script>`,
  );
  const r = spawnSync(chrome(), ["--headless=new", "--no-sandbox", `--user-data-dir=${dir}/perfil`, "--virtual-time-budget=3000", "--dump-dom", "file://" + pagina], { encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  const m = r.stdout.match(/<pre id="r">([\s\S]*?)<\/pre>/);
  if (!m) fallas.push("el navegador no devolvió la validación");
  else JSON.parse(m[1].replace(/&quot;/g, '"')).forEach((f) => fallas.push(`${f}: SVG inválido`));

  fallas.forEach((f) => console.error("✗ " + f));
  const fuera = fallas.filter((f) => f.includes("fuera de ojos")).length;
  console.log(`${archivos.length} expresiones, ${fuera} diferencias fuera de rasgos`);
  if (archivos.length !== Object.keys(datos.animales).length * expresiones.length || fallas.length) process.exit(1);
}
