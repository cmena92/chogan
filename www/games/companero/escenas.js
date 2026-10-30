/* Capybara's companion: what is seen while it eats, bathes or plays (epic #2, #32).
   One source for the app and for design/companero/escenas.mjs, which checks every animal and scene.
   A scene is a layer drawn over the dressed companion, marked data-escena. Its resting pose is the
   still picture shown under reduced motion: the food by the mouth, the bubbles around the body, the
   ball at its feet. The movement comes from the page's CSS on the classes below. Pure string work,
   no DOM: the mouths, the bubbles, the ball and the food art come in as `datos`. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CompaneroEscenas = factory();
})(this, function () {
  'use strict';

  var ESCENAS = ['comer', 'banio', 'jugar'];

  function n(x) { return +x.toFixed(2); }
  // the inside of a 24 x 24 food drawing, without its <svg> wrapper
  function interior(svg) { return (svg.match(/<g id="comida">([\s\S]*?)<\/g>\s*<\/svg>/) || [])[1] || ''; }

  function comer(boca, comida) {
    // the food rests by the mouth, a little to the side, 22 units across
    var x = boca[0] + 7, y = boca[1] - 1, k = 22 / 24;
    return '<g data-escena="comer" data-comida="' + comida.id + '" transform="translate(' + n(x - 12 * k) + ' ' + n(y - 12 * k) + ') scale(' + n(k) + ')">' +
      '<g class="cp-esc-bocado">' + interior(comida.svg) + '</g></g>';
  }
  function banio(burbujas) {
    return '<g data-escena="banio">' + burbujas.map(function (b, i) {
      var x = b[0], y = b[1], r = b[2];
      return '<g class="cp-esc-burbuja" style="animation-delay:' + n((i % 4) * 0.15) + 's">' +
        '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#E3F4FC" fill-opacity=".55" stroke="#8EC9EA" stroke-width="1.2"/>' +
        '<circle cx="' + n(x - r * 0.35) + '" cy="' + n(y - r * 0.35) + '" r="' + n(r * 0.28) + '" fill="#FFFFFF"/></g>';
    }).join('') + '</g>';
  }
  function jugar(p) {
    var x = p[0], y = p[1], r = p[2];
    // a beach ball: white, with a red and a blue wedge
    return '<g data-escena="jugar"><g class="cp-esc-pelota">' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#FFFFFF" stroke="#D9D2C7" stroke-width="1"/>' +
      '<path d="M' + x + ' ' + y + 'L' + n(x - r) + ' ' + y + 'A' + r + ' ' + r + ' 0 0 1 ' + x + ' ' + n(y - r) + 'z" fill="#E4573D"/>' +
      '<path d="M' + x + ' ' + y + 'L' + n(x + r) + ' ' + y + 'A' + r + ' ' + r + ' 0 0 1 ' + x + ' ' + n(y + r) + 'z" fill="#3A86FF"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="' + n(r * 0.22) + '" fill="#F2C14E"/></g></g>';
  }

  // datos: { bocas: { animal: [x, y] }, burbujas: [[x, y, r]], pelota: [x, y, r], comidas: { id: svg } }
  // opciones.comida: the food eaten, for «comer»
  function escena(svg, animal, tipo, datos, opciones) {
    var capa = '';
    if (tipo === 'comer') {
      var id = opciones && opciones.comida;
      if (!datos.bocas[animal] || !datos.comidas[id]) return svg;
      capa = comer(datos.bocas[animal], { id: id, svg: datos.comidas[id] });
    } else if (tipo === 'banio') capa = banio(datos.burbujas);
    else if (tipo === 'jugar') capa = jugar(datos.pelota);
    else return svg;
    // over everything, the clothes included
    return svg.replace(/<\/svg>\s*$/, capa + '</svg>\n');
  }

  return { ESCENAS: ESCENAS, escena: escena };
});
