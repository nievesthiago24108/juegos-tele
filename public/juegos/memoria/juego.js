/*
 * Memoria de colores (tipo Simón dice). Las reglas están en logica.js; acá van el flujo de la
 * partida, el dibujo y el sonido. Modos: solo (mouse/teclado), eliminación y cooperativo (celus).
 */
(function () {
  'use strict';
  const L = window.MemoriaLogica;
  const D = window.Dibujo;
  const P = D.PAL;

  const T_ANUNCIO = 1.1;   // cartel "¡Nivel N!"
  const T_AVISO = 2.0;     // cartel de ronda especial (2 segundos antes)
  const T_MEZCLA = 0.7;
  const T_BIEN = 0.8;
  const T_ERROR = 1.6;
  const T_FIN = 1.8;
  const ESTADO_TXT = { respondiendo: 'respondiendo', listo: '✓ listo', afuera: '✗ afuera', espera: 'mirando' };

  window.Plataforma.registrar('memoria', () => {
    let cx, modo, jugadores, colores, rnd;
    let nivel = 1;
    let secuencia = [];
    let info = L.nivelInfo(1);
    let posiciones = L.ordenadas(4);
    let posAnteriores = null;        // para animar la mezcla
    let palabras = [];               // ronda trampa
    let esperadoActual = [];
    let fase = 'intro';
    let tf = 0;                      // segundos en la fase
    let mostrados = -1;              // último índice ya encendido al mostrar
    const luces = {};                // color → segundos que le quedan encendido
    const ondas = [];                // { color, t }
    let resp = null;                 // solo
    let bonusSolo = 0;
    const est = {};                  // eliminación / cooperativo: id → { estado, resp, nivel, bonus }
    let vidas = L.VIDAS_COOP;
    let duenos = {};
    let rondaId = '';
    let rondaN = 0;
    let bonusEquipo = 0;
    let ultimoToqueCoop = 0;
    let alcanzado = 0;               // último nivel completo (solo / cooperativo)
    let record = null;
    let recordFestejado = false;
    let banner = null;               // { texto, sub, t, dur, color }
    let flashError = 0;
    let colorCorrecto = -1;          // se muestra parpadeando después de un error
    let cursor = -1;                 // selección con flechas (solo)
    let confeti = [];
    let ganador = null;
    let razonFin = '';

    const ahora = () => Date.now();
    const enJuego = () => jugadores.filter((j) => est[j.id] && est[j.id].estado !== 'afuera');

    // ------------------------------------------------------------ disposición de los botones
    function rectPos(pos, cantidad) {
      if (cantidad === 6) {
        const s = 330, g = 30, x0 = (1080 - (2 * s + g)) / 2, y0 = 360;
        return { x: x0 + (pos % 2) * (s + g), y: y0 + Math.floor(pos / 2) * (s + g), w: s, h: s };
      }
      const s = 420, g = 40, x0 = (1080 - (2 * s + g)) / 2, y0 = 440;
      return { x: x0 + (pos % 2) * (s + g), y: y0 + Math.floor(pos / 2) * (s + g), w: s, h: s };
    }

    /** Rectángulo actual de un color (con la animación de mezcla) */
    function rectColor(color) {
      const n = posiciones.length;
      const destino = rectPos(posiciones.indexOf(color), n);
      if (fase !== 'mezcla' || !posAnteriores) return destino;
      const origen = rectPos(posAnteriores.indexOf(color), n);
      const k = D.suave(Math.min(1, tf / T_MEZCLA));
      const alto = Math.sin(k * Math.PI) * 60;
      return { x: origen.x + (destino.x - origen.x) * k, y: origen.y + (destino.y - origen.y) * k - alto, w: destino.w, h: destino.h };
    }

    function posEn(x, y) {
      for (let p = 0; p < posiciones.length; p++) {
        const r = rectPos(p, posiciones.length);
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return p;
      }
      return -1;
    }

    // ------------------------------------------------------------ sonido y luces
    function encender(color, dur) {
      luces[color] = dur;
      ondas.push({ color, t: 0 });
      if (ondas.length > 12) ondas.shift();
      cx.sonido.tono(L.NOTAS[color], Math.max(0.18, dur), { tipo: 'triangle', volumen: 0.35 });
    }

    function cambiarFase(f) {
      fase = f;
      tf = 0;
      cx.actualizarControles();
    }

    // ------------------------------------------------------------ flujo de la partida
    function prepararNivel(repetir) {
      info = L.nivelInfo(nivel);
      if (!repetir) secuencia = L.extender(secuencia, nivel, rnd);
      if (posiciones.length !== info.colores) posiciones = L.ordenadas(info.colores);
      palabras = info.especial === 'trampa' ? L.palabrasTrampa(secuencia, nivel, rnd) : [];
      esperadoActual = L.esperado(secuencia, nivel);
      mostrados = -1;
      colorCorrecto = -1;
      cursor = -1;
      banner = { texto: repetir ? `Otra vez: nivel ${nivel}` : `¡Nivel ${nivel}!`, t: 0, dur: T_ANUNCIO, color: P.naranja };
      if (nivel === 5 && !repetir) banner.sub = 'Ahora más rápido';
      if (nivel === 8 && !repetir) banner.sub = 'Ojo: los botones cambian de lugar';
      if (nivel === 10 && !repetir) banner.sub = '¡Seis colores!';
      if (nivel === 13 && !repetir) banner.sub = 'Velocidad máxima';
      cambiarFase('anuncio');
      cx.sonido.tono(523, 0.12, { tipo: 'square', volumen: 0.12 });
    }

    function duracionMostrar() {
      const gap = Math.max(160, info.ms * 0.45);
      return { paso: (info.ms + gap) / 1000, luz: info.ms / 1000 };
    }

    function empezarRespuesta() {
      const t = ahora();
      rondaN++;
      if (modo === 'solo') {
        resp = L.crearRespuesta(esperadoActual, t);
      } else if (modo === 'eliminacion') {
        enJuego().forEach((j) => { Object.assign(est[j.id], { estado: 'respondiendo', ronda: rondaN, resp: L.crearRespuesta(esperadoActual, t) }); });
      } else {
        const ids = jugadores.filter((j) => cx.jugadorConectado(j.id)).map((j) => j.id);
        duenos = L.repartir(info.colores, ids.length ? ids : jugadores.map((j) => j.id));
        rondaId = `r${nivel}-${rondaN}`;
        ultimoToqueCoop = t;
        cx.servidor({ tipo: 'coop-ronda', id: rondaId, esperado: esperadoActual, duenos, limiteMs: L.LIMITE_MS });
      }
      cambiarFase('respondiendo');
    }

    function nivelCompleto(bonus) {
      alcanzado = nivel;
      if (modo === 'cooperativo') bonusEquipo += bonus || 0;
      if (modo === 'solo' && resp) bonusSolo += resp.bonus;
      cx.sonido.bien();
      revisarRecord();
      cambiarFase('bien');
    }

    function revisarRecord() {
      if (recordFestejado || !record) return;
      const mejor = modo === 'eliminacion'
        ? Math.max(0, ...jugadores.map((j) => (est[j.id] ? est[j.id].nivel : 0)))
        : alcanzado;
      if (mejor > Math.floor(record.puntaje / 100)) {
        recordFestejado = true;
        festejar('¡Nuevo récord!');
      }
    }

    function festejar(texto) {
      cx.sonido.festejo();
      banner = { texto, t: 0, dur: 1.8, color: P.naranja, sub: '' };
      for (let i = 0; i < 110; i++) {
        confeti.push({
          x: Math.random() * 1080, y: -20 - Math.random() * 400, vx: (Math.random() - 0.5) * 160, vy: 260 + Math.random() * 320,
          r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 8, c: colores[i % 6].color, t: 0,
        });
      }
    }

    function errorSolo(motivo) {
      colorCorrecto = esperadoActual[resp.indice];
      flashError = 1;
      cx.sonido.error();
      cx.sacudir();
      razonFin = motivo === 'tiempo' ? 'Se acabó el tiempo' : 'Color equivocado';
      cambiarFase('error');
    }

    function tocarSolo(color) {
      if (fase !== 'respondiendo' || !resp) return;
      const r = L.responder(resp, color, ahora());
      if (r === 'ignorado') return;
      if (r === 'error' || r === 'tiempo') { errorSolo(r); return; }
      encender(color, 0.22);
      if (r === 'completo') nivelCompleto();
    }

    function afuera(j, motivo) {
      const e = est[j.id];
      e.estado = 'afuera';
      e.motivo = motivo;
      e.nivel = nivel - 1;
      e.bonus = e.bonusAcum;
      cx.sonido.tono(196, 0.25, { tipo: 'sawtooth', volumen: 0.15 });
      cx.actualizarControles();
    }

    function revisarRondaEliminacion() {
      if (fase !== 'respondiendo') return;
      const enRonda = jugadores.filter((j) => est[j.id].ronda === rondaN);
      if (enRonda.some((j) => est[j.id].estado === 'respondiendo')) return;
      const listos = enRonda.filter((j) => est[j.id].estado === 'listo');
      if (listos.length === 0) {
        // se equivocaron todos en la misma ronda: empate entre los que llegaron hasta acá
        razonFin = 'Se equivocaron todos en el mismo nivel';
        ganador = null;
        flashError = 1;
        cx.sonido.error();
        cambiarFase('error');
        return;
      }
      listos.forEach((j) => { est[j.id].nivel = nivel; });
      alcanzado = nivel;
      if (listos.length === 1 && jugadores.length > 1) {
        ganador = listos[0];
        razonFin = `${ganador.nombre} es el último que queda`;
        cx.sonido.festejo();
        cambiarFase('fin');
        return;
      }
      cx.sonido.bien();
      revisarRecord();
      cambiarFase('bien');
    }

    function siguienteNivel() {
      nivel++;
      if (modo === 'eliminacion') enJuego().forEach((j) => { est[j.id].estado = 'espera'; });
      prepararNivel(false);
    }

    // ------------------------------------------------------------ eventos del servidor (cooperativo)
    function mensajeCoop(m) {
      if (!m || m.ronda !== rondaId || fase !== 'respondiendo') return;
      if (m.tipo === 'coop-toque') {
        encender(m.color, 0.22);
        ultimoToqueCoop = ahora();
        const j = jugadores.find((x) => x.id === m.jugadorId);
        if (j) est[j.id].toques = (est[j.id].toques || 0) + 1;
      } else if (m.tipo === 'coop-completo') {
        nivelCompleto(m.bonus);
      } else if (m.tipo === 'coop-error') {
        vidas--;
        colorCorrecto = m.esperado != null ? m.esperado : -1;
        flashError = 1;
        cx.sonido.error();
        cx.sacudir();
        const j = jugadores.find((x) => x.id === m.jugadorId);
        razonFin = m.motivo === 'tiempo' ? 'Se acabó el tiempo' : `${j ? j.nombre : 'Alguien'} tocó un color equivocado`;
        cambiarFase('error');
      }
    }

    // ------------------------------------------------------------ dibujo
    function dibujarFondo(ctx) {
      const cv = D.capa(`mem-fondo|${cx.config.colores.principal}|${modo}`, 1080, 1920, (g) => {
        g.fillStyle = P.noche; g.fillRect(0, 0, 1080, 1920);
        g.fillStyle = P.panel; g.fillRect(0, 1520, 1080, 400);
        g.fillStyle = P.linea; g.fillRect(0, 1520, 1080, 2);
      });
      ctx.drawImage(cv, 0, 0);
      D.encabezado(ctx, cx, 'Memoria de colores', cx.modo.nombre);
    }

    function dibujarMarcador(ctx) {
      D.texto(ctx, 'NIVEL', 60, 200, { tam: 26, color: P.gris, peso: 700 });
      D.texto(ctx, nivel, 60, 300, { tam: 110, peso: 800 });
      D.texto(ctx, 'RÉCORD', 1020, 200, { tam: 26, color: P.gris, peso: 700, alinear: 'right' });
      const rec = record ? `Nivel ${Math.floor(record.puntaje / 100)}` : '—';
      D.texto(ctx, rec, 1020, 266, { tam: 56, peso: 800, alinear: 'right', color: recordFestejado ? P.naranja : P.blanco });
      if (record) D.texto(ctx, record.nombre.length > 22 ? record.nombre.slice(0, 21) + '…' : record.nombre, 1020, 304, { tam: 26, color: P.gris, alinear: 'right', fuente: 'texto', peso: 600 });
      if (modo === 'cooperativo') {
        D.texto(ctx, 'VIDAS', 540, 200, { tam: 26, color: P.gris, alinear: 'center' });
        for (let i = 0; i < L.VIDAS_COOP; i++) {
          ctx.fillStyle = i < vidas ? P.rojo : P.panel2;
          corazon(ctx, 540 + (i - 1) * 70, 262, 26);
        }
      } else if (info.especial && fase !== 'fin') {
        D.texto(ctx, info.especial === 'alreves' ? 'AL REVÉS' : 'TRAMPA', 540, 270, { tam: 52, color: P.naranja, alinear: 'center', peso: 800 });
      }
    }

    function corazon(ctx, x, y, r) {
      ctx.beginPath();
      ctx.moveTo(x, y + r);
      ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.4, x, y - r * 0.45);
      ctx.bezierCurveTo(x + r * 0.7, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r);
      ctx.fill();
    }

    function dibujarBotones(ctx) {
      const n = posiciones.length;
      const apagar = fase === 'mostrando' && info.especial === 'trampa';
      for (let c = 0; c < n; c++) {
        const r = rectColor(c);
        const col = colores[c];
        const luz = luces[c] > 0 ? Math.min(1, luces[c] / 0.12) : 0;
        const parpadea = colorCorrecto === c && (fase === 'error' || fase === 'fin') && Math.floor(tf * 6) % 2 === 0;
        const brillo = Math.max(luz, parpadea ? 1 : 0);
        if (brillo > 0) {
          ctx.globalAlpha = 0.35 * brillo;
          D.rect(ctx, r.x - 18, r.y - 18, r.w + 36, r.h + 36, 34, D.tono(col.color, 0.3));
          ctx.globalAlpha = 1;
        }
        const base = apagar ? D.tono(col.color, -0.7) : D.tono(col.color, -0.38);
        D.rect(ctx, r.x, r.y, r.w, r.h, 24, brillo > 0 ? D.tono(col.color, 0.12 + 0.18 * brillo) : base);
        if (brillo > 0) {
          ctx.lineWidth = 8; ctx.strokeStyle = '#ffffff';
          ctx.beginPath(); ctx.roundRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8, 20); ctx.stroke();
        }
        ctx.globalAlpha = brillo > 0 ? 1 : (apagar ? 0.25 : 0.7);
        cx.formas.dibujar(ctx, col.simbolo, r.x + r.w / 2, r.y + r.h / 2 - (col.etiqueta ? 18 : 0), r.w * 0.2, '#ffffff');
        if (col.etiqueta) D.texto(ctx, col.etiqueta, r.x + r.w / 2, r.y + r.h - 36, { tam: 34, alinear: 'center', peso: 700 });
        ctx.globalAlpha = 1;
        if (modo === 'solo') {
          const pos = posiciones.indexOf(c);
          D.rect(ctx, r.x + 16, r.y + 16, 62, 62, 8, 'rgba(0,0,0,0.35)');
          D.texto(ctx, pos + 1, r.x + 47, r.y + 62, { tam: 46, alinear: 'center', peso: 800 });
          if (cursor === pos && fase === 'respondiendo') {
            ctx.lineWidth = 10; ctx.strokeStyle = P.naranja;
            ctx.beginPath(); ctx.roundRect(r.x - 14, r.y - 14, r.w + 28, r.h + 28, 32); ctx.stroke();
          }
        }
      }
      // ondas expansivas
      ondas.forEach((o) => {
        if (o.color >= n) return;
        const r = rectColor(o.color);
        const k = o.t / 0.55;
        const e = 10 + k * 80;
        ctx.globalAlpha = Math.max(0, 0.7 * (1 - k));
        ctx.lineWidth = 12 * (1 - k) + 2; ctx.strokeStyle = D.tono(colores[o.color].color, 0.4);
        ctx.beginPath(); ctx.roundRect(r.x - e, r.y - e, r.w + 2 * e, r.h + 2 * e, 24 + e); ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    function dibujarTrampa(ctx) {
      if (fase !== 'mostrando' || info.especial !== 'trampa') return;
      const { paso, luz } = duracionMostrar();
      const i = Math.floor(tf / paso);
      if (i >= secuencia.length || tf - i * paso > luz) return;
      const tinta = colores[secuencia[i]].color;
      const palabra = colores[palabras[i]].palabra;
      D.rect(ctx, 70, 640, 940, 420, 16, 'rgba(11,29,48,0.92)');
      const tam = palabra.length > 7 ? 150 : 190;
      D.texto(ctx, palabra, 540, 850 + tam * 0.35, { tam, alinear: 'center', peso: 800, color: tinta });
      D.texto(ctx, `${i + 1} de ${secuencia.length}`, 540, 1020, { tam: 32, alinear: 'center', color: P.gris });
    }

    function textoEstado() {
      if (fase === 'intro') return modo === 'solo' ? 'Mirá la secuencia y repetila' : 'Mirá la secuencia en la tele y repetila en tu celu';
      if (fase === 'anuncio' || fase === 'aviso') return 'Atentos…';
      if (fase === 'mostrando') return info.especial === 'trampa' ? 'Memorizá el color de cada palabra' : 'Memorizá la secuencia';
      if (fase === 'mezcla') return '¡Se mezclan los botones!';
      if (fase === 'respondiendo') {
        const extra = info.especial === 'alreves' ? ' al revés' : info.especial === 'trampa' ? ' (color de la letra)' : '';
        if (modo === 'solo') return `Repetí la secuencia${extra} · ${resp ? resp.indice : 0} de ${esperadoActual.length}`;
        if (modo === 'cooperativo') return `Repitan la secuencia${extra} entre todos`;
        return `¡Repitan en el celu${extra}!`;
      }
      if (fase === 'bien') return '¡Bien!';
      if (fase === 'error') return razonFin;
      return razonFin || 'Fin del juego';
    }

    function dibujarEstado(ctx) {
      const y = posiciones.length === 6 ? 1470 : 1420;
      D.texto(ctx, textoEstado(), 540, y, { tam: 46, alinear: 'center', peso: 700, color: fase === 'error' ? P.rojo : P.blanco });
      // barra del tiempo que queda para el color que sigue
      let ultimo = null;
      if (fase === 'respondiendo') {
        if (modo === 'solo' && resp) ultimo = resp.ultimo;
        if (modo === 'cooperativo') ultimo = ultimoToqueCoop;
      }
      if (ultimo != null) {
        const k = Math.max(0, 1 - (ahora() - ultimo) / L.LIMITE_MS);
        D.rect(ctx, 240, y + 22, 600, 12, 6, P.panel2);
        D.rect(ctx, 240, y + 22, 600 * k, 12, 6, k < 0.34 ? P.rojo : P.celeste);
      }
    }

    function dibujarJugadores(ctx) {
      if (modo === 'solo') {
        D.texto(ctx, 'CÓMO SE JUEGA', 60, 1590, { tam: 26, color: P.gris });
        D.texto(ctx, `Clic en el botón, o teclas 1 a ${posiciones.length}`, 60, 1660, { tam: 44, peso: 700, fuente: 'texto' });
        D.texto(ctx, 'Flechas para elegir y Enter para tocar', 60, 1720, { tam: 36, peso: 600, fuente: 'texto', color: P.gris });
        D.texto(ctx, '3 segundos por color · termina al primer error', 60, 1780, { tam: 36, peso: 600, fuente: 'texto', color: P.gris });
        return;
      }
      const cols = jugadores.length > 4 ? 3 : 2;
      const w = (960 - (cols - 1) * 20) / cols;
      jugadores.forEach((j, i) => {
        const x = 60 + (i % cols) * (w + 20);
        const y = 1560 + Math.floor(i / cols) * 160;
        const e = est[j.id];
        const fuera = e.estado === 'afuera';
        ctx.globalAlpha = fuera ? 0.45 : 1;
        D.rect(ctx, x, y, w, 140, 8, P.panel2);
        ctx.fillStyle = j.color; ctx.beginPath(); ctx.arc(x + 36, y + 46, 16, 0, Math.PI * 2); ctx.fill();
        D.texto(ctx, j.nombre, x + 64, y + 60, { tam: 40, peso: 700, fuente: 'texto' });
        let st = ESTADO_TXT[e.estado] || '';
        if (modo === 'eliminacion' && e.estado === 'respondiendo' && e.resp) st = `respondiendo ${e.resp.indice}/${esperadoActual.length}`;
        if (modo === 'cooperativo') st = cx.jugadorConectado(j.id) ? '' : 'desconectado';
        if (!cx.jugadorConectado(j.id) && !fuera && modo === 'eliminacion') st += ' · sin conexión';
        const colorSt = e.estado === 'listo' ? P.verde : fuera ? P.rojo : P.gris;
        D.texto(ctx, st, x + 28, y + 114, { tam: 32, peso: 700, color: colorSt });
        if (modo === 'cooperativo') {
          let k = 0;
          Object.keys(duenos).forEach((c) => {
            if (duenos[c] !== j.id) return;
            const cc = colores[c];
            D.rect(ctx, x + 28 + k * 54, y + 82, 44, 44, 6, cc.color);
            cx.formas.dibujar(ctx, cc.simbolo, x + 50 + k * 54, y + 104, 12, '#fff');
            k++;
          });
        }
        ctx.globalAlpha = 1;
      });
    }

    function dibujarBanner(ctx) {
      let b = banner;
      if (fase === 'aviso') {
        const alreves = info.especial === 'alreves';
        D.rect(ctx, 0, 700, 1080, 480, 0, 'rgba(11,29,48,0.94)');
        ctx.fillStyle = P.naranja; ctx.fillRect(0, 700, 1080, 10); ctx.fillRect(0, 1170, 1080, 10);
        D.texto(ctx, 'RONDA ESPECIAL', 540, 800, { tam: 40, alinear: 'center', color: P.gris });
        D.texto(ctx, alreves ? '¡Al revés!' : '¡Trampa!', 540, 950, { tam: 150, alinear: 'center', peso: 800, color: P.naranja });
        D.texto(ctx, alreves ? 'Repetila de atrás para adelante' : 'Tocá el color de la LETRA, no lo que dice', 540, 1040, { tam: 44, alinear: 'center', fuente: 'texto', peso: 700 });
        D.rect(ctx, 290, 1090, 500 * (1 - tf / T_AVISO), 14, 7, P.naranja);
        return;
      }
      if (!b || b.t > b.dur) return;
      const k = b.t / b.dur;
      const esc = 0.7 + 0.3 * D.salida(Math.min(1, b.t / 0.3));
      const alfa = k > 0.8 ? (1 - k) / 0.2 : 1;
      ctx.globalAlpha = alfa;
      D.rect(ctx, 0, 820, 1080, b.sub ? 300 : 230, 0, 'rgba(11,29,48,0.9)');
      ctx.save();
      ctx.translate(540, 980);
      ctx.scale(esc, esc);
      D.texto(ctx, b.texto, 0, 0, { tam: 150, alinear: 'center', peso: 800, color: b.color });
      ctx.restore();
      if (b.sub) D.texto(ctx, b.sub, 540, 1070, { tam: 44, alinear: 'center', peso: 700, fuente: 'texto' });
      ctx.globalAlpha = 1;
    }

    function dibujarConfeti(ctx) {
      confeti.forEach((p) => {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-9, -5, 18, 10);
        ctx.restore();
      });
    }

    // ------------------------------------------------------------ interfaz de la plataforma
    return {
      iniciar(contexto, lista, m) {
        cx = contexto; modo = m; jugadores = lista;
        colores = L.coloresDesdeConfig(cx.config.memoria);
        rnd = L.azar((Date.now() ^ (Math.random() * 1e9)) >>> 0);
        jugadores.forEach((j) => { est[j.id] = { estado: 'espera', resp: null, nivel: 0, bonus: 0, bonusAcum: 0, ronda: 0 }; });
        cx.record(modo === 'cooperativo' ? 'equipo' : 'individual').then((r) => { record = r; });
        banner = { texto: 'Memoria de colores', t: 0, dur: 1.4, color: P.blanco, sub: modo === 'solo' ? 'Repetí la secuencia' : modo === 'eliminacion' ? 'El último que queda gana' : 'Entre todos, con 3 vidas' };
        cambiarFase('intro');
      },

      recibirInput(id, datos, ts) {
        if (modo !== 'eliminacion' || fase !== 'respondiendo' || datos.boton == null) return;
        const e = est[id];
        if (!e || e.estado !== 'respondiendo' || !e.resp) return;
        const r = L.responder(e.resp, Number(datos.boton), Math.max(ts, e.resp.ultimo - 500));
        if (r === 'error' || r === 'tiempo') afuera(jugadores.find((j) => j.id === id), r);
        else if (r === 'completo') {
          e.estado = 'listo';
          e.bonusAcum += e.resp.bonus;
          e.bonus = e.bonusAcum;
          cx.sonido.tono(880, 0.08, { tipo: 'triangle', volumen: 0.15 });
          cx.actualizarControles();
        } else if (r === 'bien') {
          cx.sonido.tono(700, 0.03, { tipo: 'triangle', volumen: 0.06 });
        }
        revisarRondaEliminacion();
      },

      mensajeServidor(m) { if (modo === 'cooperativo') mensajeCoop(m); },

      puntero(x, y, tipo) {
        if (modo !== 'solo' || tipo !== 'abajo') return;
        const p = posEn(x, y);
        if (p >= 0) { cursor = -1; tocarSolo(posiciones[p]); }
      },

      tecla(codigo) {
        if (modo !== 'solo') return;
        const m = /^(?:Digit|Numpad)([1-6])$/.exec(codigo);
        if (m) {
          const p = +m[1] - 1;
          if (p < posiciones.length) tocarSolo(posiciones[p]);
          return;
        }
        if (fase !== 'respondiendo') return;
        const n = posiciones.length;
        if (/^Arrow/.test(codigo)) {
          if (cursor < 0) { cursor = 0; return; }
          if (codigo === 'ArrowLeft' && cursor % 2 === 1) cursor--;
          else if (codigo === 'ArrowRight' && cursor % 2 === 0) cursor++;
          else if (codigo === 'ArrowUp' && cursor >= 2) cursor -= 2;
          else if (codigo === 'ArrowDown' && cursor + 2 < n) cursor += 2;
          cx.sonido.mover();
        } else if ((codigo === 'Enter' || codigo === 'Space' || codigo === 'NumpadEnter') && cursor >= 0) {
          tocarSolo(posiciones[cursor]);
        }
      },

      conexion(id, conectado) {
        if (modo === 'cooperativo' && !conectado) cx.cartel('Se desconectó un jugador: sus colores se reparten en el próximo nivel');
      },

      actualizar(dt) {
        tf += dt;
        if (banner) banner.t += dt;
        Object.keys(luces).forEach((c) => { luces[c] -= dt; });
        ondas.forEach((o) => { o.t += dt; });
        while (ondas.length && ondas[0].t > 0.55) ondas.shift();
        flashError = Math.max(0, flashError - dt * 1.5);
        if (confeti.length) {
          confeti.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; });
          confeti = confeti.filter((p) => p.y < 2000);
        }

        if (fase === 'intro' && tf >= 1.5) {
          prepararNivel(false);
        } else if (fase === 'anuncio' && tf >= T_ANUNCIO) {
          cambiarFase(info.especial ? 'aviso' : 'mostrando');
          if (info.especial) cx.sonido.tono(392, 0.4, { tipo: 'square', volumen: 0.15 });
        } else if (fase === 'aviso' && tf >= T_AVISO) {
          cambiarFase('mostrando');
        } else if (fase === 'mostrando') {
          const { paso, luz } = duracionMostrar();
          const i = Math.floor(tf / paso);
          if (i > mostrados && i < secuencia.length) {
            mostrados = i;
            if (info.especial === 'trampa') cx.sonido.tono(600, 0.08, { tipo: 'sine', volumen: 0.15 });
            else encender(secuencia[i], luz);
          }
          if (tf >= secuencia.length * paso + 0.15) {
            if (info.mezclar) {
              posAnteriores = posiciones.slice();
              posiciones = L.mezclar(posiciones.length, rnd, posiciones);
              cambiarFase('mezcla');
              cx.sonido.ruido(0.5, { filtro: 1400, q: 2, volumen: 0.12 });
            } else {
              empezarRespuesta();
            }
          }
        } else if (fase === 'mezcla' && tf >= T_MEZCLA) {
          posAnteriores = null;
          empezarRespuesta();
        } else if (fase === 'respondiendo') {
          const t = ahora();
          if (modo === 'solo' && resp && L.vencida(resp, t)) { resp.estado = 'error'; errorSolo('tiempo'); }
          if (modo === 'eliminacion') {
            jugadores.forEach((j) => {
              const e = est[j.id];
              if (e.estado === 'respondiendo' && e.resp && L.vencida(e.resp, t)) afuera(j, 'tiempo');
            });
            revisarRondaEliminacion();
          }
          // cooperativo: si el servidor no contesta (se cortó), se toma como error para no quedar trabados
          if (modo === 'cooperativo' && t - ultimoToqueCoop > L.LIMITE_MS + 2500) {
            mensajeCoop({ tipo: 'coop-error', ronda: rondaId, motivo: 'tiempo', esperado: -1 });
          }
        } else if (fase === 'bien' && tf >= T_BIEN) {
          siguienteNivel();
        } else if (fase === 'error' && tf >= T_ERROR) {
          if (modo === 'cooperativo' && vidas > 0) prepararNivel(true);
          else cambiarFase('fin');
        }
      },

      dibujar(ctx) {
        dibujarFondo(ctx);
        dibujarMarcador(ctx);
        dibujarBotones(ctx);
        dibujarTrampa(ctx);
        dibujarEstado(ctx);
        dibujarJugadores(ctx);
        if (flashError > 0) {
          ctx.globalAlpha = flashError * 0.35;
          ctx.fillStyle = P.rojo; ctx.fillRect(0, 0, 1080, 1920);
          ctx.globalAlpha = 1;
        }
        dibujarBanner(ctx);
        dibujarConfeti(ctx);
        if (fase === 'fin') {
          D.rect(ctx, 0, 820, 1080, 260, 0, 'rgba(11,29,48,0.9)');
          D.texto(ctx, ganador ? `¡Ganó ${ganador.nombre}!` : 'Fin del juego', 540, 990, { tam: 120, alinear: 'center', peso: 800, color: P.naranja });
        }
      },

      controlCelular(id) {
        const e = est[id];
        if (!e) return { tipo: 'espera', grande: 'Mirá la tele' };
        const especial = info.especial === 'alreves' ? '¡Al revés!' : info.especial === 'trampa' ? 'Tocá el color de la LETRA' : '';
        if (fase === 'fin') return { tipo: 'espera', id: 'fin', titulo: 'Terminó', grande: 'Mirá la tele' };
        if (modo === 'eliminacion' && e.estado === 'afuera') {
          return { tipo: 'espera', id: 'afuera', titulo: '✗ Quedaste afuera', mensaje: `Llegaste al nivel ${e.nivel}`, grande: 'Mirá cómo sigue' };
        }
        if (fase !== 'respondiendo') {
          return { tipo: 'espera', id: `ver-${nivel}-${rondaN}`, titulo: `Nivel ${nivel}`, mensaje: especial || 'El celu no muestra la secuencia', grande: 'Mirá la tele y memorizá' };
        }
        if (modo === 'eliminacion') {
          if (e.estado === 'listo') return { tipo: 'espera', id: `listo-${nivel}`, titulo: '✓ ¡Bien!', mensaje: 'Esperá a los demás', grande: 'Listo' };
          if (e.estado !== 'respondiendo') return { tipo: 'espera', id: 'mirando', grande: 'Mirá la tele' };
          return {
            tipo: 'botones', id: `resp-${nivel}-${rondaN}`, titulo: especial || '¡Repetila!', mensaje: `Nivel ${nivel} · ${esperadoActual.length} colores`,
            columnas: 2, botones: posiciones.map((c) => ({ id: c, color: colores[c].color, simbolo: colores[c].simbolo, texto: colores[c].etiqueta })),
          };
        }
        // cooperativo: cada uno ve solo sus colores
        const mios = posiciones.filter((c) => duenos[c] === id);
        return {
          tipo: 'botones', id: `coop-${nivel}-${rondaN}`, titulo: especial || 'Tocá cuando sea tu color', mensaje: `Nivel ${nivel} · vidas: ${vidas}`,
          columnas: mios.length > 2 ? 2 : 1, botones: mios.map((c) => ({ id: c, color: colores[c].color, simbolo: colores[c].simbolo, texto: colores[c].etiqueta })),
        };
      },

      terminado() { return fase === 'fin' && tf >= T_FIN; },

      resultados() {
        if (modo === 'solo') {
          const pts = L.puntaje(alcanzado, bonusSolo);
          return {
            titulo: `Nivel ${alcanzado}`,
            subtitulo: `${pts} puntos · ${razonFin || ''}`,
            filas: [{ nombre: 'Vos', valor: `Nivel ${alcanzado}`, detalle: `${pts} puntos`, esJugadorSolo: true, destacado: true }],
            registros: [{ categoria: 'individual', puntaje: pts, detalle: { nivel: alcanzado } }],
          };
        }
        if (modo === 'cooperativo') {
          const pts = L.puntaje(alcanzado, bonusEquipo);
          const celular = {};
          jugadores.forEach((j) => { celular[j.id] = { titulo: `Nivel ${alcanzado} en equipo`, mensaje: `${pts} puntos` }; });
          return {
            titulo: `Nivel ${alcanzado} en equipo`,
            subtitulo: `${pts} puntos`,
            filas: jugadores.map((j) => ({ nombre: j.nombre, color: j.color, valor: `Nivel ${alcanzado}`, destacado: true })),
            registros: alcanzado > 0 ? [{ categoria: 'equipo', puntaje: pts, jugadorIds: jugadores.map((j) => j.id), detalle: { nivel: alcanzado } }] : [],
            celular,
          };
        }
        const orden = jugadores.slice().sort((a, b) => {
          const ea = est[a.id], eb = est[b.id];
          return (ganador && b === ganador) - (ganador && a === ganador) || eb.nivel - ea.nivel || eb.bonus - ea.bonus;
        });
        const celular = {};
        orden.forEach((j, i) => {
          const e = est[j.id];
          celular[j.id] = { titulo: j === ganador ? '¡Ganaste!' : `Puesto ${i + 1}`, mensaje: `Llegaste al nivel ${e.nivel}` };
        });
        return {
          titulo: ganador ? `¡Ganó ${ganador.nombre}!` : '¡Empate!',
          subtitulo: razonFin,
          filas: orden.map((j, i) => {
            const e = est[j.id];
            return { nombre: j.nombre, color: j.color, valor: `Nivel ${e.nivel}`, detalle: `${L.puntaje(e.nivel, e.bonus)} puntos`, destacado: i === 0 };
          }),
          registros: orden.filter((j) => est[j.id].nivel > 0).map((j) => ({
            categoria: 'individual', puntaje: L.puntaje(est[j.id].nivel, est[j.id].bonus), jugadorIds: [j.id], detalle: { nivel: est[j.id].nivel },
          })),
          celular,
        };
      },

      // para las pruebas automáticas
      _irANivel(n) {
        secuencia = [];
        for (let k = 1; k <= n; k++) secuencia = L.extender(secuencia, k, rnd);
        nivel = n;
        alcanzado = n - 1;
        prepararNivel(true);
      },
      _estado() {
        return {
          fase, nivel, esperado: esperadoActual.slice(), posiciones: posiciones.slice(), especial: info.especial, vidas, alcanzado, cursor,
          jugadores: jugadores.map((j) => ({ id: j.id, nombre: j.nombre, estado: est[j.id].estado, nivel: est[j.id].nivel })),
        };
      },
    };
  });
})();
