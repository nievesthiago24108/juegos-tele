'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io: cliente } = require('socket.io-client');
const { crearServidor, loadConfig } = require('../server.js');

async function levantar(extra) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srv-'));
  const srv = crearServidor(Object.assign({ config: loadConfig(), dataDir, silencio: true, ip: '127.0.0.1' }, extra));
  const puerto = await srv.listen(0, '127.0.0.1');
  const url = `http://127.0.0.1:${puerto}`;
  const socks = [];
  const conectar = () => new Promise((res) => {
    const s = cliente(url, { transports: ['websocket'], forceNew: true });
    socks.push(s);
    s.on('connect', () => res(s));
  });
  const emitir = (s, ev, d) => new Promise((res) => (d === undefined ? s.emit(ev, res) : s.emit(ev, d, res)));
  const cerrar = async () => { socks.forEach((s) => s.close()); await srv.close(); };
  return { srv, url, dataDir, conectar, emitir, cerrar };
}
const esperar = (s, ev, cond) => new Promise((res) => {
  const f = (d) => { if (!cond || cond(d)) { s.off(ev, f); res(d); } };
  s.on(ev, f);
});

test('config.json mal escrito usa valores por defecto', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-')), 'config.json');
  fs.writeFileSync(f, JSON.stringify({ puerto: 'abc', rotarPantalla: 45, colores: { principal: 'rojo', acento: '#112233' }, nombreEscuela: 'Mi escuela' }));
  const warn = console.warn; console.warn = () => {};
  const c = loadConfig(f);
  console.warn = warn;
  assert.equal(c.puerto, 3000);
  assert.equal(c.rotarPantalla, 0);
  assert.equal(c.colores.principal, '#6272B4');
  assert.equal(c.colores.acento, '#112233');
  assert.equal(c.nombreEscuela, 'Mi escuela');
  fs.writeFileSync(f, '{ esto no es json');
  console.warn = () => {};
  assert.equal(loadConfig(f).puerto, 3000);
  console.warn = warn;
});

test('API: config con QR, juegos y ranking', async () => {
  const t = await levantar();
  try {
    const c = await (await fetch(t.url + '/api/config')).json();
    assert.match(c.url, /^http:\/\/127\.0\.0\.1:\d+\/j$/);
    assert.match(c.qr, /^data:image\/png;base64,/);
    assert.equal(c.logo, null);
    const j = await (await fetch(t.url + '/api/juegos')).json();
    assert.ok(j.some((x) => x.id === 'toca-rapido'));
    const r = await (await fetch(t.url + '/api/ranking')).json();
    assert.ok(Array.isArray(r.juegos));
  } finally { await t.cerrar(); }
});

test('sala: el primero es anfitrión, nombres validados, reconexión con token', async () => {
  const t = await levantar();
  try {
    const tele = await t.conectar();
    await t.emitir(tele, 'tele:hola');
    const a = await t.conectar();
    const ra = await t.emitir(a, 'jugador:unirse', { nombre: 'Ana' });
    assert.equal(ra.ok, true);
    assert.equal(ra.sala.jugadores[0].anfitrion, true);
    const b = await t.conectar();
    assert.equal((await t.emitir(b, 'jugador:unirse', { nombre: 'x' })).ok, false);
    assert.equal((await t.emitir(b, 'jugador:unirse', { nombre: 'forro' })).ok, false);
    const rb = await t.emitir(b, 'jugador:unirse', { nombre: 'Beto' });
    assert.equal(rb.ok, true);
    assert.equal(rb.sala.jugadores.find((j) => j.id === rb.id).anfitrion, false);
    // Ana se cae y vuelve con su token
    a.close();
    await new Promise((r) => setTimeout(r, 100));
    const a2 = await t.conectar();
    const ra2 = await t.emitir(a2, 'jugador:unirse', { token: ra.token });
    assert.equal(ra2.ok, true);
    assert.equal(ra2.id, ra.id);
    assert.equal(ra2.sala.jugadores.length, 2);
  } finally { await t.cerrar(); }
});

