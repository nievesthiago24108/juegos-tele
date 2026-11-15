/*
 * "Tocá rápido": juego de ejemplo de la plataforma. 10 segundos para tocar lo más rápido posible.
 * Solo: clic del mouse o barra espaciadora. Con celulares: botón grande en el celu.
 */
(function () {
  'use strict';
  const D = window.Dibujo;
  const DURACION = 10;
  const CUENTA = 3;

  window.Plataforma.registrar('toca-rapido', () => {
    let cx, jugadores, solo;
    let fase = 'cuenta';  // cuenta | jugando | fin
    let t = 0;            // segundos en la fase actual
    let ultimaCuenta = 4;
    const toques = {};    // jugadorId (o 'solo') → cantidad
    const ondas = [];     // efectos de clic { x, y, t, color }
    let finEspera = 0;
    let limite = 0;       // hora (reloj de la notebook) en que terminan los 10 s, para el reloj del celu

    function sumar(id, x, y, color) {
      if (fase !== 'jugando') return;
      toques[id] = (toques[id] || 0) + 1;
      ondas.push({ x, y, t: 0, color });
      if (ondas.length > 40) ondas.shift();
      cx.sonido.tono(500 + Math.min(toques[id], 120) * 6, 0.05, { tipo: 'triangle', volumen: 0.15 });
    }

    return {
      iniciar(contexto, lista, modo) {
        cx = contexto; jugadores = lista; solo = modo === 'solo';
        if (solo) toques.solo = 0; else jugadores.forEach((j) => { toques[j.id] = 0; });
      },
      recibirInput(id, datos) {
        if (datos.boton == null) return;
        const j = jugadores.find((x) => x.id === id);
        // Solo con celu: el botón del celu suma igual que el clic o la barra
        if (solo) { sumar('solo', 540 + (Math.random() - 0.5) * 500, 900 + (Math.random() - 0.5) * 400, j ? j.color : D.PAL.naranja); return; }
        const i = jugadores.indexOf(j);
        sumar(id, 540 + (Math.random() - 0.5) * 600, 700 + i * 30 + (Math.random() - 0.5) * 300, j ? j.color : D.PAL.naranja);
      },
      puntero(x, y, tipo) {
        if (solo && tipo === 'abajo') sumar('solo', x, y, D.PAL.naranja);
      },
      tecla(codigo) {
        if (solo && (codigo === 'Space' || codigo === 'Enter')) sumar('solo', 540 + (Math.random() - 0.5) * 500, 900 + (Math.random() - 0.5) * 400, D.PAL.naranja);
      },
      actualizar(dt) {
        t += dt;
        ondas.forEach((o) => { o.t += dt; });
        while (ondas.length && ondas[0].t > 0.6) ondas.shift();
        if (fase === 'cuenta') {
          const n = Math.ceil(CUENTA - t);
          if (n !== ultimaCuenta && n > 0) { ultimaCuenta = n; cx.sonido.cuenta(false); }
          if (t >= CUENTA) { fase = 'jugando'; t = 0; limite = cx.horaServidor() + DURACION * 1000; cx.sonido.cuenta(true); cx.actualizarControles(); }
        } else if (fase === 'jugando' && t >= DURACION) {
          fase = 'fin'; t = 0; cx.sonido.silbato(true); cx.actualizarControles();
        } else if (fase === 'fin') {
          finEspera += dt;
        }
      },
      dibujar(ctx) {
        ctx.fillStyle = D.PAL.noche;
        ctx.fillRect(0, 0, 1080, 1920);
        D.encabezado(ctx, cx, 'Tocá rápido', solo ? 'Solo' : `${jugadores.length} jugadores`);

        // barra de tiempo
        const resto = fase === 'cuenta' ? DURACION : fase === 'jugando' ? Math.max(0, DURACION - t) : 0;
        D.rect(ctx, 60, 190, 960, 34, 4, D.PAL.panel);
        D.rect(ctx, 60, 190, 960 * resto / DURACION, 34, 4, resto < 3 ? D.PAL.rojo : D.PAL.celeste);
        D.texto(ctx, `${resto.toFixed(1)} s`, 1020, 280, { tam: 44, alinear: 'right', color: D.PAL.gris });

        ondas.forEach((o) => {
          const k = o.t / 0.6;
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = o.color; ctx.lineWidth = 10 * (1 - k) + 2;
          ctx.beginPath(); ctx.arc(o.x, o.y, 30 + k * 120, 0, Math.PI * 2); ctx.stroke();
        });
        ctx.globalAlpha = 1;

        if (fase === 'cuenta') {
          const n = Math.ceil(CUENTA - t);
          const k = 1 - (CUENTA - t - (n - 1));
          D.texto(ctx, n, 540, 1050, { tam: 420 + k * 80, alinear: 'center', color: D.PAL.naranja, peso: 800 });
          D.texto(ctx, solo && !cx.conCelu ? 'Hacé clic (o tocá la barra espaciadora) lo más rápido que puedas' : 'Tocá el botón de tu celu lo más rápido que puedas',
            540, 1250, { tam: 36, alinear: 'center', color: D.PAL.gris, fuente: 'texto', peso: 600 });
          return;
        }
        if (solo) {
          D.texto(ctx, toques.solo, 540, 1080, { tam: 460, alinear: 'center', peso: 800 });
          D.texto(ctx, 'toques', 540, 1180, { tam: 60, alinear: 'center', color: D.PAL.gris });
          if (fase === 'jugando') D.texto(ctx, 'Seguí haciendo clic', 540, 1500, { tam: 64, alinear: 'center', color: D.PAL.naranja });
        } else {
          const max = Math.max(10, ...Object.values(toques));
          jugadores.forEach((j, i) => {
            const y = 400 + i * 220;
            D.texto(ctx, j.nombre, 60, y, { tam: 52, peso: 800 });
            D.ficha(ctx, 60, y + 24, 960, 110, j.color);
            ctx.globalAlpha = 0.85;
            D.rect(ctx, 70, y + 24, 950 * toques[j.id] / max, 110, 0, j.color);
            ctx.globalAlpha = 1;
            D.texto(ctx, toques[j.id], 1000, y + 106, { tam: 80, alinear: 'right', peso: 800, borde: 8 });
          });
        }
        if (fase === 'fin') D.texto(ctx, 'Tiempo', 540, 1700, { tam: 120, alinear: 'center', color: D.PAL.naranja, peso: 800 });
      },
      controlCelular(id) {
        if (fase === 'jugando') return { tipo: 'botones', id: 'toca', titulo: 'Tocá', mensaje: 'Lo más rápido que puedas', limite, columnas: 1, botones: [{ id: 0, color: '#5868AA', texto: 'TOCÁ' }] };
        if (fase === 'cuenta') return { tipo: 'espera', id: 'cuenta', titulo: 'Preparate…', mensaje: 'Mirá la tele', grande: 'Ya empieza' };
        const mios = solo ? toques.solo : (toques[id] || 0);
        return { tipo: 'espera', id: 'fin', titulo: 'Tiempo', mensaje: `Hiciste ${mios} toques`, grande: `${mios}` };
      },
      terminado() { return fase === 'fin' && finEspera > 1.5; },
      resultados() {
        if (solo && jugadores[0]) {
          const n = toques.solo, j = jugadores[0];
          return {
            titulo: `${n} toques`,
            subtitulo: `${(n / DURACION).toFixed(1)} toques por segundo`,
            filas: [{ nombre: j.nombre, color: j.color, valor: n, destacado: true }],
            registros: n > 0 ? [{ categoria: 'toques', puntaje: n, jugadorIds: [j.id], detalle: { porSegundo: n / DURACION } }] : [],
            celular: { [j.id]: { titulo: `${n} toques`, mensaje: `${(n / DURACION).toFixed(1)} por segundo` } },
          };
        }
        if (solo) {
          const n = toques.solo;
          return {
            titulo: `${n} toques`,
            subtitulo: `${(n / DURACION).toFixed(1)} toques por segundo`,
            filas: [{ nombre: 'Vos', valor: n, esJugadorSolo: true, destacado: true }],
            registros: [{ categoria: 'toques', puntaje: n, detalle: { porSegundo: n / DURACION } }],
          };
        }
        const orden = jugadores.slice().sort((a, b) => toques[b.id] - toques[a.id]);
        const ganador = orden[0];
        const celular = {};
        orden.forEach((j, i) => { celular[j.id] = { titulo: i === 0 ? 'Ganaste' : `Puesto ${i + 1}`, mensaje: `${toques[j.id]} toques` }; });
        return {
          titulo: jugadores.length > 1 ? `Ganó ${ganador.nombre}` : `${toques[ganador.id]} toques`,
          subtitulo: 'Toques en 10 segundos',
          filas: orden.map((j, i) => ({ nombre: j.nombre, color: j.color, valor: toques[j.id], destacado: i === 0 })),
          registros: orden.map((j) => ({ categoria: 'toques', puntaje: toques[j.id], jugadorIds: [j.id] })),
          celular,
        };
      },
    };
  });
})();
