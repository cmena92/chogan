/* Capybara's companion: its five expressions (epic #2, #9 and #18).
   One source for the app and for design/companero/expresiones.mjs, which checks the 40 animal and
   expression pairs. Only the eyes and the mouth change: the face's own are taken out by their
   exact coordinates and new ones, marked data-expr, are drawn at the end of the face. Pure string
   work, no DOM: where each face draws its features and the top of each head come in as `datos`. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CompaneroExpresiones = factory();
})(this, function () {
  'use strict';

  var EXPRESIONES = ['contento', 'feliz', 'antojado', 'dormido', 'sorprendido', 'guino', 'sonrojado', 'mareado', 'nam'];

  function n(x) { return +x.toFixed(2); }
  function trazo(d, color, ancho) {
    if (ancho === undefined) ancho = 2.8;
    return '<path data-expr="1" d="' + d + '" stroke="' + color + '" stroke-width="' + ancho + '" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  function punto(x, y, r, color) { return '<circle data-expr="1" cx="' + n(x) + '" cy="' + n(y) + '" r="' + n(r) + '" fill="' + color + '"/>'; }
  // ∩: closed in joy; ∪: asleep
  function arriba(x, y, r, color, a) { return trazo('M' + n(x - r) + ' ' + n(y + r * 0.4) + 'q' + n(r) + ' ' + n(-r * 1.8) + ' ' + n(2 * r) + ' 0', color, a); }
  function abajo(x, y, r, color, a) { return trazo('M' + n(x - r) + ' ' + n(y) + 'q' + n(r) + ' ' + n(r * 0.9) + ' ' + n(2 * r) + ' 0', color, a); }
  function brillo(x, y, r) { return punto(x - r * 0.35, y - r * 0.35, r * 0.3, '#FFFFFF'); }
  // @: dizzy, a small spiral that winds out from the eye's centre
  function espiral(x, y, r, color, a) {
    var s = r * 0.25;
    return trazo('M' + n(x - s) + ' ' + n(y) + 'a' + n(s) + ' ' + n(s) + ' 0 1 1 ' + n(2 * s) + ' 0a' + n(2 * s) + ' ' + n(2 * s) + ' 0 1 1 ' + n(-3.5 * s) + ' 0a' + n(3 * s) + ' ' + n(3 * s) + ' 0 1 1 ' + n(5.5 * s) + ' 0', color, a);
  }
  // pink cheeks under the eyes, for «sonrojado»
  function mejillas(a) {
    return a.ojos.map(function (o, i) {
      var x = o[0] + (i ? 4 : -4), y = o[1] + o[2] * 2.4;
      return '<ellipse data-expr="1" cx="' + n(x) + '" cy="' + n(y) + '" rx="' + n(o[2] * 1.2) + '" ry="' + n(o[2] * 0.7) + '" fill="#F497A9" fill-opacity=".75"/>';
    }).join('');
  }

  function ojos(a, e) {
    var out = [];
    a.ojos.forEach(function (o, i) {
      var x = o[0], y = o[1], r = o[2];
      if (a.tipo === 'panda') {
        var p = a.pupilas[i], px = p[0], py = p[1], pr = p[2];
        if (e === 'feliz') out.push(arriba(x, y, r, a.color, 2.4));
        else if (e === 'dormido') out.push(abajo(x, y, r, a.color, 2.4));
        else if (e === 'antojado') out.push(punto(x, y, r, a.color), punto(px + 1.4, py - 0.9, pr, a.pupila), brillo(px + 1.4, py - 0.9, pr * 1.6));
        else if (e === 'sorprendido') out.push(punto(x, y, r * 1.3, a.color), punto(x, y, pr, a.pupila));
        else if (e === 'guino') out.push(i ? arriba(x, y, r, a.color, 2.4) : punto(x, y, r, a.color) + punto(px, py, pr, a.pupila));
        else if (e === 'sonrojado' || e === 'nam') out.push(arriba(x, y, r, a.color, 2.4));
        else if (e === 'mareado') out.push(espiral(x, y, r * 1.1, a.color, 1.6));
      } else {
        // punto: a dark eye; pupila: the owl's pupil on its light disc, which stays
        if (e === 'feliz') out.push(arriba(x, y, r, a.color, a.tipo === 'pupila' ? 3.4 : 2.8));
        else if (e === 'dormido') out.push(abajo(x, y, r, a.color, a.tipo === 'pupila' ? 3.4 : 2.8));
        else if (e === 'antojado') out.push(punto(x + r * 0.5, y - r * 0.35, r, a.color), brillo(x + r * 0.5, y - r * 0.35, r)); // eager: up, aside, shining
        else if (e === 'sorprendido') {
          var rr = a.tipo === 'pupila' ? r * 0.6 : r * 1.3; // wide eyes: a bigger dot, or a smaller pupil
          out.push(punto(x, y, rr, a.color), brillo(x, y, rr));
        }
        // a wink: the left eye as drawn, the right one closed in joy
        else if (e === 'guino') out.push(i ? arriba(x, y, r, a.color, a.tipo === 'pupila' ? 3.4 : 2.8) : punto(x, y, r, a.color));
        else if (e === 'sonrojado' || e === 'nam') out.push(arriba(x, y, r, a.color, a.tipo === 'pupila' ? 3.4 : 2.8));
        else if (e === 'mareado') out.push(espiral(x, y, r * 1.2, a.color, a.tipo === 'pupila' ? 2 : 1.6));
      }
    });
    return out.join('');
  }

  function boca(a, e) {
    var b = a.boca;
    if (!b) return '';
    var c = b.color || a.color, w = b.ancho, cx = b.cx, cy = b.cy;
    var pre = b.prefijo ? trazo(b.prefijo, c, 3) : '';
    if (e === 'feliz') return pre + '<path data-expr="1" d="M' + n(cx - w / 2) + ' ' + n(cy - 1.5) + 'h' + w + 'c0 ' + n(w * 0.55) + '-' + w + ' ' + n(w * 0.55) + '-' + w + ' 0z" fill="' + c + '"/>';
    if (e === 'antojado') // a small smile with the tip of the tongue out
      return pre + '<ellipse data-expr="1" cx="' + n(cx + w * 0.12) + '" cy="' + n(cy + 2.4) + '" rx="2.6" ry="3" fill="#E8697A"/>' + trazo('M' + n(cx - w * 0.3) + ' ' + n(cy) + 'c1.2 1.8 ' + n(w * 0.6 - 1.2) + ' 1.8 ' + n(w * 0.6) + ' 0', c, 3);
    if (e === 'dormido') return pre + trazo('M' + n(cx - w * 0.2) + ' ' + n(cy + 0.5) + 'h' + n(w * 0.4), c, 3);
    if (e === 'sorprendido') return pre + '<ellipse data-expr="1" cx="' + cx + '" cy="' + n(cy + 1) + '" rx="2.6" ry="3.2" fill="' + c + '"/>';
    // a closed smile, for the wink and the blush
    if (e === 'guino' || e === 'sonrojado') return pre + trazo('M' + n(cx - w / 2) + ' ' + n(cy - 1) + 'c2 3.5 ' + n(w - 2) + ' 3.5 ' + w + ' 0', c, 3);
    // a wobbly line
    if (e === 'mareado') return pre + trazo('M' + n(cx - w / 2) + ' ' + n(cy) + 'q' + n(w / 4) + ' -3 ' + n(w / 2) + ' 0t' + n(w / 2) + ' 0', c, 3);
    // chewing: a «w»
    if (e === 'nam') return pre + trazo('M' + n(cx - w / 2) + ' ' + n(cy - 1) + 'q' + n(w / 4) + ' 3.5 ' + n(w / 2) + ' 0q' + n(w / 4) + ' 3.5 ' + n(w / 2) + ' 0', c, 3);
    return '';
  }

  // Takes the face's own eyes and mouth out, whatever fill they inherit, by their exact coordinates
  function quitarRasgos(svg, a) {
    var circulos = a.ojos.concat(a.pupilas || []);
    circulos.forEach(function (o) {
      svg = svg.replace(new RegExp('<circle cx="' + o[0] + '" cy="' + o[1] + '" r="' + o[2] + '"[^>]*/>', 'g'), '');
    });
    if (a.boca) svg = svg.split('<path d="' + a.boca.d + '"').map(function (p, i) { return i ? p.replace(/^[^>]*\/>/, '') : p; }).join('');
    return svg;
  }
  function sinExpresion(svg) { return svg.replace(/<(path|circle|ellipse|g)[^>]*data-expr="1"[^>]*\/>/g, ''); }

  // datos: { animales: { animal: { tipo, color, ojos, pupilas?, pupila?, boca? } }, cabeza: { animal: y } }
  function expresar(svg, animal, e, datos) {
    var a = datos.animales[animal];
    if (e === 'contento' || !a || EXPRESIONES.indexOf(e) < 0) return svg;
    var top = datos.cabeza[animal];
    var zeta = e === 'dormido' ? trazo('M84 ' + (top - 4) + 'h5l-5 6h5M92 ' + (top - 12) + 'h3.5l-3.5 4.5h3.5', '#8A8F9C', 1.8) : '';
    var nuevo = (e === 'sonrojado' ? mejillas(a) : '') + ojos(a, e) + boca(a, e) + zeta;
    // the new features go at the end of the face, over everything the face draws
    return quitarRasgos(svg, a).replace(/<\/g>\s*<\/svg>\s*$/, nuevo + '</g>\n</svg>\n');
  }

  return { EXPRESIONES: EXPRESIONES, expresar: expresar, quitarRasgos: quitarRasgos, sinExpresion: sinExpresion };
});
