// Applies the companion's exclusive designs (#7, #17) to any companion SVG, with or without
// clothes. Colour designs swap the animal's base, dark and light colours; pattern designs add a
// twin of each base-coloured shape, filled with the pattern, right after it, so the muzzle, belly
// and features drawn later stay on top. Run on its own, it writes the 48 animal and design pairs
// to disenos/ and checks them: valid SVG in headless Chrome, eyes at 3:1 or more against the
// surface under them, and every pattern drawn before the eyes.
// Usage: node design/companero/disenos.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { chrome } from "./prendas.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const { disenos, ojos } = JSON.parse(fs.readFileSync(path.join(here, "disenos.json"), "utf8"));
const anclajes = JSON.parse(fs.readFileSync(path.join(here, "anclajes.json"), "utf8")).animales;
export { disenos };

// The logic itself lives in the app (www/games/companero/disenos.js), so the browser and these
// checks share one source; this script only feeds it the data.
const require = createRequire(import.meta.url);
const { aplicar: aplicarDatos } = require("../../www/games/companero/disenos.js");
const colores = Object.fromEntries(Object.entries(anclajes).map(([id, a]) => [id, a.colores]));
export function aplicar(svg, animal, disenoId) {
  return aplicarDatos(svg, animal, disenoId, { disenos, colores });
}

// WCAG relative luminance and contrast
const lum = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contraste = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// The worst contrast between an animal's eyes and every colour that can sit under them
export function contrasteOjos(animal, disenoId) {
  const d = disenos.find((x) => x.id === disenoId);
  const nat = anclajes[animal].colores;
  const o = ojos[animal];
  const col = { ...nat, ...(d.colores || {}) };
  const debajo = [].concat(col[o.sobre]);
  if (d.patron && o.sobre === "base") debajo.push(d.patron === "brillitos" ? "#FFFFFF" : col.oscuro);
  return Math.min(...debajo.map((c) => contraste(o.color, c)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const salida = path.join(here, "disenos");
  fs.rmSync(salida, { recursive: true, force: true });
  fs.mkdirSync(salida);
  const fallas = [];
  let minimo = Infinity, peor = "";
  const archivos = [];
  for (const animal of Object.keys(anclajes)) {
    const cuerpo = fs.readFileSync(path.join(here, "cuerpos", animal + ".svg"), "utf8");
    for (const d of disenos) {
      const svg = aplicar(cuerpo, animal, d.id);
      const nombre = `${animal}-${d.id}.svg`;
      fs.writeFileSync(path.join(salida, nombre), svg);
      archivos.push(nombre);
      const c = contrasteOjos(animal, d.id);
      if (c < minimo) [minimo, peor] = [c, `${animal} + ${d.id}`];
      if (c < 3) fallas.push(`${animal} + ${d.id}: contraste de los ojos ${c.toFixed(2)}:1`);
      // every pattern twin comes before the first eye in drawing order
      const ultimo = svg.lastIndexOf("data-patron=");
      const ojo = svg.toUpperCase().indexOf(`FILL="${ojos[animal].color}"`.toUpperCase(), svg.indexOf('<g id="cara">'));
      if (ultimo > -1 && ojo > -1 && ultimo > ojo) fallas.push(`${animal} + ${d.id}: el patrón se dibuja sobre los ojos`);
    }
  }
  // Valid SVG: every file parses in the browser
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "disenos-"));
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
  console.log(`${archivos.length} combinaciones, contraste mínimo ${minimo.toFixed(2)}:1 (${peor})`);
  if (archivos.length !== 48 || fallas.length) process.exit(1);
}
