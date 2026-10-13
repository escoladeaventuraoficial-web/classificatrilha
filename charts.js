/* Classifica Trilha 2.0 — gráficos SVG (mapa, perfil altimétrico) e pictogramas.
   Tudo é desenhado localmente: funciona sem internet e sem mapas de terceiros. */
(function (root) {
  'use strict';
  const { fmt } = root.CT;
  const esc = (s = '') => String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

  function niceStep(range, target = 5) {
    if (!(range > 0)) return 1;
    const raw = range / target, pow = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / pow;
    const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return m * pow;
  }
  const ticks = (min, max, step) => {
    const out = [];
    for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  };
  const trackHasElevation = t => !!t && t.hasElevation !== false && (t.points || []).some(p => p.ele != null && p.ele !== 0);

  /* ---------- Perfil altimétrico ---------- */
  function profile(survey, agg) {
    const W = 640, H = 300, L = 58, R = 16, T = 26, B = 46;
    const track = survey.track && survey.track.points && survey.track.points.length > 1 ? survey.track : null;
    let pts = null, kind = 'none', note = '';

    if (track && trackHasElevation(track)) {
      const withD = root.CT.tracks.withDistances(track.points);
      const step = Math.max(1, Math.ceil(withD.length / 500));
      pts = withD.filter((_, i) => i % step === 0 || i === withD.length - 1).map(p => [p.d, p.ele]);
      kind = 'track';
      note = 'Altitudes do traçado importado (' + esc(track.fileName || 'arquivo') + '), suavizadas para reduzir ruído do GPS.';
    } else if (agg.segments.length) {
      // estimado a partir das etapas: reta entre altitude inicial e final de cada etapa
      let x = 0, alt = null, relative = false;
      const first = agg.segments[0];
      if (Number.isFinite(first.startAltitude)) alt = first.startAltitude; else { alt = 0; relative = true; }
      pts = [[0, alt]];
      agg.segments.forEach(s => {
        x += s.distance;
        if (Number.isFinite(s.endAltitude) && !relative) alt = s.endAltitude;
        else alt = alt + s.ascent - s.descent;
        pts.push([x, alt]);
      });
      kind = 'estimated';
      note = relative
        ? 'Perfil esquemático: não há altitudes reais. Mostra apenas a variação acumulada das etapas (altitude relativa ao início).'
        : 'Perfil esquemático ligando as altitudes inicial e final informadas em cada etapa; não representa o relevo real entre elas.';
    }
    if (!pts || pts.length < 2) {
      return { kind: 'none', note: 'Sem dados de altitude.', svg: emptyBox(W, H, 'Perfil altimétrico indisponível: cadastre etapas ou importe um traçado com altitudes.') };
    }

    const maxX = Math.max(pts[pts.length - 1][0], 0.01);
    const ys = pts.map(p => p[1]);
    let yMin = Math.min(...ys), yMax = Math.max(...ys);
    if (yMax - yMin < 10) { const c = (yMax + yMin) / 2; yMin = c - 5; yMax = c + 5; }
    const ystep = niceStep(yMax - yMin, 4);
    yMin = Math.floor(yMin / ystep) * ystep; yMax = Math.ceil(yMax / ystep) * ystep;
    const xstep = niceStep(maxX, 6);
    const sx = v => L + v / maxX * (W - L - R), sy = v => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);

    const yt = ticks(yMin, yMax, ystep), xt = ticks(0, maxX, xstep);
    const dec = xstep < 1 ? 1 : 0;
    let g = '';
    yt.forEach(v => { g += `<line class="cg" x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}"/><text class="ct" x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${fmt(v, 0)}</text>`; });
    xt.forEach(v => { g += `<line class="cg" x1="${sx(v)}" x2="${sx(v)}" y1="${T}" y2="${H - B}"/><text class="ct" x="${sx(v)}" y="${H - B + 16}" text-anchor="middle">${fmt(v, dec)}</text>`; });

    const line = pts.map((p, i) => (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ' ' + sy(p[1]).toFixed(1)).join(' ');
    const area = line + ` L${sx(pts[pts.length - 1][0]).toFixed(1)} ${H - B} L${sx(0)} ${H - B} Z`;

    // limites das etapas
    let marks = '';
    const totalStages = agg.total;
    if (agg.segments.length > 1 && totalStages > 0 && Math.abs(totalStages - maxX) / maxX < 0.2) {
      let acc = 0;
      agg.segments.forEach((s, i) => {
        const x0 = acc / totalStages * maxX; acc += s.distance;
        const x1 = acc / totalStages * maxX;
        if (i) marks += `<line class="cs" x1="${sx(x0)}" x2="${sx(x0)}" y1="${T - 6}" y2="${H - B}"/>`;
        marks += `<text class="cm" x="${(sx(x0) + sx(x1)) / 2}" y="${T - 10}" text-anchor="middle">${i + 1}</text>`;
      });
    }

    const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Perfil altimétrico: distância em quilômetros por altitude em metros">
      ${g}<line class="ca" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><line class="ca" x1="${L}" x2="${L}" y1="${T}" y2="${H - B}"/>
      <path class="cf" d="${area}"/><path class="cl" d="${line}"/>${marks}
      <text class="cx" x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle">Distância (km)</text>
      <text class="cx" transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">Altitude (m)</text></svg>`;
    return { kind, note, svg };
  }

  function emptyBox(W, H, msg) {
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(msg)}"><rect class="cb" x="2" y="2" width="${W - 4}" height="${H - 4}" rx="14"/><text class="ct" x="${W / 2}" y="${H / 2}" text-anchor="middle">${esc(msg)}</text></svg>`;
  }

  /* ---------- Mapa esquemático do traçado ---------- */
  function map(survey) {
    const W = 360, H = 270, P = 26;
    const track = survey.track && survey.track.points && survey.track.points.length > 1 ? survey.track : null;
    if (!track) {
      return { kind: 'none', note: 'Sem traçado importado: importe um GPX, KML ou KMZ para exibir o mapa do percurso.',
        svg: emptyBox(W, H, 'Sem traçado importado') };
    }
    const p = track.points, lat0 = p.reduce((a, q) => a + q.lat, 0) / p.length, k = Math.cos(lat0 * Math.PI / 180);
    const xs = p.map(q => q.lon * k), ys = p.map(q => q.lat);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const rx = Math.max(maxX - minX, 1e-6), ry = Math.max(maxY - minY, 1e-6);
    const scale = Math.min((W - 2 * P) / rx, (H - 2 * P - 18) / ry);
    const ox = (W - rx * scale) / 2, oy = (H - 18 - ry * scale) / 2;
    const X = v => ox + (v - minX) * scale, Y = v => oy + (maxY - v) * scale;
    const step = Math.max(1, Math.ceil(p.length / 500));
    const pl = p.filter((_, i) => i % step === 0 || i === p.length - 1);
    const d = pl.map((q, i) => (i ? 'L' : 'M') + X(q.lon * k).toFixed(1) + ' ' + Y(q.lat).toFixed(1)).join(' ');
    const a = p[0], z = p[p.length - 1];

    // barra de escala: km por unidade de tela (1° lat ≈ 111,19 km)
    const kmPerPx = (1 / scale) * 111.19;
    const sbKm = niceStep(kmPerPx * 80, 1);
    const sbPx = sbKm / kmPerPx;
    const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa esquemático do traçado importado, com início e fim">
      <rect class="cb" x="2" y="2" width="${W - 4}" height="${H - 4}" rx="14"/>
      <path class="mp-halo" d="${d}"/><path class="mp" d="${d}"/>
      <circle class="m-start" cx="${X(a.lon * k).toFixed(1)}" cy="${Y(a.lat).toFixed(1)}" r="8"/>
      <circle class="m-end" cx="${X(z.lon * k).toFixed(1)}" cy="${Y(z.lat).toFixed(1)}" r="8"/>
      <g transform="translate(${W - 30} 34)"><path class="mn" d="M0 -16 L7 6 L0 1 L-7 6Z"/><text class="ct" y="-20" text-anchor="middle">N</text></g>
      <g transform="translate(${P} ${H - 18})"><line class="ca" x1="0" x2="${sbPx.toFixed(1)}" y1="0" y2="0" stroke-width="3"/><text class="ct" x="0" y="-6">${fmt(sbKm, sbKm < 1 ? 2 : (Number.isInteger(sbKm) ? 0 : 1))} km</text></g>
      <g transform="translate(${W - 150} ${H - 14})"><circle class="m-start" r="5" cx="0" cy="-3"/><text class="ct" x="9" y="0">Início</text><circle class="m-end" r="5" cx="64" cy="-3"/><text class="ct" x="73" y="0">Fim</text></g>
    </svg>`;
    return { kind: 'track', note: 'Traçado importado (' + esc(track.fileName || 'arquivo') + '). Mapa esquemático sem fundo cartográfico; norte para cima.', svg };
  }

  /* ---------- Pictogramas dos níveis ---------- */
  const ICONS = {
    orientation: [
      '<path d="M24 58 30 8M40 58 34 8"/><path d="M32 54v-6M32 40v-6M32 26v-6" stroke-dasharray="1 0"/><path d="M46 20h12l-3 5 3 5H46z"/>',
      '<path d="M32 58V36M32 36 15 12M32 36 49 12"/><path d="M40 11h9v9"/>',
      '<circle cx="32" cy="34" r="22"/><path d="M32 18l6 16-6 16-6-16z"/><path d="M32 6v5"/>',
      '<path d="M4 52 22 24l10 14 10-18 18 32"/><path d="M8 60c10-4 18 0 26-4s16-2 22-6" stroke-dasharray="4 4"/>',
      '<path d="M6 54h16" stroke-dasharray="4 3"/><path d="M26 54l4-14h10l4 14z"/><path d="M22 46c4-22 28-22 34 0"/><path d="m50 40 6 7 3-9"/>'
    ],
    terrain: [
      '<path d="M4 44h56"/><path d="M12 52h40" stroke-dasharray="3 5"/>',
      '<path d="M4 48 60 32"/><path d="M12 56h40" stroke-dasharray="3 5"/>',
      '<path d="M4 52h12v-9h11v5h8V37h11v5h14"/><circle cx="20" cy="58" r="2"/><circle cx="40" cy="58" r="2"/>',
      '<path d="M4 56 15 30l15 5 9 21z"/><path d="m36 56 8-33 16 7v26z"/>',
      '<path d="M38 6h20v54H38z"/><path d="M38 20h10M38 34h10M48 48h10"/><path d="M22 6v44"/><circle cx="22" cy="55" r="5"/>'
    ]
  };
  const levelIcon = (kind, n, size = 52) =>
    `<svg class="lvl-ico" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[kind][n - 1]}</svg>`;

  root.CT = Object.assign(root.CT || {}, { charts: { profile, map, levelIcon, trackHasElevation, esc } });
})(window);
