/*
 * Memoria de colores: reglas sin dibujo (secuencias, niveles, validación y puntaje).
 * La usan la tele (window.MemoriaLogica), el servidor (cooperativo) y los tests (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MemoriaLogica = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LIMITE_MS = 3000;   // tiempo para cada color al responder
  const BONUS_MAX = 99;     // así el nivel siempre pesa más que el bonus (puntaje = nivel × 100 + bonus)
  const VIDAS_COOP = 3;

  const COLORES_BASE = [
    { color: '#E5484D', simbolo: '●', palabra: 'ROJO', etiqueta: '' },
    { color: '#3E7BFA', simbolo: '▲', palabra: 'AZUL', etiqueta: '' },
    { color: '#F5C518', simbolo: '■', palabra: 'AMARILLO', etiqueta: '' },
    { color: '#2FB36B', simbolo: '★', palabra: 'VERDE', etiqueta: '' },
    { color: '#A15CE8', simbolo: '◆', palabra: 'VIOLETA', etiqueta: '' },
    { color: '#F28A2E', simbolo: '✚', palabra: 'NARANJA', etiqueta: '' },
  ];
  const NOTAS = [329.63, 440.0, 554.37, 659.25, 783.99, 880.0]; // Mi, La, Do#, Mi, Sol, La

  /** Cómo es cada nivel: velocidad, cantidad de colores, si se mezclan y si es ronda especial */
  function nivelInfo(n) {
    return {
      nivel: n,
      ms: n >= 13 ? 320 : n >= 5 ? 450 : 600,
      colores: n >= 10 ? 6 : 4,
      mezclar: n >= 8,
      especial: n > 0 && n % 6 === 0 ? ((n / 6) % 2 === 1 ? 'alreves' : 'trampa') : null,
    };
  }

  /** Generador de números al azar con semilla (así una partida se puede repetir en los tests) */
  function azar(semilla) {
    let s = (semilla >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /** Agrega un color a la secuencia (sin el mismo color tres veces seguidas) */
  function extender(secuencia, nivel, rnd) {
    const n = nivelInfo(nivel).colores;
    const sec = secuencia.slice();
    let c;
    do { c = Math.floor(rnd() * n); }
    while (sec.length >= 2 && sec[sec.length - 1] === c && sec[sec.length - 2] === c);
    sec.push(c);
    return sec;
  }

  /** La secuencia que hay que tocar (al revés en la ronda especial "al revés") */
  function esperado(secuencia, nivel) {
    return nivelInfo(nivel).especial === 'alreves' ? secuencia.slice().reverse() : secuencia.slice();
  }

  /** Ronda "trampa": para cada color, una palabra de OTRO color (se muestra escrita con la tinta del correcto) */
  function palabrasTrampa(secuencia, nivel, rnd) {
    const n = nivelInfo(nivel).colores;
    return secuencia.map((c) => {
      let p;
      do { p = Math.floor(rnd() * n); } while (p === c);
      return p;
    });
  }

  /** Posiciones de los botones: posiciones[lugar] = color. Mezcla distinta de la anterior */
  function mezclar(cantidad, rnd, anterior) {
    const base = anterior && anterior.length === cantidad ? anterior : Array.from({ length: cantidad }, (_, i) => i);
    let p;
    let intentos = 0;
    do {
      p = base.slice();
      for (let i = p.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
      }
      intentos++;
    } while (cantidad > 1 && intentos < 30 && p.some((c, i) => c === base[i])); // que ningún botón quede en su lugar
    return p;
  }

  const ordenadas = (cantidad) => Array.from({ length: cantidad }, (_, i) => i);

  /** Bonus por responder rápido: según cuánto tardó en ese color */
  function bonusToque(ms) {
    return ms < 700 ? 3 : ms < 1200 ? 2 : ms < 2000 ? 1 : 0;
  }

  /** Estado de quien responde (un jugador, o el equipo en el cooperativo) */
  function crearRespuesta(esperadoLista, ahora, limiteMs) {
    return { esperado: esperadoLista.slice(), indice: 0, ultimo: ahora, limiteMs: limiteMs || LIMITE_MS, estado: 'respondiendo', bonus: 0 };
  }

  /** ¿Se le acabó el tiempo para el color que sigue? */
  function vencida(r, ahora) {
    return r.estado === 'respondiendo' && ahora - r.ultimo > r.limiteMs;
  }

  /**
   * Toca un color. Devuelve 'bien' (sigue), 'completo' (terminó la secuencia), 'error' o 'tiempo'.
   * Si ya había terminado o perdido, devuelve 'ignorado'.
   */
  function responder(r, color, ahora) {
    if (r.estado !== 'respondiendo') return 'ignorado';
    if (ahora - r.ultimo > r.limiteMs) { r.estado = 'error'; r.motivo = 'tiempo'; return 'tiempo'; }
    if (color !== r.esperado[r.indice]) { r.estado = 'error'; r.motivo = 'color'; return 'error'; }
    r.bonus += bonusToque(ahora - r.ultimo);
    r.ultimo = ahora;
    r.indice++;
    if (r.indice >= r.esperado.length) { r.estado = 'completo'; return 'completo'; }
    return 'bien';
  }

  /** Puntaje final: nivel alcanzado (último completo) × 100 + bonus (tope 99) */
  function puntaje(nivelAlcanzado, bonus) {
    return Math.max(0, nivelAlcanzado) * 100 + Math.min(BONUS_MAX, Math.max(0, Math.round(bonus || 0)));
  }

  /** Cooperativo: reparte los colores entre los jugadores (dueños[color] = jugadorId) */
  function repartir(cantidadColores, jugadorIds) {
    const duenos = {};
    if (!jugadorIds.length) return duenos;
    for (let c = 0; c < cantidadColores; c++) duenos[c] = jugadorIds[c % jugadorIds.length];
    return duenos;
  }

  /**
   * Cooperativo: valida los toques de varios celus en orden de marca de tiempo.
   * ronda: { esperado, duenos, indice, ultimo, limiteMs }. Devuelve una lista de eventos.
   */
  function validarToquesCoop(ronda, toques) {
    const eventos = [];
    const lista = toques.slice().sort((a, b) => a.ts - b.ts);
    for (const t of lista) {
      if (ronda.terminada) break;
      if (t.ts - ronda.ultimo > ronda.limiteMs) {
        ronda.terminada = true;
        eventos.push({ tipo: 'error', motivo: 'tiempo', jugadorId: t.jugadorId, color: t.color, esperado: ronda.esperado[ronda.indice] });
        break;
      }
      if (ronda.duenos[t.color] !== t.jugadorId) continue; // no es su color (no tiene ese botón): se ignora
      if (t.color !== ronda.esperado[ronda.indice]) {
        ronda.terminada = true;
        eventos.push({ tipo: 'error', motivo: 'color', jugadorId: t.jugadorId, color: t.color, esperado: ronda.esperado[ronda.indice] });
        break;
      }
      ronda.bonus = (ronda.bonus || 0) + bonusToque(t.ts - ronda.ultimo);
      ronda.ultimo = Math.max(ronda.ultimo, t.ts);
      ronda.indice++;
      eventos.push({ tipo: 'toque', jugadorId: t.jugadorId, color: t.color, indice: ronda.indice });
      if (ronda.indice >= ronda.esperado.length) {
        ronda.terminada = true;
        eventos.push({ tipo: 'completo', bonus: ronda.bonus });
      }
    }
    return eventos;
  }

  /** Colores de config.json validados (siempre 6) */
  function coloresDesdeConfig(cfg) {
    const lista = cfg && Array.isArray(cfg.colores) ? cfg.colores : [];
    return COLORES_BASE.map((base, i) => {
      const c = lista[i] || {};
      return {
        color: /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : base.color,
        simbolo: typeof c.simbolo === 'string' && c.simbolo.trim() ? c.simbolo.trim().slice(0, 2) : base.simbolo,
        palabra: typeof c.palabra === 'string' && c.palabra.trim() ? c.palabra.trim().toUpperCase().slice(0, 12) : base.palabra,
        etiqueta: typeof c.etiqueta === 'string' ? c.etiqueta.trim().slice(0, 16) : '',
      };
    });
  }

  return {
    LIMITE_MS, BONUS_MAX, VIDAS_COOP, COLORES_BASE, NOTAS,
    nivelInfo, azar, extender, esperado, palabrasTrampa, mezclar, ordenadas,
    bonusToque, crearRespuesta, vencida, responder, puntaje, repartir, validarToquesCoop, coloresDesdeConfig,
  };
});
