/*
 * Prueba final de todo el proyecto (1080x1920):
 *   1. Modos solo SIN ningún celular conectado, con mouse y con teclado (los 3 juegos).
 *   2. Cada modo con celulares, hasta el final; un celu se desconecta y vuelve (Tocá rápido y Memoria).
 *   3. Los puntajes quedan en el leaderboard y siguen ahí después de reiniciar el servidor.
 *   4. Una partida con rotarPantalla = 90 (desde config), con clics del mouse.
 *   5. Ninguna página pide nada a internet y no hay errores de consola.
 * Capturas en capturas/f*.png
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const u = require('./pw-util.js');
const { crearServidor, loadConfig } = require('../server.js');

const est = (tele) => tele.evaluate(() => window.Plataforma.juego._estado());
const faseJuego = (tele, f, ms) => tele.waitForFunction((f) => {
  const j = window.Plataforma.juego; return j && j._estado && j._estado().fase === f;
}, f, { timeout: ms || 30000 });
const guardado = (tele) => tele.waitForFunction(() => /ranking|puesto|récord/i.test(document.getElementById('res-guardado').textContent), null, { timeout: 10000 });

/** Centro del botón de Memoria en la posición p (misma cuenta que el juego) */
function centroMemoria(p, n) {
  const [s, g, y0] = n === 6 ? [330, 30, 360] : [420, 40, 440];
  const x0 = (1080 - (2 * s + g)) / 2;
  return { x: x0 + (p % 2) * (s + g) + s / 2, y: y0 + Math.floor(p / 2) * (s + g) + s / 2 };
}

async function clicLienzo(tele, x, y) {
  const p = await u.aVentana(tele, x, y);
  await tele.mouse.click(p.x, p.y);
}

