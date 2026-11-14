/*
 * Simulación de Penales: 1000 tiros al azar y 1000 tiros "buenos" contra el arquero automático.
 * Un tiro bueno apunta adentro del arco, cerca de los costados, con fuerza media-alta y un error
 * humano chico. Objetivo de calibración: en dificultad normal, un tiro bueno es gol el 60–75%.
 *
 *   npm run sim                 → tabla para las tres dificultades
 *   node test/sim-penales.js 5  → otra semilla
 */
'use strict';
const L = require('../public/juegos/penales/logica.js');

/** Arma un trazo de celu que, sin error, daría el tiro pedido */
function trazoPara(objetivo, rnd, errorHumano) {
  const p = L.PERFILES.celu;
  const e = errorHumano ? 1 : 0;
  const angulo = ((objetivo.x - objetivo.comba * 0.22) * p.angulo + L.gauss(rnd) * 1.5 * e) * Math.PI / 180;
  const subida = (p.s0 + objetivo.y * (p.s1 - p.s0)) * (1 + L.gauss(rnd) * 0.04 * e);
  const v = (p.v0 + objetivo.fuerza * (p.v1 - p.v0)) * (1 + L.gauss(rnd) * 0.08 * e);
  return trazoRecto({ angulo, subida, v, curva: objetivo.comba * 0.15 });
}

/** Trazo con velocidad constante; curva > 0 = panza a la izquierda */
function trazoRecto({ angulo, subida, v, curva }) {
  const largo = subida / Math.cos(angulo);
  const dur = Math.max(30, largo / v * 1000);
  const n = Math.max(6, Math.round(dur / 12));
  const ux = Math.sin(angulo), uy = -Math.cos(angulo);   // dirección del trazo (hacia arriba)
  const px = -uy, py = ux;                               // perpendicular (hacia la derecha del trazo)
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const d = largo * t;
    const off = -curva * largo * Math.sin(Math.PI * t) * 1.0;
    pts.push({ x: 0.5 + ux * d + px * off, y: 0.86 + uy * d + py * off, t: t * dur });
  }
  return pts;
}

function trazoAlAzar(rnd) {
  return trazoRecto({
    angulo: (rnd() * 90 - 45) * Math.PI / 180,
    subida: 0.05 + rnd() * 0.85,
    v: 0.3 + rnd() * 4.5,
    curva: (rnd() - 0.5) * 0.4,
  });
}

function objetivoBueno(rnd) {
  const lado = rnd() < 0.5 ? -1 : 1;
  return {
    x: lado * (0.35 + rnd() * 0.55),
    y: 0.1 + rnd() * 0.75,
    fuerza: 0.45 + rnd() * 0.35,
    comba: (rnd() - 0.5) * 0.4,
  };
}

/** Patea n tiros en tandas de 10 por "jugador" (el arquero aprende la tendencia de cada uno) */
function simular(n, tipo, dificultad, semilla) {
  const rnd = L.azar(semilla);
  const cuenta = { gol: 0, atajada: 0, afuera: 0, palo: 0, golazo: 0 };
  let historial = [];
  for (let i = 0; i < n; i++) {
    if (i % 10 === 0) historial = [];
    let tiro = null;
    while (!tiro) {
      const pts = tipo === 'bueno' ? trazoPara(objetivoBueno(rnd), rnd, true) : trazoAlAzar(rnd);
      tiro = L.trazoATiro(pts, { perfil: 'celu', rnd });
    }
    const zonaArq = L.elegirZonaAuto(historial, dificultad, rnd, tiro);
    const r = L.evaluar(tiro, zonaArq);
    cuenta[r.resultado]++;
    if (r.golazo) cuenta.golazo++;
    historial.push(r.zona);
  }
  return cuenta;
}

function tabla(semilla) {
  const filas = [];
  for (const dificultad of ['facil', 'normal', 'dificil']) {
    for (const tipo of ['azar', 'bueno']) {
      const c = simular(1000, tipo, dificultad, semilla + (tipo === 'bueno' ? 1 : 0));
      filas.push({ dificultad, tipo, ...c });
    }
  }
  return filas;
}

if (require.main === module) {
  const semilla = Number(process.argv[2]) || 2026;
  const filas = tabla(semilla);
  const pct = (v) => (v / 10).toFixed(1).padStart(5) + '%';
  console.log(`\nSimulación de penales (1000 tiros por fila, semilla ${semilla})\n`);
  console.log('Dificultad  Tiros   |   Gol    Atajada  Afuera   Palo   | Golazos');
  console.log('------------------------------------------------------------------');
  filas.forEach((f) => {
    console.log(`${f.dificultad.padEnd(10)}  ${(f.tipo === 'bueno' ? 'buenos' : 'al azar').padEnd(7)} | ${pct(f.gol)}  ${pct(f.atajada)}  ${pct(f.afuera)}  ${pct(f.palo)} | ${String(f.golazo).padStart(5)}`);
  });
  const normal = filas.find((f) => f.dificultad === 'normal' && f.tipo === 'bueno');
  const ok = normal.gol >= 600 && normal.gol <= 750;
  console.log(`\nTiros buenos en dificultad normal: ${(normal.gol / 10).toFixed(1)}% de gol → ${ok ? 'dentro' : 'FUERA'} del objetivo (60–75%).\n`);
  if (!ok) process.exitCode = 1;
}

module.exports = { simular, tabla, trazoPara, trazoRecto, objetivoBueno };
