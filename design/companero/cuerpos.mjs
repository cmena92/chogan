// Builds the full-body companions (option A of #12): each face, from the core for the four
// current characters and from animales/ for the new ones, sits on one shared round body in the
// animal's own colours. Writes cuerpos/<id>.svg and anclajes.json.
// Usage: node design/companero/cuerpos.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const here = path.dirname(new URL(import.meta.url).pathname);
const core = fs.readFileSync(path.join(here, "../../www/lib/chogan.js"), "utf8");
const actuales = vm.runInNewContext("(" + core.match(/var MASCOT = (\{[\s\S]*?\n  \});/)[1] + ")");

// base: head and body; oscuro: ears, arms and feet; claro: muzzle and belly.
// cabeza: top of the head between the ears, where a hat rests. ojos: eye centres and radius (the
// panda's is its dark patch), for the glasses. rasgos: [x0, y0, x1, y1] of eyes, nose and mouth,
// which no garment may cover.
const ANIMALES = {
  fox: { base: "#EE9070", oscuro: "#E07A5F", claro: "#FBEDE6", cabeza: 26, cola: "zorro", ojos: { izq: 46, der: 74, y: 58, r: 5 }, rasgos: [41, 53, 79, 86] },
  owl: { base: "#6A8CBF", oscuro: "#4E6C97", claro: "#FBEDE6", cabeza: 20, brazos: "alas", ojos: { izq: 45, der: 75, y: 52, r: 6.5 }, rasgos: [30, 37, 90, 93] },
  cat: { base: "#F0BC70", oscuro: "#E4A853", claro: "#FBEDE6", cabeza: 28, cola: "gato", ojos: { izq: 47, der: 73, y: 58, r: 5.5 }, rasgos: [41, 52, 79, 83] },
  bear: { base: "#94C398", oscuro: "#7BAE7F", claro: "#E7F2E4", cabeza: 26, ojos: { izq: 47, der: 73, y: 56, r: 5 }, rasgos: [40, 51, 80, 90] },
  capybara: { base: "#C9935F", oscuro: "#A9744A", claro: "#E6BE92", cabeza: 26, ojos: { izq: 44, der: 76, y: 53, r: 5 }, rasgos: [33, 48, 87, 96] },
  conejo: { base: "#F2B3C8", oscuro: "#E59AB4", claro: "#FCE9EF", cabeza: 36, cola: "pompon", ojos: { izq: 47, der: 73, y: 63, r: 5 }, rasgos: [42, 58, 78, 95] },
  panda: { base: "#F4F1EA", oscuro: "#4A4E5C", claro: "#FFFFFF", cabeza: 26, ojos: { izq: 45, der: 75, y: 57, r: 11 }, rasgos: [34, 45, 86, 86] },
  nutria: { base: "#B59BD6", oscuro: "#9C80C2", claro: "#F1E9FA", cabeza: 24, cola: "nutria", ojos: { izq: 46, der: 74, y: 56, r: 5 }, rasgos: [34, 51, 86, 98] },
};

// Per-animal tweaks for the clothes, declared here and never drawn into a garment:
// dy moves a slot down (positive) or up, escala resizes what sits on it.
const AJUSTES = {
  owl: { cabeza: { dy: 4 } },
  conejo: { cabeza: { dy: 2, escala: 0.75 } },
};

// The shared body, in a 120 x 170 frame; the face keeps its 0..120 box on top.
const ANCLAJES_COMUNES = { cuello: { x: 60, y: 100, ancho: 40 }, cuerpo: { x: 60, y: 130, ancho: 56, alto: 44 } };

const colas = {
  zorro: (c) => `<path d="M80 148c22 4 38-10 36-34-2-8-8-12-12-10 2 16-8 24-26 26z" fill="${c.base}"/><path d="M104 104c6-2 12 2 12 10-4 0-10-2-13-6z" fill="${c.claro}"/>`,
  gato: (c) => `<path d="M86 146c14-2 22-14 18-30" stroke="${c.oscuro}" stroke-width="7" fill="none" stroke-linecap="round"/>`,
  pompon: (c) => `<circle cx="88" cy="148" r="10" fill="${c.oscuro}"/><circle cx="87" cy="147" r="6" fill="${c.claro}"/>`,
  nutria: (c) => `<path d="M84 150c16 4 28-2 32-12-8 2-20 2-30 0z" fill="${c.oscuro}"/>`,
};

function cuerpo(id, c, cara) {
  const brazos =
    c.brazos === "alas"
      ? `<path d="M32 112c-10 8-12 26-4 34 6-6 10-18 8-34z" fill="${c.oscuro}"/><path d="M88 112c10 8 12 26 4 34-6-6-10-18-8-34z" fill="${c.oscuro}"/>`
      : `<ellipse cx="32" cy="124" rx="7" ry="11" transform="rotate(20 32 124)" fill="${c.oscuro}"/><ellipse cx="88" cy="124" rx="7" ry="11" transform="rotate(-20 88 124)" fill="${c.oscuro}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 170" width="120" height="170">
  <g id="cola">${c.cola ? colas[c.cola](c) : ""}</g>
  <g id="cuerpo">
    <ellipse cx="60" cy="130" rx="30" ry="30" fill="${c.base}"/>
    <ellipse id="panza" cx="60" cy="136" rx="18" ry="19" fill="${c.claro}"/>
    <g id="brazos">${brazos}</g>
    <g id="patas" fill="${c.oscuro}"><ellipse cx="46" cy="160" rx="10" ry="6"/><ellipse cx="74" cy="160" rx="10" ry="6"/></g>
  </g>
  <g id="cara">${cara}</g>
</svg>
`;
}

const interior = (s) => s.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim();
fs.mkdirSync(path.join(here, "cuerpos"), { recursive: true });
const anclajes = {};
for (const [id, c] of Object.entries(ANIMALES)) {
  const cara = actuales[id] ? interior(actuales[id]) : interior(fs.readFileSync(path.join(here, "animales", id + ".svg"), "utf8"));
  fs.writeFileSync(path.join(here, "cuerpos", id + ".svg"), cuerpo(id, c, cara));
  anclajes[id] = {
    cabeza: { x: 60, y: c.cabeza },
    ...ANCLAJES_COMUNES,
    ojos: c.ojos,
    rasgos: { x0: c.rasgos[0], y0: c.rasgos[1], x1: c.rasgos[2], y1: c.rasgos[3] },
    ajustes: AJUSTES[id] || {},
  };
}
fs.writeFileSync(
  path.join(here, "anclajes.json"),
  JSON.stringify({ marco: { ancho: 120, alto: 170 }, nota: "Coordenadas en el marco del cuerpo entero. cabeza: donde apoya un gorro; cuello y cuerpo son comunes a los ocho; ojos: para los lentes; rasgos: zona que ninguna prenda cubre; ajustes: desplazamiento o escala de una prenda en ese animal.", animales: anclajes }, null, 2) + "\n",
);
console.log(`${Object.keys(ANIMALES).length} cuerpos y anclajes.json listos`);
