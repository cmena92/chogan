/* Capybara's companion: the exclusive colour designs (epic #2, #7 and #17).
   One source for the app and for design/companero/disenos.mjs, which checks the 48 animal and
   design pairs. Pure string work on an SVG, no DOM: the designs' data (disenos.json) and each
   animal's natural colours come in as `datos`. Colour designs swap the animal's base, dark and
   light colours, fills and strokes alike; pattern designs add a patterned twin right after each
   base-coloured shape, so the muzzle, belly and eyes drawn later stay on top. Gradient and
   pattern ids are unique per animal and design. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CompaneroDisenos = factory();
})(this, function () {
  'use strict';

  var PATRONES = {
    manchitas: function (id, c) {
      return '<pattern id="' + id + '" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="3.4" fill="' + c + '" opacity="0.85"/><circle cx="13" cy="12" r="2.8" fill="' + c + '" opacity="0.85"/></pattern>';
    },
    rayas: function (id, c) {
      return '<pattern id="' + id + '" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="4" fill="' + c + '" opacity="0.45"/></pattern>';
    },
    brillitos: function (id) {
      return '<pattern id="' + id + '" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M5 2.5 5.8 5.2 8.5 6 5.8 6.8 5 9.5 4.2 6.8 1.5 6 4.2 5.2z" fill="#FFFFFF" opacity="0.85"/><circle cx="16" cy="16" r="1.2" fill="#FFFFFF" opacity="0.8"/></pattern>';
    }
  };

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // fills and strokes alike: the cat's tail and the owl's brows are strokes in the dark colour
  function reemplazar(s, de, a) {
    return s.replace(new RegExp('(fill|stroke)="' + esc(de) + '"', 'gi'), function (m, attr) { return attr + '="' + a + '"'; });
  }

  // datos: { disenos: [{ id, colores?, patron? }], colores: { animal: { base, oscuro, claro } } }
  function aplicar(svg, animal, disenoId, datos) {
    var d = null;
    for (var i = 0; i < datos.disenos.length; i++) if (datos.disenos[i].id === disenoId) d = datos.disenos[i];
    var nat = datos.colores[animal];
    if (!d || d.id === 'natural' || !nat) return svg;
    var uid = animal + '-' + d.id;
    var defs = '';
    var base = nat.base;
    if (d.colores) {
      var c = d.colores;
      if (Object.prototype.toString.call(c.base) === '[object Array]') {
        var paradas = c.base.map(function (col, j) {
          return '<stop offset="' + (j / (c.base.length - 1)).toFixed(2) + '" stop-color="' + col + '"/>';
        }).join('');
        defs += '<linearGradient id="g-' + uid + '" x1="0" y1="0" x2="0" y2="170" gradientUnits="userSpaceOnUse">' + paradas + '</linearGradient>';
        base = 'url(#g-' + uid + ')';
      } else base = c.base;
      // dark and light first: a design colour must never be picked up again as a natural one
      svg = reemplazar(reemplazar(svg, nat.oscuro, '@@OSCURO@@'), nat.claro, '@@CLARO@@');
      svg = reemplazar(svg, nat.base, base);
      svg = svg.replace(/"@@OSCURO@@"/g, '"' + c.oscuro + '"').replace(/"@@CLARO@@"/g, '"' + c.claro + '"');
    }
    if (d.patron) {
      var pid = 'p-' + uid;
      defs += PATRONES[d.patron](pid, (d.colores && d.colores.oscuro) || nat.oscuro);
      // a twin of each base-coloured shape, right after it, filled with the pattern
      svg = svg.replace(new RegExp('<(path|ellipse|circle)\\b([^>]*?)fill="' + esc(base) + '"([^>]*?)/>', 'g'), function (m, tag, a, b) {
        var sinId = (a + b).replace(/\sid="[^"]*"/g, '');
        return m + '<' + tag + sinId.replace(/\s+$/, '') + ' fill="url(#' + pid + ')" data-patron="' + d.patron + '"/>';
      });
    }
    return defs ? svg.replace(/(<svg[^>]*>)/, '$1<defs>' + defs + '</defs>') : svg;
  }

  return { aplicar: aplicar };
});
