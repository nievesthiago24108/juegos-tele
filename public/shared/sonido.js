/*
 * Sonidos sintetizados con WebAudio (sin archivos de audio). Lo usan la tele y los juegos.
 *   Sonido.tono(440, 0.2)                 → una nota
 *   Sonido.ruido(0.3, { filtro: 800 })    → ruido filtrado (red, hinchada, viento)
 *   Sonido.silbato(), Sonido.patada(), Sonido.festejo(), Sonido.error()
 * El navegador no deja sonar nada hasta el primer clic o tecla (salvo el modo kiosco con
 * --autoplay-policy=no-user-gesture-required): Sonido.desbloquear() se llama en cada clic/tecla.
 */
(function () {
  'use strict';
  let ctx = null;
  let maestro = null;
  let silenciado = false;
  let bufferRuido = null;

  function contexto() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      maestro = ctx.createGain();
      maestro.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor();
      maestro.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function ruidoBuffer(c) {
    if (bufferRuido) return bufferRuido;
    bufferRuido = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = bufferRuido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return bufferRuido;
  }

  /** Nota con envolvente: frecuencia (Hz), duración (s), opciones { tipo, volumen, deslizarA, retraso } */
  function tono(freq, dur, o) {
    o = o || {};
    const c = contexto();
    if (!c || silenciado) return;
    const t0 = c.currentTime + (o.retraso || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.tipo || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.deslizarA) osc.frequency.exponentialRampToValueAtTime(o.deslizarA, t0 + dur);
    const v = o.volumen == null ? 0.4 : o.volumen;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(maestro);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** Ruido filtrado: duración (s), { filtro (Hz), q, volumen, ataque, retraso, tipoFiltro } */
  function ruido(dur, o) {
    o = o || {};
    const c = contexto();
    if (!c || silenciado) return null;
    const t0 = c.currentTime + (o.retraso || 0);
    const src = c.createBufferSource();
    src.buffer = ruidoBuffer(c);
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = o.tipoFiltro || 'bandpass';
    f.frequency.value = o.filtro || 1000;
    f.Q.value = o.q || 0.8;
    const g = c.createGain();
    const v = o.volumen == null ? 0.3 : o.volumen;
    const ataque = o.ataque || 0.01;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(maestro);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
    return src;
  }

  const Sonido = {
    desbloquear: () => { contexto(); },
    silenciar: (s) => { silenciado = !!s; },
    get silenciado() { return silenciado; },
    tono,
    ruido,
    clic: () => tono(880, 0.06, { tipo: 'triangle', volumen: 0.2 }),
    mover: () => tono(660, 0.04, { tipo: 'triangle', volumen: 0.12 }),
    error: () => { tono(220, 0.35, { tipo: 'sawtooth', volumen: 0.25, deslizarA: 110 }); },
    bien: () => { tono(660, 0.1, { tipo: 'triangle' }); tono(990, 0.16, { tipo: 'triangle', retraso: 0.08 }); },
    cuenta: (final) => tono(final ? 1046 : 523, final ? 0.4 : 0.15, { tipo: 'square', volumen: 0.18 }),
    festejo: () => {
      [523, 659, 784, 1046].forEach((f, i) => tono(f, 0.22, { tipo: 'triangle', volumen: 0.3, retraso: i * 0.11 }));
      tono(1318, 0.5, { tipo: 'triangle', volumen: 0.3, retraso: 0.44 });
    },
    silbato: (largo) => {
      const d = largo ? 0.9 : 0.35;
      tono(2900, d, { tipo: 'sine', volumen: 0.22 });
      tono(3150, d, { tipo: 'sine', volumen: 0.12 });
      ruido(d, { filtro: 3000, q: 6, volumen: 0.08 });
    },
    patada: () => {
      tono(140, 0.18, { tipo: 'sine', volumen: 0.7, deslizarA: 45 });
      ruido(0.05, { filtro: 1800, q: 1, volumen: 0.25 });
    },
    red: () => { ruido(0.45, { filtro: 600, q: 0.6, volumen: 0.35, ataque: 0.02 }); },
    palo: () => { tono(1400, 0.5, { tipo: 'triangle', volumen: 0.3 }); tono(2120, 0.4, { tipo: 'sine', volumen: 0.15 }); },
    hinchada: (fuerte) => {
      ruido(fuerte ? 2.6 : 1.4, { filtro: 900, q: 0.4, volumen: fuerte ? 0.4 : 0.15, ataque: fuerte ? 0.15 : 0.4 });
      if (fuerte) ruido(2.2, { filtro: 2200, q: 0.7, volumen: 0.12, ataque: 0.2, retraso: 0.1 });
    },
    lamento: () => { ruido(1.2, { filtro: 400, q: 0.5, volumen: 0.22, ataque: 0.1 }); tono(300, 0.9, { tipo: 'sine', volumen: 0.1, deslizarA: 180 }); },
  };
  window.Sonido = Sonido;
})();
