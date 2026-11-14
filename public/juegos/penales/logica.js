/*
 * Penales: reglas sin dibujo. Convierte un trazo en un tiro y decide si es gol, atajada,
 * afuera o palo. La usan la tele (window.PenalesLogica), la simulación y los tests (require).
 *
 * Coordenadas del arco: x de -1 (palo izquierdo) a 1 (palo derecho), y de 0 (piso) a 1 (travesaño).
 * Zonas (como la grilla 3×2 del celu del arquero):   0 1 2   ← arriba
 *                                                    3 4 5   ← abajo
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../../shared/trazo.js'));
  else root.PenalesLogica = factory(root.Trazo);
})(typeof self !== 'undefined' ? self : this, function (Trazo) {
  'use strict';

  const BORDE = 0.04;          // medio ancho de la franja del palo / travesaño (en unidades del arco)
  const PEGADO = 0.82;         // |x| desde el que un tiro está "pegado al palo"
  const FUERTE = 0.8;          // fuerza desde la que un tiro es "muy fuerte"
  const LENTO = 0.25;          // fuerza por debajo de la que el arquero llega aunque se tire alto/bajo
  const CENTRO = 'centro';     // el arquero no eligió: se queda parado en el medio (cubre zonas 1 y 4)

  /**
   * Calibración del trazo. En el celu las medidas son "altos del área de deslizar"; con el mouse,
   * "altos del lienzo" (1920 px). Desde la pelota hasta el travesaño dibujado ≈ altura 1.
   *   s0/s1: subida que da altura 0 (piso) y 1 (travesaño)
   *   angulo: grados respecto de la vertical que llevan la pelota al palo
   *   v0/v1: velocidad (altos/segundo) que da fuerza 0 y 1
   */
  const PERFILES = {
    celu: { s0: 0.12, s1: 0.62, angulo: 20, v0: 0.6, v1: 3.6 },
    mouse: { s0: 0.06, s1: 0.40, angulo: 24, v0: 0.3, v1: 2.0 },
  };

  const DIFICULTAD = {
    facil: { tendencia: 0.3, lectura: 0.0, centro: 0.15 },
    normal: { tendencia: 0.8, lectura: 0.17, centro: 0.08 },
    dificil: { tendencia: 1.6, lectura: 0.3, centro: 0.04 },
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function azar(semilla) {
    let s = (semilla >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  /** Normal(0,1) con Box-Muller */
  function gauss(rnd) {
    const u = Math.max(1e-9, rnd()), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /**
   * Trazo → tiro { x, y, fuerza, comba } (o null si el trazo no sirve: muy corto o hacia abajo).
   * opciones: { perfil: 'celu' | 'mouse', rnd (para el error humano), sinRuido }
   */
  function trazoATiro(puntos, opciones) {
    opciones = opciones || {};
    const p = PERFILES[opciones.perfil] || PERFILES.celu;
    const a = Trazo.analizar(puntos);
    if (!a || a.subida < p.s0 * 0.6) return null;
    if (Math.abs(a.angulo) > 70) return null;
    const fuerza = clamp((a.velocidad - p.v0) / (p.v1 - p.v0), 0, 1);
    const comba = clamp(a.curva / 0.15, -1, 1);
    let x = a.angulo / p.angulo + comba * 0.22;
    let y = (a.subida - p.s0) / (p.s1 - p.s0);
    if (fuerza < LENTO) y *= 0.4 + 2.4 * fuerza;             // tiro flojo: va más bajo
    if (fuerza > 0.85) y += (fuerza - 0.85) * 1.6;            // demasiada fuerza: el tiro sube
    if (!opciones.sinRuido && opciones.rnd) {
      x += gauss(opciones.rnd) * 0.035 * (0.6 + fuerza);
      y += gauss(opciones.rnd) * 0.035;
    }
    y = Math.max(0.02, y);
    const r = (v) => Math.round(v * 1000) / 1000 + 0;
    return { x: r(x), y: r(y), fuerza: r(fuerza), comba: r(comba) };
  }

  /** Si el pateador no tira en 15 segundos: tiro débil al centro */
  function tiroDebil() {
    return { x: 0, y: 0.12, fuerza: 0.12, comba: 0, debil: true };
  }

  function zonaDe(x, y) {
    const col = x < -1 / 3 ? 0 : x > 1 / 3 ? 2 : 1;
    const fila = y >= 0.5 ? 0 : 1;
    return fila * 3 + col;
  }
  const columna = (z) => (z === CENTRO ? 1 : z % 3);
  const cubre = (zonaArquero, z) => (zonaArquero === CENTRO ? (z === 1 || z === 4) : zonaArquero === z);

  /**
   * Decide el resultado. zonaArquero: 0..5 o 'centro'.
   * Devuelve { resultado: 'gol' | 'atajada' | 'afuera' | 'palo', zona, golazo, pegado, donde }
   */
  function evaluar(tiro, zonaArquero) {
    const ax = Math.abs(tiro.x);
    const zona = zonaDe(clamp(tiro.x, -1, 1), clamp(tiro.y, 0, 1));
    const pegado = ax >= PEGADO || tiro.y >= 0.85;
    if (ax > 1 + BORDE || tiro.y > 1 + BORDE) return { resultado: 'afuera', zona, golazo: false, pegado: ax < 1.25 && tiro.y < 1.3 };
    if (ax >= 1 - BORDE) return { resultado: 'palo', zona, golazo: false, pegado: true, donde: tiro.x < 0 ? 'izquierdo' : 'derecho' };
    if (tiro.y >= 1 - BORDE) return { resultado: 'palo', zona, golazo: false, pegado: true, donde: 'travesaño' };
    const golazo = tiro.fuerza >= FUERTE && ax >= PEGADO;
    let ataja = cubre(zonaArquero, zona) && !golazo;
    // pelota lenta: si el arquero se tiró para ese lado, llega aunque haya elegido otra altura
    if (!ataja && tiro.fuerza < LENTO && zonaArquero !== null && zonaArquero !== undefined && columna(zonaArquero) === columna(zona)) ataja = true;
    return { resultado: ataja ? 'atajada' : 'gol', zona, golazo, pegado };
  }

  /**
   * Arquero automático: elige una zona al azar con tendencia hacia donde más patea el jugador.
   * historial: zonas de los tiros anteriores de ese jugador. tiro: el tiro real (para la "lectura").
   */
  function elegirZonaAuto(historial, dificultad, rnd, tiro) {
    const d = DIFICULTAD[dificultad] || DIFICULTAD.normal;
    if (tiro && rnd() < d.lectura) return zonaDe(clamp(tiro.x, -1, 1), clamp(tiro.y, 0, 1)); // leyó el tiro
    if (rnd() < d.centro) return CENTRO;
    const pesos = [1, 1, 1, 1, 1, 1];
    (historial || []).forEach((z) => { if (z >= 0 && z < 6) pesos[z] += d.tendencia; });
    const total = pesos.reduce((a, b) => a + b, 0);
    let r = rnd() * total;
    for (let z = 0; z < 6; z++) { r -= pesos[z]; if (r <= 0) return z; }
    return 5;
  }

  /** Precisión de un tiro (0 a 1): qué tan lejos del centro del arco entró. Errados = 0 */
  function precision(tiro, resultado) {
    if (resultado !== 'gol') return 0;
    const dx = Math.abs(tiro.x), dy = Math.abs(tiro.y - 0.5) * 2;
    return clamp(Math.hypot(dx, dy) / Math.SQRT2, 0, 1);
  }

  /** Centro de una zona en coordenadas del arco (para la estirada del arquero) */
  function centroZona(z) {
    if (z === CENTRO || z == null) return { x: 0, y: 0.45 };
    return { x: [-0.62, 0, 0.62][z % 3], y: z < 3 ? 0.72 : 0.22 };
  }

  /**
   * 1 contra 1: estado de la tanda. tiros[jugador] = lista de true/false.
   * Devuelve { terminado, ganador (índice 0/1 o null), muerteSubita }
   */
  function estadoTanda(tirosA, tirosB, porLado) {
    porLado = porLado || 5;
    const golesA = tirosA.filter(Boolean).length, golesB = tirosB.filter(Boolean).length;
    const nA = tirosA.length, nB = tirosB.length;
    if (nA <= porLado && nB <= porLado) {
      const restanA = porLado - nA, restanB = porLado - nB;
      if (golesA > golesB + restanB) return { terminado: true, ganador: 0, muerteSubita: false };
      if (golesB > golesA + restanA) return { terminado: true, ganador: 1, muerteSubita: false };
      if (nA < porLado || nB < porLado) return { terminado: false, ganador: null, muerteSubita: false };
    }
    // muerte súbita: después de que los dos patearon la misma cantidad
    if (nA === nB) {
      if (golesA !== golesB) return { terminado: true, ganador: golesA > golesB ? 0 : 1, muerteSubita: nA > porLado };
      return { terminado: false, ganador: null, muerteSubita: true };
    }
    return { terminado: false, ganador: null, muerteSubita: nA >= porLado };
  }

  return {
    PERFILES, DIFICULTAD, BORDE, PEGADO, FUERTE, LENTO, CENTRO,
    azar, gauss, trazoATiro, tiroDebil, zonaDe, cubre, evaluar, elegirZonaAuto, precision, centroZona, estadoTanda,
  };
});
