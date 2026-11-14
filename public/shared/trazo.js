/*
 * Analiza un trazo (deslizar el dedo en el celu o arrastrar el mouse en la tele).
 * Funciona en el navegador (window.Trazo) y en Node (require) para los tests.
 *
 * puntos: [{ x, y, t }] en unidades de "alto de pantalla" (0..1 de arriba a abajo) y ms.
 * Devuelve { dx, dy, subida, largo, angulo, velocidad, curva, duracion } o null si no sirve:
 *   subida    = cuánto subió el trazo (alturas de pantalla, positivo hacia arriba)
 *   angulo    = grados respecto de la vertical (negativo = izquierda)
 *   velocidad = alturas de pantalla por segundo en el último tramo
 *   curva     = desvío del medio del trazo respecto de la recta / largo (con signo:
 *               positivo si la panza queda a la izquierda → la pelota dobla a la derecha)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Trazo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VENTANA_MS = 140;

  /**
   * Velocidad del tramo final: recorrido del último 60% del trazo dividido el tiempo que llevó.
   * Medir sobre un tramo largo (y no solo los últimos milisegundos) la hace estable aunque los
   * eventos del navegador lleguen a destiempo.
   */
  function velocidadFinal(p) {
    // al soltar, el último punto suele repetir la posición unos milisegundos después: esa pausa corta
    // (menos de 90 ms) no cuenta, si no un deslizamiento rápido parecería lento. Una pausa larga sí.
    let fin = p.length - 1;
    while (fin > 1 && Math.hypot(p[fin].x - p[fin - 1].x, p[fin].y - p[fin - 1].y) < 0.002 && p[fin].t - p[fin - 1].t < 90) fin--;
    p = p.slice(0, fin + 1);
    const tramos = [];
    let total = 0;
    for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); tramos.push(d); total += d; }
    let i = p.length - 1;
    let recorrido = 0;
    while (i > 0 && recorrido < total * 0.6) { recorrido += tramos[i - 1]; i--; }
    const dt = Math.max(VENTANA_MS / 4, p[p.length - 1].t - p[i].t);
    return recorrido / dt * 1000;
  }

  function analizar(puntos) {
    if (!Array.isArray(puntos) || puntos.length < 2) return null;
    const p = puntos.filter((q) => q && Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.t));
    if (p.length < 2) return null;
    const s = p[0], e = p[p.length - 1];
    const dx = e.x - s.x, dy = e.y - s.y;
    const largo = Math.hypot(dx, dy);
    if (largo < 0.02) return null;
    let desvio = 0;
    for (let i = 1; i < p.length - 1; i++) {
      const d = (dx * (p[i].y - s.y) - dy * (p[i].x - s.x)) / largo;
      if (Math.abs(d) > Math.abs(desvio)) desvio = d;
    }
    const r = (v, n) => Math.round(v * (n || 1000)) / (n || 1000) + 0;
    return {
      dx: r(dx), dy: r(dy), subida: r(-dy), largo: r(largo),
      angulo: r(Math.atan2(dx, -dy) * 180 / Math.PI, 10),
      velocidad: r(velocidadFinal(p), 100),
      curva: r(-desvio / largo),
      duracion: Math.round(e.t - s.t),
    };
  }

  /** Reduce un trazo a como mucho n puntos (para mandarlo por la red) */
  function simplificar(puntos, n) {
    n = n || 24;
    if (puntos.length <= n) return puntos.slice();
    const out = [];
    for (let i = 0; i < n; i++) out.push(puntos[Math.round(i * (puntos.length - 1) / (n - 1))]);
    return out;
  }

  return { analizar, simplificar };
});
