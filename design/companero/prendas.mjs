// Puts the garments of prendas/ on the full-body companions of cuerpos/, at the anchors of
// anclajes.json, and checks every animal and garment pair in headless Chrome: no garment may
// cover the features zone or leave the 120 x 170 frame, and each eye must fit inside its lens.
// Usage: node design/companero/prendas.mjs      (CHROME=/path/to/chrome to pick a browser)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

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

// The glasses follow each animal's eyes: one ring per eye, 3.5 units wider than the eye
function lentes(o) {
  const R = o.r + 3.5;
  const puente = o.der - o.izq - 2 * R > 0 ? `<path d="M${o.izq + R} ${o.y}H${o.der - R}" fill="none"/>` : "";
  return `<g data-prenda="lentes" fill="rgba(255,255,255,0.18)" stroke="#2C2620" stroke-width="2.5"><circle cx="${o.izq}" cy="${o.y}" r="${R}"/><circle cx="${o.der}" cy="${o.y}" r="${R}"/>${puente}</g>`;
}

function colocar(animal, prenda, capa) {
  const a = anclajes[animal];
  const p = catalogo.find((x) => x.id === prenda);
  if (p.anclaje === "ojos") return capa === "frente" ? lentes(a.ojos) : "";
  const punto = a[p.espacio];
  const aj = (a.ajustes && a.ajustes[p.espacio]) || {};
  const dibujo = piezas[prenda][capa];
  if (!dibujo) return "";
  return `<g data-prenda="${prenda}" transform="translate(${punto.x} ${punto.y + (aj.dy || 0)}) scale(${aj.escala || 1})">${dibujo}</g>`;
}

// The companion with the given garments: capes behind the body, sweaters over the belly and under
// the arms, everything else over the face, and the glasses last
export function componer(animal, prendas = []) {
  let s = leer("cuerpos", animal + ".svg");
  const por = (espacio) => prendas.filter((id) => catalogo.find((p) => p.id === id).espacio === espacio);
  const atras = prendas.map((id) => colocar(animal, id, "atras")).join("");
  const sueter = por("cuerpo").filter((id) => !piezas[id].atras).map((id) => colocar(animal, id, "frente")).join("");
  const frente = prendas
    .filter((id) => !(por("cuerpo").includes(id) && !piezas[id].atras))
    .sort((x, y) => (x === "lentes") - (y === "lentes"))
    .map((id) => colocar(animal, id, "frente"))
    .join("");
  s = s.replace('<g id="cuerpo">', `${atras}<g id="cuerpo">`);
  s = s.replace('<g id="brazos">', `${sueter}<g id="brazos">`);
  return s.replace(/<\/svg>\s*$/, `${frente}</svg>\n`);
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
