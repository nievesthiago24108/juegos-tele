'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLeaderboard, limpiarNombre, fechaLocal } = require('../leaderboard.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lb-'));

test('guarda cada puntaje en un renglón y lo vuelve a leer', () => {
  const dir = tmp();
  const lb = createLeaderboard({ dir });
  lb.guardarPartida({ juego: 'memoria', modo: 'solo', registros: [{ categoria: 'individual', nombre: 'Ana', puntaje: 512 }] });
  lb.guardarPartida({ juego: 'memoria', modo: 'solo', registros: [{ categoria: 'individual', nombre: 'Beto', puntaje: 730 }] });
  const lineas = fs.readFileSync(path.join(dir, 'puntajes.jsonl'), 'utf8').trim().split('\n');
  assert.equal(lineas.length, 2);
  const r = JSON.parse(lineas[0]);
  assert.equal(r.nombre, 'Ana'); assert.equal(r.juego, 'memoria'); assert.equal(r.modo, 'solo'); assert.ok(r.fecha);
  const lb2 = createLeaderboard({ dir });
  assert.deepEqual(lb2.top('memoria', 'individual', 'siempre').map((x) => x.nombre), ['Beto', 'Ana']);
});

test('separa juegos y categorías, y Hoy / Semana / Siempre', () => {
  const dir = tmp();
  let ahora = Date.parse('2026-11-01T15:00:00-03:00');
  const lb = createLeaderboard({ dir, now: () => ahora });
  lb.guardarPartida({ juego: 'penales', modo: 'solo', registros: [{ categoria: 'seguidos', nombre: 'Viejo', puntaje: 9 }] });
  ahora += 10 * 24 * 3600e3;
  lb.guardarPartida({ juego: 'penales', modo: 'solo', registros: [{ categoria: 'seguidos', nombre: 'Nuevo', puntaje: 3 }] });
  lb.guardarPartida({ juego: 'penales', modo: 'uno', registros: [{ categoria: 'arquero', nombre: 'Arq', puntaje: 60 }] });
  assert.deepEqual(lb.top('penales', 'seguidos', 'hoy').map((x) => x.nombre), ['Nuevo']);
  assert.deepEqual(lb.top('penales', 'seguidos', 'semana').map((x) => x.nombre), ['Nuevo']);
  assert.deepEqual(lb.top('penales', 'seguidos', 'siempre').map((x) => x.nombre), ['Viejo', 'Nuevo']);
  assert.deepEqual(lb.top('penales', 'arquero', 'siempre').map((x) => x.nombre), ['Arq']);
  assert.equal(lb.top('memoria', 'individual', 'siempre').length, 0);
});

test('avisa el récord y el puesto', () => {
  const lb = createLeaderboard({ dir: tmp() });
  const [a] = lb.guardarPartida({ juego: 'x', modo: 's', registros: [{ categoria: 'c', nombre: 'Ana', puntaje: 10 }] });
  assert.equal(a.esRecord, true); assert.equal(a.puestoHoy, 1);
  const [b] = lb.guardarPartida({ juego: 'x', modo: 's', registros: [{ categoria: 'c', nombre: 'Beto', puntaje: 5 }] });
  assert.equal(b.esRecord, false); assert.equal(b.puestoHoy, 2);
  const [c] = lb.guardarPartida({ juego: 'x', modo: 's', registros: [{ categoria: 'c', nombre: 'Caro', puntaje: 10 }] });
  assert.equal(c.esRecord, false, 'empatar no es récord');
});

test('un renglón cortado (corte de luz) no rompe la lectura', () => {
  const dir = tmp();
  const lb = createLeaderboard({ dir });
  lb.guardarPartida({ juego: 'x', modo: 's', registros: [{ categoria: 'c', nombre: 'Ana', puntaje: 10 }] });
  fs.appendFileSync(path.join(dir, 'puntajes.jsonl'), '{"id":"roto","jue');
  const lb2 = createLeaderboard({ dir });
  lb2.guardarPartida({ juego: 'x', modo: 's', registros: [{ categoria: 'c', nombre: 'Beto', puntaje: 20 }] });
  const lb3 = createLeaderboard({ dir });
  assert.deepEqual(lb3.top('x', 'c', 'siempre').map((r) => r.nombre), ['Beto', 'Ana']);
});

test('tienePartida evita guardar dos veces la misma partida', () => {
  const lb = createLeaderboard({ dir: tmp() });
  lb.guardarPartida({ partidaId: 'p-abc', juego: 'x', modo: 's', registros: [{ categoria: 'c', nombre: 'Ana', puntaje: 1 }] });
  assert.equal(lb.tienePartida('p-abc'), true);
  assert.equal(lb.tienePartida('p-otra'), false);
});

test('el detalle solo guarda números y textos cortos', () => {
  const lb = createLeaderboard({ dir: tmp() });
  const [g] = lb.guardarPartida({ juego: 'x', modo: 's', registros: [{ categoria: 'c', nombre: 'Ana', puntaje: 1, detalle: { nivel: 7, texto: '<b>hola</b>', obj: { a: 1 }, 'mal-clave': 3 } }] });
  assert.deepEqual(g.registro.detalle, { nivel: 7, texto: 'bhola/b' });
});

test('filtro de nombres y limpieza', () => {
  const lb = createLeaderboard({ dir: tmp() });
  assert.equal(lb.nombrePermitido('Lucía'), true);
  assert.equal(lb.nombrePermitido('Vergara'), true);
  assert.equal(lb.nombrePermitido('b0lud0'), false);
  assert.equal(lb.nombrePermitido('pelotudito'), false);
  assert.equal(lb.nombrePermitido('p u t o'), false);
  assert.equal(limpiarNombre('  Ana   Paula '), 'Ana Paula');
  assert.equal(limpiarNombre('A'), null);
  assert.equal(limpiarNombre('<script>'), null);
  assert.equal(limpiarNombre('Quince letras!!'), null);
});

test('fechaLocal usa la hora de Argentina', () => {
  assert.equal(fechaLocal(Date.parse('2026-11-01T02:00:00Z')), '2026-10-31T23:00:00-03:00');
});
