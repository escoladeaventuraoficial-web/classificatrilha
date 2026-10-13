/* Classifica Trilha 2.0 — núcleo de regras (ABNT NBR ISO 3021:2024, Seção 14)
   Sem dependência de DOM: pode ser testado em Node. */
(function (root) {
  'use strict';

  /* ---------- Tabelas da norma ---------- */
  const SEVERITY_GROUPS = [
    ['Quedas e passagens', ['a', 'b', 'c', 'd']],
    ['Piso e água', ['e', 'f', 'g']],
    ['Clima e exposição', ['h', 'i', 'j', 'k', 'l', 'm', 'n', 'r']],
    ['Isolamento e tempo', ['o', 'p', 'q']],
    ['Vegetação e recursos', ['s', 't']]
  ];

  const SEVERITY_FACTORS = [
    ['a', 'Desprendimento espontâneo de rochas'],
    ['b', 'Desprendimento de rochas provocado pelo grupo ou por terceiros'],
    ['c', 'Queda em fenda ou em declive acentuado'],
    ['d', 'Passagem que exige o uso das mãos para progredir'],
    ['e', 'Trecho permanentemente escorregadio, rochoso ou alagado'],
    ['f', 'Trecho escorregadio ou alagado por causa da chuva'],
    ['g', 'Travessia livre (sem ponte) de rio ou corpo d’água com correnteza'],
    ['h', 'Alta probabilidade de chuva forte ou contínua'],
    ['i', 'Alta probabilidade de temperatura abaixo de 0 °C à noite'],
    ['j', 'Alta probabilidade de temperatura abaixo de 5 °C com umidade acima de 90 %'],
    ['k', 'Alta probabilidade de exposição a ventos fortes ou frios'],
    ['l', 'Alta probabilidade de umidade relativa abaixo de 30 %'],
    ['m', 'Alta probabilidade de exposição a calor acima de 32 °C'],
    ['n', 'Longos trechos de elevada exposição solar'],
    ['o', '1 h ou mais sem passar por local habitado, telefone de socorro (ou sinal de celular/rádio) ou via aberta com trânsito'],
    ['p', '3 h ou mais sem passar por local habitado, telefone de socorro (ou sinal de celular/rádio) ou via aberta com trânsito'],
    ['q', 'Menos de 3 h de folga entre o tempo para concluir o percurso e as horas de luz restantes no dia'],
    ['r', 'Visibilidade reduzida por fenômenos atmosféricos, dificultando orientação ou localização'],
    ['s', 'Vegetação densa ou terreno acidentado que dificulta orientação ou localização de pessoas'],
    ['t', 'Região ou trecho sem acesso a água potável']
  ];

  const SEVERITY_LABELS = ['', 'Severidade baixa', 'Severidade moderada', 'Severidade média', 'Severidade alta', 'Severidade muito alta'];
  const SEVERITY_RANGES = ['', 'até 3 fatores', '4 ou 5 fatores', '6 a 8 fatores', '9 a 12 fatores', '13 ou mais fatores'];

  const ORIENTATION = [
    ['1', 'Caminhos e cruzamentos bem definidos ou sinalizados', 'Caminho evidente e cruzamentos claros ou sinalizados. Manter-se na trilha não exige esforço para identificá-la; pode-se seguir um relevo inconfundível, como uma praia ou a margem de um lago.'],
    ['2', 'Caminho ou sinalização indicando continuidade', 'Há traçado visível ou sinalização que indica a continuidade, mas é preciso atenção ao caminho e aos cruzamentos com outras vias (estradas, trilhas, campos assinalados por marcos).'],
    ['3', 'Requer identificar características geográficas e pontos cardeais', 'Mesmo seguindo trilhas ou acidentes geográficos (rios, fundos de vale, costas, cordilheiras), escolher o caminho certo depende de reconhecer o relevo e os pontos cardeais.'],
    ['4', 'Requer habilidades de navegação fora do percurso', 'Não há traçado no terreno nem garantia de marcos no horizonte. O itinerário depende de compreender o terreno e o desenho do percurso.'],
    ['5', 'Requer navegação por alternativas anteriormente desconhecidas', 'A rota depende de ler o terreno e exige habilidade de navegação; obstáculos inesperados podem obrigar a contornos e caminhos alternativos antes desconhecidos.']
  ];

  const TERRAIN = [
    ['1', 'Percurso em superfícies planas', 'Estradas e vias para veículos, qualquer que seja a inclinação; caminhos com degraus em terreno plano e regular; praias de areia ou cascalho planas e firmes.'],
    ['2', 'Percurso por caminhos sem obstáculos', 'Terreno regular, trilhas bem marcadas sem declives acentuados nem obstáculos que exijam grande esforço; campos inclinados e pastagens uniformes.'],
    ['3', 'Trilhas escalonadas ou terrenos irregulares', 'Obstáculos irregulares ou degraus de tamanhos variados; áreas rochosas ou lajes de pedra; rocha solta, raízes expostas, areia ou erosão.'],
    ['4', 'Percurso com obstáculos', 'Obstáculos que podem exigir saltos ou uso das mãos, até o grau I Sup (escala UIAA).'],
    ['5', 'Percurso que requer técnicas verticais', 'Trechos que exigem escalada de graus II e III Sup (UIAA), com equipamento e técnicas específicas. Registre isso em “condições específicas”.']
  ];

  const EFFORT_LABELS = ['', 'Pouco esforço', 'Esforço moderado', 'Esforço significativo', 'Esforço intenso', 'Esforço extraordinário'];
  const EFFORT_RANGES = ['', 'até 1 h', 'mais de 1 h até 3 h', 'mais de 3 h até 6 h', 'mais de 6 h até 10 h', 'mais de 10 h'];

  const SURFACES = [
    { v: 4, name: 'Fácil', hint: 'estradas, encostas · 4 km/h' },
    { v: 3, name: 'Moderado', hint: 'trilhas, caminhos suaves, prados · 3 km/h' },
    { v: 2, name: 'Difícil', hint: 'caminhos pedregosos, leitos de rios · 2 km/h' }
  ];

  const V_UP = 200;   // m/h — Tabela 4, subidas
  const V_DOWN = 300; // m/h — Tabela 4, descidas

  /* ---------- Níveis ---------- */
  const severityLevel = n => (n <= 3 ? 1 : n <= 5 ? 2 : n <= 8 ? 3 : n <= 12 ? 4 : 5);
  const effortLevel = h => (h <= 1 ? 1 : h <= 3 ? 2 : h <= 6 ? 3 : h <= 10 ? 4 : 5);

  /* ---------- Esforço (Eq. 1–4) ---------- */
  // TH = DH/VH ; TAS = D/VS ; TAD = D/VD
  function stageTimes(distanceKm, speedKmh, ascentM, descentM) {
    const th = speedKmh > 0 ? distanceKm / speedKmh : 0;
    const tv = (ascentM || 0) / V_UP + (descentM || 0) / V_DOWN;
    return { th, tv };
  }
  // IE = TL + TC/2
  const effortIndex = (th, tv) => Math.max(th, tv) + Math.min(th, tv) / 2;

  /* ---------- Formatação ---------- */
  const fmt = (n, d = 1) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  function durationText(hours) {
    const minutes = Math.round((Number(hours) || 0) * 60);
    if (minutes < 60) return minutes + ' min';
    const h = Math.floor(minutes / 60), m = minutes % 60;
    return m ? h + ' h ' + m + ' min' : h + ' h';
  }
  const minutesText = min => durationText((Number(min) || 0) / 60);

  /* ---------- Etapas ---------- */
  function normalizeSegment(s, i) {
    const f = Array.isArray(s.factors) ? s.factors : [];
    const distance = Number(s.distance) || 0;
    const surface = Number(s.surface) || 3;
    const ascent = Number(s.ascent) || 0;
    const descent = Number(s.descent) || 0;
    const t = stageTimes(distance, surface, ascent, descent);
    return Object.assign({}, s, {
      name: (s.name && String(s.name).trim()) || 'Etapa ' + (i + 1),
      distance, surface, ascent, descent, factors: f,
      day: Math.max(1, Math.round(Number(s.day) || 1)),
      severity: severityLevel(f.length),
      orientation: Number(s.orientation) || 1,
      terrain: Number(s.terrain) || 1,
      horizontal: t.th, vertical: t.tv, effort: effortIndex(t.th, t.tv)
    });
  }

  /* ---------- Consolidação (14.3.1 e 14.3.5) ---------- */
  function aggregate(survey) {
    const segs = (survey.segments || []).map(normalizeSegment);
    const total = segs.reduce((a, s) => a + s.distance, 0);
    const up = segs.reduce((a, s) => a + s.ascent, 0);
    const down = segs.reduce((a, s) => a + s.descent, 0);
    const TH = segs.reduce((a, s) => a + s.horizontal, 0);
    const TV = segs.reduce((a, s) => a + s.vertical, 0);
    const IEtotal = effortIndex(TH, TV);

    // Esforço: soma dos tempos por dia (Nota 2 da Tabela 5); caminhada simples = 1 dia.
    const multiDay = survey.activity === 'Caminhada de longo curso';
    const dayMap = new Map();
    segs.forEach(s => {
      const d = multiDay ? s.day : 1;
      const o = dayMap.get(d) || { day: d, th: 0, tv: 0, km: 0 };
      o.th += s.horizontal; o.tv += s.vertical; o.km += s.distance;
      dayMap.set(d, o);
    });
    const days = [...dayMap.values()].sort((a, b) => a.day - b.day)
      .map(o => Object.assign(o, { ie: effortIndex(o.th, o.tv) }, { level: effortLevel(effortIndex(o.th, o.tv)) }));
    const worstDay = days.reduce((m, d) => (d.ie > m.ie ? d : m), days[0] || { ie: 0, level: 1, day: 1, th: 0, tv: 0 });

    const max = k => (segs.length ? Math.max(...segs.map(s => s[k])) : 0);
    const levels = {
      severity: max('severity'),
      orientation: max('orientation'),
      terrain: max('terrain'),
      effort: days.length ? worstDay.level : 0
    };

    // Aviso dos 80 % (severidade e terreno)
    const notes = [];
    [['severity', 'severidade do ambiente'], ['terrain', 'condições do terreno']].forEach(([k, label]) => {
      if (!total || !levels[k]) return;
      const below = segs.filter(s => s[k] < levels[k]);
      const km = below.reduce((a, s) => a + s.distance, 0);
      if (km / total >= 0.8) {
        const byLevel = {};
        below.forEach(s => { byLevel[s[k]] = (byLevel[s[k]] || 0) + s.distance; });
        const parts = Object.keys(byLevel).sort().map(l => fmt(byLevel[l], 1) + ' km de nível ' + l);
        notes.push({ key: k, km, pct: km / total * 100,
          text: 'Em ' + label + ', o percurso é nível ' + levels[k] + ', mas ' + fmt(km / total * 100, 0) + ' % da extensão (' + parts.join(' e ') + ') está classificada abaixo desse valor.' });
      }
    });

    return { segments: segs, total, up, down, TH, TV, IE: IEtotal, days, worstDay, levels, notes, multiDay };
  }

  /* ---------- Compatibilidade de backup ---------- */
  const BACKUP_FORMAT = 'classifica-trilha-backup';
  function isBackup(data) {
    return !!data && data.format === BACKUP_FORMAT && Array.isArray(data.classifications);
  }

  const api = {
    SEVERITY_GROUPS, SEVERITY_FACTORS, SEVERITY_LABELS, SEVERITY_RANGES, ORIENTATION, TERRAIN,
    EFFORT_LABELS, EFFORT_RANGES, SURFACES, V_UP, V_DOWN,
    severityLevel, effortLevel, stageTimes, effortIndex, fmt, durationText, minutesText,
    normalizeSegment, aggregate, BACKUP_FORMAT, isBackup
  };
  root.CT = Object.assign(root.CT || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
