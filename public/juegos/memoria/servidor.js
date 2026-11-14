/*
 * Memoria de colores, parte de servidor: en el modo cooperativo el orden de los toques de los
 * distintos celus se valida acá, con la marca de tiempo de cada toque (no con el orden de llegada,
 * que depende del wifi de cada uno). Se espera REORDEN_MS antes de validar para poder reordenar.
 */
'use strict';
const L = require('./logica.js');
const REORDEN_MS = 120;

module.exports = function crear(api) {
  let ronda = null;
  let pendientes = [];
  let timerProceso = null;
  let timerVence = null;

  function limpiar() {
    ronda = null;
    pendientes = [];
    clearTimeout(timerProceso); timerProceso = null;
    clearInterval(timerVence); timerVence = null;
  }

  function emitir(eventos) {
    eventos.forEach((e) => api.aTele(Object.assign({ ronda: ronda && ronda.id }, e, { tipo: 'coop-' + e.tipo })));
    if (ronda && ronda.terminada) limpiar();
  }

  function procesar() {
    timerProceso = null;
    if (!ronda) return;
    const lista = pendientes;
    pendientes = [];
    emitir(L.validarToquesCoop(ronda, lista));
  }

  function revisarTiempo() {
    if (!ronda || pendientes.length) return;
    if (api.ahora() - ronda.ultimo > ronda.limiteMs + REORDEN_MS) {
      ronda.terminada = true;
      emitir([{ tipo: 'error', motivo: 'tiempo', esperado: ronda.esperado[ronda.indice] }]);
    }
  }

  return {
    deTele(d) {
      if (!d || typeof d !== 'object') return;
      if (d.tipo === 'coop-ronda' && Array.isArray(d.esperado) && d.duenos && typeof d.duenos === 'object') {
        limpiar();
        ronda = {
          id: String(d.id || ''),
          esperado: d.esperado.map(Number).slice(0, 200),
          duenos: d.duenos,
          indice: 0,
          ultimo: api.ahora(),
          limiteMs: Math.max(500, Math.min(10000, Number(d.limiteMs) || L.LIMITE_MS)),
          bonus: 0,
        };
        timerVence = setInterval(revisarTiempo, 100);
      } else if (d.tipo === 'coop-parar') {
        limpiar();
      }
    },
    alInput(jugadorId, datos, ts) {
      if (!ronda || datos.boton == null) return false;
      const color = Number(datos.boton);
      if (!Number.isInteger(color)) return true;
      pendientes.push({ jugadorId, color, ts: Math.max(ts, ronda.ultimo - REORDEN_MS) });
      if (!timerProceso) timerProceso = setTimeout(procesar, REORDEN_MS);
      return true;
    },
    reiniciar: limpiar,
    cerrar: limpiar,
  };
};
