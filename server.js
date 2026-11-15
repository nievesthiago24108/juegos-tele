/*
 * Servidor de Juegos en la tele: sirve las páginas (todo local, sin internet), maneja la sala
 * de jugadores y reenvía mensajes entre la tele (que corre los juegos) y los celulares.
 *
 *   npm start                        → usa config.json
 *   IP_TELE=192.168.0.5 npm start    → fuerza la IP que va en el QR
 */
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { createLeaderboard, limpiarNombre } = require('./leaderboard.js');

const RAIZ = __dirname;
const PUBLIC = path.join(RAIZ, 'public');
const JUEGOS = path.join(PUBLIC, 'juegos');

const DEFAULTS = {
  nombreEscuela: 'Escuela Industrial Nº4 “José Menéndez”',
  nombreCorto: 'EI Nº4',
  colores: { principal: '#6272B4', secundario: '#7AB6E6', acento: '#F2A33A', fondo: '#0B1D30' },
  logo: 'public/logo.png',
  puerto: 3001,        // el Bowling Tótem usa el 3000: así pueden estar abiertos los dos a la vez
  rotarPantalla: 0,
  margenSeguridad: 0,   // como el bowling: la imagen ocupa toda la pantalla
  maxJugadores: 6,
  creditos: 'Hecho por 5ºI Informática',
  memoria: {},
  penales: {},
};
const COLORES_JUGADOR = ['#3FB6E0', '#EE6A5B', '#F2C14E', '#5DBF7A', '#A98BE8', '#E98AB8'];
const GRACIA_MENU_MS = 20000;   // en el menú, un desconectado se borra después de esto
const INPUT_MIN_MS = 25;        // tope de mensajes de un celu (~40 por segundo)
const COLOR = /^#[0-9a-fA-F]{6}$/;

function log(...args) {
  const hora = new Date().toLocaleTimeString('es-AR', { hour12: false });
  console.log(`[${hora}]`, ...args);
}

/** Lee config.json y valida cada valor: un archivo mal editado no tiene que romper nada */
function loadConfig(file) {
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file || path.join(RAIZ, 'config.json'), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('No se pudo leer config.json, uso valores por defecto:', err.message);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  const c = JSON.parse(JSON.stringify(DEFAULTS));
  const texto = (k, max) => {
    if (data[k] === undefined) return;
    if (typeof data[k] === 'string' && data[k].trim()) c[k] = data[k].trim().slice(0, max || 80);
    else console.warn(`config.json: "${k}" tiene que ser un texto; uso "${DEFAULTS[k]}".`);
  };
  const numero = (k, permitidos, min, max) => {
    if (data[k] === undefined) return;
    const n = Number(data[k]);
    const ok = Number.isFinite(n) && (permitidos ? permitidos.includes(n) : n >= min && n <= max);
    if (ok) c[k] = n;
    else console.warn(`config.json: "${k}" no es válido; uso ${DEFAULTS[k]}.`);
  };
  texto('nombreEscuela'); texto('nombreCorto', 20); texto('logo', 200); texto('creditos');
  numero('puerto', null, 1, 65535);
  numero('rotarPantalla', [0, 90, -90]);
  numero('margenSeguridad', null, 0, 10);
  numero('maxJugadores', null, 2, 6);
  if (data.colores && typeof data.colores === 'object') {
    Object.keys(DEFAULTS.colores).forEach((k) => {
      if (data.colores[k] === undefined) return;
      if (COLOR.test(data.colores[k])) c.colores[k] = data.colores[k];
      else console.warn(`config.json: colores.${k} tiene que ser como "#6272B4".`);
    });
  }
  // las secciones de cada juego las valida el propio juego; acá solo se pasan si son objetos
  Object.keys(data).forEach((k) => {
    if (!(k in DEFAULTS) && data[k] && typeof data[k] === 'object' && !Array.isArray(data[k])) c[k] = data[k];
  });
  ['memoria', 'penales'].forEach((k) => { if (data[k] && typeof data[k] === 'object' && !Array.isArray(data[k])) c[k] = data[k]; });
  return c;
}

