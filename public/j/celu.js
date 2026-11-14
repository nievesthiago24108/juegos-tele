/*
 * Celular: entra a la sala con un nombre, reconecta solo (token en localStorage) y muestra el
 * control que pide el juego: "botones", "zonas", "deslizar" o "espera".
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CLAVE = 'juegos-tele:jugador';

  const yo = { id: null, nombre: null, color: null, token: null };
  let sala = { fase: 'menu', jugadores: [] };
  let control = null;
  let juegos = [];
  let desfase = 0; // hora del servidor - hora del celu (para las marcas de tiempo de los toques)

  function leerGuardado() {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || {}; } catch { return {}; }
  }
  function guardar(datos) {
    try { localStorage.setItem(CLAVE, JSON.stringify(datos)); } catch { /* modo privado: sin reconexión automática */ }
  }

  const socket = io({ transports: ['websocket', 'polling'] });

  // ---------------------------------------------------------------- reloj
  async function sincronizarReloj() {
    let mejor = null;
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const ts = await new Promise((res) => socket.timeout(2000).emit('reloj', (err, t) => res(err ? null : t)));
      const t1 = Date.now();
      if (ts == null) continue;
      const rtt = t1 - t0;
      if (!mejor || rtt < mejor.rtt) mejor = { rtt, off: ts - (t0 + t1) / 2 };
    }
    if (mejor) desfase = mejor.off;
  }
  const ahoraServidor = () => Math.round(Date.now() + desfase);

  // ---------------------------------------------------------------- conexión
  socket.on('connect', () => {
    $('conexion').classList.add('oculto');
    const g = leerGuardado();
    if (g.token) unirse(g.nombre, g.token, true);
    sincronizarReloj();
  });
  socket.on('disconnect', () => { if (yo.id) $('conexion').classList.remove('oculto'); });
  socket.on('sala', (s) => { sala = s || sala; render(); });
  socket.on('control', (c) => {
    const anterior = control;
    control = c;
    if (!c || !anterior || c.id !== anterior.id || c.tipo !== anterior.tipo) estadoControl = {};
    render();
  });
  socket.on('expulsado', () => {
    guardar({});
    Object.assign(yo, { id: null, token: null });
    mostrar('unirse');
  });

  function unirse(nombre, token, silencioso) {
    $('btn-entrar').disabled = true;
    socket.timeout(5000).emit('jugador:unirse', { nombre, token }, (err, r) => {
      $('btn-entrar').disabled = false;
      if (err || !r || !r.ok) {
        if (silencioso) { guardar({ nombre }); mostrar('unirse'); $('nombre').value = nombre || ''; return; }
        $('error-unirse').textContent = (r && r.error) || 'No hay conexión con la notebook. ¿Estás en la misma red wifi?';
        return;
      }
      Object.assign(yo, { id: r.id, nombre: r.nombre, color: r.color, token: r.token });
      guardar({ nombre: r.nombre, token: r.token });
      sala = r.sala || sala;
      $('error-unirse').textContent = '';
      render();
    });
  }

  $('form-unirse').addEventListener('submit', (e) => {
    e.preventDefault();
    const n = $('nombre').value.replace(/\s+/g, ' ').trim();
    if (!/^[\p{L}\p{N} ]{2,14}$/u.test(n)) {
      $('error-unirse').textContent = 'Usá de 2 a 14 letras o números.';
      return;
    }
    unirse(n, leerGuardado().token || null, false);
  });
  $('btn-salir').addEventListener('click', () => {
    socket.emit('jugador:salir');
    guardar({ nombre: yo.nombre });
    Object.assign(yo, { id: null, token: null });
    mostrar('unirse');
  });

  const accion = (a) => socket.emit('anfitrion:accion', a);
  $('btn-otra').addEventListener('click', () => accion({ accion: 'otra' }));
  $('btn-volver').addEventListener('click', () => accion({ accion: 'menu' }));
  $('btn-menu-anf').addEventListener('click', () => accion({ accion: 'menu' }));

  // ---------------------------------------------------------------- pantallas
  function mostrar(cual) {
    ['unirse', 'sala', 'control'].forEach((p) => $('pant-' + p).classList.toggle('oculto', p !== cual));
  }

  const soyAnfitrion = () => !!(sala.jugadores || []).find((j) => j.id === yo.id && j.anfitrion);

  function render() {
    if (!yo.id) { mostrar('unirse'); return; }
    const anf = soyAnfitrion();
    if (control && sala.fase !== 'menu') {
      mostrar('control');
      $('ctl-color').style.background = yo.color;
      $('ctl-nombre').textContent = yo.nombre;
      $('btn-menu-anf').classList.toggle('oculto', !anf || sala.fase !== 'jugando');
      $('ctl-anfitrion').classList.toggle('oculto', !(anf && sala.fase === 'resultados'));
      dibujarControl();
      return;
    }
    mostrar('sala');
    $('yo-color').style.background = yo.color;
    $('yo-nombre').textContent = yo.nombre;
    $('yo-rol').textContent = anf ? 'Anfitrión' : 'Jugador';
    $('sala-espera').classList.toggle('oculto', anf && sala.fase === 'menu');
    $('sala-anfitrion').classList.toggle('oculto', !(anf && sala.fase === 'menu'));
    $('sala-texto').textContent = !sala.teleConectada ? 'La tele no está conectada.'
      : sala.fase === 'menu' ? 'Esperando que el anfitrión elija un juego…' : 'Hay una partida en curso.';
    $('sala-jugadores').innerHTML = (sala.jugadores || []).map((j) =>
      `<li class="${j.conectado ? '' : 'fuera'}"><span class="punto" style="background:${esc(j.color)}"></span>${esc(j.nombre)}${j.id === yo.id ? ' (vos)' : ''}</li>`).join('');
    if (anf && sala.fase === 'menu') dibujarMenuAnfitrion();
  }

  async function cargarJuegos() {
    try { juegos = await fetch('/api/juegos').then((r) => r.json()); } catch { juegos = []; }
    render();
  }

  function dibujarMenuAnfitrion() {
    const n = (sala.jugadores || []).filter((j) => j.conectado).length;
    $('lista-juegos').innerHTML = juegos.map((j) => `<div class="anf-juego"><h3>${esc(j.nombre)}</h3><p>${esc(j.descripcion)}</p><div class="anf-modos">` +
      j.modos.map((m) => {
        const falta = m.celulares ? Math.max(0, m.min - n) : 0;
        const det = m.celulares ? (falta ? `faltan ${falta}` : `${m.min}–${m.max} celus`) : 'en la tele, con mouse';
        return `<button data-j="${esc(j.id)}" data-m="${esc(m.id)}" ${falta ? 'disabled' : ''}>${esc(m.nombre)}<small>${esc(det)}</small></button>`;
      }).join('') + '</div></div>').join('');
  }
  $('lista-juegos').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-j]');
    if (b) accion({ accion: 'elegir', juego: b.dataset.j, modo: b.dataset.m });
  });

  // ---------------------------------------------------------------- controles
  let estadoControl = {};
  let controlDibujado = null;

  function enviar(datos) {
    datos.t = ahoraServidor();
    socket.timeout(3000).emit('jugador:input', datos, () => {});
    if (navigator.vibrate) navigator.vibrate(25);
  }

  function dibujarControl() {
    const c = control;
    $('ctl-titulo').textContent = c.titulo || '';
    $('ctl-mensaje').textContent = c.mensaje || '';
    const clave = JSON.stringify(c);
    if (clave === controlDibujado && c.tipo !== 'zonas') return; // no rehacer (perdería el trazo en curso)
    controlDibujado = clave;
    const area = $('ctl-area');
    if (c.tipo === 'botones') return dibujarBotones(area, c);
    if (c.tipo === 'zonas') return dibujarZonas(area, c);
    if (c.tipo === 'deslizar') return dibujarDeslizar(area, c);
    area.innerHTML = `<div class="espera"><p class="grande">${esc(c.grande || 'Mirá la tele')}</p></div>`;
  }

  function dibujarBotones(area, c) {
    const lista = c.botones || [];
    const cols = c.columnas || (lista.length <= 1 ? 1 : 2);
    area.innerHTML = `<div class="grilla ${c.bloqueado ? 'bloqueada' : ''}" style="grid-template-columns:repeat(${cols},1fr)">` +
      lista.map((b) => `<button class="btn-color" data-id="${esc(b.id)}" style="background:${esc(b.color || '#5868AA')}" ${b.deshabilitado || c.bloqueado ? 'disabled' : ''}>` +
        `${b.simbolo ? Formas.svg(b.simbolo, '#fff') : ''}${b.texto ? `<span>${esc(b.texto)}</span>` : ''}</button>`).join('') + '</div>';
    area.querySelectorAll('.btn-color').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (btn.disabled) return;
        btn.classList.add('apretado');
        setTimeout(() => btn.classList.remove('apretado'), 140);
        const id = btn.dataset.id;
        enviar({ boton: isNaN(+id) ? id : +id });
      });
    });
  }

  function dibujarZonas(area, c) {
    const cols = c.columnas || 3;
    const filas = c.filas || 2;
    const elegida = estadoControl.zona != null ? estadoControl.zona : c.elegida;
    const etiquetas = c.etiquetas || [];
    let html = '';
    for (let i = 0; i < cols * filas; i++) {
      html += `<button class="zona ${elegida === i ? 'elegida' : ''}" data-i="${i}" ${c.bloqueado ? 'disabled' : ''}>${esc(etiquetas[i] || '')}</button>`;
    }
    const grilla = `<div class="grilla" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${filas},1fr)">${html}</div>`;
    area.innerHTML = c.arco ? `<div class="arco-marco">${grilla}</div>` : grilla;
    area.querySelectorAll('.zona').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (b.disabled) return;
        estadoControl.zona = +b.dataset.i;
        enviar({ zona: +b.dataset.i });
        area.querySelectorAll('.zona').forEach((x) => x.classList.toggle('elegida', x === b));
      });
    });
  }

  function dibujarDeslizar(area, c) {
    area.innerHTML = '<div class="deslizar"><canvas></canvas></div>';
    const caja = area.firstChild;
    const cv = caja.firstChild;
    const g = cv.getContext('2d');
    let puntos = [];
    let activo = false;
    const lanzado = () => !!estadoControl.lanzado || c.bloqueado;

    function medidas() {
      const r = caja.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return r;
    }
    let r = medidas();
    const pelota = () => ({ x: r.width / 2, y: r.height - Math.min(90, r.height * 0.14) });

    function pintar() {
      g.clearRect(0, 0, r.width, r.height);
      // arco de referencia arriba
      const aw = r.width * 0.7, ah = r.height * 0.16, ax = (r.width - aw) / 2, ay = r.height * 0.06;
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(ax, ay + ah); g.lineTo(ax, ay); g.lineTo(ax + aw, ay); g.lineTo(ax + aw, ay + ah); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
      for (let x = ax + 14; x < ax + aw; x += 14) { g.beginPath(); g.moveTo(x, ay); g.lineTo(x, ay + ah); g.stroke(); }
      for (let y = ay + 14; y < ay + ah; y += 14) { g.beginPath(); g.moveTo(ax, y); g.lineTo(ax + aw, y); g.stroke(); }
      // trazo
      if (puntos.length > 1) {
        g.strokeStyle = '#F2A33A'; g.lineWidth = 10; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath();
        puntos.forEach((p, i) => (i ? g.lineTo(p.px, p.py) : g.moveTo(p.px, p.py)));
        g.stroke();
      }
      const p = pelota();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(p.x, p.y, 30, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1b1b1b';
      g.beginPath(); g.arc(p.x, p.y, 10, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = '700 18px Barlow, sans-serif'; g.textAlign = 'center';
      g.fillText(lanzado() ? 'Listo' : 'Deslizá desde la pelota hacia el arco', r.width / 2, r.height - 18);
    }
    pintar();
    window.addEventListener('resize', () => { r = medidas(); pintar(); }, { once: true });

    const punto = (e) => {
      const b = caja.getBoundingClientRect();
      const px = e.clientX - b.left, py = e.clientY - b.top;
      return { px, py, x: px / b.height, y: py / b.height, t: performance.now() };
    };
    caja.addEventListener('pointerdown', (e) => {
      if (lanzado()) return;
      e.preventDefault();
      caja.setPointerCapture(e.pointerId);
      activo = true;
      puntos = [punto(e)];
      pintar();
    });
    caja.addEventListener('pointermove', (e) => {
      if (!activo) return;
      puntos.push(punto(e));
      if (puntos.length > 200) puntos.splice(1, 1);
      pintar();
    });
    const soltar = (e) => {
      if (!activo) return;
      activo = false;
      puntos.push(punto(e));
      const norm = puntos.map((p) => ({ x: p.x, y: p.y, t: Math.round(p.t) }));
      const a = Trazo.analizar(norm);
      if (!a || a.subida < 0.08) {
        $('ctl-mensaje').textContent = 'Deslizá más largo, desde la pelota hacia el arco.';
        puntos = [];
        pintar();
        return;
      }
      estadoControl.lanzado = true;
      const t0 = norm[0].t;
      enviar({ trazo: Trazo.simplificar(norm, 28).map((p) => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4), t: p.t - t0 })) });
      caja.classList.add('listo');
      $('ctl-mensaje').textContent = '¡Pateaste! Mirá la tele.';
      pintar();
    };
    caja.addEventListener('pointerup', soltar);
    caja.addEventListener('pointercancel', () => { activo = false; puntos = []; pintar(); });
    if (lanzado()) caja.classList.add('listo');
  }

  // ---------------------------------------------------------------- arranque
  fetch('/api/config').then((r) => r.json()).then((c) => {
    $('escuela').textContent = c.nombreEscuela;
    document.documentElement.style.setProperty('--azul', c.colores.principal);
    document.documentElement.style.setProperty('--celeste', c.colores.secundario);
    document.documentElement.style.setProperty('--naranja', c.colores.acento);
  }).catch(() => {});
  const g = leerGuardado();
  if (g.nombre) $('nombre').value = g.nombre;
  cargarJuegos();
  render();
  window.Celu = { get yo() { return yo; }, get control() { return control; }, get sala() { return sala; } };
})();
