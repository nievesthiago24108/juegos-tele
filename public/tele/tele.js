/*
 * Plataforma de la tele: escala y gira el lienzo de 1080x1920, muestra el menú, carga los
 * juegos de public/juegos/<id>/ y les pasa el mouse, el teclado y lo que mandan los celulares.
 * La interfaz que tiene que cumplir cada juego está explicada en JUEGOS.md.
 */
(function () {
  'use strict';
  const ANCHO = 1080;
  const ALTO = 1920;

  const $ = (id) => document.getElementById(id);
  const escenario = $('escenario');
  const lienzo = $('lienzo');
  const ctx = lienzo.getContext('2d');
  const params = new URLSearchParams(location.search);

  const estado = {
    config: null,
    juegos: [],              // manifiestos (juego.json)
    fabricas: {},            // id → función que crea una instancia del juego
    sala: { jugadores: [] },
    fase: 'menu',            // menu | jugando | resultados | nombre
    sel: { juego: 0, modo: 0 },
    actual: null,            // { manifiesto, modo, instancia, jugadores, partidaId, solo }
    rotacion: 0,
    escala: 1,
    ultimoResultado: null,
    controlesEnviados: {},
    escPendiente: 0,
  };
  window.Plataforma = {
    registrar(id, fabrica) { estado.fabricas[id] = fabrica; },
    get estado() { return estado; },
    // para las pruebas automáticas
    get juego() { return estado.actual && estado.actual.instancia; },
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------- escala y rotación
  function ajustar() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const girada = estado.rotacion !== 0;
    const anchoDisp = girada ? vh : vw;
    const altoDisp = girada ? vw : vh;
    const margen = (estado.config ? estado.config.margenSeguridad : 4) / 100;
    estado.escala = Math.min(anchoDisp * (1 - 2 * margen) / ANCHO, altoDisp * (1 - 2 * margen) / ALTO);
    escenario.style.transform = `translate(-50%, -50%) rotate(${estado.rotacion}deg) scale(${estado.escala})`;
  }

  /** Coordenadas de la ventana → coordenadas del lienzo de 1080x1920 (deshace escala y giro) */
  function aLienzo(cx, cy) {
    const dx = cx - window.innerWidth / 2;
    const dy = cy - window.innerHeight / 2;
    const a = -estado.rotacion * Math.PI / 180;
    const x = dx * Math.cos(a) - dy * Math.sin(a);
    const y = dx * Math.sin(a) + dy * Math.cos(a);
    return { x: x / estado.escala + ANCHO / 2, y: y / estado.escala + ALTO / 2 };
  }
  window.Plataforma.aLienzo = aLienzo;

  function rotar() {
    const orden = [0, 90, -90];
    estado.rotacion = orden[(orden.indexOf(estado.rotacion) + 1) % orden.length];
    ajustar();
    cartel(estado.rotacion === 0 ? 'Pantalla sin girar' : `Pantalla girada ${estado.rotacion}°`);
  }

  window.addEventListener('resize', ajustar);

  // ---------------------------------------------------------------- cursor y pantalla completa
  let timerCursor = 0;
  function moverCursor() {
    document.body.classList.remove('sin-cursor');
    clearTimeout(timerCursor);
    timerCursor = setTimeout(() => document.body.classList.add('sin-cursor'), 3000);
  }
  function pantallaCompleta() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => cartel('El navegador no dejó poner pantalla completa'));
  }

  let timerCartel = 0;
  function cartel(texto, ms) {
    const el = $('cartel');
    el.textContent = texto;
    el.classList.remove('oculto');
    clearTimeout(timerCartel);
    timerCartel = setTimeout(() => el.classList.add('oculto'), ms || 2200);
  }

  function sacudir() {
    escenario.classList.remove('sacude');
    void escenario.offsetWidth; // reinicia la animación
    escenario.classList.add('sacude');
  }

  // ---------------------------------------------------------------- conexión con el servidor
  const socket = io({ transports: ['websocket', 'polling'] });
  socket.on('connect', () => {
    socket.emit('tele:hola', (r) => {
      if (r && r.sala) actualizarSala(r.sala);
      avisarFase();
    });
  });
  socket.on('sala', actualizarSala);
  socket.on('tele:reemplazada', () => {
    $('bloqueo').classList.remove('oculto');
    socket.disconnect();
  });
  socket.on('input', (m) => {
    const a = estado.actual;
    if (estado.fase !== 'jugando' || !a || !m) return;
    if (!a.jugadores.some((j) => j.id === m.jugadorId)) return;
    llamar('recibirInput', m.jugadorId, m.datos || {}, m.ts);
  });
  socket.on('juego:servidor', (datos) => { if (estado.fase === 'jugando') llamar('mensajeServidor', datos); });
  socket.on('jugador:conexion', (m) => {
    if (!m) return;
    const a = estado.actual;
    if (a) {
      const j = a.jugadores.find((x) => x.id === m.jugadorId);
      if (j) {
        j.conectado = m.conectado;
        if (estado.fase === 'jugando') llamar('conexion', m.jugadorId, m.conectado);
        if (m.conectado) delete estado.controlesEnviados[m.jugadorId];
      }
    }
  });
  socket.on('anfitrion', (m) => {
    if (!m) return;
    if (m.accion === 'elegir' && estado.fase === 'menu') {
      const ji = estado.juegos.findIndex((j) => j.id === m.juego);
      if (ji < 0) return;
      const mi = estado.juegos[ji].modos.findIndex((x) => x.id === m.modo);
      estado.sel = { juego: ji, modo: Math.max(0, mi) };
      dibujarMenu();
      empezarSeleccion();
    } else if (m.accion === 'menu') {
      volverAlMenu();
    } else if (m.accion === 'otra' && estado.fase === 'resultados') {
      jugarOtraVez();
    } else if (m.accion === 'tecla' && m.tecla) {
      teclaGlobal({ code: m.tecla, key: m.tecla, preventDefault() {}, desdeCelu: true });
    }
  });
  socket.on('ranking:cambio', () => cargarRecords());
  socket.on('connect_error', () => {});

  function avisarFase() {
    const a = estado.actual;
    socket.emit('tele:fase', {
      fase: estado.fase === 'nombre' ? 'resultados' : estado.fase,
      juego: a && estado.fase !== 'menu' ? a.manifiesto.id : null,
      modo: a && estado.fase !== 'menu' ? a.modo.id : null,
      partidaId: a ? a.partidaId : null,
    });
  }

  function actualizarSala(s) {
    if (!s) return;
    estado.sala = s;
    if (estado.fase === 'menu') dibujarJugadores();
  }

  const conectados = () => (estado.sala.jugadores || []).filter((j) => j.conectado);

  // ---------------------------------------------------------------- menú
  let records = {};
  async function cargarRecords() {
    try {
      const r = await fetch('/api/ranking?n=10').then((x) => x.json());
      records = {};
      (r.juegos || []).forEach((j) => { records[j.id] = j; });
      rankingClave = '';
      if (estado.fase === 'menu') dibujarRanking();
    } catch { /* sin ranking no pasa nada */ }
  }

  function faltan(modo) {
    if (!modo.celulares) return 0;
    return Math.max(0, modo.min - conectados().length);
  }
  const rangoModo = (m) => (m.celulares ? (m.min === m.max ? `${m.min} celulares` : `${m.min} a ${m.max} celulares`) : 'mouse y teclado');

  function dibujarMenu() {
    const ul = $('lista-juegos');
    ul.innerHTML = estado.juegos.map((j, ji) => {
      const activo = ji === estado.sel.juego;
      const modos = j.modos.map((m, mi) => {
        const f = faltan(m);
        const cls = ['modo', activo && mi === estado.sel.modo ? 'activo' : '', f ? 'falta' : ''].join(' ');
        return `<button class="${cls}" data-j="${ji}" data-m="${mi}">${esc(m.nombre)}<small>${esc(f ? `faltan ${f}` : rangoModo(m))}</small></button>`;
      }).join('');
      return `<li class="juego ${activo ? 'activo' : ''}" data-j="${ji}"><h3>${esc(j.nombre)}</h3><p>${esc(j.descripcion)}</p><div class="modos">${modos}</div></li>`;
    }).join('');
    dibujarJugadores();
    rankingClave = '';
    dibujarRanking();
  }

  function dibujarJugadores() {
    const lista = estado.sala.jugadores || [];
    $('cant-jugadores').textContent = lista.length ? `${lista.length}/${estado.sala.maxJugadores || 6}` : '';
    $('jugadores').innerHTML = lista.length ? lista.map((j) => {
      const tag = j.anfitrion ? 'Anfitrión' : j.conectado ? '' : 'Sin conexión';
      return `<li class="${j.conectado ? '' : 'fuera'}" style="--color:${esc(j.color)}"><span class="nom">${esc(j.nombre)}</span>${tag ? `<span class="tag">${tag}</span>` : ''}</li>`;
    }).join('') : '<li class="vacio">Todavía no hay nadie. Para jugar solo no hace falta celular.</li>';
    // los modos que dependen de la cantidad de celus
    document.querySelectorAll('.modo').forEach((b) => {
      const m = estado.juegos[+b.dataset.j].modos[+b.dataset.m];
      const f = faltan(m);
      b.classList.toggle('falta', !!f);
      b.querySelector('small').textContent = f ? `faltan ${f}` : rangoModo(m);
    });
    const hay = lista.some((j) => j.conectado);
    const anf = lista.find((j) => j.anfitrion && j.conectado);
    $('indicacion').textContent = !hay ? 'Elegí con las flechas y Enter, o escaneá el QR con el celu'
      : anf ? `${anf.nombre} es anfitrión: puede elegir el juego desde su celu` : 'Elegí un juego con las flechas y Enter';
  }

  // Ranking del juego elegido: top 10 en dos columnas, rotando Hoy → Semana → Siempre (y la
  // tabla siguiente del juego, si tiene varias), igual que el lobby del bowling
  const TABLAS = [['hoy', 'Hoy'], ['semana', 'Semana'], ['siempre', 'Siempre']];
  const ROTACION_MS = 8000;
  let rankingClave = '';
  function dibujarRanking() {
    const j = estado.juegos[estado.sel.juego];
    if (!j) return;
    const r = records[j.id];
    const cats = r && r.rankings.length ? r.rankings : (j.rankings || []);
    const ahora = performance.now();
    const k = Math.floor(ahora / ROTACION_MS);
    const ti = k % TABLAS.length;
    const rk = cats[Math.floor(k / TABLAS.length) % Math.max(1, cats.length)];
    const clave = `${j.id}|${rk && rk.id}|${ti}`;
    // la barra naranja avanza hasta la próxima tabla
    const avance = $('pestanas').querySelector('.avance');
    if (avance) avance.style.width = `calc(${Math.min(100, ((ahora % ROTACION_MS) / ROTACION_MS) * 100 + 2)}% + 20px)`;
    if (clave === rankingClave) return;
    rankingClave = clave;
    $('ranking-cat').textContent = rk ? `${rk.titulo} · ${j.nombre}` : j.nombre;
    $('pestanas').innerHTML = TABLAS.map(([, t], i) => `<span class="pestana ${i === ti ? 'activa' : ''}">${t}${i === ti ? '<span class="avance"></span>' : ''}</span>`).join('');
    const lista = rk && rk[TABLAS[ti][0]] ? rk[TABLAS[ti][0]] : [];
    if (!lista.length) {
      const vacio = ti === 0 ? 'Todavía no hay puntajes hoy. El primero queda arriba.' : 'Todavía no hay puntajes.';
      $('ranking-cuerpo').innerHTML = `<div class="ranking-vacio">${vacio}</div>`;
      return;
    }
    const fila = (x) => `<li class="p${x.puesto}"><span class="medalla m${x.puesto}">${x.puesto}</span><span class="nom">${esc(x.nombre)}</span><span class="val">${esc(formatearCorto(rk, x))}</span></li>`;
    $('ranking-cuerpo').innerHTML = `<ol>${lista.slice(0, 5).map(fila).join('')}</ol><ol>${lista.slice(5, 10).map(fila).join('')}</ol>`;
  }
  setInterval(() => { if (estado.fase === 'menu') dibujarRanking(); }, 200);

  function formatear(rk, x) {
    if (rk.formato === 'nivel') return `Nivel ${Math.floor(x.puntaje / 100)}`;
    if (rk.formato === 'porcentaje') return `${x.puntaje}%`;
    return `${x.puntaje} ${rk.unidad}`;
  }
  function formatearCorto(rk, x) {
    if (rk.formato === 'nivel') return `Nivel ${Math.floor(x.puntaje / 100)}`;
    if (rk.formato === 'porcentaje') return `${x.puntaje}%`;
    return String(x.puntaje);
  }
  window.Plataforma.formatear = formatear;

  function moverSeleccion(dj, dm) {
    const n = estado.juegos.length;
    if (!n) return;
    if (dj) {
      estado.sel.juego = (estado.sel.juego + dj + n) % n;
      estado.sel.modo = 0;
    }
    if (dm) {
      const nm = estado.juegos[estado.sel.juego].modos.length;
      estado.sel.modo = (estado.sel.modo + dm + nm) % nm;
    }
    Sonido.mover();
    dibujarMenu();
  }

  $('lista-juegos').addEventListener('click', (e) => {
    const b = e.target.closest('.modo');
    const li = e.target.closest('.juego');
    if (!li) return;
    const ji = +li.dataset.j;
    if (b) {
      const mi = +b.dataset.m;
      const yaElegido = estado.sel.juego === ji && estado.sel.modo === mi;
      estado.sel = { juego: ji, modo: mi };
      dibujarMenu();
      if (yaElegido) empezarSeleccion();
      else Sonido.mover();
    } else if (estado.sel.juego !== ji) {
      estado.sel = { juego: ji, modo: 0 };
      Sonido.mover();
      dibujarMenu();
    }
  });
  // doble clic en un modo = jugar
  $('lista-juegos').addEventListener('dblclick', (e) => { if (e.target.closest('.modo')) empezarSeleccion(); });

  // ---------------------------------------------------------------- partidas
  function idPartida() {
    return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  }

  function empezarSeleccion() {
    const j = estado.juegos[estado.sel.juego];
    if (!j) return;
    const m = j.modos[estado.sel.modo];
    const f = faltan(m);
    if (f) {
      Sonido.error();
      cartel(`Para «${m.nombre}» faltan ${f} jugador${f > 1 ? 'es' : ''} con celular. Escaneen el QR.`, 3200);
      return;
    }
    empezar(j, m);
  }

  function empezar(manifiesto, modo) {
    const fabrica = estado.fabricas[manifiesto.id];
    if (!fabrica) { cartel('Ese juego no se pudo cargar.'); return; }
    let jugadores = [];
    if (modo.celulares) {
      jugadores = conectados().slice(0, modo.max).map((j) => ({ id: j.id, nombre: j.nombre, color: j.color, conectado: true }));
    }
    let instancia;
    try { instancia = fabrica(); } catch (err) { console.error(err); cartel('Error al crear el juego.'); return; }
    estado.actual = { manifiesto, modo, instancia, jugadores, partidaId: idPartida(), solo: !modo.celulares };
    estado.controlesEnviados = {};
    estado.ultimoResultado = null;
    mostrar('jugando');
    try {
      instancia.iniciar(crearContexto(), jugadores.map((j) => Object.assign({}, j)), modo.id);
    } catch (err) {
      console.error('Error en iniciar():', err);
      cartel('El juego tuvo un error al empezar.');
      volverAlMenu();
      return;
    }
    // los que no entran en esta partida esperan
    const ids = new Set(jugadores.map((j) => j.id));
    conectados().filter((j) => !ids.has(j.id)).forEach((j) => {
      socket.emit('tele:control', { jugadorId: j.id, control: { tipo: 'espera', titulo: 'Partida en curso', mensaje: `Esta partida es de ${modo.max}. Jugás en la próxima.` } });
    });
    actualizarControles(true);
    avisarFase();
    Sonido.desbloquear();
  }

  function crearContexto() {
    const a = estado.actual;
    return {
      ancho: ANCHO,
      alto: ALTO,
      config: estado.config,
      juego: a.manifiesto,
      modo: a.modo,
      solo: a.solo,
      partidaId: a.partidaId,
      sonido: window.Sonido,
      formas: window.Formas,
      trazo: window.Trazo,
      logo: logoImg,
      sacudir,
      cartel,
      actualizarControles: () => actualizarControles(true),
      servidor: (datos) => socket.emit('tele:juego', datos),
      ahora: () => performance.now(),
      horaServidor: () => Date.now(),
      record: (categoria) => fetch(`/api/record?juego=${encodeURIComponent(a.manifiesto.id)}&categoria=${encodeURIComponent(categoria)}`)
        .then((r) => r.json()).then((r) => r.record).catch(() => null),
      jugadorConectado: (id) => { const j = a.jugadores.find((x) => x.id === id); return !!(j && j.conectado); },
    };
  }

  /** Pide a cada juego el control de cada celu y lo manda solo si cambió */
  function actualizarControles(forzarRevision) {
    const a = estado.actual;
    if (!a || estado.fase !== 'jugando' || !a.instancia.controlCelular) return;
    if (!forzarRevision && !a.jugadores.length) return;
    a.jugadores.forEach((j) => {
      let c = null;
      try { c = a.instancia.controlCelular(j.id); } catch (err) { console.error('controlCelular:', err); return; }
      const txt = JSON.stringify(c || null);
      if (estado.controlesEnviados[j.id] !== txt) {
        estado.controlesEnviados[j.id] = txt;
        socket.emit('tele:control', { jugadorId: j.id, control: c });
      }
    });
  }
  setInterval(() => actualizarControles(false), 200);

  function llamar(fn, ...args) {
    const a = estado.actual;
    if (!a || typeof a.instancia[fn] !== 'function') return undefined;
    try { return a.instancia[fn](...args); } catch (err) { console.error(`Error en ${fn}():`, err); return undefined; }
  }

  function terminar() {
    const a = estado.actual;
    let res = llamar('resultados') || {};
    res = Object.assign({ titulo: 'Fin', subtitulo: '', filas: [], registros: [], celular: {} }, res);
    estado.ultimoResultado = res;
    // celus: mensaje personal de resultado
    a.jugadores.forEach((j) => {
      const msj = res.celular && res.celular[j.id];
      socket.emit('tele:control', { jugadorId: j.id, control: { tipo: 'espera', titulo: (msj && msj.titulo) || 'Terminó la partida', mensaje: (msj && msj.mensaje) || 'Mirá la tele' } });
    });
    const registros = (res.registros || []).filter((r) => r && r.categoria);
    if (a.solo) {
      const valen = registros.filter((r) => r.puntaje > 0);
      if (valen.length) { pedirNombre(res, valen); return; }
      mostrarResultados(res, null);
    } else {
      mostrarResultados(res, null);
      guardar(registros, res);
    }
  }

  // "¡Ganó Ana!" → "Ganó Ana": en la interfaz no van signos de exclamación (sí en los carteles del juego)
  const sinExclamar = (t) => String(t || '').replace(/^¡\s*/, '').replace(/\s*!$/, '');
  const ordinal = (n) => `${n}.º`;

  function guardar(registros, res) {
    const a = estado.actual;
    if (!registros.length) return;
    $('res-guardado').textContent = 'Guardando en el ranking…';
    socket.timeout(5000).emit('tele:puntajes', {
      partidaId: a.partidaId, juego: a.manifiesto.id, modo: a.modo.id, registros,
    }, (err, r) => {
      if (err || !r || !r.ok) {
        $('res-guardado').textContent = 'No se pudo guardar el puntaje' + (r && r.error ? `: ${r.error}` : '.') + ' Revisá que el servidor siga andando.';
        return;
      }
      const guardados = r.guardados || [];
      const rec = guardados.find((g) => g.esRecord);
      if (rec) {
        const rk = a.manifiesto.rankings.find((x) => x.id === rec.registro.categoria);
        const cinta = $('res-cinta');
        cinta.textContent = `Nuevo récord de la escuela · ${rec.registro.nombre}`;
        cinta.title = rk ? rk.titulo : '';
        cinta.classList.remove('oculto');
        Sonido.festejo();
        llamar('festejarRecord', rec);
      }
      $('res-guardado').textContent = guardados.length ? 'Guardado en el ranking.' : '';
      res.guardados = guardados;
      dibujarFilas(res);
      cargarRecords();
    });
  }

  function dibujarFilas(res) {
    const guardados = res.guardados || [];
    const puestoDe = (f) => {
      const g = guardados.find((x) => x.registro.nombre === f.nombre);
      if (!g) return '';
      if (g.esRecord) return 'Récord de la escuela';
      return g.puestoHoy <= 10 ? `${ordinal(g.puestoHoy)} de hoy` : '';
    };
    $('res-filas').innerHTML = (res.filas || []).slice(0, 6).map((f, i) => {
      const pos = f.pos != null ? f.pos : i + 1;
      return `<li class="${f.destacado ? 'destacado' : ''}" style="--color:${esc(f.color || 'var(--azul)')}">` +
        `<span class="medalla m${pos}">${esc(pos)}</span>` +
        `<span class="nom">${esc(f.nombre)}${f.detalle ? `<small>${esc(f.detalle)}</small>` : ''}</span>` +
        `<span class="der"><div class="val">${esc(f.valor)}</div><div class="puesto">${esc(puestoDe(f))}</div></span></li>`;
    }).join('');
  }

  function mostrarResultados(res) {
    const a = estado.actual;
    $('res-juego').textContent = `${a.manifiesto.nombre}  ·  ${a.modo.nombre}`;
    $('res-titulo').textContent = sinExclamar(res.titulo);
    $('res-subtitulo').textContent = res.subtitulo || '';
    $('res-cinta').classList.add('oculto');
    dibujarFilas(res);
    $('res-guardado').textContent = '';
    mostrar('resultados');
    avisarFase();
    reiniciarInactividad();
  }

  function jugarOtraVez() {
    const a = estado.actual;
    if (!a) return volverAlMenu();
    const f = faltan(a.modo);
    if (f) { cartel(`Faltan ${f} jugadores con celular.`); return; }
    empezar(a.manifiesto, a.modo);
  }

  function volverAlMenu() {
    const a = estado.actual;
    if (a && estado.fase === 'jugando') llamar('salir');
    estado.actual = null;
    mostrar('menu');
    socket.emit('tele:control', { jugadorId: '*', control: null });
    avisarFase();
    dibujarMenu();
    cargarRecords();
  }

  // inactividad en resultados: a los 60 s vuelve solo al menú (con cuenta regresiva a la vista)
  const INACTIVO_MS = 60000;
  let vencimiento = 0;
  function reiniciarInactividad() {
    vencimiento = performance.now() + INACTIVO_MS;
  }
  setInterval(() => {
    if (estado.fase !== 'resultados' && estado.fase !== 'nombre') return;
    const resta = Math.ceil((vencimiento - performance.now()) / 1000);
    if (resta <= 0) { volverAlMenu(); return; }
    $('res-vuelta').textContent = resta <= 30 ? `Volviendo al menú en ${resta} s` : '';
  }, 500);

  function mostrar(fase) {
    estado.fase = fase;
    $('menu').classList.toggle('oculto', fase !== 'menu');
    $('resultados').classList.toggle('oculto', fase !== 'resultados');
    $('teclado').classList.toggle('oculto', fase !== 'nombre');
    if (fase === 'menu') dibujarFondoMenu();
  }

  $('btn-otra').addEventListener('click', jugarOtraVez);
  $('btn-menu').addEventListener('click', volverAlMenu);

  // ---------------------------------------------------------------- teclado en pantalla (nombre)
  const FILAS_TECLADO = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM'];
  let nombre = '';
  let pendiente = null;
  function armarTeclado() {
    const cont = $('tec-teclas');
    cont.innerHTML = FILAS_TECLADO.map((f) => `<div class="tec-fila">${[...f].map((c) => `<button class="tecla" data-c="${c}">${c}</button>`).join('')}</div>`).join('') +
      '<div class="tec-fila"><button class="tecla ancha" data-c=" ">Espacio</button><button class="tecla ancha" data-c="borrar">Borrar</button></div>';
    cont.addEventListener('click', (e) => {
      const b = e.target.closest('.tecla');
      if (!b) return;
      escribir(b.dataset.c);
    });
    $('tec-listo').addEventListener('click', confirmarNombre);
    $('tec-saltar').addEventListener('click', () => { const p = pendiente; pendiente = null; mostrarResultados(p.res); });
  }
  function escribir(c) {
    reiniciarInactividad();
    if (c === 'borrar') nombre = nombre.slice(0, -1);
    else if (nombre.length < 14 && !(c === ' ' && (!nombre || nombre.endsWith(' ')))) nombre += c;
    Sonido.clic();
    $('tec-nombre').textContent = nombre;
    $('tec-ayuda').textContent = 'De 2 a 14 letras o números. Usá el mouse o el teclado.';
    $('tec-ayuda').classList.remove('error');
  }
  function pedirNombre(res, registros) {
    const a = estado.actual;
    pendiente = { res, registros };
    nombre = '';
    $('tec-nombre').textContent = '';
    $('tec-juego').textContent = `${a.manifiesto.nombre}  ·  ${a.modo.nombre}`;
    $('tec-titulo').textContent = sinExclamar(res.titulo);
    $('tec-ayuda').textContent = 'De 2 a 14 letras o números. Usá el mouse o el teclado.';
    $('tec-ayuda').classList.remove('error');
    mostrar('nombre');
    avisarFase();
    reiniciarInactividad();
  }
  function confirmarNombre() {
    const n = nombre.trim();
    const ayuda = $('tec-ayuda');
    if (n.length < 2) {
      ayuda.textContent = 'El nombre tiene que tener al menos 2 letras.';
      ayuda.classList.add('error');
      Sonido.error();
      return;
    }
    const p = pendiente;
    pendiente = null;
    // "JUAN PÉREZ" → "Juan Pérez"
    const bonito = n.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    const registros = p.registros.map((r) => Object.assign({}, r, { nombre: bonito }));
    (p.res.filas || []).forEach((f) => { if (f.esJugadorSolo) f.nombre = bonito; });
    mostrarResultados(p.res);
    guardar(registros, p.res);
  }

  // ---------------------------------------------------------------- teclado físico
  function teclaGlobal(e) {
    moverCursor();
    Sonido.desbloquear();
    const code = e.code || e.key;
    if (estado.fase === 'nombre') {
      if (code === 'Enter' || code === 'NumpadEnter') { e.preventDefault(); confirmarNombre(); return; }
      if (code === 'Escape') { const p = pendiente; pendiente = null; mostrarResultados(p.res); return; }
      if (code === 'Backspace') { e.preventDefault(); escribir('borrar'); return; }
      const k = e.key || '';
      if (k.length === 1 && /[\p{L}\p{N} ]/u.test(k)) { escribir(k.toUpperCase()); return; }
      return;
    }
    if (code === 'KeyF') { pantallaCompleta(); return; }
    if (code === 'KeyO') { rotar(); return; }
    if (estado.fase === 'menu') {
      if (code === 'ArrowUp') { e.preventDefault(); moverSeleccion(-1, 0); }
      else if (code === 'ArrowDown') { e.preventDefault(); moverSeleccion(1, 0); }
      else if (code === 'ArrowLeft') { e.preventDefault(); moverSeleccion(0, -1); }
      else if (code === 'ArrowRight') { e.preventDefault(); moverSeleccion(0, 1); }
      else if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') { e.preventDefault(); empezarSeleccion(); }
      return;
    }
    if (estado.fase === 'resultados') {
      reiniciarInactividad();
      if (code === 'Enter' || code === 'NumpadEnter') { e.preventDefault(); jugarOtraVez(); }
      else if (code === 'Escape') volverAlMenu();
      return;
    }
    if (estado.fase === 'jugando') {
      if (code === 'Escape') {
        const t = performance.now();
        if (t - estado.escPendiente < 2500) { volverAlMenu(); return; }
        estado.escPendiente = t;
        cartel('Tocá Esc otra vez para salir al menú');
        return;
      }
      if (/^Arrow|^Space$/.test(code)) e.preventDefault();
      llamar('tecla', code);
    }
  }
  window.addEventListener('keydown', (e) => { if (!e.repeat) teclaGlobal(e); });

  // ---------------------------------------------------------------- mouse
  let botonApretado = false;
  function puntero(e, tipo) {
    moverCursor();
    if (estado.fase !== 'jugando') return;
    if (tipo === 'mover' && !botonApretado && e.pointerType === 'mouse' && e.buttons === 0) {
      const p = aLienzo(e.clientX, e.clientY);
      llamar('puntero', p.x, p.y, 'mover');
      return;
    }
    const p = aLienzo(e.clientX, e.clientY);
    llamar('puntero', p.x, p.y, tipo);
  }
  window.addEventListener('pointerdown', (e) => { Sonido.desbloquear(); botonApretado = true; puntero(e, 'abajo'); });
  window.addEventListener('pointermove', (e) => puntero(e, 'mover'));
  window.addEventListener('pointerup', (e) => { botonApretado = false; puntero(e, 'arriba'); });
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------------------------------------------------------------- dibujo
  let logoImg = null;
  function dibujarFondoMenu() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0B1D30';
    ctx.fillRect(0, 0, ANCHO, ALTO);
  }

  let ultimo = performance.now();
  function cuadro(t) {
    requestAnimationFrame(cuadro); // primero: un error en el juego no puede congelar la tele
    const dt = Math.min(0.1, Math.max(0, (t - ultimo) / 1000));
    ultimo = t;
    if (estado.fase !== 'jugando' || !estado.actual) return;
    llamar('actualizar', dt);
    if (estado.fase !== 'jugando') return; // el juego pudo volver al menú
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    llamar('dibujar', ctx);
    if (llamar('terminado')) terminar();
  }

  // ---------------------------------------------------------------- arranque
  function cargarScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve(true);
      s.onerror = () => { console.error('No se pudo cargar', src); resolve(false); };
      document.head.appendChild(s);
    });
  }

  async function iniciar() {
    const [config, juegos] = await Promise.all([
      fetch('/api/config').then((r) => r.json()),
      fetch('/api/juegos').then((r) => r.json()),
    ]);
    estado.config = config;
    const rot = Number(params.get('rotar'));
    estado.rotacion = [0, 90, -90].includes(rot) && params.has('rotar') ? rot : config.rotarPantalla || 0;
    ajustar();
    document.documentElement.style.setProperty('--azul', config.colores.principal);
    document.documentElement.style.setProperty('--celeste', config.colores.secundario);
    document.documentElement.style.setProperty('--naranja', config.colores.acento);
    document.documentElement.style.setProperty('--noche', config.colores.fondo);

    document.querySelectorAll('[data-escuela]').forEach((el) => { el.textContent = config.nombreEscuela; });
    document.querySelectorAll('[data-creditos]').forEach((el) => { el.textContent = config.creditos; });
    $('qr').src = config.qr;
    $('url').textContent = config.url;
    // logo de la escuela: public/logo.png si existe; si no, el emblema redibujado (lo resuelve el servidor)
    logoImg = new Image();
    logoImg.onerror = () => { if (!/emblema\.svg$/.test(logoImg.src)) logoImg.src = '/shared/emblema.svg'; };
    logoImg.src = config.logo || '/shared/emblema.svg';
    document.querySelectorAll('[data-logo]').forEach((el) => {
      el.onerror = () => { if (!/emblema\.svg$/.test(el.src)) el.src = '/shared/emblema.svg'; };
      el.src = logoImg.src;
    });

    for (const j of juegos) {
      for (const f of j.archivos) await cargarScript(`/juegos/${j.id}/${f}`);
    }
    estado.juegos = juegos.filter((j) => estado.fabricas[j.id]);
    armarTeclado();
    mostrar('menu');
    dibujarMenu();
    cargarRecords();
    moverCursor();
    requestAnimationFrame(cuadro);
    document.body.dataset.listo = '1';
  }

  iniciar().catch((err) => {
    console.error(err);
    document.body.innerHTML = '<p style="color:#fff;font:24px sans-serif;padding:40px">No se pudo cargar la tele. ¿Está andando el servidor?</p>';
  });
})();
