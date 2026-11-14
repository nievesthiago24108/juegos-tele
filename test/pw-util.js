/*
 * Ayudas para las pruebas con Playwright: levanta un servidor con datos temporales (nunca toca
 * data/), abre la tele en 1080x1920 y celulares emulados, junta errores de consola y avisa si
 * alguna página pide algo a internet.
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { crearServidor, loadConfig } = require('../server.js');

const CAPTURAS = path.join(__dirname, '..', 'capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function levantar(opts) {
  opts = opts || {};
  const dataDir = opts.dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'juegos-tele-'));
  const config = Object.assign(loadConfig(), opts.config || {});
  const srv = crearServidor({ config, dataDir, silencio: true, ip: '127.0.0.1' });
  const puerto = await srv.listen(opts.puerto || 0, '127.0.0.1');
  const base = `http://127.0.0.1:${puerto}`;
  return { srv, dataDir, puerto, base };
}

function vigilar(page, nombre, problemas) {
  page.on('console', (m) => {
    if (m.type() === 'error') problemas.push(`[${nombre}] consola: ${m.text()}`);
  });
  page.on('pageerror', (e) => problemas.push(`[${nombre}] error: ${e.message}`));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['127.0.0.1', 'localhost'].includes(u.hostname) && u.protocol !== 'data:' && u.protocol !== 'blob:') {
      problemas.push(`[${nombre}] pidió algo afuera: ${r.url()}`);
    }
  });
}

async function navegador() {
  return chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
}

async function abrirTele(browser, base, problemas, opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1080, height: 1920 }, deviceScaleFactor: opts.escala || 0.5 });
  const page = await ctx.newPage();
  vigilar(page, opts.nombre || 'tele', problemas);
  await page.goto(base + '/' + (opts.query || ''));
  await page.waitForFunction(() => document.body.dataset.listo === '1');
  await sleep(300);
  return page;
}

async function abrirCelu(browser, base, problemas, nombre, opts) {
  opts = opts || {};
  const ctx = opts.contexto || await browser.newContext({
    viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: false,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
  });
  const page = await ctx.newPage();
  vigilar(page, 'celu ' + nombre, problemas);
  await page.goto(base + '/j/');
  if (opts.sinEntrar) return page;
  await page.fill('#nombre', nombre);
  await page.click('#btn-entrar');
  await page.waitForFunction(() => window.Celu && window.Celu.yo.id);
  return page;
}

/** Elige juego y modo con el teclado de la tele (flechas + Enter) */
async function elegirConTeclado(tele, juegoId, modoId) {
  for (let i = 0; i < 10; i++) {
    const ok = await tele.evaluate((id) => { const e = window.Plataforma.estado; return e.juegos[e.sel.juego].id === id; }, juegoId);
    if (ok) break;
    await tele.keyboard.press('ArrowDown');
  }
  for (let i = 0; i < 6; i++) {
    const ok = await tele.evaluate((id) => { const e = window.Plataforma.estado; return e.juegos[e.sel.juego].modos[e.sel.modo].id === id; }, modoId);
    if (ok) break;
    await tele.keyboard.press('ArrowRight');
  }
  await tele.keyboard.press('Enter');
  await tele.waitForFunction(() => window.Plataforma.estado.fase === 'jugando');
}

/** Punto del lienzo (1080x1920) → punto de la ventana, para hacer clic donde corresponde */
async function aVentana(tele, x, y) {
  return tele.evaluate(([x, y]) => {
    const e = window.Plataforma.estado;
    const dx = (x - 540) * e.escala, dy = (y - 960) * e.escala;
    const a = e.rotacion * Math.PI / 180;
    return { x: window.innerWidth / 2 + dx * Math.cos(a) - dy * Math.sin(a), y: window.innerHeight / 2 + dx * Math.sin(a) + dy * Math.cos(a) };
  }, [x, y]);
}

async function captura(page, nombre) {
  const archivo = path.join(CAPTURAS, nombre + '.png');
  await page.screenshot({ path: archivo });
  return archivo;
}