async function elegirConMouse(tele, juegoId, modoId) {
  const pos = await tele.evaluate(([j, m]) => {
    const e = window.Plataforma.estado;
    const ji = e.juegos.findIndex((x) => x.id === j);
    const mi = e.juegos[ji].modos.findIndex((x) => x.id === m);
    const r = document.querySelector(`.modo[data-j="${ji}"][data-m="${mi}"]`).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [juegoId, modoId]);
  await tele.mouse.click(pos.x, pos.y);   // primer clic: elige
  await tele.mouse.click(pos.x, pos.y);   // segundo clic: juega
  await u.esperarFase(tele, 'jugando');
}

/** Juega Memoria solo: niveles con mouse o teclado y después se equivoca */
async function memoriaSolo(tele, niveles, conMouse) {
  for (let n = 1; n <= niveles; n++) {
    await faseJuego(tele, 'respondiendo');
    const e = await est(tele);
    for (const c of e.esperado) {
      const p = e.posiciones.indexOf(c);
      if (conMouse(n)) { const q = centroMemoria(p, e.posiciones.length); await clicLienzo(tele, q.x, q.y); }
      else await tele.keyboard.press(`Digit${p + 1}`);
      await u.sleep(80);
    }
    await faseJuego(tele, 'bien');
  }
  await faseJuego(tele, 'respondiendo');
  const e = await est(tele);
  await tele.keyboard.press(`Digit${e.posiciones.findIndex((c) => c !== e.esperado[0]) + 1}`);
}

async function nombreConMouse(tele, nombre) {
  await u.esperarFase(tele, 'nombre', 15000);
  for (const c of nombre.toUpperCase()) await tele.click(`.tecla[data-c="${c}"]`);
  await tele.click('#tec-listo');
  await u.esperarFase(tele, 'resultados');
  await guardado(tele);
}

async function contarRanking(base) {
  const r = await (await fetch(base + '/api/ranking?n=50')).json();
  const c = {};
  r.juegos.forEach((j) => j.rankings.forEach((rk) => { c[`${j.id}/${rk.id}`] = rk.siempre.length; }));
  return c;
}

(async () => {
  const problemas = [];
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'juegos-final-'));
  let { srv, base, puerto } = await u.levantar({ dataDir });
  const browser = await u.navegador();
  const t0 = Date.now();
  try {
    // ------------------------------------------------------------------ 1. modos solo sin celus
    console.log('1. Modos solo, sin ningún celular');
    const tele = await u.abrirTele(browser, base, problemas);
    u.revisar(await tele.evaluate(() => window.Plataforma.estado.sala.jugadores.length) === 0, 'no hay ningún celular conectado');
    await u.captura(tele, 'f1-menu-vacio');

    await elegirConMouse(tele, 'toca-rapido', 'solo');
    await u.sleep(3300);
    for (let i = 0; i < 12; i++) { await clicLienzo(tele, 400 + (i % 3) * 120, 900); await u.sleep(30); }
    for (let i = 0; i < 5; i++) { await tele.keyboard.press('Space'); await u.sleep(30); }
    await nombreConMouse(tele, 'Rocio');
    u.revisar(true, 'Tocá rápido solo: elegido con mouse, jugado con mouse y barra, nombre con el teclado en pantalla');
    await tele.keyboard.press('Escape');

    await u.elegirConTeclado(tele, 'memoria', 'solo');
    await memoriaSolo(tele, 2, (n) => n === 1);
    await u.esperarFase(tele, 'nombre', 15000);
    await tele.keyboard.type('Mati');
    await tele.keyboard.press('Enter');
    await u.esperarFase(tele, 'resultados'); await guardado(tele);
    u.revisar(true, 'Memoria solo: nivel 1 con clics en los botones, nivel 2 con el teclado');
    await tele.keyboard.press('Escape');

    await u.elegirConTeclado(tele, 'penales', 'solo');
    await faseJuego(tele, 'apuntar');
    await u.arrastrar(tele, { x: 0.6, y: 0.65, fuerza: 0.6 });
    await faseJuego(tele, 'resultado', 10000);
    const r1 = await est(tele);
    u.revisar(r1.tiro && Math.abs(r1.tiro.x - 0.6) < 0.3, `Penales solo con mouse: tiro a x=${r1.tiro.x} y=${r1.tiro.y} → ${r1.resultado}`);
    while ((await est(tele)).solo.errados < 3) {
      await faseJuego(tele, 'apuntar');
      await u.arrastrar(tele, { x: 1.7, y: 0.4, fuerza: 0.6 });
      await faseJuego(tele, 'resultado', 10000);
    }
    await tele.waitForFunction(() => ['nombre', 'resultados'].includes(window.Plataforma.estado.fase), null, { timeout: 15000 });
    if (await tele.evaluate(() => window.Plataforma.estado.fase) === 'nombre') {
      await tele.keyboard.type('Luz'); await tele.keyboard.press('Enter');
      await u.esperarFase(tele, 'resultados'); await guardado(tele);
    }
    await tele.keyboard.press('Escape');
    await u.esperarFase(tele, 'menu');
    u.revisar(true, 'Penales solo terminado al errar 3');

    // ------------------------------------------------------------------ 2. modos con celulares
    console.log('2. Modos con celulares');
    const ana = await u.abrirCelu(browser, base, problemas, 'Ana');
    let beto = await u.abrirCelu(browser, base, problemas, 'Beto');
    let caro = await u.abrirCelu(browser, base, problemas, 'Caro');
    await tele.waitForFunction(() => window.Plataforma.estado.sala.jugadores.filter((j) => j.conectado).length === 3);
    await u.captura(tele, 'f2-menu-3-celus');
    const id = async (p) => p.evaluate(() => window.Celu.yo.id);
    const ids = { Ana: await id(ana), Beto: await id(beto), Caro: await id(caro) };

    // Solo con celu (como el bowling): Ana elige el Solo desde su celu y juega con el celu
    const volver = async () => { await ana.click('#btn-volver'); await u.esperarFase(tele, 'menu'); };
    const sinTeclado = async () => {
      await tele.waitForFunction(() => ['nombre', 'resultados'].includes(window.Plataforma.estado.fase), null, { timeout: 20000 });
      return (await tele.evaluate(() => window.Plataforma.estado.fase)) === 'resultados';
    };
    await ana.click('button[data-j="toca-rapido"][data-m="solo"]');
    await u.esperarFase(tele, 'jugando');
    await beto.waitForFunction(() => window.Celu.control && /Juega Ana/.test(window.Celu.control.mensaje || ''));
    await ana.waitForSelector('.btn-color', { timeout: 8000 });
    await ana.waitForSelector('#ctl-reloj:not(.oculto)');
    await u.captura(ana, 'f10-celu-solo-toca-reloj');
    for (let i = 0; i < 8; i++) { await ana.click('.btn-color'); await u.sleep(60); }
    u.revisar(await sinTeclado(), 'Tocá rápido Solo con celu: termina sin teclado en pantalla');
    await guardado(tele);
    const st = await tele.evaluate(() => window.Plataforma.estado.ultimoResultado);
    u.revisar(st.filas[0].nombre === 'Ana' && st.filas[0].valor === 8, `Tocá rápido Solo con celu: Ana hizo ${st.filas[0].valor} toques desde el celu`);
    await volver();

    await ana.click('button[data-j="memoria"][data-m="solo"]');
    await u.esperarFase(tele, 'jugando');
    for (let n = 1; n <= 2; n++) {
      await faseJuego(tele, 'respondiendo');
      const e = await est(tele);
      await ana.waitForSelector('.btn-color:not([disabled])', { timeout: 5000 });
      for (const c of e.esperado) { await ana.click(`.btn-color[data-id="${c}"]`); await u.sleep(80); }
      if (n === 2) await u.captura(tele, 'f11-memoria-solo-celu');
      await faseJuego(tele, 'bien', 5000);
    }
    await faseJuego(tele, 'respondiendo');
    const em = await est(tele);
    await ana.waitForSelector('.btn-color:not([disabled])', { timeout: 5000 });
    await u.captura(ana, 'f12-celu-solo-memoria');
    await ana.click(`.btn-color[data-id="${em.posiciones.find((c) => c !== em.esperado[0])}"]`);
    u.revisar(await sinTeclado(), 'Memoria Solo con celu: termina sin teclado en pantalla');
    await guardado(tele);
    const rkm = await (await fetch(base + '/api/ranking?n=50')).json();
    const indiv = rkm.juegos.find((j) => j.id === 'memoria').rankings.find((r) => r.id === 'individual').hoy;
    u.revisar(indiv.some((x) => x.nombre === 'Ana' && x.modo === 'solo' && Math.floor(x.puntaje / 100) === 2), 'Memoria Solo con celu: queda en el ranking como Ana, nivel 2');
    await volver();

    await ana.click('button[data-j="penales"][data-m="solo"]');
    await u.esperarFase(tele, 'jugando');
    let tirosCelu = 0;
    while ((await est(tele)).solo.errados < 3) {
      await faseJuego(tele, 'apuntar');
      await ana.waitForSelector('.deslizar');
      if (tirosCelu === 0) {
        await ana.waitForSelector('#ctl-reloj:not(.oculto)');
        await u.deslizar(ana, { x: 0.6, y: 0.6, fuerza: 0.55, alMedio: () => u.captura(ana, 'f13-celu-solo-penales') });
      } else {
        await u.deslizar(ana, { x: 1.8, y: 0.4, fuerza: 0.55 });
      }
      await faseJuego(tele, 'resultado', 12000);
      if (tirosCelu === 0) {
        const r = await est(tele);
        u.revisar(r.pateador === ids.Ana && Math.abs(r.tiro.x - 0.6) < 0.3, `Penales Solo con celu: Ana patea desde el celu (x=${r.tiro.x}) → ${r.resultado}`);
        await u.sleep(400); await u.captura(tele, 'f14-penales-solo-celu');
      }
      tirosCelu++;
    }
    u.revisar(await sinTeclado(), 'Penales Solo con celu: termina al errar 3, sin teclado en pantalla');
    const sp = await tele.evaluate(() => window.Plataforma.estado.ultimoResultado);
    u.revisar(sp.filas[0].nombre === 'Ana', `Penales Solo con celu: resultado a nombre de Ana (${sp.titulo})`);
    await volver();

    // Tocá rápido con celus: Beto recarga la página en medio de la partida y sigue tocando
    await ana.click('button[data-j="toca-rapido"][data-m="celus"]');
    await u.esperarFase(tele, 'jugando');
    await ana.waitForSelector('.btn-color', { timeout: 8000 });
    await beto.waitForSelector('.btn-color');
    for (let i = 0; i < 5; i++) { await beto.click('.btn-color'); await ana.click('.btn-color'); await u.sleep(60); }
    await beto.reload();
    await beto.waitForFunction(() => window.Celu && window.Celu.yo.id);
    u.revisar(await id(beto) === ids.Beto, 'Beto se desconectó (recargó) y volvió con el mismo lugar');
    await beto.waitForSelector('.btn-color', { timeout: 5000 });
    for (let i = 0; i < 5; i++) { await beto.click('.btn-color'); await u.sleep(60); }
    await u.esperarFase(tele, 'resultados', 15000); await guardado(tele);
    const rt = await tele.evaluate(() => window.Plataforma.estado.ultimoResultado);
    const filaBeto = rt.filas.find((f) => f.nombre === 'Beto');
    u.revisar(filaBeto.valor === 10, `los toques de Beto antes y después de volver cuentan (${filaBeto.valor})`);
    await ana.click('#btn-volver');
    await u.esperarFase(tele, 'menu');

    // Memoria eliminación: Caro recarga mientras se muestra el nivel 2 y vuelve a tiempo
    await ana.click('button[data-j="memoria"][data-m="eliminacion"]');
    await u.esperarFase(tele, 'jugando');
    const celus = { [ids.Ana]: () => ana, [ids.Beto]: () => beto, [ids.Caro]: () => caro };
    for (let n = 1; n <= 3; n++) {
      if (n === 2) {
        await faseJuego(tele, 'mostrando');
        await caro.reload();
        await caro.waitForFunction(() => window.Celu && window.Celu.yo.id);
      }
      await faseJuego(tele, 'respondiendo');
      const e = await est(tele);
      for (const j of e.jugadores.filter((x) => x.estado === 'respondiendo')) {
        const page = celus[j.id]();
        await page.waitForSelector('.btn-color:not([disabled])', { timeout: 5000 });
        for (const [i, c] of e.esperado.entries()) {
          const falla = (n === 2 && j.nombre === 'Beto' && i === 0) || (n === 3 && j.nombre === 'Caro' && i === 0);
          await page.click(`.btn-color[data-id="${falla ? e.posiciones.find((x) => x !== c) : c}"]`);
          await u.sleep(50);
          if (falla) break;
        }
      }
      if (n === 2) {
        await tele.waitForFunction(() => !window.Plataforma.juego._estado().jugadores.some((j) => j.estado === 'respondiendo'));
        const s = await est(tele);
        u.revisar(s.jugadores.find((x) => x.nombre === 'Caro').estado !== 'afuera', 'Caro volvió a tiempo y respondió bien el nivel 2');
      }
    }
    await u.esperarFase(tele, 'resultados', 15000); await guardado(tele);
    const rm = await tele.evaluate(() => window.Plataforma.estado.ultimoResultado);
    u.revisar(/Ganó Ana/.test(rm.titulo), `Memoria eliminación: ${rm.titulo}`);
    await u.captura(tele, 'f3-memoria-eliminacion');
    await ana.click('#btn-volver');
    await u.esperarFase(tele, 'menu');

    // Memoria cooperativo con 3
    await ana.click('button[data-j="memoria"][data-m="cooperativo"]');
    await u.esperarFase(tele, 'jugando');
    const pages = [ana, beto, caro];
    const tocarColor = async (c) => {
      for (const p of pages) { if (await p.$(`.btn-color[data-id="${c}"]`)) { await p.click(`.btn-color[data-id="${c}"]`); return; } }
      throw new Error('nadie tiene el color ' + c);
    };
    await faseJuego(tele, 'respondiendo');
    await ana.waitForSelector('.btn-color');
    await u.sleep(300);
    for (const c of (await est(tele)).esperado) { await tocarColor(c); await u.sleep(150); }
    await faseJuego(tele, 'bien', 5000);
    for (let v = 0; v < 3; v++) {
      await faseJuego(tele, 'respondiendo');
      await ana.waitForSelector('.btn-color');
      await u.sleep(300);
      const e = await est(tele);
      await tocarColor(e.posiciones.find((c) => c !== e.esperado[0]));
      await faseJuego(tele, 'error', 5000);
    }
    await u.esperarFase(tele, 'resultados', 15000); await guardado(tele);
    u.revisar(true, 'Memoria cooperativo con 3 celus hasta perder las 3 vidas');
    await ana.click('#btn-volver');
    await u.esperarFase(tele, 'menu');

    // Penales 1 contra 1 (con 3 conectados juegan los 2 primeros; Caro espera)
    await ana.click('button[data-j="penales"][data-m="uno"]');
    await u.esperarFase(tele, 'jugando');
    await caro.waitForFunction(() => window.Celu.control && /próxima/.test(window.Celu.control.mensaje || ''));
    u.revisar(true, 'con 3 celus en un modo de 2, la tercera espera la próxima');
    await u.captura(caro, 'f4-celu-espera-proxima');
    const porId = { [ids.Ana]: ana, [ids.Beto]: beto };
    let k = 0;
    for (;;) {
      const f = await tele.waitForFunction(() => { const e = window.Plataforma.juego && window.Plataforma.juego._estado(); return e && (e.fase === 'apuntar' || e.fase === 'fin') && e.fase; }, null, { timeout: 30000 });
      if ((await f.jsonValue()) === 'fin') break;
      const e = await est(tele);
      const lado = k % 2 ? -1 : 1;
      const tx = lado * 0.6, ty = k % 4 < 2 ? 0.25 : 0.7;
      const zt = (ty >= 0.5 ? 0 : 3) + (lado > 0 ? 2 : 0);
      await porId[e.arquero].waitForSelector('.zona');
      await porId[e.arquero].click(`.zona[data-i="${[0, 3, 10].includes(k) ? zt : (zt + 3) % 6}"]`);
      await porId[e.pateador].waitForSelector('.deslizar');
      await u.deslizar(porId[e.pateador], { x: tx, y: ty, fuerza: 0.55 });
      await faseJuego(tele, 'resultado', 12000);
      k++;
      if (k > 20) throw new Error('la tanda no termina');
    }
    await u.esperarFase(tele, 'resultados', 10000); await guardado(tele);
    const ru = await tele.evaluate(() => window.Plataforma.estado.ultimoResultado);
    u.revisar(true, `Penales 1 contra 1 (${k} tiros): ${ru.titulo} ${ru.subtitulo}`);
    await ana.click('#btn-volver');
    await u.esperarFase(tele, 'menu');

    // Penales torneo con 3
    await ana.click('button[data-j="penales"][data-m="torneo"]');
    await u.esperarFase(tele, 'jugando');
    const todos = { [ids.Ana]: ana, [ids.Beto]: beto, [ids.Caro]: caro };
    let t = 0;
    for (;;) {
      const f = await tele.waitForFunction(() => { const e = window.Plataforma.juego && window.Plataforma.juego._estado(); return e && (e.fase === 'apuntar' || e.fase === 'fin') && e.fase; }, null, { timeout: 30000 });
      if ((await f.jsonValue()) === 'fin') break;
      const e = await est(tele);
      await todos[e.pateador].waitForSelector('.deslizar');
      await u.deslizar(todos[e.pateador], { x: ((t % 3) - 1) * 0.6, y: 0.2 + (t % 4) * 0.2, fuerza: 0.55 });
      await faseJuego(tele, 'resultado', 12000);
      t++;
    }
    u.revisar(t === 15, `Penales torneo: 3 × 5 = ${t} tiros`);
    await u.esperarFase(tele, 'resultados', 10000); await guardado(tele);
    await u.captura(tele, 'f5-penales-torneo');
    await ana.click('#btn-volver');
    await u.esperarFase(tele, 'menu');

    // ------------------------------------------------------------------ 3. reiniciar el servidor
    console.log('3. Reiniciar el servidor');
    const antes = await contarRanking(base);
    const totalAntes = Object.values(antes).reduce((a, b) => a + b, 0);
    console.log('   puntajes por tabla:', JSON.stringify(antes));
    u.revisar(antes['toca-rapido/toques'] >= 4 && antes['memoria/individual'] >= 3 && antes['memoria/equipo'] === 1 &&
      antes['penales/torneo'] === 1 && antes['penales/arquero'] >= 1, 'hay puntajes de todos los juegos y tablas');
    const lineas = fs.readFileSync(path.join(dataDir, 'puntajes.jsonl'), 'utf8').trim().split('\n').length;
    await srv.close();
    const config = Object.assign(loadConfig(), { rotarPantalla: 90 });
    srv = crearServidor({ config, dataDir, silencio: true, ip: '127.0.0.1' });
    await srv.listen(puerto, '127.0.0.1');
    const despues = await contarRanking(base);
    u.revisar(JSON.stringify(despues) === JSON.stringify(antes), `después de reiniciar siguen los ${totalAntes} puntajes (${lineas} renglones en puntajes.jsonl)`);
    // la tele y los celus se reconectan solos
    await tele.waitForFunction(() => window.Plataforma.estado.sala.jugadores.length === 3, null, { timeout: 15000 });
    u.revisar(true, 'la tele y los 3 celus se reconectaron solos al servidor nuevo');
    await tele.reload();
    await tele.waitForFunction(() => document.body.dataset.listo === '1');
    await tele.waitForFunction(() => document.querySelectorAll('#ranking-cuerpo li .val').length > 0);
    await u.captura(tele, 'f6-menu-despues-de-reiniciar');

    // ------------------------------------------------------------------ 4. pantalla girada desde config
    console.log('4. rotarPantalla = 90 (config.json)');
    const rot = await u.abrirTele(browser, base, problemas, { viewport: { width: 1920, height: 1080 }, nombre: 'tele girada' });
    u.revisar(await rot.evaluate(() => window.Plataforma.estado.rotacion) === 90, 'la tele toma rotarPantalla = 90 de config.json');
    await elegirConMouse(rot, 'memoria', 'solo');
    await memoriaSolo(rot, 2, () => true);
    await faseJuego(rot, 'error', 5000);
    await u.captura(rot, 'f7-girada-memoria');
    await nombreConMouse(rot, 'Giro');
    await u.captura(rot, 'f8-girada-resultados');
    u.revisar(true, 'Memoria solo jugada entera con clics del mouse en la pantalla girada');

    const pr = await browser.newPage({ viewport: { width: 1100, height: 1300 } });
    u.vigilar(pr, 'ranking', problemas);
    await pr.goto(base + '/ranking/?juego=penales');
    await pr.waitForSelector('li.p1');
    await pr.screenshot({ path: path.join(u.CAPTURAS, 'f9-ranking-penales.png'), fullPage: true });

    // ------------------------------------------------------------------ 5. red y consola
    console.log('5. Red y consola');
    if (problemas.length) {
      console.log('\nProblemas:'); problemas.forEach((p) => console.log('  ✗ ' + p)); process.exitCode = 1;
    } else {
      u.revisar(true, 'ninguna página pidió nada fuera de la notebook (sin internet)');
      u.revisar(true, 'sin errores en la consola de la tele, los celus y /ranking');
    }
    console.log(`\nPrueba final: ${Math.round((Date.now() - t0) / 1000)} s`);
  } catch (err) {
    console.error(err);
    problemas.forEach((p) => console.log('  ✗ ' + p));
    process.exitCode = 1;
  } finally {
    await browser.close();
    await srv.close();
  }
})();
