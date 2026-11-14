'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../public/juegos/memoria/logica.js');
const crearPlugin = require('../public/juegos/memoria/servidor.js');

test('dificultad por nivel', () => {
  assert.deepEqual([1, 4, 5, 12, 13].map((n) => L.nivelInfo(n).ms), [600, 600, 450, 450, 320]);
  assert.equal(L.nivelInfo(7).mezclar, false);
  assert.equal(L.nivelInfo(8).mezclar, true);
  assert.equal(L.nivelInfo(9).colores, 4);
  assert.equal(L.nivelInfo(10).colores, 6);
  assert.deepEqual([5, 6, 7, 12, 18, 24].map((n) => L.nivelInfo(n).especial), [null, 'alreves', null, 'trampa', 'alreves', 'trampa']);
});

test('la secuencia suma un color por nivel y usa 6 colores desde el nivel 10', () => {
  const rnd = L.azar(42);
  let sec = [];
  for (let n = 1; n <= 30; n++) {
    sec = L.extender(sec, n, rnd);
    assert.equal(sec.length, n);
    assert.ok(sec[n - 1] < L.nivelInfo(n).colores);
  }
  assert.ok(sec.slice(9).some((c) => c >= 4), 'aparecen colores 5 y 6');
  for (let i = 2; i < sec.length; i++) assert.ok(!(sec[i] === sec[i - 1] && sec[i] === sec[i - 2]), 'nunca tres iguales seguidos');
});

test('el azar con semilla se repite', () => {
  const a = L.azar(7), b = L.azar(7);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
});

test('ronda al revés y trampa', () => {
  assert.deepEqual(L.esperado([0, 1, 2], 5), [0, 1, 2]);
  assert.deepEqual(L.esperado([0, 1, 2], 6), [2, 1, 0]);
  const sec = [0, 1, 2, 3, 0, 1, 2, 3, 1, 2, 3, 0];
  const p = L.palabrasTrampa(sec, 12, L.azar(3));
  assert.equal(p.length, sec.length);
  p.forEach((w, i) => assert.notEqual(w, sec[i], 'la palabra nunca coincide con la tinta'));
  assert.deepEqual(L.esperado(sec, 12), sec, 'en la trampa se toca el color de la tinta, en orden');
});

test('mezclar cambia todos los botones de lugar', () => {
  const rnd = L.azar(9);
  for (const n of [4, 6]) {
    const base = L.ordenadas(n);
    for (let k = 0; k < 20; k++) {
      const m = L.mezclar(n, rnd, base);
      assert.deepEqual(m.slice().sort(), base);
      assert.ok(m.every((c, i) => c !== base[i]));
    }
  }
});

test('responder: bien, completo, error y tiempo', () => {
  let r = L.crearRespuesta([2, 0, 1], 1000);
  assert.equal(L.responder(r, 2, 1500), 'bien');
  assert.equal(L.responder(r, 0, 2000), 'bien');
  assert.equal(L.responder(r, 1, 4000), 'completo');
  assert.equal(r.bonus, 3 + 3 + 0);
  assert.equal(L.responder(r, 1, 4100), 'ignorado');
  r = L.crearRespuesta([2, 0], 0);
  assert.equal(L.responder(r, 3, 100), 'error');
  r = L.crearRespuesta([2, 0], 0);
  assert.equal(L.vencida(r, 2999), false);
  assert.equal(L.vencida(r, 3001), true);
  assert.equal(L.responder(r, 2, 3500), 'tiempo');
});

test('puntaje: nivel × 100 + bonus con tope de 99', () => {
  assert.equal(L.puntaje(7, 12), 712);
  assert.equal(L.puntaje(3, 500), 399);
  assert.equal(L.puntaje(0, 0), 0);
  assert.ok(L.puntaje(4, 99) < L.puntaje(5, 0), 'un nivel más siempre gana');
});

