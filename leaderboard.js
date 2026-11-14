/*
 * Leaderboard: guarda TODOS los puntajes en data/puntajes.jsonl (un JSON por renglón; solo
 * se agrega al final, nunca se borra) y arma las tablas Hoy / Semana / Siempre por juego.
 *
 * Cada registro:
 *   { id, partidaId, juego, modo, categoria, nombre, nombreClave, puntaje, detalle,
 *     jugadores: [nombres], fecha: "2026-11-14T18:30:00-03:00" }
 *
 * "categoria" separa tablas dentro de un juego (ej. penales: "seguidos", "torneo", "arquero").
 * Se ordena por puntaje (mayor primero) y, si empatan, gana quien lo logró antes.
 *
 * Adaptado del leaderboard del Bowling Tótem (mismo formato JSONL y mismo filtro de nombres).
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ZONA = 'America/Argentina/Buenos_Aires';
const DIA_MS = 24 * 60 * 60 * 1000;
const TABLAS = ['hoy', 'semana', 'siempre'];
const MAX_PUNTAJE = 1e7;

const PALABRAS_BASE = `# Una palabra por renglón. Se compara sin tildes, sin mayúsculas y detectando
# reemplazos como 4→a, 3→e, 0→o, 1→i, 5→s, 7→t y letras repetidas ("puuuto").
# Una palabra prohibida rechaza el nombre si aparece como palabra suelta; las de 5 letras
# o más también con terminaciones de plural, diminutivo o aumentativo. Se puede editar en caliente.
puto
puta
trolo
pija
poronga
concha
conchudo
chota
culo
orto
mierda
boludo
pelotudo
forro
garca
sorete
verga
pajero
culiado
cagon
mogolico
tarado
idiota
imbecil
estupido
hdp
ptm
lpm
sexo
porno
nazi
hitler
`;

/** Minúsculas, sin tildes y sin espacios repetidos: "  LUCÍA  Pérez" → "lucia perez" */
function nombreClave(nombre) {
  return String(nombre == null ? '' : nombre)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Para el filtro: además deshace reemplazos (p0rong4 → poronga) y letras repetidas */
function normalizarFiltro(s) {
  return nombreClave(s)
    .replace(/[4@]/g, 'a').replace(/3/g, 'e').replace(/0/g, 'o').replace(/[1!]/g, 'i')
    .replace(/5/g, 's').replace(/7/g, 't')
    .replace(/[^a-zñ ]/g, '')
    .replace(/(.)\1+/g, '$1');
}

/** Nombre: espacios colapsados, 2 a 14 letras, números o espacios (sin HTML posible) */
function limpiarNombre(raw) {
  if (typeof raw !== 'string') return null;
  const nombre = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  return /^[\p{L}\p{N} ]{2,14}$/u.test(nombre) ? nombre : null;
}

/** Fecha y hora de Argentina con su desfase: "2026-11-01T14:32:10-03:00" */
const formatoFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
});
function fechaLocal(ms) {
  const p = {};
  formatoFecha.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
  const desfase = p.timeZoneName.replace('GMT', '') || '+00:00';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${desfase}`;
}

const ID = /^[\w-]{1,40}$/;

function esRegistro(r) {
  return r && typeof r.id === 'string' && typeof r.juego === 'string' && typeof r.categoria === 'string' &&
    typeof r.nombre === 'string' && Number.isFinite(r.puntaje) && typeof r.fecha === 'string' &&
    Number.isFinite(Date.parse(r.fecha));
}

/** Detalle: solo números y textos cortos (no se guarda cualquier cosa que mande un cliente) */
function limpiarDetalle(d) {
  const out = {};
  if (!d || typeof d !== 'object' || Array.isArray(d)) return out;
  Object.keys(d).slice(0, 12).forEach((k) => {
    if (!/^[a-zA-Z]{1,20}$/.test(k)) return;
    const v = d[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.round(v * 100) / 100;
    else if (typeof v === 'string' && v.length <= 40) out[k] = v.replace(/[<>]/g, '');
  });
  return out;
}

function comparar(a, b) {
  return b.puntaje - a.puntaje || a.t - b.t;
}

function createLeaderboard(opts) {
  opts = opts || {};
  const dir = opts.dir || path.join(__dirname, 'data');
  const now = opts.now || Date.now;
  const archivo = path.join(dir, 'puntajes.jsonl');
  const archivoPalabras = path.join(dir, 'palabras-prohibidas.txt');

  let registros = [];

  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(archivoPalabras)) fs.writeFileSync(archivoPalabras, PALABRAS_BASE);
  cargar();

  function cargar() {
    registros = [];
    let texto = '';
    try { texto = fs.readFileSync(archivo, 'utf8'); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    texto.split('\n').forEach((linea) => {
      if (!linea.trim()) return;
      let obj;
      try { obj = JSON.parse(linea); } catch { return; } // renglón dañado (ej. corte de luz): se ignora
      if (esRegistro(obj)) registros.push(Object.assign(obj, { t: Date.parse(obj.fecha) }));
    });
  }

  /** Agrega renglones al final del archivo; si el último quedó cortado, empieza en uno nuevo */
  function agregar(objs) {
    let prefijo = '';
    try {
      const fd = fs.openSync(archivo, 'r');
      const { size } = fs.fstatSync(fd);
      if (size > 0) {
        const b = Buffer.alloc(1);
        fs.readSync(fd, b, 0, 1, size - 1);
        if (b[0] !== 0x0a) prefijo = '\n';
      }
      fs.closeSync(fd);
    } catch (err) { if (err.code !== 'ENOENT') throw err; }
    fs.appendFileSync(archivo, prefijo + objs.map((o) => JSON.stringify(o)).join('\n') + '\n');
  }

  const hoy = () => fechaLocal(now()).slice(0, 10);

  function filtrar(tabla, lista) {
    if (tabla === 'hoy') { const d = hoy(); return lista.filter((r) => r.fecha.slice(0, 10) === d); }
    if (tabla === 'semana') { const desde = now() - 7 * DIA_MS; return lista.filter((r) => r.t >= desde); }
    return lista;
  }

  const publico = (r) => ({
    id: r.id, juego: r.juego, modo: r.modo, categoria: r.categoria, nombre: r.nombre,
    puntaje: r.puntaje, detalle: r.detalle || {}, jugadores: r.jugadores || [], fecha: r.fecha,
  });

  /** Top de una tabla para un juego y categoría; la misma persona puede repetirse */
  function top(juego, categoria, tabla, n) {
    if (!TABLAS.includes(tabla)) throw new Error('Tabla desconocida: ' + tabla);
    const lista = registros.filter((r) => r.juego === juego && r.categoria === categoria);
    return filtrar(tabla, lista).sort(comparar).slice(0, n || 10)
      .map((r, i) => Object.assign(publico(r), { puesto: i + 1 }));
  }

  /** Mejor puntaje histórico de un juego y categoría (para mostrar "Récord") */
  function record(juego, categoria) {
    const t = top(juego, categoria, 'siempre', 1)[0];
    return t ? { nombre: t.nombre, puntaje: t.puntaje, detalle: t.detalle } : null;
  }

  /** Copia del archivo una vez por día, antes del primer puntaje de ese día */
  function copiaDiaria(dia) {
    if (!fs.existsSync(archivo)) return;
    const destino = path.join(dir, 'backups', `puntajes-${dia}.jsonl`);
    if (fs.existsSync(destino)) return;
    try {
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.copyFileSync(archivo, destino);
    } catch (err) {
      console.error('No se pudo hacer la copia diaria de los puntajes:', err.message);
    }
  }

  /**
   * Guarda los puntajes de una partida terminada.
   * partida: { partidaId, juego, modo, registros: [{ categoria, nombre, puntaje, detalle, jugadores }] }
   * Devuelve cada registro guardado con su puesto en Hoy y Siempre y si es récord.
   */
  function guardarPartida(partida) {
    const t = now();
    const fecha = fechaLocal(t);
    const juego = String(partida.juego);
    const modo = String(partida.modo || '');
    const partidaId = typeof partida.partidaId === 'string' && ID.test(partida.partidaId)
      ? partida.partidaId : 'p-' + t.toString(36) + '-' + crypto.randomBytes(2).toString('hex');
    const nuevos = (partida.registros || []).map((j) => ({
      id: crypto.randomBytes(4).toString('hex'),
      partidaId,
      juego,
      modo,
      categoria: String(j.categoria),
      nombre: String(j.nombre),
      nombreClave: nombreClave(j.nombre),
      puntaje: Math.max(0, Math.min(MAX_PUNTAJE, Math.round(Number(j.puntaje) || 0))),
      detalle: limpiarDetalle(j.detalle),
      jugadores: Array.isArray(j.jugadores) ? j.jugadores.map(String).slice(0, 8) : [],
      fecha,
    }));
    if (!nuevos.length) return [];
    copiaDiaria(fecha.slice(0, 10));
    // récord anterior de cada categoría, antes de agregar los nuevos
    const previos = {};
    nuevos.forEach((r) => {
      if (!(r.categoria in previos)) {
        const rec = record(juego, r.categoria);
        previos[r.categoria] = rec ? rec.puntaje : -1;
      }
    });
    agregar(nuevos);
    const guardados = nuevos.map((r) => Object.assign({}, r, { t }));
    registros.push(...guardados);
    return guardados.map((r) => {
      const lugar = (tabla) => filtrar(tabla, registros.filter((x) => x.juego === juego && x.categoria === r.categoria))
        .sort(comparar).indexOf(r) + 1;
      return {
        registro: publico(r),
        puestoHoy: lugar('hoy'),
        puestoSiempre: lugar('siempre'),
        esRecord: r.puntaje > 0 && r.puntaje > previos[r.categoria] && lugar('siempre') === 1,
      };
    });
  }

  /** ¿Ya se guardó esta partida? (así un reenvío no se guarda dos veces) */
  function tienePartida(partidaId) {
    return typeof partidaId === 'string' && registros.some((r) => r.partidaId === partidaId);
  }

  /**
   * Filtro de malas palabras. La lista se vuelve a leer solo si cambió el archivo. Cada palabra
   * bloquea el nombre si aparece suelta, si se escribe todo junto ("p u t o") o, en las de 5 letras
   * o más, con terminaciones de plural/diminutivo/aumentativo; así "Vergara" no se bloquea.
   */
  const SUFIJOS = new Set(['o', 'a', 'e', 's', 'os', 'as', 'es', 'ito', 'ita', 'itos', 'itas',
    'azo', 'aza', 'azos', 'azas', 'on', 'ona', 'ones', 'onas']);
  let filtro = { mtime: -1, palabras: [] };
  function palabrasProhibidas() {
    let mtime = 0;
    try { mtime = fs.statSync(archivoPalabras).mtimeMs; } catch { /* sin archivo: lista base */ }
    if (mtime !== filtro.mtime) {
      let texto = PALABRAS_BASE;
      try { texto = fs.readFileSync(archivoPalabras, 'utf8'); } catch { /* sin archivo: lista base */ }
      const palabras = [];
      texto.split('\n').forEach((l) => {
        const cruda = nombreClave(l.replace(/#.*/, ''));
        const norm = normalizarFiltro(cruda);
        if (norm) palabras.push({ norm, raiz: cruda.length >= 5 ? norm.replace(/[aeo]$/, '') : null });
      });
      filtro = { mtime, palabras };
    }
    return filtro.palabras;
  }

  function nombrePermitido(nombre) {
    const prohibidas = palabrasProhibidas();
    const norm = normalizarFiltro(nombre);
    const palabras = norm.split(' ').filter(Boolean);
    const junto = palabras.join('');
    return !prohibidas.some((p) => junto === p.norm || palabras.some((w) => w === p.norm ||
      (w === p.norm + 's') ||
      (p.raiz && w.startsWith(p.raiz) && SUFIJOS.has(w.slice(p.raiz.length)))));
  }

  /** Todas las tablas de una lista de juegos: [{ id, nombre, rankings: [{ id, titulo, ..., hoy, semana, siempre }] }] */
  function tablas(juegos, n) {
    return juegos.map((j) => ({
      id: j.id,
      nombre: j.nombre,
      rankings: (j.rankings || []).map((rk) => Object.assign({}, rk, {
        hoy: top(j.id, rk.id, 'hoy', n),
        semana: top(j.id, rk.id, 'semana', n),
        siempre: top(j.id, rk.id, 'siempre', n),
      })),
    }));
  }

  const cantidad = () => registros.length;

  return {
    archivo, guardarPartida, tienePartida, top, record, tablas, nombrePermitido, cantidad, recargar: cargar,
  };
}

module.exports = { createLeaderboard, nombreClave, normalizarFiltro, limpiarNombre, fechaLocal, TABLAS };
