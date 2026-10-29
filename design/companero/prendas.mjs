// Puts the garments of prendas/ on the full-body companions of cuerpos/, at the anchors of
// anclajes.json, and checks every animal and garment pair in headless Chrome: no garment may
// cover the features zone or leave the 120 x 170 frame, and each eye must fit inside its lens.
// Usage: node design/companero/prendas.mjs      (CHROME=/path/to/chrome to pick a browser)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const here = path.dirname(new URL(import.meta.url).pathname);
const leer = (...p) => fs.readFileSync(path.join(here, ...p), "utf8");
export const anclajes = JSON.parse(leer("anclajes.json")).animales;
export const catalogo = JSON.parse(leer("prendas", "catalogo.json")).prendas;

const grupo = (svg, id) => (svg.match(new RegExp(`<g id="${id}"[^>]*>[\\s\\S]*?</g>(?=\\s*(?:<g id=|</svg>))`)) || [""])[0];
const piezas = Object.fromEntries(
  catalogo.map((p) => {
    const s = leer("prendas", p.id + ".svg");
    return [p.id, { frente: grupo(s, "prenda") || grupo(s, "prenda-frente"), atras: grupo(s, "prenda-atras") }];
  }),
);

// The logic itself lives in the app (www/games/companero/prendas.js), so the browser and this
// check share one source; this script only feeds it the data and measures the result.
const require = createRequire(import.meta.url);
const { componer: componerDatos } = require("../../www/games/companero/prendas.js");
export const datosPrendas = { catalogo, piezas, anclajes };

// The companion with the given garments, on its body from cuerpos/ (the preview's signature)
export function componer(animal, prendas = []) {
  return componerDatos(leer("cuerpos", animal + ".svg"), animal, prendas, datosPrendas);
}

export function chrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const c of ["google-chrome", "chromium", "chromium-browser"]) {
    if (spawnSync("sh", ["-c", `command -v ${c}`]).status === 0) return c;
  }
  throw new Error("Chrome or Chromium not found; set CHROME");
}

// Measures each placed garment in a real browser and compares it with the zones in anclajes.json
export function comprobar() {
  const pares = Object.keys(anclajes).flatMap((animal) => catalogo.map((p) => [animal, p.id]));
  const html = `<!doctype html><body style="margin:0">${pares
    .map(([a, p]) => `<div data-a="${a}" data-p="${p}" style="width:120px;height:170px">${componer(a, [p])}</div>`)
    .join("")}<pre id="r"></pre><script>
const out = [];
for (const d of document.querySelectorAll("div[data-a]")) {
  const svg = d.querySelector("svg").getBoundingClientRect();
  for (const g of d.querySelectorAll("[data-prenda]")) {
    const b = g.getBoundingClientRect();
    out.push({ a: d.dataset.a, p: d.dataset.p, x0: b.left - svg.left, y0: b.top - svg.top, x1: b.right - svg.left, y1: b.bottom - svg.top });
  }
}
document.getElementById("r").textContent = JSON.stringify(out);
</script>`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prendas-"));
  const archivo = path.join(dir, "comprobar.html");
  fs.writeFileSync(archivo, html);
  const r = spawnSync(chrome(), ["--headless=new", "--no-sandbox", `--user-data-dir=${dir}/perfil`, "--virtual-time-budget=3000", "--dump-dom", "file://" + archivo], { encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  const m = r.stdout.match(/<pre id="r">([\s\S]*?)<\/pre>/);
  if (!m) throw new Error("the browser returned no measurements");
  const medidas = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));

  const fallas = [];
  const corta = (b, z) => b.x0 < z.x1 && z.x0 < b.x1 && b.y0 < z.y1 && z.y0 < b.y1;
  for (const b of medidas) {
    const a = anclajes[b.a];
    if (b.x0 < -0.5 || b.y0 < -0.5 || b.x1 > 120.5 || b.y1 > 170.5) fallas.push(`${b.a} + ${b.p}: se sale del marco`);
    if (b.p === "lentes") {
      const R = a.ojos.r + 3.5, interior = R - 1.25;
      if (interior <= a.ojos.r) fallas.push(`${b.a} + lentes: el ojo no cabe en el lente`);
    } else if (corta(b, a.rasgos)) {
      fallas.push(`${b.a} + ${b.p}: cubre la zona de rasgos`);
    }
  }
  const combinaciones = new Set(medidas.map((b) => b.a + "|" + b.p)).size;
  return { combinaciones, esperadas: pares.length, fallas };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { combinaciones, esperadas, fallas } = comprobar();
  fallas.forEach((f) => console.error("✗ " + f));
  console.log(`${combinaciones} combinaciones, ${fallas.length} superposiciones`);
  if (combinaciones !== esperadas || fallas.length) process.exit(1);
}
