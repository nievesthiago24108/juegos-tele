'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../public/juegos/penales/logica.js');
const S = require('./sim-penales.js');

const tiro = (x, y, fuerza, comba) => ({ x, y, fuerza: fuerza == null ? 0.6 : fuerza, comba: comba || 0 });

test('trazo → tiro: dirección, altura, fuerza y comba', () => {
  const rnd = L.azar(1);
  const ir = (o) => L.trazoATiro(S.trazoPara(o, rnd, false), { perfil: 'celu', sinRuido: true });
  const a = ir({ x: 0.6, y: 0.7, fuerza: 0.6, comba: 0 });
  assert.ok(Math.abs(a.x - 0.6) < 0.02 && Math.abs(a.y - 0.7) < 0.02 && Math.abs(a.fuerza - 0.6) < 0.03);
  const izq = ir({ x: -0.7, y: 0.3, fuerza: 0.5, comba: 0 });
  assert.ok(izq.x < -0.6, 'trazo hacia la izquierda = tiro a la izquierda');
  // trazo recto hacia el medio pero con panza a la izquierda: la pelota dobla a la derecha
  const curva = L.trazoATiro(S.trazoRecto({ angulo: 0, subida: 0.37, v: 2, curva: 0.075 }), { sinRuido: true });
  assert.ok(curva.comba > 0.4 && curva.x > 0.08, `la comba corre la pelota (${curva.comba}, x ${curva.x})`);
  const contra = L.trazoATiro(S.trazoRecto({ angulo: 0, subida: 0.37, v: 2, curva: -0.075 }), { sinRuido: true });
  assert.ok(contra.x < -0.08, 'panza a la derecha: dobla a la izquierda');
});

test('demasiada fuerza hace subir el tiro; un tiro flojo va bajo', () => {
  const rnd = L.azar(2);
  const medio = L.trazoATiro(S.trazoPara({ x: 0, y: 0.9, fuerza: 0.7, comba: 0 }, rnd, false), { sinRuido: true });
  const fuerte = L.trazoATiro(S.trazoPara({ x: 0, y: 0.9, fuerza: 1, comba: 0 }, rnd, false), { sinRuido: true });
  const flojo = L.trazoATiro(S.trazoPara({ x: 0, y: 0.8, fuerza: 0.05, comba: 0 }, rnd, false), { sinRuido: true });
  assert.ok(fuerte.y > medio.y + 0.15, `con fuerza 1 sube (${medio.y} → ${fuerte.y})`);
  assert.equal(L.evaluar(fuerte, 4).resultado, 'afuera');
  assert.ok(flojo.y < 0.5, 'el flojo va abajo');
});

test('trazos que no sirven', () => {
  assert.equal(L.trazoATiro([{ x: 0.5, y: 0.8, t: 0 }, { x: 0.5, y: 0.79, t: 100 }]), null, 'muy corto');
  assert.equal(L.trazoATiro([{ x: 0.5, y: 0.5, t: 0 }, { x: 0.5, y: 0.9, t: 100 }]), null, 'hacia abajo');
  assert.equal(L.trazoATiro([{ x: 0.1, y: 0.5, t: 0 }, { x: 0.9, y: 0.48, t: 100 }]), null, 'de costado');
  assert.equal(L.trazoATiro('nada'), null);
});

test('perfil del mouse: arrastrar desde la pelota hasta el palo pega en el palo', () => {
  // pelota en (540, 1560) y palo derecho a ras del piso en (900, 800), en píxeles del lienzo de 1920 de alto
  const pts = [];
  for (let i = 0; i <= 10; i++) pts.push({ x: (540 + 360 * i / 10) / 1920, y: (1560 - 760 * i / 10) / 1920, t: i * 25 });
  const t = L.trazoATiro(pts, { perfil: 'mouse', sinRuido: true });
  assert.ok(Math.abs(t.x - 1) < 0.15, `x ≈ 1 (${t.x})`);
});

test('evaluar: gol, atajada, afuera, palo', () => {
  assert.equal(L.evaluar(tiro(0.6, 0.7), 3).resultado, 'gol');
  assert.equal(L.evaluar(tiro(0.6, 0.7), 2).resultado, 'atajada');
  assert.equal(L.evaluar(tiro(1.2, 0.5), 2).resultado, 'afuera');
  assert.equal(L.evaluar(tiro(0, 1.2), 2).resultado, 'afuera');
  assert.equal(L.evaluar(tiro(-1.0, 0.4), 0).resultado, 'palo');
  assert.equal(L.evaluar(tiro(0.2, 1.0), 0).donde, 'travesaño');
});

