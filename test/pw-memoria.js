/*
 * Prueba de Memoria de colores con Playwright en 1080x1920:
 *   - Solo: 3 niveles con el teclado (números y flechas + Enter), error, nombre y ranking
 *   - Rondas especiales y 6 colores (capturas)
 *   - Eliminación con 3 celus: Ana acierta siempre, Bruno falla en el nivel 3, Caro se desconecta
 *   - Cooperativo con 2 celus
 * Capturas en capturas/m*.png
 */
'use strict';
const u = require('./pw-util.js');

const estado = (tele) => tele.evaluate(() => window.Plataforma.juego._estado());
const esperarFaseJuego = (tele, f, ms) => tele.waitForFunction((f) => {
  const j = window.Plataforma.juego; return j && j._estado && j._estado().fase === f;
}, f, { timeout: ms || 30000 });

(async () => {
  const problemas = [];
  const { srv, base } = await u.levantar();
  const browser = await u.navegador();
  try {
    console.log('Solo con teclado');
    const tele = await u.abrirTele(browser, base, problemas);
    await u.elegirConTeclado(tele, 'memoria', 'solo');
    for (let nivel = 1; nivel <= 3; nivel++) {
      if (nivel === 1) {
        await esperarFaseJuego(tele, 'anuncio');
        await u.sleep(250);
        await u.captura(tele, 'm1-solo-nivel');
      }
      await esperarFaseJuego(tele, 'mostrando');
      if (nivel === 3) { await u.sleep(120); await u.captura(tele, 'm2-solo-mostrando'); }
      await esperarFaseJuego(tele, 'respondiendo');
      const e = await estado(tele);
      u.revisar(e.nivel === nivel && e.esperado.length === nivel, `nivel ${nivel} con ${nivel} color(es)`);
      for (const [i, color] of e.esperado.entries()) {
        const pos = e.posiciones.indexOf(color);
        if (nivel === 2) {
          // con flechas: la primera muestra el cursor en el botón 1; después se mueve desde donde está
          let cur = (await estado(tele)).cursor;
          if (cur < 0) { await tele.keyboard.press('ArrowRight'); cur = 0; }
          const dc = (pos % 2) - (cur % 2), df = Math.floor(pos / 2) - Math.floor(cur / 2);
          if (dc > 0) await tele.keyboard.press('ArrowRight');
          if (dc < 0) await tele.keyboard.press('ArrowLeft');
          for (let f = 0; f < Math.abs(df); f++) await tele.keyboard.press(df > 0 ? 'ArrowDown' : 'ArrowUp');
          await tele.keyboard.press('Enter');
        } else {
          await tele.keyboard.press(`Digit${pos + 1}`);
        }
        if (nivel === 3 && i === 0) await u.captura(tele, 'm3-solo-respondiendo');
        await u.sleep(90);
      }
      await esperarFaseJuego(tele, 'bien');
    }
    u.revisar((await estado(tele)).alcanzado === 3, 'completó 3 niveles con el teclado');
    // error a propósito en el nivel 4
    await esperarFaseJuego(tele, 'respondiendo');
    const e4 = await estado(tele);
    const malo = e4.posiciones.findIndex((c) => c !== e4.esperado[0]);
    await tele.keyboard.press(`Digit${malo + 1}`);
    await esperarFaseJuego(tele, 'error');
    await u.sleep(300);
    await u.captura(tele, 'm4-solo-error');
    await u.esperarFase(tele, 'nombre', 10000);
    await tele.keyboard.type('Sofi');
    await tele.keyboard.press('Enter');
    await u.esperarFase(tele, 'resultados');
    await tele.waitForFunction(() => /ranking|puesto|récord/i.test(document.getElementById('res-guardado').textContent));
    await u.captura(tele, 'm5-solo-resultados');
    const rk = await (await fetch(base + '/api/ranking')).json();
    const top = rk.juegos.find((j) => j.id === 'memoria').rankings.find((r) => r.id === 'individual').hoy[0];
    u.revisar(top && top.nombre === 'Sofi' && Math.floor(top.puntaje / 100) === 3, `ranking: Sofi nivel 3 (${top && top.puntaje} puntos)`);

    console.log('Rondas especiales (capturas)');
    await tele.keyboard.press('Enter'); // jugar otra vez
    await esperarFaseJuego(tele, 'anuncio');
    await tele.evaluate(() => window.Plataforma.juego._irANivel(6));
    await esperarFaseJuego(tele, 'aviso');
    await u.sleep(500);
    await u.captura(tele, 'm6-aviso-al-reves');
    await esperarFaseJuego(tele, 'respondiendo');
    let e = await estado(tele);
    u.revisar(e.especial === 'alreves', 'nivel 6 = ronda al revés');
    await tele.evaluate(() => window.Plataforma.juego._irANivel(10));
    await esperarFaseJuego(tele, 'mostrando');
    await u.sleep(200);
    await u.captura(tele, 'm7-seis-colores');
    await esperarFaseJuego(tele, 'mezcla');
    await u.sleep(330);
    await u.captura(tele, 'm8-mezcla');
    await tele.evaluate(() => window.Plataforma.juego._irANivel(12));
    await esperarFaseJuego(tele, 'mostrando');
    await u.sleep(150);
    await u.captura(tele, 'm9-trampa');
    e = await estado(tele);
    u.revisar(e.especial === 'trampa' && e.posiciones.length === 6, 'nivel 12 = trampa con 6 colores');
    await tele.keyboard.press('Escape'); await tele.keyboard.press('Escape');
    await u.esperarFase(tele, 'menu');

    console.log('Eliminación con 3 celus');
    const ana = await u.abrirCelu(browser, base, problemas, 'Ana');
    const bruno = await u.abrirCelu(browser, base, problemas, 'Bruno');
    const caro = await u.abrirCelu(browser, base, problemas, 'Caro');
    await tele.waitForFunction(() => window.Plataforma.estado.sala.jugadores.filter((j) => j.conectado).length === 3);
    await ana.click('button[data-j="memoria"][data-m="eliminacion"]');
    await u.esperarFase(tele, 'jugando');
    const celus = { Ana: ana, Bruno: bruno, Caro: caro };
    for (let nivel = 1; nivel <= 3; nivel++) {
      await esperarFaseJuego(tele, 'mostrando');
      if (nivel === 1) {
        await ana.waitForSelector('.espera');
        await u.captura(ana, 'm10-celu-memoriza');
      }
      await esperarFaseJuego(tele, 'respondiendo');
      const s = await estado(tele);
      const vivos = s.jugadores.filter((j) => j.estado === 'respondiendo').map((j) => j.nombre);
      for (const nombre of vivos) {
        const page = celus[nombre];
        if (nivel === 2 && nombre === 'Caro') {
          await caro.context().close(); // se desconecta y no contesta
          continue;
        }
        await page.waitForSelector('.btn-color:not([disabled])');
        for (const [i, color] of s.esperado.entries()) {
          let c = color;
          if (nivel === 3 && nombre === 'Bruno' && i === s.esperado.length - 1) c = s.posiciones.find((x) => x !== color);
          await page.click(`.btn-color[data-id="${c}"]`);
          await u.sleep(60);
        }
      }
      if (nivel === 1) {
        await u.sleep(100);
        await u.captura(tele, 'm11-elim-estados');
        await u.captura(ana, 'm12-celu-listo');
      }
      if (nivel === 2) {
        // Caro tiene que quedar afuera por tiempo (3 s sin contestar)
        await tele.waitForFunction(() => window.Plataforma.juego._estado().jugadores.find((j) => j.nombre === 'Caro').estado === 'afuera', null, { timeout: 8000 });
        await u.captura(tele, 'm13-elim-caro-afuera');
        u.revisar(true, 'Caro se desconectó y quedó afuera por tiempo');
      }
      if (nivel === 3) {
        await tele.waitForFunction(() => window.Plataforma.juego._estado().jugadores.find((j) => j.nombre === 'Bruno').estado === 'afuera');
        u.revisar(true, 'Bruno se equivocó en el nivel 3 y quedó afuera');
      }
    }
    await u.esperarFase(tele, 'resultados', 15000);
    await tele.waitForFunction(() => /ranking|puesto|récord/i.test(document.getElementById('res-guardado').textContent));
    await u.captura(tele, 'm15-elim-resultados');
    const res = await tele.evaluate(() => window.Plataforma.estado.ultimoResultado);
    u.revisar(/Ganó Ana/.test(res.titulo), `gana Ana: "${res.titulo}"`);
    u.revisar(res.filas.map((f) => f.valor).join(',') === 'Nivel 3,Nivel 2,Nivel 1', `niveles: ${res.filas.map((f) => f.nombre + ' ' + f.valor).join(', ')}`);
    await u.captura(ana, 'm16-celu-gano');
    await bruno.waitForFunction(() => window.Celu.control && /Puesto/.test(window.Celu.control.titulo || ''));
    await u.captura(bruno, 'm14-celu-bruno-puesto');
    await ana.click('#btn-volver');
    await u.esperarFase(tele, 'menu');

    console.log('Cooperativo con 2 celus');
    await tele.waitForFunction(() => window.Plataforma.estado.sala.jugadores.length === 2);
    await ana.click('button[data-j="memoria"][data-m="cooperativo"]');
    await u.esperarFase(tele, 'jugando');
    for (let nivel = 1; nivel <= 2; nivel++) {
      await esperarFaseJuego(tele, 'respondiendo');
      const s = await estado(tele);
      await ana.waitForSelector('.btn-color');
      await bruno.waitForSelector('.btn-color');
      if (nivel === 2) await u.captura(bruno, 'm17-celu-coop');
      for (const color of s.esperado) {
        // tiene el botón quien sea dueño de ese color
        const enAna = await ana.$(`.btn-color[data-id="${color}"]`);
        await (enAna ? ana : bruno).click(`.btn-color[data-id="${color}"]`);
        await u.sleep(150);
      }
      await esperarFaseJuego(tele, 'bien', 5000);
      if (nivel === 2) await u.captura(tele, 'm18-coop-bien');
    }
    u.revisar(true, 'el servidor validó 2 niveles cooperativos');
    for (let vida = 3; vida >= 1; vida--) {
      await esperarFaseJuego(tele, 'respondiendo');
      const s = await estado(tele);
      const malo = s.posiciones.find((c) => c !== s.esperado[0]);
      const enAna = await ana.$(`.btn-color[data-id="${malo}"]`);
      await (enAna ? ana : bruno).click(`.btn-color[data-id="${malo}"]`);
      await esperarFaseJuego(tele, vida > 1 ? 'error' : 'error');
      if (vida === 2) { await u.sleep(200); await u.captura(tele, 'm19-coop-error'); }
    }
    await u.esperarFase(tele, 'resultados', 15000);
    await tele.waitForFunction(() => /ranking|puesto|récord/i.test(document.getElementById('res-guardado').textContent));
    await u.captura(tele, 'm20-coop-resultados');
    const rk2 = await (await fetch(base + '/api/ranking')).json();
    const eq = rk2.juegos.find((j) => j.id === 'memoria').rankings.find((r) => r.id === 'equipo').hoy[0];
    u.revisar(eq && eq.jugadores.length === 2 && Math.floor(eq.puntaje / 100) === 2, `ranking de equipo: ${eq && eq.nombre} nivel ${eq && Math.floor(eq.puntaje / 100)}`);

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
