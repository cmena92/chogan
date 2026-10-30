// Puts the care scenes of #32 (eating, a bubble bath, playing) on the eight companions, dressed,
// and checks every animal and scene in headless Chrome: nothing may leave the 120 x 170 frame, the
// bubbles and the ball may not cover the features zone, and the food must rest by the mouth.
// Usage: node design/companero/escenas.mjs      (CHROME=/path/to/chrome to pick a browser)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { anclajes, chrome, componer } from "./prendas.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const leer = (...p) => fs.readFileSync(path.join(here, ...p), "utf8");
const json = JSON.parse(leer("escenas.json"));

// The logic itself lives in the app (www/games/companero/escenas.js), one source for both
const require = createRequire(import.meta.url);
const app = require("../../www/games/companero/escenas.js");
export const comidas = [...json.comidas, "jabon"];
export const datosEscenas = {
  bocas: json.bocas,
  burbujas: json.burbujas,
  pelota: json.pelota,
  comidas: Object.fromEntries(comidas.map((id) => [id, leer("comidas", id + ".svg")])),
};
export function escena(svg, animal, tipo, comida) {
  return app.escena(svg, animal, tipo, datosEscenas, { comida });
}

// Every animal with each food eaten, the bath and the ball, dressed so the scene sits over clothes
export const casos = Object.keys(anclajes).flatMap((a) => [
  ...json.comidas.map((c) => [a, "comer", c]),
  [a, "banio"],
  [a, "jugar"],
]);
const vestido = (a) => componer(a, ["gorra", "lazo", "sueter"]);

export function comprobar() {
  const html = `<!doctype html><body style="margin:0">${casos
    .map(([a, t, c]) => `<div data-a="${a}" data-t="${t}" style="width:120px;height:170px">${escena(vestido(a), a, t, c)}</div>`)
    .join("")}<pre id="r"></pre><script>
const out = [];
for (const d of document.querySelectorAll("div[data-a]")) {
  const svg = d.querySelector("svg").getBoundingClientRect();
  const capa = d.querySelector("[data-escena]");
  const partes = capa ? [...capa.children] : [];
  out.push({ a: d.dataset.a, t: d.dataset.t, hay: !!capa, partes: partes.map((g) => { const b = g.getBoundingClientRect(); return { x0: b.left - svg.left, y0: b.top - svg.top, x1: b.right - svg.left, y1: b.bottom - svg.top }; }) });
}
document.getElementById("r").textContent = JSON.stringify(out);
</script>`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "escenas-"));
  const archivo = path.join(dir, "comprobar.html");
  fs.writeFileSync(archivo, html);
  const r = spawnSync(chrome(), ["--headless=new", "--no-sandbox", `--user-data-dir=${dir}/perfil`, "--virtual-time-budget=3000", "--dump-dom", "file://" + archivo], { encoding: "utf8" });
  fs.rmSync(dir, { recursive: true, force: true });
  const m = r.stdout.match(/<pre id="r">([\s\S]*?)<\/pre>/);
  if (!m) throw new Error("the browser returned no measurements");
  const medidas = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));

  const fallas = [];
  const corta = (b, z) => b.x0 < z.x1 && z.x0 < b.x1 && b.y0 < z.y1 && z.y0 < b.y1;
  for (const s of medidas) {
    const nombre = `${s.a} + ${s.t}`;
    if (!s.hay || !s.partes.length) { fallas.push(`${nombre}: no dibuja la escena`); continue; }
    for (const b of s.partes) {
      if (b.x0 < -0.5 || b.y0 < -0.5 || b.x1 > 120.5 || b.y1 > 170.5) fallas.push(`${nombre}: se sale del marco`);
      if (s.t !== "comer" && corta(b, anclajes[s.a].rasgos)) fallas.push(`${nombre}: cubre la zona de rasgos`);
    }
    if (s.t === "comer") {
      const b = s.partes[0], [bx, by] = json.bocas[s.a];
      const cerca = bx >= b.x0 - 4 && bx <= b.x1 + 4 && by >= b.y0 - 4 && by <= b.y1 + 4;
      if (!cerca) fallas.push(`${nombre}: la comida no queda junto a la boca`);
    }
  }
  return { escenas: medidas.length, esperadas: casos.length, fallas };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { escenas, esperadas, fallas } = comprobar();
  fallas.forEach((f) => console.error("✗ " + f));
  console.log(`${escenas} escenas, ${fallas.length} fallas`);
  if (escenas !== esperadas || fallas.length) process.exit(1);
}