test('golazo imposible: muy fuerte y pegado al palo no se ataja', () => {
  const r = L.evaluar(tiro(0.9, 0.3, 0.9), 5);
  assert.equal(r.resultado, 'gol');
  assert.equal(r.golazo, true);
  assert.equal(L.evaluar(tiro(0.9, 0.3, 0.6), 5).resultado, 'atajada', 'sin fuerza sí se ataja');
});

test('arquero en el centro y pelota lenta', () => {
  assert.equal(L.evaluar(tiro(0, 0.2), L.CENTRO).resultado, 'atajada');
  assert.equal(L.evaluar(tiro(0, 0.8), L.CENTRO).resultado, 'atajada');
  assert.equal(L.evaluar(tiro(0.6, 0.2), L.CENTRO).resultado, 'gol');
  assert.equal(L.evaluar(tiro(0.6, 0.2, 0.1), 2).resultado, 'atajada', 'lenta: llega aunque se tiró alto');
  assert.equal(L.evaluar(L.tiroDebil(), L.CENTRO).resultado, 'atajada', 'el tiro débil por tiempo va al medio');
});

test('zonas', () => {
  assert.equal(L.zonaDe(-0.8, 0.9), 0);
  assert.equal(L.zonaDe(0, 0.7), 1);
  assert.equal(L.zonaDe(0.5, 0.6), 2);
  assert.equal(L.zonaDe(-0.5, 0.1), 3);
  assert.equal(L.zonaDe(0.1, 0.2), 4);
  assert.equal(L.zonaDe(0.9, 0.3), 5);
});

test('el arquero automático tiende a tirarse donde más patea el jugador', () => {
  const rnd = L.azar(5);
  const historial = [2, 2, 2, 2, 2, 2];
  const cuenta = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 3000; i++) { const z = L.elegirZonaAuto(historial, 'normal', rnd); if (typeof z === 'number') cuenta[z]++; }
  assert.ok(cuenta[2] > cuenta[0] * 2.5, `zona 2 = ${cuenta[2]}, zona 0 = ${cuenta[0]}`);
});

test('1 contra 1: 5 por lado, cierre anticipado y muerte súbita', () => {
  const T = true, F = false;
  assert.equal(L.estadoTanda([T, T, T], [F, F], 5).terminado, false);
  assert.deepEqual(L.estadoTanda([T, T, T], [F, F, F], 5), { terminado: true, ganador: 0, muerteSubita: false }, '3-0 con 2 por patear: ya ganó');
  assert.equal(L.estadoTanda([T, T, T, T, T], [T, T, T, T, T], 5).muerteSubita, true);
  assert.equal(L.estadoTanda([T, T, T, T, T, T], [T, T, T, T, T], 5).terminado, false, 'falta que patee el segundo');
  assert.deepEqual(L.estadoTanda([T, T, T, T, T, T], [T, T, T, T, T, F], 5), { terminado: true, ganador: 0, muerteSubita: true });
  assert.deepEqual(L.estadoTanda([F, F, F, F, F], [F, F, F, F, T], 5), { terminado: true, ganador: 1, muerteSubita: false });
});

test('precisión: más cerca del ángulo, más precisión; errado = 0', () => {
  assert.ok(L.precision(tiro(0.9, 0.9), 'gol') > L.precision(tiro(0.1, 0.5), 'gol'));
  assert.equal(L.precision(tiro(0.9, 0.9), 'atajada'), 0);
});

test('simulación: un tiro bueno es gol entre 60% y 75% en dificultad normal', () => {
  for (const semilla of [11, 22, 33]) {
    const c = S.simular(1000, 'bueno', 'normal', semilla);
    assert.ok(c.gol >= 600 && c.gol <= 750, `semilla ${semilla}: ${c.gol / 10}%`);
  }
  const azar = S.simular(1000, 'azar', 'normal', 44);
  assert.ok(azar.gol < 400, `al azar se convierte mucho menos (${azar.gol / 10}%)`);
});
