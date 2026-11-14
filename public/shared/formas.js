/*
 * Símbolos dibujados (no dependen de que la fuente tenga ● ▲ ■ ★ ◆ ✚).
 *   Formas.dibujar(ctx, '★', x, y, radio, color)   → en un canvas
 *   Formas.svg('★', color)                          → texto SVG para el celu
 * Si el símbolo no es uno de esos, se escribe como texto.
 */
(function () {
  'use strict';
  const PUNTOS = {
    '▲': [[0, -1], [0.95, 0.75], [-0.95, 0.75]],
    '■': [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]],
    '◆': [[0, -1], [0.85, 0], [0, 1], [-0.85, 0]],
    '✚': [[-0.3, -1], [0.3, -1], [0.3, -0.3], [1, -0.3], [1, 0.3], [0.3, 0.3], [0.3, 1], [-0.3, 1], [-0.3, 0.3], [-1, 0.3], [-1, -0.3], [-0.3, -0.3]],
  };
  (function () {
    const est = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.45 : 1;
      const a = -Math.PI / 2 + i * Math.PI / 5;
      est.push([Math.cos(a) * r, Math.sin(a) * r + 0.08]);
    }
    PUNTOS['★'] = est;
  })();

  function dibujar(ctx, simbolo, x, y, radio, color) {
    ctx.fillStyle = color;
    if (simbolo === '●') {
      ctx.beginPath(); ctx.arc(x, y, radio * 0.9, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const pts = PUNTOS[simbolo];
    if (pts) {
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(x + px * radio, y + py * radio) : ctx.moveTo(x + px * radio, y + py * radio)));
      ctx.closePath(); ctx.fill();
      return;
    }
    ctx.font = `700 ${Math.round(radio * 1.8)}px 'Barlow Condensed', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(simbolo || '').slice(0, 2), x, y);
  }

  function svg(simbolo, color) {
    const c = color || '#fff';
    if (simbolo === '●') return `<svg viewBox="-1 -1 2 2" aria-hidden="true"><circle r="0.9" fill="${c}"/></svg>`;
    const pts = PUNTOS[simbolo];
    if (pts) return `<svg viewBox="-1.05 -1.05 2.1 2.1" aria-hidden="true"><polygon fill="${c}" points="${pts.map((p) => p.join(',')).join(' ')}"/></svg>`;
    const t = String(simbolo || '').slice(0, 2).replace(/[<>&"]/g, '');
    return `<svg viewBox="-1 -1 2 2" aria-hidden="true"><text x="0" y="0.35" font-size="1.2" text-anchor="middle" fill="${c}" font-weight="700">${t}</text></svg>`;
  }

  window.Formas = { dibujar, svg };
})();
