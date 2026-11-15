/* Capybara's companion: its own small sounds (epic #2, #40), made with WebAudio like the core's.
   Nothing plays unless the app's sound setting is on, read through `activo`, and the AudioContext is
   only opened by a sound asked for from a touch, as browsers require. `suelto` sounds (a yawn while
   idle) play only once a touch has opened it. No files and no network: every sound is synthesised. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CompaneroSonidos = factory();
})(this, function () {
  'use strict';

  var SONIDOS = ['crunch', 'burbujas', 'rebote', 'risa', 'bostezo'];

  // opts.activo() -> whether the app's sound is on; opts.Contexto: the AudioContext constructor
  function crear(opts) {
    var activo = opts.activo || function () { return false; };
    var Contexto = opts.Contexto || (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
    var ac = null, salida = null;

    function abrir() {
      if (ac) return ac;
      if (!Contexto) return null;
      try { ac = new Contexto(); } catch (e) { return null; }
      salida = ac.createGain(); salida.gain.value = 0.35; salida.connect(ac.destination);
      return ac;
    }
    // a tone that glides from f0 to f1, with a short fade so it never clicks
    function tono(t, dur, f0, f1, tipo, vol) {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = tipo || 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.5, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(salida);
      o.start(t); o.stop(t + dur + 0.02);
    }
    // a burst of filtered noise: one bite
    function mordida(t, dur) {
      var n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = b; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.9; g.gain.value = 0.7;
      s.connect(f); f.connect(g); g.connect(salida);
      s.start(t);
    }

    var HACER = {
      crunch: function (t) { mordida(t, 0.07); mordida(t + 0.22, 0.07); mordida(t + 0.44, 0.07); },
      burbujas: function (t) { [0, 0.12, 0.2, 0.34, 0.45].forEach(function (d, i) { tono(t + d, 0.09, 500 + i * 140, 1100 + i * 160, 'sine', 0.35); }); },
      rebote: function (t) { tono(t, 0.16, 320, 140, 'triangle', 0.5); tono(t + 0.42, 0.13, 280, 130, 'triangle', 0.35); tono(t + 0.72, 0.1, 250, 125, 'triangle', 0.2); },
      risa: function (t) { [0, 0.11, 0.22].forEach(function (d, i) { tono(t + d, 0.08, 700 - i * 40, 900 - i * 60, 'sine', 0.4); }); },
      bostezo: function (t) { tono(t, 0.9, 420, 190, 'sine', 0.18); }
    };

    // suelto: not asked for by a touch, so it never opens the AudioContext itself
    function tocar(nombre, suelto) {
      if (!activo() || !HACER[nombre]) return false;
      if (!ac && suelto) return false;
      if (!abrir()) return false;
      if (ac.state === 'suspended' && ac.resume) ac.resume();
      try { HACER[nombre](ac.currentTime + 0.01); } catch (e) { return false; /* a sound never breaks the page */ }
      return true;
    }

    return { tocar: tocar };
  }

  return { SONIDOS: SONIDOS, crear: crear };
});