test('input del celu llega a la tele con marca de tiempo; el control llega al celu', async () => {
  const t = await levantar();
  try {
    const tele = await t.conectar();
    await t.emitir(tele, 'tele:hola');
    const a = await t.conectar();
    const ra = await t.emitir(a, 'jugador:unirse', { nombre: 'Ana' });
    tele.emit('tele:fase', { fase: 'jugando', juego: 'toca-rapido', modo: 'celus', partidaId: 'p-1' });
    const llegaControl = esperar(a, 'control', (c) => c && c.tipo === 'botones');
    tele.emit('tele:control', { jugadorId: ra.id, control: { tipo: 'botones', botones: [{ id: 0 }] } });
    assert.equal((await llegaControl).tipo, 'botones');
    const llega = esperar(tele, 'input');
    const antes = Date.now();
    a.emit('jugador:input', { boton: 0, t: antes - 20 }, () => {});
    const m = await llega;
    assert.equal(m.jugadorId, ra.id);
    assert.deepEqual(m.datos.boton, 0);
    assert.equal(m.ts, antes - 20, 'usa la hora del celu si es creíble');
    a.emit('jugador:input', { boton: 0, t: 5 }, () => {});
    await new Promise((r) => setTimeout(r, 40));
    const llega2 = esperar(tele, 'input');
    a.emit('jugador:input', { boton: 1, t: 5 }, () => {});
    const m2 = await llega2;
    assert.ok(Math.abs(m2.ts - Date.now()) < 200, 'una hora absurda se reemplaza por la de llegada');
  } finally { await t.cerrar(); }
});

test('puntajes: solo la tele guarda, los nombres de celus los pone el servidor y no se repite la partida', async () => {
  const t = await levantar();
  try {
    const tele = await t.conectar();
    await t.emitir(tele, 'tele:hola');
    const a = await t.conectar();
    const ra = await t.emitir(a, 'jugador:unirse', { nombre: 'Ana' });
    const intruso = await t.emitir(a, 'tele:puntajes', { juego: 'toca-rapido', modo: 'solo', registros: [{ categoria: 'toques', nombre: 'Hacker', puntaje: 999 }] });
    assert.equal(intruso.ok, false);
    const r = await t.emitir(tele, 'tele:puntajes', {
      partidaId: 'p-x1', juego: 'toca-rapido', modo: 'celus',
      registros: [
        { categoria: 'toques', puntaje: 40, jugadorIds: [ra.id], nombre: 'Otro nombre' },
        { categoria: 'toques', puntaje: 50, jugadorIds: ['no-existe'] },
        { categoria: 'toques', puntaje: 60, nombre: 'Sin celu' },
        { categoria: 'inventada', puntaje: 70, jugadorIds: [ra.id] },
      ],
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.guardados.map((g) => [g.registro.nombre, g.registro.puntaje]), [['Ana', 40]]);
    const rep = await t.emitir(tele, 'tele:puntajes', { partidaId: 'p-x1', juego: 'toca-rapido', modo: 'celus', registros: [{ categoria: 'toques', puntaje: 40, jugadorIds: [ra.id] }] });
    assert.equal(rep.repetida, true);
    const solo = await t.emitir(tele, 'tele:puntajes', { partidaId: 'p-x2', juego: 'toca-rapido', modo: 'solo', registros: [{ categoria: 'toques', puntaje: 33, nombre: 'Lucía' }, { categoria: 'toques', puntaje: 3, nombre: 'boludo' }] });
    assert.deepEqual(solo.guardados.map((g) => g.registro.nombre), ['Lucía']);
    const lineas = fs.readFileSync(path.join(t.dataDir, 'puntajes.jsonl'), 'utf8').trim().split('\n');
    assert.equal(lineas.length, 2);
  } finally { await t.cerrar(); }
});

test('payloads raros no tiran abajo el servidor', async () => {
  const t = await levantar();
  try {
    const s = await t.conectar();
    ['jugador:unirse', 'jugador:input', 'tele:control', 'tele:fase', 'tele:puntajes', 'anfitrion:accion', 'tele:juego']
      .forEach((ev) => { s.emit(ev, null); s.emit(ev, 'texto'); s.emit(ev, { a: { b: [1, 2] } }); s.emit(ev); });
    await new Promise((r) => setTimeout(r, 150));
    const c = await (await fetch(t.url + '/api/config')).json();
    assert.ok(c.qr);
  } finally { await t.cerrar(); }
});
