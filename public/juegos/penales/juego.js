/*
 * Penales. Reglas en logica.js; acá van el flujo de la tanda, el dibujo (a mano, en canvas) y el
 * sonido. Modos: solo (mouse contra arquero automático), 1 contra 1 y torneo (celus).
 */
(function () {
  'use strict';
  const L = window.PenalesLogica;
  const D = window.Dibujo;
  const P = D.PAL;

  // geometría de la cancha en el lienzo de 1080x1920
  const GX = 540, GHW = 360, GLINEA = 800, GALTO = 240;         // arco: palos en 180 y 900, travesaño en 560
  const FONDO = { hw: 300, arriba: 548, abajo: 772 };           // fondo de la red (más lejos = más chico y más arriba)
  const BALON = { x: 540, y: 1560, r: 36 };
  const R_ARCO = 13;                                            // radio de la pelota al llegar al arco
  const T_PREPARAR = 1.4, T_RESULTADO = 2.5, T_FIN = 2.2, LIMITE_TIRO = 15;
  const TEXTOS = {
    gol: { t: '¡GOOOL!', c: P.naranja }, atajada: { t: '¡ATAJÓ!', c: P.celeste },
    afuera: { t: '¡AFUERA!', c: P.rojo }, palo: { t: '¡PALO!', c: '#FFFFFF' },
  };

  const proy = (x, y) => ({ x: GX + x * GHW, y: GLINEA - y * GALTO });
  const lerp = (a, b, t) => a + (b - a) * t;

  window.Plataforma.registrar('penales', () => {
    let cx, modo, jugadores, rnd, dificultad, colores;
    let fase = 'intro';
    let tf = 0;
    let n = 0;                    // número de tiro (global)
    let intento = 0;              // para reiniciar el control de deslizar si el trazo no sirvió
    let pateador = null, arquero = null;   // jugadores (arquero null = automático)
    let zonaElegida = null;       // lo que eligió el arquero humano
    let zonaArq = null;           // zona final del arquero
    let tiro = null, res = null;
    let trazo = null;             // trazo del mouse en curso [{x,y,t}] en px del lienzo
    let aviso = '';
    // por modo
    const solo = { racha: 0, mejor: 0, errados: 0, goles: 0, tiros: 0, historial: [] };
    const tanda = [[], []];       // 1 contra 1: goles (true/false) de cada jugador
    const arq = {};               // id → { atajadas, recibidos }
    const tor = {};               // id → { tiros: [], goles, prec, historial }
    let ordenTorneo = [];
    let tandaInfo = { terminado: false, ganador: null, muerteSubita: false };
    // animación
    let vuelo = null;             // { S, C, E, dur, t, lento, rebote }
    let pelota = { x: BALON.x, y: BALON.y, r: BALON.r, giro: 0, sombra: null, visible: true };
    let keeper = { x: 0, y: 0.4, ang: 0, k: 0, desde: null, hacia: null };
    let carrera = 0;              // 0..1 de la carrera del pateador
    let texto = null;             // { t, sub, color, tiempo }
    let red = null;               // { x, y, t } impacto en la red
    let festejo = 0;              // segundos de hinchada saltando
    let murmullo = 0;

    // ------------------------------------------------------------ turnos
    const esUno = () => modo === 'uno';
    const esTorneo = () => modo === 'torneo';

    function nuevoTurno() {
      n++;
      intento = 0;
      zonaElegida = null; zonaArq = null; tiro = null; res = null; trazo = null; aviso = '';
      vuelo = null; red = null; texto = null; carrera = 0;
      pelota = { x: BALON.x, y: BALON.y, r: BALON.r, giro: 0, visible: true };
      keeper = { x: 0, y: 0.4, ang: 0, k: 0, desde: null, hacia: null };
      if (esUno()) {
        const k = n - 1;
        pateador = jugadores[k % 2];
        arquero = jugadores[(k + 1) % 2];
      } else if (esTorneo()) {
        pateador = ordenTorneo[n - 1];
        arquero = null;
      } else {
        pateador = null; arquero = null;
      }
      fase = 'preparar'; tf = 0;
      cx.actualizarControles();
    }

    function nombreP() { return pateador ? pateador.nombre : 'Vos'; }

    function empezarApuntar() {
      fase = 'apuntar'; tf = 0;
      cx.sonido.silbato(false);
      cx.actualizarControles();
    }

    function recibirTiro(t) {
      if (fase !== 'apuntar') return;
      if (!t) {
        intento++;
        aviso = 'Ese trazo no sirve: deslizá hacia el arco, desde la pelota';
        cx.actualizarControles();
        return;
      }
      tiro = t;
      fase = 'carrera'; tf = 0;
      cx.actualizarControles();
    }

    function duracionCarrera() { return esUno() ? 3 : 0.9; }

    function patear() {
      // decide el arquero
      if (esUno()) {
        zonaArq = zonaElegida == null ? L.CENTRO : zonaElegida;
      } else {
        const hist = esTorneo() ? tor[pateador.id].historial : solo.historial;
        zonaArq = L.elegirZonaAuto(hist, dificultad, rnd, tiro);
      }
      res = L.evaluar(tiro, zonaArq);
      armarVuelo();
      fase = 'vuelo'; tf = 0;
      cx.sonido.patada();
      cx.actualizarControles();
    }

    function armarVuelo() {
      const S = { x: BALON.x, y: BALON.y };
      let E = proy(tiro.x, tiro.y);
      let rebote = null;
      if (res.resultado === 'palo') {
        if (res.donde === 'travesaño') E = proy(Math.max(-1, Math.min(1, tiro.x)), 1);
        else E = proy(Math.sign(tiro.x), Math.min(1, tiro.y));
        rebote = { x: E.x - Math.sign(tiro.x || 1) * 140, y: E.y + 380, r: 22 };
      } else if (res.resultado === 'afuera') {
        // sigue de largo: a la tribuna o al costado
        const sx = tiro.x * 1.25, sy = tiro.y > 1 + L.BORDE ? tiro.y + 0.6 : tiro.y;
        E = proy(sx, sy);
      } else if (res.resultado === 'atajada') {
        rebote = { x: E.x + (tiro.x >= 0 ? 1 : -1) * 200, y: E.y + 330, r: 22 };
      }
      const dur = 0.42 + (1 - tiro.fuerza) * 0.6;
      const mx = (S.x + E.x) / 2, my = (S.y + E.y) / 2;
      // comba: el control se corre al lado contrario y la pelota "dobla" hacia el final
      const C = { x: mx - tiro.comba * 220, y: my - 120 };
      const lento = res.pegado && res.resultado !== 'afuera';
      vuelo = { S, C, E, dur, t: 0, lento, rebote, fin: false };
      // el arquero se tira: a la pelota si ataja; a su zona si no
      const destino = res.resultado === 'atajada' ? { x: tiro.x * 0.95, y: Math.max(0.15, tiro.y) } : L.centroZona(zonaArq);
      keeper.desde = { x: 0, y: 0.4 };
      keeper.hacia = destino;
    }

    function llegar() {
      const r = res.resultado;
      const gol = r === 'gol';
      const tx = TEXTOS[r];
      let sub = '';
      if (tiro.debil) sub = 'Se le acabó el tiempo: tiro débil al medio';
      else if (r === 'gol' && res.golazo) sub = '¡Golazo imposible, pegado al palo!';
      else if (r === 'gol' && tiro.y > 0.75 && Math.abs(tiro.x) > 0.6) sub = 'Al ángulo';
      else if (r === 'afuera' && tiro.y > 1) sub = tiro.fuerza > 0.85 ? 'Demasiada fuerza: se fue por arriba' : 'Por arriba del travesaño';
      else if (r === 'afuera') sub = 'Se fue al costado';
      else if (r === 'palo') sub = res.donde === 'travesaño' ? 'Pegó en el travesaño' : `Pegó en el palo ${res.donde}`;
      else if (r === 'atajada' && arquero) sub = `Atajó ${arquero.nombre}`;
      texto = { t: tx.t, sub, color: tx.c, tiempo: 0 };
      if (gol) {
        red = { x: tiro.x, y: tiro.y, t: 0 };
        cx.sonido.red();
        cx.sonido.hinchada(true);
        cx.sacudir();
        festejo = 2.4;
      } else if (r === 'palo') {
        cx.sonido.palo();
        cx.sonido.lamento();
      } else {
        cx.sonido.lamento();
      }
      anotar(gol);
      fase = 'resultado'; tf = 0;
      cx.actualizarControles();
    }

    function anotar(gol) {
      if (modo === 'solo') {
        solo.tiros++;
        solo.historial.push(res.zona);
        if (gol) { solo.goles++; solo.racha++; solo.mejor = Math.max(solo.mejor, solo.racha); }
        else { solo.errados++; solo.racha = 0; }
      } else if (esUno()) {
        const i = jugadores.indexOf(pateador);
        tanda[i].push(gol);
        const a = arq[arquero.id];
        a.recibidos++;
        if (res.resultado === 'atajada') a.atajadas++;
        tandaInfo = L.estadoTanda(tanda[0], tanda[1], 5);
      } else {
        const t = tor[pateador.id];
        t.tiros.push(gol);
        t.historial.push(res.zona);
        if (gol) t.goles++;
        t.prec += L.precision(tiro, res.resultado);
      }
    }

    function terminoPartida() {
      if (modo === 'solo') return solo.errados >= 3;
      if (esUno()) return tandaInfo.terminado;
      return n >= ordenTorneo.length;
    }

    // ------------------------------------------------------------ entrada
    function trazoMouseATiro(pts) {
      const norm = pts.map((p) => ({ x: p.x / 1920, y: p.y / 1920, t: p.t }));
      return L.trazoATiro(norm, { perfil: 'mouse', rnd });
    }

    // ------------------------------------------------------------ dibujo: cancha y fondo
    function dibujarCancha(g) {
      // pasto con franjas en perspectiva
      g.fillStyle = '#1F6B3A'; g.fillRect(0, 470, 1080, 1450);
      let y = 530;
      for (let i = 0; y < 1920; i++) {
        const h = 40 + i * 16;
        if (i % 2 === 0) { g.fillStyle = '#237641'; g.fillRect(0, y, 1080, h); }
        y += h;
      }
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 6; g.lineCap = 'round';
      // línea de gol
      g.beginPath(); g.moveTo(0, GLINEA); g.lineTo(1080, GLINEA); g.stroke();
      // área chica
      g.beginPath(); g.moveTo(330, GLINEA); g.lineTo(290, 900); g.lineTo(790, 900); g.lineTo(750, GLINEA); g.stroke();
      // área grande
      g.beginPath(); g.moveTo(40, GLINEA); g.lineTo(-120, 1790); g.moveTo(1040, GLINEA); g.lineTo(1200, 1790); g.stroke();
      g.beginPath(); g.moveTo(-120, 1790); g.lineTo(1200, 1790); g.stroke();
      // punto penal
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(BALON.x, BALON.y + 6, 14, 6, 0, 0, Math.PI * 2); g.fill();
      // medialuna
      g.beginPath(); g.ellipse(540, 1790, 300, 90, 0, 0, Math.PI); g.stroke();
    }

    function dibujarTribuna(g, salto) {
      g.fillStyle = '#16314D'; g.fillRect(0, 290, 1080, 185);
      for (let fila = 0; fila < 4; fila++) {
        const y0 = 315 + fila * 42;
        g.fillStyle = fila % 2 ? '#1B3A5A' : '#183652';
        g.fillRect(0, y0 + 16, 1080, 26);
        for (let i = 0; i < 28; i++) {
          const x = 18 + i * 38 + (fila % 2) * 19;
          const semilla = (fila * 31 + i * 17) % 7;
          const arriba = salto && ((i + fila + salto) % 2 === 0) ? 9 : 0;
          const camiseta = [colores.principal, colores.secundario, '#F4F8FB', colores.principal, colores.acento, colores.secundario, '#C9D3DD'][semilla];
          g.fillStyle = camiseta;
          g.fillRect(x - 12, y0 + 14 - arriba, 24, 22);
          g.fillStyle = ['#F1C9A5', '#D9A47C', '#8D5A3B', '#F1C9A5', '#B57C55', '#E8B892', '#6B4429'][semilla];
          g.beginPath(); g.arc(x, y0 + 7 - arriba, 9, 0, Math.PI * 2); g.fill();
          if (salto && arriba && semilla % 3 === 0) {
            g.strokeStyle = camiseta; g.lineWidth = 5;
            g.beginPath(); g.moveTo(x - 10, y0 + 16 - arriba); g.lineTo(x - 18, y0 - 6 - arriba); g.moveTo(x + 10, y0 + 16 - arriba); g.lineTo(x + 18, y0 - 6 - arriba); g.stroke();
          }
        }
      }
    }

    function dibujarCarteles(g) {
      const y = 474, h = 62;
      g.fillStyle = colores.principal; g.fillRect(0, y, 1080, h);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y + h - 6, 1080, 6);
      const nombre = (cx.config.nombreEscuela || '').toUpperCase();
      const logoListo = cx.logo && cx.logo.complete && cx.logo.naturalWidth > 0;
      g.save();
      g.beginPath(); g.rect(0, y, 1080, h); g.clip();
      g.font = `800 34px ${D.TITULO}`; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      const ancho = g.measureText(nombre).width + (logoListo ? 70 : 0) + 80;
      for (let x = -40; x < 1080; x += ancho) {
        let tx = x;
        if (logoListo) { g.drawImage(cx.logo, tx, y + 7, 48, 48); tx += 64; }
        else { g.fillStyle = colores.acento; g.fillRect(tx, y + 22, 18, 18); g.fillStyle = '#fff'; tx += 34; }
        g.fillText(nombre, tx, y + h / 2 + 2);
      }
      g.restore();
    }

    function dibujarArcoFijo(g) {
      // red: laterales, techo y fondo (lo que no se mueve)
      const f = proy(-1, 1), d = proy(1, 1), fi = proy(-1, 0), di = proy(1, 0);
      const bi = { x: GX - FONDO.hw, y: FONDO.arriba }, bd = { x: GX + FONDO.hw, y: FONDO.arriba };
      const bii = { x: GX - FONDO.hw, y: FONDO.abajo }, bdi = { x: GX + FONDO.hw, y: FONDO.abajo };
      g.fillStyle = 'rgba(10,30,20,0.35)';
      g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(bi.x, bi.y); g.lineTo(bd.x, bd.y); g.lineTo(d.x, d.y); g.lineTo(di.x, di.y); g.lineTo(bdi.x, bdi.y); g.lineTo(bii.x, bii.y); g.lineTo(fi.x, fi.y); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5;
      // techo y laterales
      for (let i = 0; i <= 10; i++) {
        const k = i / 10;
        g.beginPath(); g.moveTo(lerp(f.x, d.x, k), f.y); g.lineTo(lerp(bi.x, bd.x, k), bi.y); g.stroke();
        g.beginPath(); g.moveTo(lerp(f.x, bi.x, k), lerp(f.y, bi.y, k)); g.lineTo(lerp(fi.x, bii.x, k), lerp(fi.y, bii.y, k)); g.stroke();
        g.beginPath(); g.moveTo(lerp(d.x, bd.x, k), lerp(d.y, bd.y, k)); g.lineTo(lerp(di.x, bdi.x, k), lerp(di.y, bdi.y, k)); g.stroke();
      }
      for (let j = 0; j <= 8; j++) {
        const k = j / 8;
        g.beginPath(); g.moveTo(lerp(f.x, fi.x, k), lerp(f.y, fi.y, k)); g.lineTo(lerp(bi.x, bii.x, k), lerp(bi.y, bii.y, k)); g.stroke();
        g.beginPath(); g.moveTo(lerp(d.x, di.x, k), lerp(d.y, di.y, k)); g.lineTo(lerp(bd.x, bdi.x, k), lerp(bd.y, bdi.y, k)); g.stroke();
      }
    }

    /** Fondo de la red (se mueve con el gol) */
    function dibujarRed(ctx) {
      const cols = 20, filas = 9;
      const amp = red ? 26 * Math.exp(-red.t * 2.2) * Math.cos(red.t * 16) : 0;
      const imp = red ? { x: GX + red.x * FONDO.hw, y: lerp(FONDO.abajo, FONDO.arriba, Math.min(1, red.y)) } : null;
      const punto = (i, j) => {
        let x = GX - FONDO.hw + (2 * FONDO.hw) * i / cols;
        let y = FONDO.arriba + (FONDO.abajo - FONDO.arriba) * j / filas;
        if (imp && amp) {
          const d2 = ((x - imp.x) ** 2 + (y - imp.y) ** 2) / (120 * 120);
          const k = Math.exp(-d2) * amp;
          x += (x - imp.x) * 0.002 * k * 4;
          y -= k;
        }
        return { x, y };
      };
      ctx.strokeStyle = 'rgba(255,255,255,0.42)'; ctx.lineWidth = 1.6;
      for (let i = 0; i <= cols; i++) {
        ctx.beginPath();
        for (let j = 0; j <= filas; j++) { const p = punto(i, j); j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
        ctx.stroke();
      }
      for (let j = 0; j <= filas; j++) {
        ctx.beginPath();
        for (let i = 0; i <= cols; i++) { const p = punto(i, j); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
        ctx.stroke();
      }
    }

    function dibujarPalos(ctx) {
      const f = proy(-1, 1), d = proy(1, 1), fi = proy(-1, 0), di = proy(1, 0);
      ctx.strokeStyle = '#F4F8FB'; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(fi.x, fi.y); ctx.lineTo(f.x, f.y); ctx.lineTo(d.x, d.y); ctx.lineTo(di.x, di.y); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(fi.x + 6, fi.y); ctx.lineTo(f.x + 6, f.y + 6); ctx.lineTo(d.x - 6, d.y + 6); ctx.lineTo(di.x - 6, di.y); ctx.stroke();
    }

    // ------------------------------------------------------------ personajes
    function dibujarArquero(ctx) {
      const pos = proy(keeper.x, keeper.y);
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(keeper.ang);
      const agachado = keeper.agachado || 0;
      ctx.scale(1, 1 - agachado * 0.25);
      const camiseta = colores.acento, short = '#1B1B1B', piel = '#E0AC82';
      ctx.lineCap = 'round';
      // piernas
      ctx.strokeStyle = short; ctx.lineWidth = 22;
      ctx.beginPath(); ctx.moveTo(-14, 30); ctx.lineTo(-30 - keeper.k * 10, 96); ctx.moveTo(14, 30); ctx.lineTo(30 + keeper.k * 10, 96); ctx.stroke();
      ctx.strokeStyle = '#F4F8FB'; ctx.lineWidth = 20;
      ctx.beginPath(); ctx.moveTo(-30 - keeper.k * 10, 96); ctx.lineTo(-34 - keeper.k * 10, 112); ctx.moveTo(30 + keeper.k * 10, 96); ctx.lineTo(34 + keeper.k * 10, 112); ctx.stroke();
      // brazos (arriba y abiertos; estirados al tirarse)
      const abre = 0.6 + keeper.k * 0.4;
      ctx.strokeStyle = camiseta; ctx.lineWidth = 18;
      ctx.beginPath(); ctx.moveTo(-24, -26); ctx.lineTo(-24 - 46 * abre, -26 - 52 * abre); ctx.moveTo(24, -26); ctx.lineTo(24 + 46 * abre, -26 - 52 * abre); ctx.stroke();
      ctx.fillStyle = '#F4F8FB';
      ctx.beginPath(); ctx.arc(-24 - 50 * abre, -30 - 56 * abre, 13, 0, Math.PI * 2); ctx.arc(24 + 50 * abre, -30 - 56 * abre, 13, 0, Math.PI * 2); ctx.fill();
      // torso
      D.rect(ctx, -30, -40, 60, 78, 14, camiseta);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(-30, 20, 60, 8);
      D.texto(ctx, '1', 0, 14, { tam: 34, alinear: 'center', color: '#1B1B1B', peso: 800 });
      // cabeza
      ctx.fillStyle = piel; ctx.beginPath(); ctx.arc(0, -60, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3B2A20'; ctx.beginPath(); ctx.arc(0, -66, 20, Math.PI, 0); ctx.fill();
      ctx.restore();
    }

    function dibujarPateador(ctx) {
      // de espaldas, corre hacia la pelota
      const k = D.suave(carrera);
      const x = lerp(370, 476, k), y = lerp(1660, 1610, k);
      const paso = Math.sin(carrera * Math.PI * 6) * (carrera > 0 && carrera < 1 ? 1 : 0);
      ctx.save();
      ctx.translate(x, y);
      const esc = lerp(0.9, 0.8, k);
      ctx.scale(esc, esc);
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#1B1B1B'; ctx.lineWidth = 24;
      ctx.beginPath(); ctx.moveTo(-14, 40); ctx.lineTo(-18 - paso * 14, 120); ctx.moveTo(14, 40); ctx.lineTo(20 + paso * 14, 120); ctx.stroke();
      ctx.strokeStyle = colores.secundario; ctx.lineWidth = 20;
      ctx.beginPath(); ctx.moveTo(-18 - paso * 14, 120); ctx.lineTo(-20 - paso * 14, 150); ctx.moveTo(20 + paso * 14, 120); ctx.lineTo(22 + paso * 14, 150); ctx.stroke();
      ctx.strokeStyle = colores.principal; ctx.lineWidth = 18;
      ctx.beginPath(); ctx.moveTo(-34, -30); ctx.lineTo(-50 - paso * 10, 30); ctx.moveTo(34, -30); ctx.lineTo(50 + paso * 10, 30); ctx.stroke();
      // camiseta a rayas con los colores de la escuela
      D.rect(ctx, -36, -44, 72, 92, 14, colores.principal);
      ctx.fillStyle = colores.secundario;
      for (let i = -24; i <= 20; i += 22) ctx.fillRect(i, -44, 10, 92);
      D.texto(ctx, (pateador ? pateador.nombre : 'Vos').slice(0, 10).toUpperCase(), 0, -14, { tam: 18, alinear: 'center', peso: 800, color: '#fff', borde: 4, colorBorde: colores.principal });
      D.texto(ctx, String(((n - 1) % 9) + 2), 0, 30, { tam: 40, alinear: 'center', peso: 800, color: '#fff', borde: 5, colorBorde: colores.principal });
      ctx.fillStyle = '#3B2A20'; ctx.beginPath(); ctx.arc(0, -68, 22, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function dibujarPelota(ctx) {
      if (!pelota.visible) return;
      if (pelota.sombra) {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath(); ctx.ellipse(pelota.sombra.x, pelota.sombra.y, pelota.r * 1.1, pelota.r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.save();
      ctx.translate(pelota.x, pelota.y);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(0, 0, pelota.r, 0, Math.PI * 2); ctx.fill();
      ctx.clip();
      ctx.rotate(pelota.giro);
      ctx.fillStyle = '#1C1C1C';
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5;
        ctx.beginPath(); ctx.arc(Math.cos(a) * pelota.r * 0.78, Math.sin(a) * pelota.r * 0.78, pelota.r * 0.28, 0, Math.PI * 2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, 0, pelota.r * 0.32, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pelota.x, pelota.y, pelota.r, 0, Math.PI * 2); ctx.stroke();
    }

    // ------------------------------------------------------------ marcador e información
    function puntitos(ctx, x, y, lista, total, r) {
      for (let i = 0; i < Math.max(total, lista.length); i++) {
        const cxp = x + i * (r * 2 + 10);
        if (i < lista.length) {
          ctx.fillStyle = lista[i] ? P.verde : P.rojo;
          ctx.beginPath(); ctx.arc(cxp, y, r, 0, Math.PI * 2); ctx.fill();
          D.texto(ctx, lista[i] ? '✓' : '✗', cxp, y + r * 0.42, { tam: r * 1.3, alinear: 'center', peso: 800, color: P.noche, fuente: 'texto' });
        } else {
          ctx.strokeStyle = P.gris; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(cxp, y, r - 2, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }

    function dibujarMarcador(ctx) {
      D.rect(ctx, 0, 140, 1080, 150, 0, P.noche);
      if (modo === 'solo') {
        D.texto(ctx, 'GOLES SEGUIDOS', 60, 186, { tam: 26, color: P.gris });
        D.texto(ctx, solo.racha, 60, 272, { tam: 88, peso: 800, color: solo.racha ? P.naranja : P.blanco });
        D.texto(ctx, 'MEJOR', 470, 186, { tam: 26, color: P.gris, alinear: 'center' });
        D.texto(ctx, solo.mejor, 470, 272, { tam: 88, peso: 800, alinear: 'center' });
        D.texto(ctx, 'ERRADOS', 1020, 186, { tam: 26, color: P.gris, alinear: 'right' });
        for (let i = 0; i < 3; i++) {
          const x = 1020 - 30 - (2 - i) * 74, y = 240;
          if (i < solo.errados) { ctx.fillStyle = P.rojo; ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2); ctx.fill(); D.texto(ctx, '✗', x, y + 13, { tam: 38, alinear: 'center', color: P.noche, fuente: 'texto', peso: 800 }); }
          else { ctx.strokeStyle = P.gris; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 28, 0, Math.PI * 2); ctx.stroke(); }
        }
        return;
      }
      if (esUno()) {
        jugadores.forEach((j, i) => {
          const y = 196 + i * 70;
          const patea = pateador === j && fase !== 'fin';
          if (patea) D.rect(ctx, 40, y - 34, 1000, 62, 6, P.panel2);
          ctx.fillStyle = j.color; ctx.beginPath(); ctx.arc(76, y - 3, 14, 0, Math.PI * 2); ctx.fill();
          D.texto(ctx, j.nombre, 104, y + 10, { tam: 38, peso: 700, fuente: 'texto' });
          puntitos(ctx, 420, y - 3, tanda[i], 5, 20);
          D.texto(ctx, tanda[i].filter(Boolean).length, 1010, y + 14, { tam: 56, peso: 800, alinear: 'right', color: patea ? P.naranja : P.blanco });
        });
        if (tandaInfo.muerteSubita && !tandaInfo.terminado) D.texto(ctx, 'MUERTE SÚBITA', 540, 160, { tam: 22, alinear: 'center', color: P.naranja });
        return;
      }
      // torneo: 2 columnas × 3 filas
      const lista = jugadores;
      lista.forEach((j, i) => {
        const col = i % 2, fila = Math.floor(i / 2);
        const x = 50 + col * 510, y = 178 + fila * 46;
        const t = tor[j.id];
        if (pateador === j && fase !== 'fin') D.rect(ctx, x - 12, y - 30, 500, 42, 6, P.panel2);
        ctx.fillStyle = j.color; ctx.beginPath(); ctx.arc(x + 8, y - 9, 9, 0, Math.PI * 2); ctx.fill();
        D.texto(ctx, j.nombre.slice(0, 11), x + 26, y + 2, { tam: 28, peso: 700, fuente: 'texto' });
        puntitos(ctx, x + 236, y - 9, t.tiros, 5, 13);
        D.texto(ctx, t.goles, x + 478, y + 6, { tam: 38, peso: 800, alinear: 'right' });
      });
    }

    function dibujarInfo(ctx) {
      D.rect(ctx, 0, 1800, 1080, 120, 0, 'rgba(11,29,48,0.88)');
      let linea1 = '', linea2 = '';
      if (fase === 'apuntar') {
        const resta = Math.max(0, Math.ceil(LIMITE_TIRO - tf));
        if (modo === 'solo') {
          linea1 = 'Hacé clic en la pelota y arrastrá hacia el arco';
          linea2 = `Más rápido = más fuerte · trazo curvo = comba · ${resta} s`;
        } else {
          linea1 = `Patea ${pateador.nombre}: deslizá en tu celu`;
          linea2 = esUno() ? `Ataja ${arquero.nombre}: ${zonaElegida == null ? 'elegí dónde tirarte' : 'ya eligió ✓'} · ${resta} s` : `${resta} s para patear`;
        }
        if (aviso) linea2 = aviso;
        D.texto(ctx, resta, 1020, 1880, { tam: 70, peso: 800, alinear: 'right', color: resta <= 5 ? P.rojo : P.gris });
      } else if (fase === 'carrera') {
        linea1 = pateador ? `${pateador.nombre} toma carrera…` : 'Tomando carrera…';
        linea2 = esUno() ? `${arquero.nombre}: ${zonaElegida == null ? '¡elegí rápido!' : 'ya eligió ✓'}` : '';
      } else if (fase === 'preparar') {
        linea1 = modo === 'solo' ? `Tiro ${n}` : `Patea ${pateador.nombre}`;
        linea2 = esUno() ? `Ataja ${arquero.nombre}` : esTorneo() ? `Tiro ${Math.ceil(n / jugadores.length)} de 5` : '';
      }
      D.texto(ctx, linea1, 60, 1850, { tam: 40, peso: 700, fuente: 'texto' });
      D.texto(ctx, linea2, 60, 1896, { tam: 30, peso: 600, fuente: 'texto', color: aviso && fase === 'apuntar' ? P.naranja : P.gris });
    }

    function dibujarTexto(ctx) {
      if (fase === 'preparar') {
        const k = Math.min(1, tf / 0.3);
        ctx.globalAlpha = tf > T_PREPARAR - 0.3 ? (T_PREPARAR - tf) / 0.3 : 1;
        D.rect(ctx, 0, 1040, 1080, 200, 0, 'rgba(11,29,48,0.85)');
        const t = modo === 'solo' ? `Tiro ${n}` : `Patea ${pateador.nombre}`;
        ctx.save(); ctx.translate(540, 1170); ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k);
        D.texto(ctx, t, 0, 0, { tam: 110, alinear: 'center', peso: 800 });
        ctx.restore();
        ctx.globalAlpha = 1;
        return;
      }
      if (!texto) return;
      const k = Math.min(1, texto.tiempo / 0.25);
      const esc = texto.t === '¡GOOOL!' ? 0.6 + 0.4 * D.salida(k) + Math.sin(texto.tiempo * 9) * 0.03 : 0.6 + 0.4 * D.salida(k);
      ctx.save();
      ctx.translate(540, 1200);
      ctx.scale(esc, esc);
      D.texto(ctx, texto.t, 0, 0, { tam: 200, alinear: 'center', peso: 800, color: texto.color, borde: 16, colorBorde: P.noche });
      ctx.restore();
      if (texto.sub) D.texto(ctx, texto.sub, 540, 1300, { tam: 46, alinear: 'center', peso: 700, fuente: 'texto', borde: 8, colorBorde: P.noche });
    }

    // ------------------------------------------------------------ actualización de la animación
    function actualizarVuelo(dt) {
      const v = vuelo;
      // cámara lenta en el último tramo de un tiro pegado al palo
      const lento = v.lento && v.t > 0.45 * v.dur && !v.fin;
      const paso = dt * (lento ? 0.3 : 1);
      v.t += paso;
      v.lentoAhora = lento;
      const k = Math.min(1, v.t / v.dur);
      const e = k; // velocidad casi constante; se achica con la distancia
      const x = (1 - e) * (1 - e) * v.S.x + 2 * (1 - e) * e * v.C.x + e * e * v.E.x;
      const y = (1 - e) * (1 - e) * v.S.y + 2 * (1 - e) * e * v.C.y + e * e * v.E.y;
      pelota.x = x; pelota.y = y;
      pelota.r = lerp(BALON.r, R_ARCO, Math.pow(e, 0.7));
      pelota.giro += paso * (8 + tiro.fuerza * 18) * (tiro.comba >= 0 ? 1 : -1);
      const pisoY = lerp(v.S.y, GLINEA, e);
      pelota.sombra = { x: lerp(v.S.x, v.E.x, e), y: pisoY + 4 };
      // arquero
      const kk = Math.max(0, Math.min(1, (k - 0.12) / 0.55));
      actualizarArquero(D.salida(kk));
      if (k >= 1 && !v.fin) {
        v.fin = true;
        llegar();
      }
    }

    function actualizarArquero(k) {
      if (!keeper.hacia) return;
      keeper.k = k;
      keeper.x = lerp(keeper.desde.x, keeper.hacia.x, k);
      keeper.y = lerp(keeper.desde.y, keeper.hacia.y, k);
      const lado = keeper.hacia.x;
      if (Math.abs(lado) > 0.25) {
        const ang = (keeper.hacia.y > 0.5 ? 60 : 82) * Math.PI / 180;
        keeper.ang = Math.sign(lado) * ang * k;
        keeper.agachado = 0;
      } else {
        keeper.ang = 0;
        keeper.agachado = keeper.hacia.y < 0.3 ? k : 0;
        if (keeper.hacia.y > 0.6) keeper.y = lerp(keeper.desde.y, keeper.hacia.y - 0.12, k);
      }
    }

    function actualizarDespues(dt) {
      // después de llegar: rebote o pelota dentro de la red
      const v = vuelo;
      if (!v) return;
      v.post = (v.post || 0) + dt;
      const k = Math.min(1, v.post / 0.6);
      if (v.rebote) {
        pelota.x = lerp(v.E.x, v.rebote.x, D.salida(k));
        pelota.y = lerp(v.E.y, v.rebote.y, D.salida(k)) - Math.sin(k * Math.PI) * 60;
        pelota.r = lerp(R_ARCO, v.rebote.r, k);
        pelota.giro += dt * 10;
        pelota.sombra = { x: pelota.x, y: lerp(GLINEA, v.rebote.y, k) + 6 };
      } else if (res.resultado === 'gol') {
        const fondo = { x: GX + tiro.x * FONDO.hw, y: lerp(FONDO.abajo, FONDO.arriba, Math.min(1, tiro.y)) };
        pelota.x = lerp(v.E.x, fondo.x, D.salida(k));
        pelota.y = lerp(v.E.y, fondo.y, D.salida(k)) + (k > 0.6 ? (k - 0.6) * 60 : 0);
        pelota.r = lerp(R_ARCO, R_ARCO * 0.85, k);
        pelota.sombra = null;
      } else if (res.resultado === 'afuera') {
        pelota.visible = k < 0.5;
        pelota.y -= dt * 200; pelota.r = Math.max(6, pelota.r - dt * 10);
        pelota.sombra = null;
      }
    }

    // ------------------------------------------------------------ interfaz de la plataforma
    return {
      iniciar(contexto, lista, m) {
        cx = contexto; modo = m; jugadores = lista;
        rnd = L.azar((Date.now() ^ (Math.random() * 1e9)) >>> 0);
        const cfg = cx.config.penales || {};
        dificultad = L.DIFICULTAD[cfg.dificultad] ? cfg.dificultad : 'normal';
        colores = cx.config.colores;
        jugadores.forEach((j) => {
          arq[j.id] = { atajadas: 0, recibidos: 0 };
          tor[j.id] = { tiros: [], goles: 0, prec: 0, historial: [] };
        });
        if (esTorneo()) {
          ordenTorneo = [];
          for (let r = 0; r < 5; r++) jugadores.forEach((j) => ordenTorneo.push(j));
        }
        fase = 'intro'; tf = 0;
        cx.sonido.hinchada(false);
      },

      recibirInput(id, datos) {
        if (esUno() && arquero && id === arquero.id && datos.zona != null && (fase === 'preparar' || fase === 'apuntar' || fase === 'carrera')) {
          const z = Number(datos.zona);
          if (Number.isInteger(z) && z >= 0 && z < 6) {
            if (zonaElegida == null) cx.sonido.tono(880, 0.05, { tipo: 'triangle', volumen: 0.1 });
            zonaElegida = z;
          }
          return;
        }
        if (pateador && id === pateador.id && Array.isArray(datos.trazo) && fase === 'apuntar') {
          const pts = datos.trazo.slice(0, 64).map((p) => ({ x: Number(p.x), y: Number(p.y), t: Number(p.t) }));
          recibirTiro(L.trazoATiro(pts, { perfil: 'celu', rnd }));
        }
      },

      puntero(x, y, tipo) {
        if (modo !== 'solo' || fase !== 'apuntar') return;
        const t = performance.now();
        if (tipo === 'abajo') {
          if (Math.hypot(x - BALON.x, y - BALON.y) > 220) { aviso = 'Empezá el trazo desde la pelota'; return; }
          trazo = [{ x, y, t }];
          aviso = '';
        } else if (tipo === 'mover' && trazo) {
          trazo.push({ x, y, t });
          if (trazo.length > 300) trazo.splice(1, 1);
        } else if (tipo === 'arriba' && trazo) {
          trazo.push({ x, y, t });
          const pts = trazo;
          trazo = null;
          const t0 = pts[0].t;
          const tiroMouse = trazoMouseATiro(pts.map((p) => ({ x: p.x, y: p.y, t: p.t - t0 })));
          if (!tiroMouse) { aviso = 'Arrastrá más largo, desde la pelota hacia el arco'; return; }
          recibirTiro(tiroMouse);
        }
      },

      tecla() {},

      actualizar(dt) {
        tf += dt;
        if (texto) texto.tiempo += dt;
        if (red) red.t += dt;
        festejo = Math.max(0, festejo - dt);
        murmullo -= dt;
        if (murmullo <= 0) { murmullo = 3.2; cx.sonido.ruido(3.4, { filtro: 650, q: 0.4, volumen: 0.05, ataque: 1.2 }); }

        if (fase === 'intro' && tf >= 0.6) nuevoTurno();
        else if (fase === 'preparar' && tf >= T_PREPARAR) empezarApuntar();
        else if (fase === 'apuntar' && tf >= LIMITE_TIRO) {
          aviso = '';
          tiro = L.tiroDebil();
          fase = 'carrera'; tf = 0;
          cx.actualizarControles();
        } else if (fase === 'carrera') {
          const dur = duracionCarrera();
          carrera = Math.min(1, tf / dur);
          if (tf >= dur) patear();
        } else if (fase === 'vuelo') {
          actualizarVuelo(dt);
        } else if (fase === 'resultado') {
          actualizarDespues(dt);
          if (tf >= T_RESULTADO) {
            if (terminoPartida()) { fase = 'fin'; tf = 0; cx.sonido.silbato(true); cx.actualizarControles(); }
            else nuevoTurno();
          }
        }
      },

      dibujar(ctx) {
        const salto = festejo > 0 ? 1 + (Math.floor(festejo * 8) % 2) : 0;
        const fondo = D.capa(`pen-fondo|${colores.principal}|${colores.secundario}|${!!(cx.logo && cx.logo.complete && cx.logo.naturalWidth)}`, 1080, 1920, (g) => {
          g.fillStyle = P.noche; g.fillRect(0, 0, 1080, 1920);
          dibujarCancha(g);
          dibujarCarteles(g);
          dibujarArcoFijo(g);
        });
        ctx.drawImage(fondo, 0, 0);
        const tribuna = D.capa(`pen-trib${salto}|${colores.principal}|${salto}`, 1080, 190, (g) => {
          g.translate(0, -290);
          dibujarTribuna(g, salto);
        });
        ctx.drawImage(tribuna, 0, 290);
        D.encabezado(ctx, cx, 'Penales', cx.modo.nombre);
        dibujarMarcador(ctx);
        dibujarRed(ctx);
        // la pelota va detrás del arquero si entró o la atajó por detrás; delante mientras viene
        const pelotaAtras = fase === 'resultado' && res && res.resultado === 'gol';
        if (pelotaAtras) dibujarPelota(ctx);
        dibujarArquero(ctx);
        dibujarPalos(ctx);
        if (fase === 'preparar' || fase === 'apuntar' || fase === 'carrera') dibujarPateador(ctx);
        if (!pelotaAtras) dibujarPelota(ctx);
        if (trazo && trazo.length > 1) {
          ctx.strokeStyle = P.naranja; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath(); trazo.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
        }
        if (vuelo && vuelo.lentoAhora) D.texto(ctx, 'CÁMARA LENTA', 1020, 1000, { tam: 30, alinear: 'right', color: P.naranja, borde: 6 });
        dibujarTexto(ctx);
        dibujarInfo(ctx);
        if (fase === 'fin') {
          D.rect(ctx, 0, 1040, 1080, 220, 0, 'rgba(11,29,48,0.9)');
          D.texto(ctx, '¡Final!', 540, 1190, { tam: 130, alinear: 'center', peso: 800, color: P.naranja });
        }
      },

      controlCelular(id) {
        const j = jugadores.find((x) => x.id === id);
        if (!j) return null;
        if (fase === 'fin') return { tipo: 'espera', id: 'fin', titulo: 'Terminó la tanda', grande: 'Mirá la tele' };
        if (fase === 'intro') return { tipo: 'espera', id: 'intro', titulo: 'Penales', grande: 'Ya empieza' };
        const esPateador = pateador && pateador.id === id;
        const esArquero = arquero && arquero.id === id;
        if (esPateador) {
          if (fase === 'preparar') return { tipo: 'espera', id: `prep-${n}`, titulo: '¡Te toca patear!', grande: 'Preparate', mensaje: arquero ? `Ataja ${arquero.nombre}` : 'Contra el arquero de la compu' };
          if (fase === 'apuntar') return { tipo: 'deslizar', id: `tiro-${n}-${intento}`, titulo: '¡Pateá!', mensaje: aviso || 'Deslizá desde la pelota hacia el arco. Rápido = fuerte' };
          if (fase === 'carrera' || fase === 'vuelo') return { tipo: 'espera', id: `pateo-${n}`, titulo: '¡Pateaste!', grande: 'Mirá la tele' };
          return { tipo: 'espera', id: `res-${n}`, titulo: res ? TEXTOS[res.resultado].t : '', grande: 'Mirá la tele' };
        }
        if (esArquero) {
          if (fase === 'preparar' || fase === 'apuntar' || fase === 'carrera') {
            return {
              tipo: 'zonas', id: `arq-${n}`, columnas: 3, filas: 2, arco: true, etiquetas: ['↖', '↑', '↗', '↙', '↓', '↘'],
              titulo: '¡Atajá!', mensaje: `Patea ${pateador.nombre}. Elegí dónde tirarte (es secreto). Si no elegís, te quedás en el medio.`,
            };
          }
          return { tipo: 'espera', id: `arq-res-${n}`, titulo: res ? TEXTOS[res.resultado].t : '', grande: 'Mirá la tele' };
        }
        const quien = pateador ? `Patea ${pateador.nombre}` : '';
        return { tipo: 'espera', id: `ver-${n}`, titulo: quien, mensaje: esTorneo() ? 'Esperá tu turno' : '', grande: 'Mirá la tele' };
      },

      terminado() { return fase === 'fin' && tf >= T_FIN; },

      resultados() {
        if (modo === 'solo') {
          return {
            titulo: `${solo.mejor} ${solo.mejor === 1 ? 'gol seguido' : 'goles seguidos'}`,
            subtitulo: `${solo.goles} goles en ${solo.tiros} tiros`,
            filas: [{ nombre: 'Vos', valor: `${solo.mejor} seguidos`, detalle: `${solo.goles} de ${solo.tiros}`, esJugadorSolo: true, destacado: true }],
            registros: [{ categoria: 'seguidos', puntaje: solo.mejor, detalle: { goles: solo.goles, tiros: solo.tiros } }],
          };
        }
        if (esUno()) {
          const g = tanda.map((t) => t.filter(Boolean).length);
          const ganador = tandaInfo.ganador != null ? jugadores[tandaInfo.ganador] : null;
          const celular = {};
          jugadores.forEach((j, i) => {
            const a = arq[j.id];
            celular[j.id] = { titulo: ganador === j ? '¡Ganaste!' : 'Perdiste', mensaje: `${g[i]} goles · atajaste ${a.atajadas} de ${a.recibidos}` };
          });
          const registros = jugadores.filter((j) => arq[j.id].recibidos >= 5).map((j) => ({
            categoria: 'arquero', puntaje: Math.round(100 * arq[j.id].atajadas / arq[j.id].recibidos), jugadorIds: [j.id],
            detalle: { atajadas: arq[j.id].atajadas, recibidos: arq[j.id].recibidos, texto: `atajó ${arq[j.id].atajadas} de ${arq[j.id].recibidos}` },
          }));
          return {
            titulo: ganador ? `¡Ganó ${ganador.nombre}!` : 'Empate',
            subtitulo: `${g[0]} a ${g[1]}${tandaInfo.muerteSubita ? ' en muerte súbita' : ''}`,
            filas: jugadores.map((j, i) => ({
              nombre: j.nombre, color: j.color, valor: `${g[i]} goles`, destacado: ganador === j,
              detalle: `Como arquero atajó ${arq[j.id].atajadas} de ${arq[j.id].recibidos}`,
            })).sort((a, b) => b.destacado - a.destacado),
            registros,
            celular,
          };
        }
        const orden = jugadores.slice().sort((a, b) => tor[b.id].goles - tor[a.id].goles || tor[b.id].prec - tor[a.id].prec);
        const precisionPct = (j) => Math.round(100 * tor[j.id].prec / 5);
        const ganador = orden[0];
        const empate = orden.length > 1 && tor[orden[1].id].goles === tor[ganador.id].goles;
        const celular = {};
        orden.forEach((j, i) => { celular[j.id] = { titulo: i === 0 ? '¡Ganaste el torneo!' : `Puesto ${i + 1}`, mensaje: `${tor[j.id].goles} goles de 5 · precisión ${precisionPct(j)}%` }; });
        return {
          titulo: `¡Ganó ${ganador.nombre}!`,
          subtitulo: `${tor[ganador.id].goles} goles de 5${empate ? ` · desempate por precisión (${precisionPct(ganador)}%)` : ''}`,
          filas: orden.map((j, i) => ({ nombre: j.nombre, color: j.color, valor: `${tor[j.id].goles} goles`, detalle: `Precisión ${precisionPct(j)}%`, destacado: i === 0 })),
          registros: [{ categoria: 'torneo', puntaje: tor[ganador.id].goles, jugadorIds: [ganador.id], detalle: { precision: precisionPct(ganador), rivales: jugadores.length - 1, texto: `ganó contra ${jugadores.length - 1}` } }],
          celular,
        };
      },

      // para las pruebas automáticas
      _estado() {
        return {
          fase, n, pateador: pateador && pateador.id, arquero: arquero && arquero.id, zonaElegida, zonaArq,
          tiro, resultado: res && res.resultado, solo: Object.assign({}, solo, { historial: undefined }),
          tanda: tanda.map((t) => t.slice()), tandaInfo, torneo: jugadores.map((j) => ({ nombre: j.nombre, goles: tor[j.id].goles, tiros: tor[j.id].tiros.length })),
        };
      },
    };
  });
})();
