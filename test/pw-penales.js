/*
 * Prueba de Penales con Playwright en 1080x1920:
 *   - Solo con el mouse (clic y arrastrar), un tiro por tiempo (15 s) y fin al errar 3
 *   - 1 contra 1 con 2 celus: deslizar contra zonas, hasta que termina la tanda
 *   - Torneo con 4 celus
 * Capturas en capturas/p*.png (tele, celu del pateador y celu del arquero)
 */
'use strict';
const u = require('./pw-util.js');

const estado = (tele) => tele.evaluate(() => window.Plataforma.juego._estado());
const esperarFaseJuego = (tele, f, ms) => tele.waitForFunction((f) => {
  const j = window.Plataforma.juego; return j && j._estado && j._estado().fase === f;
}, f, { timeout: ms || 30000 });

const { arrastrar, deslizar } = u;

(async () => {
  const problemas = [];
  const { srv, base } = await u.levantar();
  const browser = await u.navegador();
  try {
    console.log('Solo con mouse');
    const tele = await u.abrirTele(browser, base, problemas);
    await u.elegirConTeclado(tele, 'penales', 'solo');
    const tiros = [
      { x: 0.6, y: 0.7, fuerza: 0.6 },                   // arriba a la derecha
      { x: -0.55, y: 0.2, fuerza: 0.55, curva: -25 },    // abajo a la izquierda, con comba
      { x: 0.65, y: 0.3, fuerza: 0.7 },
      { x: -0.6, y: 0.75, fuerza: 0.5 },
    ];
    // primer tiro sin patear: a los 15 s sale un tiro débil al medio
    await esperarFaseJuego(tele, 'apuntar');
    await u.captura(tele, 'p1-solo-apuntar');
    await esperarFaseJuego(tele, 'carrera', 18000);
    const ed = await estado(tele);
    u.revisar(ed.tiro && ed.tiro.debil === true, 'a los 15 s sin patear sale un tiro débil al centro');
    await esperarFaseJuego(tele, 'resultado', 8000);
    const resultados = [];
    for (const [i, t] of tiros.entries()) {
      if ((await estado(tele)).solo.errados >= 3) break;
      await esperarFaseJuego(tele, 'apuntar');
      await arrastrar(tele, Object.assign({}, t, i === 0 ? { alMedio: () => u.captura(tele, 'p2-solo-arrastrando') } : {}));
      await esperarFaseJuego(tele, 'vuelo', 5000);
      if (i === 0) { await u.sleep(250); await u.captura(tele, 'p3-solo-vuelo'); }
      await esperarFaseJuego(tele, 'resultado', 8000);
      const e = await estado(tele);
      resultados.push(e);
      await u.sleep(350);
      await u.captura(tele, `p4-solo-${e.resultado}-${i + 1}`);
      console.log(`  tiro ${i + 1}: x=${e.tiro.x} y=${e.tiro.y} fuerza=${e.tiro.fuerza} comba=${e.tiro.comba} → ${e.resultado}`);
    }
    u.revisar(resultados.length >= 2, `el mouse patea (${resultados.length} tiros apuntados)`);
    u.revisar(resultados.every((e, i) => Math.abs(e.tiro.x - tiros[i].x) < 0.3 && Math.abs(e.tiro.y - tiros[i].y) < 0.3),
      'cada tiro va cerca de donde se apuntó con el arrastre');
    // Playwright entrega los movimientos con ~25 ms de atraso, así que la fuerza sale algo menor que la
    // pedida; lo importante es que no dé ≈0 (la relación velocidad → fuerza está en test/penales.test.js)
    u.revisar(resultados.every((e) => e.tiro.fuerza > 0.15), `el arrastre tiene fuerza (${resultados.map((e) => e.tiro.fuerza).join(', ')})`);
    // tiros afuera hasta errar 3
    if ((await estado(tele)).solo.errados < 3) await esperarFaseJuego(tele, 'apuntar').catch(() => {});
    while ((await estado(tele)).solo.errados < 3) {
      await esperarFaseJuego(tele, 'apuntar');
      await arrastrar(tele, { x: 1.6, y: 0.4, fuerza: 0.6 });
      await esperarFaseJuego(tele, 'resultado', 8000);
      const r = await estado(tele);
      if (r.resultado === 'afuera') { await u.sleep(300); await u.captura(tele, 'p5-solo-afuera'); }
    }
    await u.esperarFase(tele, 'nombre', 10000);
    const fin = await tele.evaluate(() => window.Plataforma.estado.ultimoResultado);
    await tele.keyboard.type('Tomi');
    await tele.keyboard.press('Enter');
    await u.esperarFase(tele, 'resultados');
    await tele.waitForFunction(() => /ranking|puesto|récord|guardar/i.test(document.getElementById('res-guardado').textContent));
    await u.captura(tele, 'p6-solo-resultados');
    u.revisar(true, `terminó al errar 3: "${fin.titulo}"`);
    await tele.keyboard.press('Escape');
    await u.esperarFase(tele, 'menu');

    console.log('1 contra 1 con 2 celus');
    const ana = await u.abrirCelu(browser, base, problemas, 'Ana');
    const beto = await u.abrirCelu(browser, base, problemas, 'Beto');
    await tele.waitForFunction(() => window.Plataforma.estado.sala.jugadores.filter((j) => j.conectado).length === 2);
    const idDe = { [await ana.evaluate(() => window.Celu.yo.id)]: ana, [await beto.evaluate(() => window.Celu.yo.id)]: beto };
    await ana.click('button[data-j="penales"][data-m="uno"]');
    await u.esperarFase(tele, 'jugando');
    let k = 0;
    while (true) {
      const f = await tele.waitForFunction(() => {
        const e = window.Plataforma.juego && window.Plataforma.juego._estado();
        return e && (e.fase === 'apuntar' || e.fase === 'fin') && e.fase;
      }, null, { timeout: 30000 });
      if ((await f.jsonValue()) === 'fin') break;
      const e = await estado(tele);
      const pat = idDe[e.pateador], arq = idDe[e.arquero];
      await pat.waitForSelector('.deslizar');
      await arq.waitForSelector('.zona');
      const lado = k % 2 ? -1 : 1;
      const tx = lado * (0.45 + (k % 3) * 0.12), ty = 0.25 + (k % 2) * 0.45;
      const zonaTiro = (ty >= 0.5 ? 0 : 3) + (lado > 0 ? 2 : 0);
      // el arquero adivina en los tiros 1, 4, 5, 8 y 11: queda 3 a 3 y se define en muerte súbita
      const zona = [0, 3, 4, 7, 10].includes(k) ? zonaTiro : (zonaTiro + 3) % 6;
      await arq.click(`.zona[data-i="${zona}"]`);
      if (k === 0) await u.captura(arq, 'p7-celu-arquero');
      await deslizar(pat, {
        x: tx, y: ty, fuerza: 0.55,
        alMedio: k === 0 ? () => u.captura(pat, 'p8-celu-pateador') : null,
      });
      await esperarFaseJuego(tele, 'carrera', 5000);
      if (k === 0) { await u.sleep(1200); await u.captura(tele, 'p9-uno-carrera'); }
      await esperarFaseJuego(tele, 'resultado', 10000);
      const r = await estado(tele);
      if (k < 3) { await u.sleep(400); await u.captura(tele, `p10-uno-${r.resultado}-${k + 1}`); }
      u.revisar(r.zonaArq === zona, `tiro ${k + 1}: el arquero se tiró a la zona que eligió en el celu (${zona}) → ${r.resultado}`);
      k++;
      if (k > 16) throw new Error('la tanda no termina');
    }
    await u.esperarFase(tele, 'resultados', 10000);
    await tele.waitForFunction(() => /ranking|puesto|récord|guardad/i.test(document.getElementById('res-guardado').textContent));
    await u.captura(tele, 'p11-uno-resultados');
    await u.captura(ana, 'p12-celu-resultado');
    const ru = await tele.evaluate(() => window.Plataforma.estado.ultimoResultado);
    u.revisar(/muerte súbita/.test(ru.subtitulo), `1 contra 1 terminado: ${ru.titulo} (${ru.subtitulo})`);
    const rk = await (await fetch(base + '/api/ranking')).json();
    const arqRk = rk.juegos.find((j) => j.id === 'penales').rankings.find((r) => r.id === 'arquero').hoy;
    u.revisar(arqRk.length >= 1, `efectividad de arquero guardada (${arqRk.map((x) => `${x.nombre} ${x.puntaje}%`).join(', ')})`);
    await ana.click('#btn-volver');
    await u.esperarFase(tele, 'menu');

    console.log('Torneo con 4 celus');
    const caro = await u.abrirCelu(browser, base, problemas, 'Caro');
    const dani = await u.abrirCelu(browser, base, problemas, 'Dani');
    await tele.waitForFunction(() => window.Plataforma.estado.sala.jugadores.filter((j) => j.conectado).length === 4);
    idDe[await caro.evaluate(() => window.Celu.yo.id)] = caro;
    idDe[await dani.evaluate(() => window.Celu.yo.id)] = dani;
    await ana.click('button[data-j="penales"][data-m="torneo"]');
    await u.esperarFase(tele, 'jugando');
    let t = 0;
    while (true) {
      const f = await tele.waitForFunction(() => {
        const e = window.Plataforma.juego && window.Plataforma.juego._estado();
        return e && (e.fase === 'apuntar' || e.fase === 'fin') && e.fase;
      }, null, { timeout: 30000 });
      if ((await f.jsonValue()) === 'fin') break;
      const e = await estado(tele);
      const pat = idDe[e.pateador];
      await pat.waitForSelector('.deslizar');
      const lado = (t * 7) % 3 - 1;
      await deslizar(pat, { x: lado * 0.6, y: 0.2 + ((t * 5) % 4) * 0.2, fuerza: 0.5 + (t % 3) * 0.1 });
      if (t === 5) { await esperarFaseJuego(tele, 'vuelo', 5000); await u.sleep(200); await u.captura(tele, 'p13-torneo-vuelo'); }
      await esperarFaseJuego(tele, 'resultado', 10000);
      if (t === 6) { await u.sleep(400); await u.captura(tele, 'p14-torneo-marcador'); await u.captura(dani, 'p15-celu-esperando'); }
      t++;
      if (t > 25) throw new Error('el torneo no termina');
    }
    u.revisar(t === 20, `torneo: 4 jugadores × 5 penales = ${t} tiros`);
    await u.esperarFase(tele, 'resultados', 10000);
    await tele.waitForFunction(() => /ranking|puesto|récord|guardad/i.test(document.getElementById('res-guardado').textContent));
    await u.captura(tele, 'p16-torneo-resultados');
    const rt = await tele.evaluate(() => window.Plataforma.estado.ultimoResultado);
    u.revisar(/Ganó/.test(rt.titulo), `${rt.titulo} · ${rt.subtitulo}`);
    const rk2 = await (await fetch(base + '/api/ranking')).json();
    const torRk = rk2.juegos.find((j) => j.id === 'penales').rankings.find((r) => r.id === 'torneo').hoy;
    u.revisar(torRk.length === 1, `ganador del torneo en el ranking: ${torRk[0] && torRk[0].nombre}`);

    if (problemas.length) {
      console.log('\nProblemas:'); problemas.forEach((p) => console.log('  ✗ ' + p)); process.exitCode = 1;
    } else console.log('\nSin errores de consola ni pedidos a internet.');
  } catch (err) {
    console.error(err);
    problemas.forEach((p) => console.log('  ✗ ' + p));
    process.exitCode = 1;
  } finally {
    await browser.close();
    await srv.close();
  }
})();
