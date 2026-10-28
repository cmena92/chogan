// Builds vista-previa.html: the four current characters (read from the core) next to the new
// sketches, at the sizes the app draws them, on the light and the dark theme.
// Usage: node design/companero/vista-previa.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { componer, catalogo } from "./prendas.mjs";
import { aplicar, disenos } from "./disenos.mjs";
import { expresar, expresiones } from "./expresiones.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const core = fs.readFileSync(path.join(here, "../../www/lib/chogan.js"), "utf8");
const block = core.match(/var MASCOT = (\{[\s\S]*?\n  \});/)[1];
const actuales = vm.runInNewContext("(" + block + ")");
const nuevos = ["capybara", "conejo", "panda", "nutria"];

const svg = (s, size) => s.replace(/\{S\}/g, size).replace(/width="120" height="120"/, `width="${size}" height="${size}"`);
const animales = [
  ...Object.entries(actuales).map(([id, s]) => ({ id, s, nuevo: false })),
  ...nuevos.map((id) => ({ id, s: fs.readFileSync(path.join(here, "animales", id + ".svg"), "utf8"), nuevo: true })),
];
const fila = (tam) =>
  `<div class="fila">${animales.map((a) => `<figure>${svg(a.s, tam)}<figcaption>${a.id}${a.nuevo ? " ✦" : ""}</figcaption></figure>`).join("")}</div>`;
const tema = (nombre, fondo, texto) =>
  `<section style="background:${fondo};color:${texto}"><h2>${nombre}</h2>${[120, 92, 56].map((t) => `<h3>${t} px</h3>${fila(t)}`).join("")}</section>`;

// Full bodies (option A), with an optional row that marks where each slot's clothes go
const ids = [...Object.keys(actuales), ...nuevos];
const anclajes = JSON.parse(fs.readFileSync(path.join(here, "anclajes.json"), "utf8")).animales;
const cuerpoSvg = (id, alto, marcas) => {
  let s = fs.readFileSync(path.join(here, "cuerpos", id + ".svg"), "utf8").replace('width="120" height="170"', `width="${Math.round((alto * 120) / 170)}" height="${alto}"`);
  if (marcas) {
    const a = anclajes[id];
    const punto = (p, c) => `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${c}" stroke="#fff" stroke-width="1.5"/>`;
    s = s.replace("</svg>", `${punto(a.cabeza, "#D7263D")}${punto(a.cuello, "#1B998B")}${punto(a.cuerpo, "#3A86FF")}</svg>`);
  }
  return s;
};
const filaCuerpos = (alto, marcas) =>
  `<div class="fila">${ids.map((id) => `<figure>${cuerpoSvg(id, alto, marcas)}<figcaption>${id}</figcaption></figure>`).join("")}</div>`;
const cuerpos = (nombre, fondo, texto) =>
  `<section style="background:${fondo};color:${texto}"><h2>${nombre}</h2><h3>170 px</h3>${filaCuerpos(170)}<h3>100 px</h3>${filaCuerpos(100)}</section>`;

// Each garment on the eight animals, and whole outfits with the three slots at once
const vestido = (id, prendas, alto) => componer(id, prendas).replace('width="120" height="170"', `width="${Math.round((alto * 120) / 170)}" height="${alto}"`);
const filaPrenda = (prendas, alto) =>
  `<div class="fila">${ids.map((id) => `<figure>${vestido(id, prendas, alto)}<figcaption>${id}</figcaption></figure>`).join("")}</div>`;
const CONJUNTOS = [["gorra", "lazo", "sueter"], ["corona", "panuelo", "capa"], ["lentes", "lazo", "capa"]];
const ropa = `<section style="background:#FBF6EF;color:#2C2620"><h2>Prendas (#16)</h2>${catalogo
  .map((p) => `<h3>${p.nombre} · ${p.espacio}</h3>${filaPrenda([p.id], 120)}`)
  .join("")}<h2>Conjuntos completos</h2>${CONJUNTOS.map((c) => `<h3>${c.join(" + ")}</h3>${filaPrenda(c, 150)}`).join("")}</section>`;

// The exclusive designs (#17) on the eight animals
const filaDiseno = (d, alto) =>
  `<div class="fila">${ids.map((id) => `<figure>${aplicar(fs.readFileSync(path.join(here, "cuerpos", id + ".svg"), "utf8"), id, d.id).replace('width="120" height="170"', `width="${Math.round((alto * 120) / 170)}" height="${alto}"`)}<figcaption>${id}</figcaption></figure>`).join("")}</div>`;
const colores = (nombre, fondo, texto) =>
  `<section style="background:${fondo};color:${texto}"><h2>${nombre}</h2>${disenos.map((d) => `<h3>${d.nombre} · ${d.precio ? d.precio + " monedas" : "incluido"}</h3>${filaDiseno(d, 110)}`).join("")}</section>`;

// The five expressions (#18), at the largest and the smallest size the companion is drawn
const filaExpr = (e, alto) =>
  `<div class="fila">${ids.map((id) => `<figure>${expresar(fs.readFileSync(path.join(here, "cuerpos", id + ".svg"), "utf8"), id, e).replace('width="120" height="170"', `width="${Math.round((alto * 120) / 170)}" height="${alto}"`)}<figcaption>${id}</figcaption></figure>`).join("")}</div>`;
const caras = `<section style="background:#FBF6EF;color:#2C2620"><h2>Expresiones (#18)</h2>${[120, 56]
  .map((t) => `<h3>${t} px</h3>${expresiones.map((e) => `<h3>${e}</h3>${filaExpr(e, Math.round((t * 170) / 120))}`).join("")}`)
  .join("")}</section>`;

fs.writeFileSync(
  path.join(here, "vista-previa.html"),
  `<!doctype html><meta charset="utf-8"><title>Compañero · bocetos de animales</title>
<style>body{margin:0;font:14px system-ui}section{padding:16px 24px}h2{margin:0 0 4px}h3{margin:12px 0 4px;font-size:12px;opacity:.7}
.fila{display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap}figure{margin:0;text-align:center}figcaption{font-size:11px;opacity:.75}</style>
<p style="padding:8px 24px;margin:0">Los cuatro actuales (del núcleo) y los cuatro nuevos (✦), issue #12.</p>
${tema("Tema claro", "#FBF6EF", "#2C2620")}${tema("Tema oscuro", "#1E1B18", "#F2EDE6")}
${cuerpos("Cuerpo entero · tema claro", "#FBF6EF", "#2C2620")}${cuerpos("Cuerpo entero · tema oscuro", "#1E1B18", "#F2EDE6")}
${caras}
${ropa}
${colores("Diseños exclusivos (#17) · tema claro", "#FBF6EF", "#2C2620")}${colores("Diseños exclusivos (#17) · tema oscuro", "#1E1B18", "#F2EDE6")}
<section style="background:#FBF6EF"><h2>Anclajes de la ropa</h2><p>Rojo: cabeza (gorro, corona, lentes) · verde: cuello (lazo, pañuelo) · azul: cuerpo (suéter, capa).</p>${filaCuerpos(170, true)}</section>`,
);
console.log("vista-previa.html lista");
