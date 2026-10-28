// The companion's five expressions (#9, #18): contento (the face as drawn), feliz, antojado,
// dormido and sorprendido. Only the eyes and the mouth change: the face's own eyes and mouth are
// taken out and new ones, marked data-expr, are drawn at the same coordinates (expresiones.json).
// Run on its own, it writes the 40 animal and expression pairs to expresiones/ and checks them:
// valid SVG in headless Chrome, and nothing but the eyes, the mouth and the sleeping «z» differs
// from the contento face.
// Usage: node design/companero/expresiones.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { chrome } from "./prendas.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const datos = JSON.parse(fs.readFileSync(path.join(here, "expresiones.json"), "utf8"));
const anclajes = JSON.parse(fs.readFileSync(path.join(here, "anclajes.json"), "utf8")).animales;
export const expresiones = datos.expresiones;

const n = (x) => +x.toFixed(2);
const trazo = (d, color, ancho = 2.8) => `<path data-expr="1" d="${d}" stroke="${color}" stroke-width="${ancho}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
const punto = (x, y, r, color) => `<circle data-expr="1" cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${color}"/>`;
const arriba = (x, y, r, color, a) => trazo(`M${n(x - r)} ${n(y + r * 0.4)}q${n(r)} ${n(-r * 1.8)} ${n(2 * r)} 0`, color, a); // ∩: closed in joy
const abajo = (x, y, r, color, a) => trazo(`M${n(x - r)} ${n(y)}q${n(r)} ${n(r * 0.9)} ${n(2 * r)} 0`, color, a); // ∪: asleep
const brillo = (x, y, r) => punto(x - r * 0.35, y - r * 0.35, r * 0.3, "#FFFFFF");

function ojos(a, e) {
  const out = [];
  a.ojos.forEach(([x, y, r], i) => {
    if (a.tipo === "panda") {
      const [px, py, pr] = a.pupilas[i];
      if (e === "feliz") out.push(arriba(x, y, r, a.color, 2.4));
      else if (e === "dormido") out.push(abajo(x, y, r, a.color, 2.4));
      else if (e === "antojado") out.push(punto(x, y, r, a.color), punto(px + 1.4, py - 0.9, pr, a.pupila), brillo(px + 1.4, py - 0.9, pr * 1.6));
      else if (e === "sorprendido") out.push(punto(x, y, r * 1.3, a.color), punto(x, y, pr, a.pupila));
    } else {
      // punto: a dark eye; pupila: the owl's pupil on its light disc, which stays
      if (e === "feliz") out.push(arriba(x, y, r, a.color, a.tipo === "pupila" ? 3.4 : 2.8));
      else if (e === "dormido") out.push(abajo(x, y, r, a.color, a.tipo === "pupila" ? 3.4 : 2.8));
      else if (e === "antojado") out.push(punto(x + r * 0.5, y - r * 0.35, r, a.color), brillo(x + r * 0.5, y - r * 0.35, r)); // eager: up, aside, shining
      else if (e === "sorprendido") {
        const rr = a.tipo === "pupila" ? r * 0.6 : r * 1.3; // wide eyes: a bigger dot, or a smaller pupil
        out.push(punto(x, y, rr, a.color), brillo(x, y, rr));
      }
    }
  });
  return out.join("");
}

function boca(a, e) {
  const b = a.boca;
  if (!b) return "";
  const c = b.color || a.color, w = b.ancho, { cx, cy } = b;
  const pre = b.prefijo ? trazo(b.prefijo, c, 3) : "";
  if (e === "feliz") return pre + `<path data-expr="1" d="M${n(cx - w / 2)} ${n(cy - 1.5)}h${w}c0 ${n(w * 0.55)}-${w} ${n(w * 0.55)}-${w} 0z" fill="${c}"/>`;
  if (e === "antojado") // a small smile with the tip of the tongue out
    return pre + `<ellipse data-expr="1" cx="${n(cx + w * 0.12)}" cy="${n(cy + 2.4)}" rx="2.6" ry="3" fill="#E8697A"/>` + trazo(`M${n(cx - w * 0.3)} ${n(cy)}c1.2 1.8 ${n(w * 0.6 - 1.2)} 1.8 ${n(w * 0.6)} 0`, c, 3);
  if (e === "dormido") return pre + trazo(`M${n(cx - w * 0.2)} ${n(cy + 0.5)}h${n(w * 0.4)}`, c, 3);
  if (e === "sorprendido") return pre + `<ellipse data-expr="1" cx="${cx}" cy="${n(cy + 1)}" rx="2.6" ry="3.2" fill="${c}"/>`;
  return "";
}

// Takes the face's own eyes and mouth out, whatever fill they inherit, by their exact coordinates
function quitarRasgos(svg, a) {
  const circulos = [...a.ojos, ...(a.pupilas || [])];
  for (const [x, y, r] of circulos) svg = svg.replace(new RegExp(`<circle cx="${x}" cy="${y}" r="${r}"[^>]*/>`, "g"), "");
  if (a.boca) svg = svg.split(`<path d="${a.boca.d}"`).map((p, i) => (i ? p.replace(/^[^>]*\/>/, "") : p)).join("");
  return svg;
}
const sinExpresion = (svg) => svg.replace(/<(path|circle|ellipse|g)[^>]*data-expr="1"[^>]*\/>/g, "");

export function expresar(svg, animal, e) {
  if (e === "contento") return svg;
  const a = datos.animales[animal];
  const top = anclajes[animal].cabeza.y;
  const zeta = e === "dormido" ? trazo(`M84 ${top - 4}h5l-5 6h5M92 ${top - 12}h3.5l-3.5 4.5h3.5`, "#8A8F9C", 1.8) : "";
  const nuevo = ojos(a, e) + boca(a, e) + zeta;
  // the new features go at the end of the face, over everything the face draws
  return quitarRasgos(svg, a).replace(/<\/g>\s*<\/svg>\s*$/, `${nuevo}</g>\n</svg>\n`);
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
  if (archivos.length !== 40 || fallas.length) process.exit(1);
}
