/*
 * Ayudas de dibujo para los juegos (canvas 2D). Mismo estilo "Institucional Nº4" que el resto.
 *   Dibujo.PAL, Dibujo.texto(ctx, 'Hola', x, y, { tam, color, alinear, peso, fuente, base })
 *   Dibujo.capa(clave, ancho, alto, dibujar) → canvas en caché (se redibuja solo si cambia la clave)
 *   Dibujo.encabezado(ctx, contexto, titulo, derecha)  → franja de arriba con escuela y título
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

  function texto(ctx, str, x, y, o) {
    o = o || {};
    ctx.font = `${o.peso || 700} ${o.tam || 32}px ${o.fuente === 'texto' ? FUENTE : TITULO}`;
    ctx.fillStyle = o.color || PAL.blanco;
    ctx.textAlign = o.alinear || 'left';
    ctx.textBaseline = o.base || 'alphabetic';
    if (o.borde) { ctx.lineWidth = o.borde; ctx.strokeStyle = o.colorBorde || PAL.noche; ctx.lineJoin = 'round'; ctx.strokeText(String(str), x, y); }
    ctx.fillText(String(str), x, y);
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

  /** Franja superior común: escuela a la izquierda y título del juego (130 px de alto) */
  function encabezado(ctx, contexto, titulo, derecha) {
    const cv = capa(`enc|${titulo}|${derecha || ''}|${contexto.config.colores.principal}`, 1080, 140, (g) => {
      g.fillStyle = PAL.noche; g.fillRect(0, 0, 1080, 140);
      g.fillStyle = contexto.config.colores.principal; g.fillRect(0, 132, 1080, 8);
      texto(g, (contexto.config.nombreCorto || '').toUpperCase(), 60, 56, { tam: 26, color: contexto.config.colores.secundario, peso: 600 });
      texto(g, titulo.toUpperCase(), 60, 112, { tam: 56, peso: 800 });
      if (derecha) texto(g, derecha, 1020, 112, { tam: 34, color: PAL.gris, alinear: 'right', peso: 700 });
    });
    ctx.drawImage(cv, 0, 0);
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

  window.Dibujo = { PAL, FUENTE, TITULO, texto, capa, encabezado, rect, tono, suave, salida };
})();