test('repartir colores entre jugadores del cooperativo', () => {
  assert.deepEqual(L.repartir(4, ['a', 'b']), { 0: 'a', 1: 'b', 2: 'a', 3: 'b' });
  assert.deepEqual(L.repartir(4, ['a', 'b', 'c', 'd']), { 0: 'a', 1: 'b', 2: 'c', 3: 'd' });
  assert.equal(Object.values(L.repartir(6, ['a', 'b', 'c'])).filter((x) => x === 'c').length, 2);
});

test('cooperativo: valida por marca de tiempo aunque lleguen desordenados', () => {
  const ronda = { esperado: [0, 1, 0], duenos: { 0: 'a', 1: 'b' }, indice: 0, ultimo: 1000, limiteMs: 3000 };
  // llegan al revés (el wifi de "a" es más lento), pero la marca de tiempo dice el orden real
  const ev = L.validarToquesCoop(ronda, [
    { jugadorId: 'a', color: 0, ts: 1900 },
    { jugadorId: 'b', color: 1, ts: 1500 },
    { jugadorId: 'a', color: 0, ts: 1200 },
  ]);
  assert.deepEqual(ev.map((e) => e.tipo), ['toque', 'toque', 'toque', 'completo']);
  const r2 = { esperado: [0, 1], duenos: { 0: 'a', 1: 'b' }, indice: 0, ultimo: 0, limiteMs: 3000 };
  assert.deepEqual(L.validarToquesCoop(r2, [{ jugadorId: 'b', color: 1, ts: 100 }]).map((e) => e.tipo), ['error']);
  const r3 = { esperado: [0, 1], duenos: { 0: 'a', 1: 'b' }, indice: 0, ultimo: 0, limiteMs: 3000 };
  assert.deepEqual(L.validarToquesCoop(r3, [{ jugadorId: 'b', color: 0, ts: 100 }]), [], 'un color ajeno se ignora');
  const r4 = { esperado: [0, 1], duenos: { 0: 'a', 1: 'b' }, indice: 0, ultimo: 0, limiteMs: 3000 };
  assert.equal(L.validarToquesCoop(r4, [{ jugadorId: 'a', color: 0, ts: 3500 }])[0].motivo, 'tiempo');
});

test('parte de servidor del cooperativo: reordena, completa y avisa errores y tiempo', async () => {
  const enviados = [];
  let reloj = 10000;
  const pl = crearPlugin({ aTele: (d) => enviados.push(d), ahora: () => reloj, log() {} });
  pl.deTele({ tipo: 'coop-ronda', id: 'r1', esperado: [1, 0], duenos: { 0: 'a', 1: 'b' }, limiteMs: 3000 });
  assert.equal(pl.alInput('a', { boton: 0 }, 10300), true, 'el toque lo atiende el servidor');
  pl.alInput('b', { boton: 1 }, 10100);
  assert.equal(pl.alInput('a', { otra: 1 }, 10100), false, 'lo que no es un botón sigue a la tele');
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(enviados.map((e) => e.tipo), ['coop-toque', 'coop-toque', 'coop-completo']);
  assert.equal(enviados[0].jugadorId, 'b');
  assert.equal(enviados[2].ronda, 'r1');

  enviados.length = 0;
  pl.deTele({ tipo: 'coop-ronda', id: 'r2', esperado: [1], duenos: { 0: 'a', 1: 'b' }, limiteMs: 1000 });
  reloj += 1500;
  await new Promise((r) => setTimeout(r, 250));
  assert.deepEqual(enviados.map((e) => [e.tipo, e.motivo]), [['coop-error', 'tiempo']]);
  pl.cerrar();
});

test('colores desde config.json con valores inválidos', () => {
  const c = L.coloresDesdeConfig({ colores: [{ color: 'rojo', simbolo: '', palabra: 'taller', etiqueta: 'Taller' }] });
  assert.equal(c.length, 6);
  assert.equal(c[0].color, '#E5484D');
  assert.equal(c[0].simbolo, '●');
  assert.equal(c[0].palabra, 'TALLER');
  assert.equal(c[0].etiqueta, 'Taller');
});
