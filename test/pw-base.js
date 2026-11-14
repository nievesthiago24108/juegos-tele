/*
 * Prueba de la base (etapa 1) con Playwright en 1080x1920:
 *   - menú, "Tocá rápido" en modo solo con mouse y teclado, nombre con teclado en pantalla
 *   - dos celulares emulados: el anfitrión elige el juego desde el celu, tocan y queda el ranking
 *   - un celu recarga la página y recupera su lugar
 *   - la tele con rotarPantalla = 90 (ventana 1920x1080) y clics que caen en el lugar correcto
 * Capturas en capturas/b*.png
 */
'use strict';
const u = require('./pw-util.js');

(async () => {
  const problemas = [];
  const { srv, base } = await u.levantar();
  const browser = await u.navegador();
  try {
    console.log('Menú y modo solo');
    const tele = await u.abrirTele(browser, base, problemas);
    await u.captura(tele, 'b1-menu');
    await u.elegirConTeclado(tele, 'toca-rapido', 'solo');
    await u.sleep(3300);
    for (let i = 0; i < 18; i++) {
      const p = await u.aVentana(tele, 300 + (i % 6) * 90, 700 + (i % 4) * 120);
      await tele.mouse.click(p.x, p.y);
      await u.sleep(40);
    }
    for (let i = 0; i < 7; i++) { await tele.keyboard.press('Space'); await u.sleep(40); }
    await u.captura(tele, 'b2-solo-jugando');
    await u.esperarFase(tele, 'nombre', 15000);
    const toques = await tele.evaluate(() => window.Plataforma.juego.resultados().registros[0].puntaje);
    u.revisar(toques === 25, `cuenta los 18 clics y las 7 teclas (${toques})`);
    await tele.keyboard.type('luc');
    await tele.click('.tecla[data-c="I"]');
    await tele.click('.tecla[data-c="A"]');
    await u.captura(tele, 'b3-teclado-nombre');
    await tele.keyboard.press('Enter');
    await u.esperarFase(tele, 'resultados');
    await tele.waitForFunction(() => /ranking|puesto|récord/i.test(document.getElementById('res-guardado').textContent));
    await u.captura(tele, 'b4-resultados-solo');
    const r1 = await (await fetch(base + '/api/ranking')).json();
    const top = r1.juegos.find((j) => j.id === 'toca-rapido').rankings[0].hoy[0];
    u.revisar(top && top.nombre === 'Lucia' && top.puntaje === 25, 'el puntaje solo queda en el ranking como "Lucia"');
    await tele.keyboard.press('Escape');
    await u.esperarFase(tele, 'menu');

    console.log('Con celulares');
    const c1 = await u.abrirCelu(browser, base, problemas, 'Ana', { sinEntrar: true });
    await u.captura(c1, 'b5-celu-entrar');
    await c1.fill('#nombre', 'Ana');
    await c1.click('#btn-entrar');
    await c1.waitForFunction(() => window.Celu.yo.id);
    const c2 = await u.abrirCelu(browser, base, problemas, 'Bruno');
    const malo = await u.abrirCelu(browser, base, problemas, 'x', { sinEntrar: true });
    await malo.fill('#nombre', 'boludo');
    await malo.click('#btn-entrar');
    await malo.waitForFunction(() => document.getElementById('error-unirse').textContent.length > 0);
    u.revisar(/no está permitido/.test(await malo.textContent('#error-unirse')), 'el filtro rechaza malas palabras');
    await malo.close();
    await tele.waitForFunction(() => window.Plataforma.estado.sala.jugadores.length === 2);
    await c1.waitForSelector('#sala-anfitrion:not(.oculto)');
    u.revisar(true, 'Ana (la primera) es anfitriona y ve el menú en el celu');
    await u.captura(c1, 'b6-celu-anfitrion');
    await u.captura(tele, 'b7-menu-con-jugadores');

    // Bruno recarga: tiene que volver con el mismo id
    const idBruno = await c2.evaluate(() => window.Celu.yo.id);
    await c2.reload();
    await c2.waitForFunction(() => window.Celu && window.Celu.yo.id);
    u.revisar(await c2.evaluate(() => window.Celu.yo.id) === idBruno, 'un celu que recarga recupera su lugar (token)');

    await c1.click('button[data-j="toca-rapido"][data-m="celus"]');
    await u.esperarFase(tele, 'jugando');
    await c1.waitForSelector('.btn-color', { timeout: 8000 });
    await c2.waitForSelector('.btn-color');
    for (let i = 0; i < 20; i++) {
      await c1.click('.btn-color');
      if (i % 2) await c2.click('.btn-color');
      await u.sleep(60);
    }
    await u.captura(tele, 'b8-celus-jugando');
    await u.captura(c1, 'b9-celu-boton');
    await u.esperarFase(tele, 'resultados', 15000);
    await tele.waitForFunction(() => /ranking|puesto|récord/i.test(document.getElementById('res-guardado').textContent));
    await u.captura(tele, 'b10-resultados-celus');
    await c1.waitForSelector('#ctl-anfitrion:not(.oculto)');
    await u.captura(c1, 'b11-celu-resultados');
    const res = await tele.evaluate(() => window.Plataforma.juego.resultados());
    u.revisar(res.filas[0].nombre === 'Ana' && res.filas[0].valor === 20 && res.filas[1].valor === 10, `Ana 20 y Bruno 10 (${res.filas.map((f) => f.valor)})`);
    await c1.click('#btn-volver');
    await u.esperarFase(tele, 'menu');
    u.revisar(true, 'la anfitriona vuelve al menú desde el celu');

    const rk = await (await fetch(base + '/ranking/')).text();
    u.revisar(rk.includes('Ranking'), '/ranking responde');
    const pr = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    u.vigilar(pr, 'ranking', problemas);
    await pr.goto(base + '/ranking/?juego=toca-rapido');
    await pr.waitForSelector('li.p1');
    await pr.screenshot({ path: u.CAPTURAS + '/b12-ranking.png' });

    console.log('Pantalla girada (rotarPantalla = 90)');
    const rot = await u.abrirTele(browser, base, problemas, { viewport: { width: 1920, height: 1080 }, query: '?rotar=90', nombre: 'tele girada' });
    await u.captura(rot, 'b13-girada-menu');
    // clic en el chip "Solo" de Tocá rápido dos veces = jugar (los clics tienen que caer bien aunque esté girada)
    await rot.evaluate(() => { const e = window.Plataforma.estado; e.sel.juego = e.juegos.findIndex((j) => j.id === 'toca-rapido'); });
    await rot.keyboard.press('ArrowUp'); await rot.keyboard.press('ArrowDown');
    const chip = await rot.evaluate(() => {
      const e = window.Plataforma.estado;
      const b = document.querySelector(`.modo[data-j="${e.sel.juego}"][data-m="0"]`);
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await rot.mouse.click(chip.x, chip.y);
    await rot.mouse.click(chip.x, chip.y);
    await u.esperarFase(rot, 'jugando');
    u.revisar(true, 'el clic en el menú girado elige el modo');
    await u.sleep(3300);
    const objetivo = { x: 200, y: 400 };
    const pv = await u.aVentana(rot, objetivo.x, objetivo.y);
    await rot.mouse.click(pv.x, pv.y);
    const llegada = await rot.evaluate(([x, y]) => window.Plataforma.aLienzo(x, y), [pv.x, pv.y]);
    u.revisar(Math.abs(llegada.x - objetivo.x) < 1 && Math.abs(llegada.y - objetivo.y) < 1, `el clic llega al lienzo en (${Math.round(llegada.x)}, ${Math.round(llegada.y)})`);
    for (let i = 0; i < 5; i++) await rot.mouse.click(pv.x, pv.y);
    await u.captura(rot, 'b14-girada-jugando');
    await rot.keyboard.press('KeyO'); // 90 → -90
    u.revisar(await rot.evaluate(() => window.Plataforma.estado.rotacion) === -90, 'la tecla O alterna la rotación');
    await rot.keyboard.press('KeyO');
    await rot.keyboard.press('Escape'); await rot.keyboard.press('Escape');
    await u.esperarFase(rot, 'menu');

    if (problemas.length) {
      console.log('\nProblemas:');
      problemas.forEach((p) => console.log('  ✗ ' + p));
      process.exitCode = 1;
    } else {
      console.log('\nSin errores de consola ni pedidos a internet.');
    }
  } catch (err) {
    console.error(err);
    problemas.forEach((p) => console.log('  ✗ ' + p));
    process.exitCode = 1;
  } finally {
    await browser.close();
    await srv.close();
  }
})();