function revisar(cond, msj) {
  if (!cond) throw new Error('Falló: ' + msj);
  console.log('  ✓ ' + msj);
}

const esperarFase = (tele, fase, ms) => tele.waitForFunction((f) => window.Plataforma.estado.fase === f, fase, { timeout: ms || 30000 });

/**
 * Arrastra el mouse en la tele desde la pelota para pegarle a (x, y) del arco con cierta fuerza,
 * usando la calibración del perfil "mouse" (largo = altura, ángulo = lado, velocidad = fuerza).
 */
async function arrastrar(tele, { x, y, fuerza, curva, alMedio, dx, subida, ms }) {
  const P = { s0: 0.06, s1: 0.40, angulo: 24, v0: 0.3, v1: 2.0 };
  if (subida == null) subida = (P.s0 + y * (P.s1 - P.s0)) * 1920;
  if (dx == null) dx = Math.tan(x * P.angulo * Math.PI / 180) * subida;
  const largo = Math.hypot(dx, subida);
  if (ms == null) ms = largo / ((P.v0 + fuerza * (P.v1 - P.v0)) * 1920) * 1000;
  const tr = await tele.evaluate(() => {
    const e = window.Plataforma.estado;
    return { esc: e.escala, rot: e.rotacion, w: window.innerWidth, h: window.innerHeight };
  });
  const aV = (cx, cy) => {
    const ddx = (cx - 540) * tr.esc, ddy = (cy - 960) * tr.esc, a = tr.rot * Math.PI / 180;
    return { x: tr.w / 2 + ddx * Math.cos(a) - ddy * Math.sin(a), y: tr.h / 2 + ddx * Math.sin(a) + ddy * Math.cos(a) };
  };
  // Chrome entrega un movimiento por cuadro (~17 ms): con menos pasos, el tiempo real se parece al pedido
  const pasos = Math.max(4, Math.min(10, Math.round(ms / 24)));
  const p0 = aV(540, 1560);
  await tele.mouse.move(p0.x, p0.y);
  await tele.mouse.down();
  const t0 = Date.now();
  for (let i = 1; i <= pasos; i++) {
    const k = i / pasos;
    const p = aV(540 + dx * k + (curva || 0) * Math.sin(Math.PI * k), 1560 - subida * k);
    const espera = t0 + ms * k - Date.now();
    if (espera > 0) await sleep(espera);
    await tele.mouse.move(p.x, p.y);
    if (alMedio && i === pasos - 2) await alMedio();
  }
  await tele.mouse.up();
}

/** Desliza en el celu, desde la pelota dibujada hacia arriba (fracciones del alto del área) */
async function deslizar(celu, { x, y, fuerza, dx, subida, ms, alMedio }) {
  const P = { s0: 0.12, s1: 0.62, angulo: 20, v0: 0.6, v1: 3.6 };
  if (subida == null) subida = P.s0 + y * (P.s1 - P.s0);
  if (dx == null) dx = Math.tan(x * P.angulo * Math.PI / 180) * subida;
  if (ms == null) ms = Math.hypot(dx, subida) / (P.v0 + fuerza * (P.v1 - P.v0)) * 1000;
  const caja = await celu.$('.deslizar');
  const b = await caja.boundingBox();
  const x0 = b.x + b.width / 2, y0 = b.y + b.height - Math.min(90, b.height * 0.14);
  await celu.mouse.move(x0, y0);
  await celu.mouse.down();
  const pasos = Math.max(4, Math.min(10, Math.round(ms / 24)));
  const t0 = Date.now();
  for (let i = 1; i <= pasos; i++) {
    const k = i / pasos;
    const espera = t0 + ms * k - Date.now();
    if (espera > 0) await sleep(espera);
    await celu.mouse.move(x0 + dx * b.height * k, y0 - subida * b.height * k);
    if (alMedio && i === pasos - 2) await alMedio();
  }
  await celu.mouse.up();
}

module.exports = { arrastrar, deslizar, levantar, navegador, abrirTele, abrirCelu, elegirConTeclado, aVentana, captura, revisar, esperarFase, sleep, CAPTURAS, vigilar };