/** IP de la notebook en la red local (la zona wifi del celu suele dar 192.168.x.x o 10.x.x.x) */
function localIp() {
  const skip = /^(lo|docker|br-|veth|virbr|vboxnet|vmnet|tun|tap|wg|tailscale|zt|utun)/i;
  const found = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (skip.test(name)) continue;
    for (const a of addrs || []) if (a.family === 'IPv4' && !a.internal) found.push(a.address);
  }
  const lan = found.find((ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip));
  return lan || found[0] || '127.0.0.1';
}

/** Lee public/juegos/<id>/juego.json de cada carpeta */
function leerJuegos(dir) {
  const lista = [];
  let carpetas = [];
  try { carpetas = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { return lista; }
  carpetas.forEach((d) => {
    const archivo = path.join(dir, d.name, 'juego.json');
    let m;
    try { m = JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`No se pudo leer ${archivo}:`, err.message);
      return;
    }
    if (!m || m.id !== d.name || !Array.isArray(m.modos) || !Array.isArray(m.archivos)) {
      console.warn(`${archivo}: falta "id" (igual al nombre de la carpeta), "modos" o "archivos".`);
      return;
    }
    lista.push({
      id: m.id,
      nombre: String(m.nombre || m.id),
      descripcion: String(m.descripcion || ''),
      orden: Number(m.orden) || 50,
      archivos: m.archivos.filter((f) => /^[\w.-]+\.js$/.test(f)),
      modos: m.modos.map((x) => ({
        id: String(x.id), nombre: String(x.nombre || x.id), descripcion: String(x.descripcion || ''),
        celulares: !!x.celulares, min: Number(x.min) || 0, max: Number(x.max) || 0,
      })),
      rankings: (m.rankings || []).map((r) => ({
        id: String(r.id), titulo: String(r.titulo || r.id), unidad: String(r.unidad || 'puntos'),
        formato: r.formato ? String(r.formato) : null,
      })),
      servidor: typeof m.servidor === 'string' && /^[\w.-]+\.js$/.test(m.servidor) ? m.servidor : null,
    });
  });
  return lista.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
}

