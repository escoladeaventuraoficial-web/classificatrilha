/* Classifica Trilha 2.0 — importação local de traçados GPX, KML e KMZ.
   Os arquivos são lidos no próprio aparelho; nada é enviado a serviços externos. */
(function (root) {
  'use strict';

  const MAX_STORED_POINTS = 3000;   // pontos guardados por traçado
  const CLIMB_THRESHOLD_M = 3;      // histerese para ignorar ruído de altitude do GPS

  const haversine = (a, b) => {
    const R = 6371, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const q = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(q));
  };

  /* Média móvel simples sobre as altitudes válidas */
  function smooth(values, win = 5) {
    const half = Math.floor(win / 2), out = new Array(values.length);
    for (let i = 0; i < values.length; i++) {
      let s = 0, n = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
        if (values[j] != null) { s += values[j]; n++; }
      }
      out[i] = n ? s / n : null;
    }
    return out;
  }

  /* Subida e descida acumuladas com histerese (só conta quando a variação
     desde a última referência passa do limiar). */
  function climb(eles, threshold = CLIMB_THRESHOLD_M) {
    let ref = null, up = 0, down = 0;
    for (const e of eles) {
      if (e == null) continue;
      if (ref == null) { ref = e; continue; }
      if (e - ref >= threshold) { up += e - ref; ref = e; }
      else if (ref - e >= threshold) { down += ref - e; ref = e; }
    }
    return { ascent: Math.round(up), descent: Math.round(down) };
  }

  /* Constrói o traçado a partir de pontos brutos {lat, lon, ele|null} */
  function buildTrack(raw, meta) {
    if (raw.length < 2) throw new Error('O arquivo não contém um percurso válido (menos de 2 pontos).');
    // distância acumulada sobre TODOS os pontos
    const cum = new Array(raw.length);
    cum[0] = 0;
    for (let i = 1; i < raw.length; i++) cum[i] = cum[i - 1] + haversine(raw[i - 1], raw[i]);

    const valid = raw.filter(p => p.ele != null && Number.isFinite(p.ele));
    const allZero = valid.length > 0 && valid.every(p => p.ele === 0);
    const hasElevation = valid.length / raw.length >= 0.9 && !allZero;
    const eles = hasElevation ? smooth(raw.map(p => (p.ele != null && Number.isFinite(p.ele) ? p.ele : null))) : raw.map(() => null);

    const step = Math.max(1, Math.ceil(raw.length / MAX_STORED_POINTS));
    const points = [];
    for (let i = 0; i < raw.length; i++) {
      if (i % step === 0 || i === raw.length - 1) {
        points.push({
          lat: +raw[i].lat.toFixed(6), lon: +raw[i].lon.toFixed(6),
          ele: eles[i] == null ? null : Math.round(eles[i] * 10) / 10,
          d: +cum[i].toFixed(4)
        });
      }
    }
    const c = hasElevation ? climb(eles) : { ascent: 0, descent: 0 };
    const known = eles.filter(e => e != null);
    const stats = {
      distance: cum[cum.length - 1],
      ascent: c.ascent, descent: c.descent,
      min: known.length ? Math.round(Math.min(...known)) : null,
      max: known.length ? Math.round(Math.max(...known)) : null
    };
    return Object.assign({ points, stats, hasElevation, rawCount: raw.length }, meta);
  }

  /* Estatísticas de um trecho do traçado (km inicial → km final) */
  function sliceStats(track, fromKm, toKm) {
    const pts = withDistances(track.points || []);
    const total = pts[pts.length - 1].d;
    const a = Math.max(0, Math.min(fromKm, total)), b = Math.max(0, Math.min(toKm, total));
    if (!(b > a)) throw new Error('O km final deve ser maior que o km inicial.');
    const at = km => {
      let i = pts.findIndex(p => p.d >= km);
      if (i <= 0) return Object.assign({}, pts[0]);
      const p0 = pts[i - 1], p1 = pts[i], f = p1.d === p0.d ? 0 : (km - p0.d) / (p1.d - p0.d);
      return {
        lat: p0.lat + (p1.lat - p0.lat) * f, lon: p0.lon + (p1.lon - p0.lon) * f,
        ele: p0.ele == null || p1.ele == null ? null : p0.ele + (p1.ele - p0.ele) * f, d: km
      };
    };
    const s = at(a), e = at(b);
    const inner = pts.filter(p => p.d > a && p.d < b);
    const sel = [s, ...inner, e];
    const hasEle = track.hasElevation !== false && sel.every(p => p.ele != null);
    const c = hasEle ? climb(sel.map(p => p.ele)) : { ascent: null, descent: null };
    return {
      distance: b - a, ascent: c.ascent, descent: c.descent,
      startEle: hasEle ? Math.round(s.ele) : null, endEle: hasEle ? Math.round(e.ele) : null,
      start: s, end: e, hasElevation: hasEle
    };
  }
  /* Traçados do app antigo não têm a distância acumulada (d): calcula uma vez. */
  function withDistances(points) {
    if (points.length && points.every(p => p.d != null)) return points;
    let d = 0;
    return points.map((p, i) => {
      if (i) d += haversine(points[i - 1], p);
      return Object.assign({}, p, { d });
    });
  }

  /* ---------- GPX ---------- */
  function parseGpx(xml) {
    const trkpts = [...xml.getElementsByTagName('trkpt')];
    const nodes = trkpts.length ? trkpts : [...xml.getElementsByTagName('rtept')];
    const raw = [], times = [];
    for (const n of nodes) {
      const lat = parseFloat(n.getAttribute('lat')), lon = parseFloat(n.getAttribute('lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const e = n.getElementsByTagName('ele')[0], t = n.getElementsByTagName('time')[0];
      const ele = e && e.textContent.trim() !== '' ? parseFloat(e.textContent) : null;
      raw.push({ lat, lon, ele: Number.isFinite(ele) ? ele : null });
      if (t) { const ms = Date.parse(t.textContent.trim()); if (Number.isFinite(ms)) times.push(ms); }
    }
    const nameNode = xml.querySelector('trk > name') || xml.querySelector('rte > name') || xml.querySelector('metadata > name');
    let durationMin = null;
    if (times.length > 1 && times.length >= raw.length * 0.9) {
      const span = (times[times.length - 1] - times[0]) / 60000;
      if (span > 0) durationMin = Math.round(span);
    }
    return { raw, name: nameNode ? nameNode.textContent.trim() : '', durationMin };
  }

  /* ---------- KML ---------- */
  function parseKml(xml) {
    const raw = [];
    const pushTuple = s => {
      const [lon, lat, ele] = s.split(',').map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lon)) raw.push({ lat, lon, ele: Number.isFinite(ele) ? ele : null });
    };
    // 1) LineString / LinearRing (ignora pontos de interesse isolados)
    let found = false;
    for (const el of [...xml.getElementsByTagName('LineString'), ...xml.getElementsByTagName('LinearRing')]) {
      const c = el.getElementsByTagName('coordinates')[0];
      if (c) { c.textContent.trim().split(/\s+/).filter(Boolean).forEach(pushTuple); found = true; }
    }
    // 2) gx:Track (Google Earth / Strava)
    if (!found) {
      for (const el of xml.getElementsByTagName('gx:coord')) {
        const [lon, lat, ele] = el.textContent.trim().split(/\s+/).map(Number);
        if (Number.isFinite(lat) && Number.isFinite(lon)) raw.push({ lat, lon, ele: Number.isFinite(ele) ? ele : null });
      }
    }
    const nameNode = xml.querySelector('Placemark > name') || xml.querySelector('Document > name') || xml.querySelector('name');
    return { raw, name: nameNode ? nameNode.textContent.trim() : '', durationMin: null };
  }

  /* ---------- KMZ (zip) ---------- */
  async function extractKmz(buffer) {
    const v = new DataView(buffer);
    let eocd = -1;
    for (let i = v.byteLength - 22; i >= Math.max(0, v.byteLength - 65557); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Arquivo KMZ inválido.');
    let off = v.getUint32(eocd + 16, true);
    const entries = [];
    while (off < v.byteLength && v.getUint32(off, true) === 0x02014b50) {
      const method = v.getUint16(off + 10, true), size = v.getUint32(off + 20, true);
      const nameLen = v.getUint16(off + 28, true), extra = v.getUint16(off + 30, true), comment = v.getUint16(off + 32, true);
      const local = v.getUint32(off + 42, true);
      const name = new TextDecoder().decode(new Uint8Array(buffer, off + 46, nameLen));
      entries.push({ method, size, local, name });
      off += 46 + nameLen + extra + comment;
    }
    const kmls = entries.filter(e => e.name.toLowerCase().endsWith('.kml'));
    const pick = kmls.find(e => /(^|\/)doc\.kml$/i.test(e.name)) || kmls[0];
    if (!pick) throw new Error('Nenhum arquivo KML encontrado dentro do KMZ.');
    const lName = v.getUint16(pick.local + 26, true), lExtra = v.getUint16(pick.local + 28, true);
    const data = new Uint8Array(buffer, pick.local + 30 + lName + lExtra, pick.size);
    if (pick.method === 0) return new TextDecoder().decode(data);
    if (pick.method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não consegue abrir KMZ. Exporte como GPX ou KML.');
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new TextDecoder().decode(await new Response(stream).arrayBuffer());
    }
    throw new Error('Tipo de compactação do KMZ não suportado.');
  }

  /* ---------- Entrada principal ---------- */
  async function importFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['gpx', 'kml', 'kmz'].includes(ext)) throw new Error('Selecione um arquivo GPX, KML ou KMZ.');
    const text = ext === 'kmz' ? await extractKmz(await file.arrayBuffer()) : await file.text();
    const xml = new DOMParser().parseFromString(text, 'application/xml');
    if (xml.getElementsByTagName('parsererror').length) throw new Error('O arquivo não é um XML válido.');
    const parsed = ext === 'gpx' ? parseGpx(xml) : parseKml(xml);
    if (parsed.raw.length < 2) throw new Error('Não encontrei um percurso (linha) neste arquivo. Pontos isolados não são importados.');
    return buildTrack(parsed.raw, { name: parsed.name, fileName: file.name, format: ext.toUpperCase(), durationMin: parsed.durationMin });
  }

  const api = { haversine, climb, smooth, buildTrack, sliceStats, withDistances, parseGpx, parseKml, extractKmz, importFile };
  root.CT = Object.assign(root.CT || {}, { tracks: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
