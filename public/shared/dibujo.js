/*
 * Ayudas de dibujo para los juegos (canvas 2D). Mismo estilo "Institucional Nº4" que el resto.
 *   Dibujo.PAL, Dibujo.texto(ctx, 'Hola', x, y, { tam, color, alinear, peso, fuente, base })
 *   Dibujo.capa(clave, ancho, alto, dibujar) → canvas en caché (se redibuja solo si cambia la clave)
 *   Dibujo.encabezado(ctx, contexto, titulo, derecha)  → franja de arriba con título, modo y emblema
 *   Dibujo.seccion(ctx, 'Jugadores', x, y), Dibujo.ficha(ctx, x, y, w, h, color)  → como en el bowling
 * Regla de rendimiento (aprendida en el bowling): nada de shadowBlur, y lo que no cambia va a una capa.
 */
(function () {
  'use strict';
  const PAL = {
    noche: '#0B1D30', panel: '#13314F', panel2: '#1A3C5E', azul: '#6272B4', celeste: '#7AB6E6',
    blanco: '#F4F8FB', gris: '#90A7BC', naranja: '#F2A33A', rojo: '#F46C70', verde: '#5DBF7A', linea: 'rgba(122,182,230,0.22)',
  };
  const FUENTE = '"Barlow", "Segoe UI", Arial, sans-serif';
  const TITULO = '"Barlow Condensed", "Arial Narrow", "Segoe UI", sans-serif';

  /** o: { tam, color, alinear, peso, fuente: 'texto' | (condensada), base, borde, colorBorde, ls (espaciado), max (ancho máx.) } */
  function texto(ctx, str, x, y, o) {
    o = o || {};
    ctx.font = `${o.peso || 700} ${o.tam || 32}px ${o.fuente === 'texto' ? FUENTE : TITULO}`;
    ctx.fillStyle = o.color || PAL.blanco;
    ctx.textAlign = o.alinear || 'left';
    ctx.textBaseline = o.base || 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = (o.ls || 0) + 'px';
    const t = String(str);
    if (o.borde) { ctx.lineWidth = o.borde; ctx.strokeStyle = o.colorBorde || PAL.noche; ctx.lineJoin = 'round'; ctx.strokeText(t, x, y, o.max); }
    if (o.max) ctx.fillText(t, x, y, o.max); else ctx.fillText(t, x, y);
    if ('letterSpacing' in ctx && o.ls) ctx.letterSpacing = '0px';
  }

  const capas = {};
  function capa(clave, ancho, alto, dibujar) {
    let c = capas[clave.split('|')[0]];
    if (!c || c.clave !== clave) {
      const cv = c ? c.cv : document.createElement('canvas');
      cv.width = ancho; cv.height = alto;
      const g = cv.getContext('2d');
      g.clearRect(0, 0, ancho, alto);
      dibujar(g);
      c = capas[clave.split('|')[0]] = { clave, cv };
    }
    return c.cv;
  }

  /**
   * Franja superior común (140 px), como el encabezado del bowling: título condensado con mucho
   * espaciado, el modo en celeste debajo, el emblema de la escuela a la derecha y la línea azul.
   */
  function encabezado(ctx, contexto, titulo, derecha) {
    const logo = contexto.logo;
    const listo = !!(logo && logo.complete && logo.naturalWidth);
    const cv = capa(`enc|${titulo}|${derecha || ''}|${contexto.config.colores.principal}|${listo}`, 1080, 140, (g) => {
      g.fillStyle = PAL.noche; g.fillRect(0, 0, 1080, 140);
      g.fillStyle = contexto.config.colores.principal; g.fillRect(0, 136, 1080, 4);
      if (listo) {
        const t = 104, k = Math.min(t / logo.naturalWidth, t / logo.naturalHeight);
        g.drawImage(logo, 1080 - 48 - logo.naturalWidth * k, (136 - logo.naturalHeight * k) / 2, logo.naturalWidth * k, logo.naturalHeight * k);
      }
      g.fillStyle = contexto.config.colores.acento; g.fillRect(48, 24, 12, 92);
      texto(g, titulo.toUpperCase(), 84, 84, { tam: 66, peso: 800, ls: 6, max: 1080 - 84 - 190 });
      if (derecha) texto(g, derecha.toUpperCase(), 86, 120, { tam: 26, peso: 700, ls: 3, color: contexto.config.colores.secundario });
    });
    ctx.drawImage(cv, 0, 0);
  }

  /** Título de sección como en el bowling: condensado en celeste con una línea a la derecha */
  function seccion(ctx, etiqueta, x, y, hasta, color) {
    texto(ctx, etiqueta.toUpperCase(), x, y, { tam: 28, peso: 700, ls: 4, color: color || PAL.celeste });
    ctx.font = `700 28px ${TITULO}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    const w = ctx.measureText(etiqueta.toUpperCase()).width;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillStyle = PAL.linea;
    ctx.fillRect(x + w + 18, y - 9, Math.max(0, (hasta || 1020) - (x + w + 18)), 2);
  }

  /** Ficha con barra de color a la izquierda (jugadores) */
  function ficha(ctx, x, y, w, h, color, fondo) {
    ctx.fillStyle = fondo || PAL.panel;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 10, h);
  }

  /** Rectángulo con esquinas apenas redondeadas */
  function rect(ctx, x, y, w, h, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  /** Aclara (+) u oscurece (-) un color #rrggbb */
  function tono(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const m = (v) => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f));
    r = m(r); g = m(g); b = m(b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  const suave = (t) => t * t * (3 - 2 * t);
  const salida = (t) => 1 - Math.pow(1 - t, 3);

  window.Dibujo = { PAL, FUENTE, TITULO, texto, capa, encabezado, seccion, ficha, rect, tono, suave, salida };
})();