function crearServidor(opts) {
  opts = opts || {};
  const config = opts.config || loadConfig(opts.configFile);
  const lb = createLeaderboard({ dir: opts.dataDir || path.join(RAIZ, 'data'), now: opts.now });
  const juegosDir = opts.juegosDir || JUEGOS;
  let juegos = leerJuegos(juegosDir);
  const silencio = !!opts.silencio;
  const decir = (...a) => { if (!silencio) log(...a); };

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 64 * 1024, pingInterval: 5000, pingTimeout: 8000 });
  let url = '';
  let qr = '';

  const logoArchivo = path.resolve(RAIZ, config.logo);
  const hayLogo = () => { try { return fs.statSync(logoArchivo).isFile(); } catch { return false; } };

  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  const configPublica = () => ({
    nombreEscuela: config.nombreEscuela,
    nombreCorto: config.nombreCorto,
    colores: config.colores,
    logo: hayLogo() ? '/logo' : '/shared/emblema.svg', // sin logo.png se usa el emblema de la escuela redibujado
    rotarPantalla: config.rotarPantalla,
    margenSeguridad: config.margenSeguridad,
    maxJugadores: config.maxJugadores,
    creditos: config.creditos,
    memoria: config.memoria,
    penales: config.penales,
    url,
    qr,
  });

  app.get('/api/config', (req, res) => res.json(configPublica()));
  app.get('/api/juegos', (req, res) => { juegos = leerJuegos(juegosDir); res.json(juegos); });
  app.get('/api/ranking', (req, res) => {
    const n = Math.max(1, Math.min(50, Number(req.query.n) || 10));
    res.json({ juegos: lb.tablas(juegos, n) });
  });
  app.get('/api/record', (req, res) => {
    res.json({ record: lb.record(String(req.query.juego || ''), String(req.query.categoria || '')) });
  });
  app.get('/logo', (req, res) => {
    if (!hayLogo()) return res.status(404).end();
    res.sendFile(logoArchivo);
  });

  // tipografías Barlow empaquetadas (andan sin internet)
  const fuente = (pkg) => path.join(path.dirname(require.resolve(pkg + '/package.json')), 'files');
  app.use('/fonts/barlow', express.static(fuente('@fontsource/barlow')));
  app.use('/fonts/barlow-condensed', express.static(fuente('@fontsource/barlow-condensed')));
  app.use('/shared', express.static(path.join(PUBLIC, 'shared')));
  app.use('/juegos', express.static(juegosDir));
  app.use('/j', express.static(path.join(PUBLIC, 'j')));
  app.use('/ranking', express.static(path.join(PUBLIC, 'ranking')));
  app.use('/', express.static(path.join(PUBLIC, 'tele')));
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    const status = Number.isInteger(err && err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500) console.error('Error en', req.method, req.path, err);
    res.status(status).json({ error: status >= 500 ? 'Error interno del servidor.' : 'Pedido inválido.' });
  });

  // ---------- Sala ----------
  const sala = {
    fase: 'menu',        // menu | jugando | resultados
    juego: null, modo: null, partidaId: null,
    tele: null,          // socket.id de la tele
    jugadores: [],
  };
  const plugins = {};   // lógica de servidor de cada juego (ej. validar el cooperativo de memoria)

  const publico = (p) => ({ id: p.id, nombre: p.nombre, color: p.color, anfitrion: p.anfitrion, conectado: p.conectado });
  const estadoSala = () => ({
    fase: sala.fase, juego: sala.juego, modo: sala.modo,
    teleConectada: !!sala.tele, maxJugadores: config.maxJugadores,
    jugadores: sala.jugadores.map(publico),
  });
  const avisarSala = () => io.emit('sala', estadoSala());
  const aTele = (evento, datos) => { if (sala.tele) io.to(sala.tele).emit(evento, datos); };
  const jugadorDe = (socket) => sala.jugadores.find((p) => p.id === socket.data.jugadorId && p.socketId === socket.id);
  const esTele = (socket) => socket.id === sala.tele;

  function colorLibre() {
    const usados = new Set(sala.jugadores.map((p) => p.color));
    return COLORES_JUGADOR.find((c) => !usados.has(c)) || COLORES_JUGADOR[sala.jugadores.length % COLORES_JUGADOR.length];
  }

  /** El anfitrión es el primero que entró (y sigue conectado) */
  function asignarAnfitrion() {
    const sigue = sala.jugadores.find((p) => p.anfitrion && p.conectado);
    sala.jugadores.forEach((p) => { p.anfitrion = false; });
    const a = sigue || sala.jugadores.find((p) => p.conectado);
    if (a) a.anfitrion = true;
  }

  function sacar(p) {
    clearTimeout(p.timerSalida);
    sala.jugadores = sala.jugadores.filter((x) => x !== p);
    asignarAnfitrion();
  }

  function plugin(id) {
    if (plugins[id] !== undefined) return plugins[id];
    plugins[id] = null;
    const j = juegos.find((x) => x.id === id);
    if (j && j.servidor) {
      try {
        const crear = require(path.join(juegosDir, id, j.servidor));
        plugins[id] = crear({
          aTele: (datos) => aTele('juego:servidor', datos),
          ahora: () => Date.now(),
          log: decir,
        });
      } catch (err) {
        console.error(`No se pudo cargar la parte de servidor de "${id}":`, err.message);
      }
    }
    return plugins[id];
  }

  function enviarControl(p) {
    if (p.socketId) io.to(p.socketId).emit('control', p.control || null);
  }

  /** Puntajes que manda la tele: se validan contra lo que el servidor sabe */
  function validarPuntajes(datos) {
    if (!datos || typeof datos !== 'object') return { error: 'Datos inválidos.' };
    const juego = juegos.find((j) => j.id === datos.juego);
    if (!juego) return { error: 'Juego desconocido.' };
    const modo = juego.modos.find((m) => m.id === datos.modo);
    if (!modo) return { error: 'Modo desconocido.' };
    const categorias = new Set(juego.rankings.map((r) => r.id));
    const lista = Array.isArray(datos.registros) ? datos.registros.slice(0, 12) : [];
    const registros = [];
    lista.forEach((r) => {
      if (!r || typeof r !== 'object' || !categorias.has(r.categoria)) return;
      const puntaje = Number(r.puntaje);
      if (!Number.isFinite(puntaje) || puntaje < 0) return;
      let nombre;
      let jugadores = [];
      if (Array.isArray(r.jugadorIds) && r.jugadorIds.length) {
        // jugadores con celular: el nombre lo pone el servidor, no la tele
        const ps = r.jugadorIds.map((id) => sala.jugadores.find((p) => p.id === id));
        if (ps.some((p) => !p)) return;
        jugadores = ps.map((p) => p.nombre);
        nombre = jugadores.length > 1 ? jugadores.join(', ').slice(0, 80) : jugadores[0];
      } else {
        if (modo.celulares) return; // en modos con celular todos los puntajes tienen dueño
        nombre = limpiarNombre(r.nombre);
        if (!nombre || !lb.nombrePermitido(nombre)) return;
        jugadores = [nombre];
      }
      registros.push({ categoria: r.categoria, nombre, puntaje, detalle: r.detalle, jugadores });
    });
    return { juego: juego.id, modo: modo.id, partidaId: datos.partidaId, registros };
  }

  io.on('connection', (socket) => {
    // Socket.io no atrapa errores en los handlers: uno solo tiraría abajo todo el servidor
    const on = (evento, fn) => socket.on(evento, (...args) => {
      try { fn(...args); } catch (err) { console.error(`Error atendiendo "${evento}":`, err && err.stack ? err.stack : err); }
    });
    const responder = (ack) => (typeof ack === 'function' ? ack : () => {});

    on('reloj', (ack) => responder(ack)(Date.now()));

    // ----- Tele -----
    on('tele:hola', (ack) => {
      if (jugadorDe(socket)) return;
      if (sala.tele && sala.tele !== socket.id) {
        decir('Se conectó otra tele; reemplaza a la anterior.');
        io.to(sala.tele).emit('tele:reemplazada');
      }
      sala.tele = socket.id;
      socket.data.rol = 'tele';
      decir('Tele conectada.');
      avisarSala();
      responder(ack)({ sala: estadoSala() });
    });

    on('tele:fase', (d) => {
      if (!esTele(socket) || !d || typeof d !== 'object') return;
      const fase = ['menu', 'jugando', 'resultados'].includes(d.fase) ? d.fase : 'menu';
      if (fase === 'jugando' && sala.fase !== 'jugando') decir(`Empieza ${d.juego} (${d.modo}).`);
      sala.fase = fase;
      sala.juego = typeof d.juego === 'string' ? d.juego.slice(0, 40) : null;
      sala.modo = typeof d.modo === 'string' ? d.modo.slice(0, 40) : null;
      sala.partidaId = typeof d.partidaId === 'string' ? d.partidaId.slice(0, 40) : null;
      if (fase === 'menu') {
        // al volver al menú se van los que se desconectaron y nadie queda con un control viejo
        sala.jugadores.filter((p) => !p.conectado).forEach(sacar);
        sala.jugadores.forEach((p) => { p.control = null; });
        Object.values(plugins).forEach((pl) => { if (pl && pl.reiniciar) pl.reiniciar(); });
      }
      avisarSala();
    });

    on('tele:control', (d) => {
      if (!esTele(socket) || !d || typeof d !== 'object') return;
      const destino = d.jugadorId === '*' ? sala.jugadores : sala.jugadores.filter((p) => p.id === d.jugadorId);
      const control = d.control && typeof d.control === 'object' ? d.control : null;
      destino.forEach((p) => { p.control = control; enviarControl(p); });
    });

    on('tele:juego', (d) => {
      if (!esTele(socket) || !sala.juego) return;
      const pl = plugin(sala.juego);
      if (pl && pl.deTele) pl.deTele(d, sala.jugadores.map(publico));
    });

    on('tele:puntajes', (d, ack) => {
      const reply = responder(ack);
      if (!esTele(socket)) return reply({ ok: false, error: 'Solo la tele guarda puntajes.' });
      if (d && lb.tienePartida(d.partidaId)) return reply({ ok: true, repetida: true, guardados: [] });
      const v = validarPuntajes(d);
      if (v.error) return reply({ ok: false, error: v.error });
      if (!v.registros.length) return reply({ ok: true, guardados: [] });
      let guardados;
      try {
        guardados = lb.guardarPartida(v);
      } catch (err) {
        console.error('No se pudieron guardar los puntajes (¿disco lleno o sin permiso en data/?):', err.message);
        return reply({ ok: false, error: 'No se pudo guardar.' });
      }
      decir(`Puntajes de ${v.juego}/${v.modo}: ` + guardados.map((g) => `${g.registro.nombre} ${g.registro.puntaje}`).join(', '));
      io.emit('ranking:cambio', { juego: v.juego });
      reply({ ok: true, guardados });
    });

    on('tele:expulsar', (d) => {
      if (!esTele(socket) || !d) return;
      const p = sala.jugadores.find((x) => x.id === d.jugadorId);
      if (!p) return;
      if (p.socketId) io.to(p.socketId).emit('expulsado');
      sacar(p);
      avisarSala();
    });

    // ----- Celulares -----
    on('jugador:unirse', (d, ack) => {
      const reply = responder(ack);
      d = d || {};
      if (esTele(socket)) return reply({ ok: false, error: 'Esta pantalla es la tele.' });
      const nombre = limpiarNombre(d.nombre);
      const token = typeof d.token === 'string' && /^[\w-]{8,64}$/.test(d.token) ? d.token : null;
      let p = token && sala.jugadores.find((x) => x.token === token);
      if (!p && !nombre) return reply({ ok: false, error: 'El nombre tiene que tener entre 2 y 14 letras o números.' });
      const actual = jugadorDe(socket);
      if (actual && actual !== p) return reply({ ok: false, error: 'Ya estás en la sala.' });
      if (!p && !lb.nombrePermitido(nombre)) return reply({ ok: false, error: 'Ese nombre no está permitido. Elegí otro.' });

      if (p) {
        // reconexión: recupera su lugar; si tenía otra pestaña abierta, la desconecta
        if (p.socketId && p.socketId !== socket.id) {
          const viejo = io.sockets.sockets.get(p.socketId);
          p.socketId = null;
          if (viejo) viejo.disconnect(true);
        }
        clearTimeout(p.timerSalida);
        p.conectado = true;
        p.socketId = socket.id;
        if (sala.fase === 'menu' && nombre && lb.nombrePermitido(nombre)) p.nombre = nombre;
        decir(`Volvió ${p.nombre}.`);
      } else {
        if (sala.jugadores.length >= config.maxJugadores) {
          return reply({ ok: false, error: `La sala está llena (máximo ${config.maxJugadores}). Esperá a que alguien salga.` });
        }
        const repetido = sala.jugadores.some((x) => x.nombre.toLowerCase() === nombre.toLowerCase());
        p = {
          id: crypto.randomBytes(5).toString('hex'),
          token: crypto.randomBytes(16).toString('hex'),
          nombre: repetido ? (nombre.slice(0, 12) + ' ' + (sala.jugadores.length + 1)) : nombre,
          color: colorLibre(),
          anfitrion: false,
          conectado: true,
          socketId: socket.id,
          control: null,
          ultimoInput: 0,
        };
        sala.jugadores.push(p);
        decir(`Entró ${p.nombre}.`);
      }
      socket.data.jugadorId = p.id;
      asignarAnfitrion();
      avisarSala();
      aTele('jugador:conexion', { jugadorId: p.id, conectado: true });
      reply({ ok: true, id: p.id, token: p.token, nombre: p.nombre, color: p.color, sala: estadoSala() });
      enviarControl(p);
    });

    on('jugador:input', (datos, ack) => {
      const reply = responder(ack);
      const p = jugadorDe(socket);
      if (!p) return reply({ ok: false });
      const ahora = Date.now();
      if (ahora - p.ultimoInput < INPUT_MIN_MS) return reply({ ok: false, error: 'muy rápido' });
      p.ultimoInput = ahora;
      if (!datos || typeof datos !== 'object' || JSON.stringify(datos).length > 8000) return reply({ ok: false });
      // marca de tiempo: la del celu (ya corregida a la hora del servidor) si es creíble; si no, la de llegada
      const tCelu = Number(datos.t);
      const ts = Number.isFinite(tCelu) && tCelu <= ahora + 50 && tCelu >= ahora - 1500 ? Math.min(tCelu, ahora) : ahora;
      const pl = sala.juego && sala.fase === 'jugando' ? plugin(sala.juego) : null;
      if (pl && pl.alInput && pl.alInput(p.id, datos, ts)) return reply({ ok: true });
      aTele('input', { jugadorId: p.id, datos, ts });
      reply({ ok: true });
    });

    on('anfitrion:accion', (d) => {
      const p = jugadorDe(socket);
      if (!p || !p.anfitrion || !d || typeof d !== 'object') return;
      const accion = ['elegir', 'menu', 'otra', 'tecla'].includes(d.accion) ? d.accion : null;
      if (!accion) return;
      aTele('anfitrion', {
        accion,
        jugadorId: p.id, // quién eligió (en Solo, ese celu es el que juega)
        juego: typeof d.juego === 'string' ? d.juego.slice(0, 40) : null,
        modo: typeof d.modo === 'string' ? d.modo.slice(0, 40) : null,
        tecla: typeof d.tecla === 'string' ? d.tecla.slice(0, 12) : null,
      });
    });

    on('jugador:salir', () => {
      const p = jugadorDe(socket);
      if (!p) return;
      decir(`Salió ${p.nombre}.`);
      sacar(p);
      socket.data.jugadorId = null;
      aTele('jugador:conexion', { jugadorId: p.id, conectado: false, salio: true });
      avisarSala();
    });

    on('disconnect', () => {
      if (esTele(socket)) {
        sala.tele = null;
        decir('Se desconectó la tele.');
        avisarSala();
        return;
      }
      const p = jugadorDe(socket);
      if (!p) return;
      p.conectado = false;
      p.socketId = null;
      decir(`Se desconectó ${p.nombre}.`);
      asignarAnfitrion();
      aTele('jugador:conexion', { jugadorId: p.id, conectado: false });
      if (sala.fase === 'menu') {
        p.timerSalida = setTimeout(() => { if (!p.conectado) { sacar(p); avisarSala(); } }, GRACIA_MENU_MS);
      }
      avisarSala();
    });
  });

  async function listen(puerto, host) {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(puerto, host, () => { server.off('error', reject); resolve(); });
    });
    const real = server.address().port;
    const ip = opts.ip || process.env.IP_TELE || localIp();
    url = `http://${ip}:${real}/j`;
    qr = await QRCode.toDataURL(url, { margin: 1, width: 600, errorCorrectionLevel: 'M' });
    return real;
  }

  function close() {
    return new Promise((resolve) => {
      sala.jugadores.forEach((p) => clearTimeout(p.timerSalida));
      Object.values(plugins).forEach((pl) => { if (pl && pl.cerrar) pl.cerrar(); });
      io.close();
      server.close(() => resolve());
      if (server.closeAllConnections) server.closeAllConnections(); // fetch deja conexiones keep-alive abiertas
    });
  }

  return { app, server, io, lb, config, sala, listen, close, getUrl: () => url };
}

if (require.main === module) {
  const config = loadConfig();
  const srv = crearServidor({ config });
  srv.listen(config.puerto).then(async (puerto) => {
    const urlCelu = srv.getUrl();
    console.log('');
    console.log('  Juegos en la tele');
    console.log('  ─────────────────');
    console.log(`  Tele (en esta notebook):  http://localhost:${puerto}/`);
    console.log(`  Celulares:                ${urlCelu}`);
    console.log(`  Ranking:                  http://localhost:${puerto}/ranking`);
    console.log('');
    try {
      console.log(await QRCode.toString(urlCelu, { type: 'terminal', small: true }));
    } catch { /* el QR de consola es un extra */ }
    console.log('  Los celulares tienen que estar en la misma red wifi que esta notebook.');
    console.log('  Para cerrar: Ctrl+C');
    console.log('');
  }).catch((err) => {
    if (err.code === 'EADDRINUSE') console.error(`El puerto ${config.puerto} está ocupado: ¿ya hay otro servidor abierto?`);
    else console.error('No se pudo arrancar el servidor:', err.message);
    process.exit(1);
  });
}

module.exports = { crearServidor, loadConfig, localIp, leerJuegos, DEFAULTS };
