/* Classifica Trilha 2.0 — interface */
(function () {
  'use strict';
  const C = CT, { fmt, durationText, minutesText, aggregate } = C, esc = C.charts.esc;
  const APP_VERSION = '2.0.0';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const iconSrc = id => (window.CT_ICONS && window.CT_ICONS[id]) || './icon-' + id + '.svg';
  const KIND = { severity: 'sev', orientation: 'ori', terrain: 'ter', effort: 'eff' };
  const TITLES = { severity: 'Severidade do ambiente', orientation: 'Orientação de navegação', terrain: 'Condições do terreno', effort: 'Esforço físico' };

  let survey = null;         // roteiro atual (rascunho ou arquivado em edição)
  let editIndex = null;      // índice da etapa em edição
  let routeTrack = null, routeLogo = null; // estado temporário do formulário do roteiro
  let draftTimer = null;
  let deferredInstall = null;

  /* ================= utilidades ================= */
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2800);
  }
  function confirmDialog(title, msg, ok = 'Confirmar', cancel = 'Cancelar') {
    const d = $('#confirmDlg');
    $('#confirmTitle').textContent = title; $('#confirmMsg').textContent = msg;
    $('#confirmYes').textContent = ok; $('#confirmNo').textContent = cancel;
    return new Promise(res => {
      d.returnValue = '';
      d.addEventListener('close', () => res(d.returnValue === 'ok'), { once: true });
      d.showModal();
    });
  }
  const persist = () => TrailDB.saveCurrent(survey).catch(() => toast('Não foi possível salvar no banco local.'));
  const hasWork = s => !!s && !s.archiveId && (s.segments.length > 0);
  const badge = (k, n) => `<span class="lv ${KIND[k]}" title="${TITLES[k]}: ${n}">${n}</span>`;
  const badgesHtml = L => ['severity', 'orientation', 'terrain', 'effort'].map(k => badge(k, L[k])).join('');
  const numOrNull = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const todayIso = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const dateBr = iso => (iso ? iso.split('-').reverse().join('/') : '');
  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  function cleanBars() { $$('.actionbar,.bottombar').forEach(e => e.remove()); $('#app').classList.remove('with-bar'); }
  function addBars(title, sub, buttons) {
    const btns = buttons.map(b => `<button type="button" class="btn ${b.cls}" data-act="${b.act}">${b.label}</button>`).join('');
    const top = document.createElement('div');
    top.className = 'actionbar no-print';
    top.innerHTML = `<div class="ab-title">${esc(title)}<small>${esc(sub)}</small></div><div class="ab-btns">${btns}</div>`;
    $('.topbar').after(top);
    const bot = document.createElement('div');
    bot.className = 'bottombar no-print';
    bot.innerHTML = `<div class="ab-btns">${btns}</div>`;
    document.body.append(bot);
    $('#app').classList.add('with-bar');
  }

  /* ================= roteamento ================= */
  const nav = r => { if (location.hash === '#/' + r) render(); else location.hash = '#/' + r; };
  async function render() {
    const r = location.hash.replace(/^#\/?/, '') || 'inicio';
    cleanBars();
    if (r === 'roteiro') return viewRoute();
    if (r === 'etapas' && survey) return viewStages();
    if (r === 'resultado' && survey && survey.segments.length) return viewResult();
    return viewHome();
  }

  /* ================= INÍCIO ================= */
  async function viewHome() {
    const main = $('#app');
    const items = await TrailDB.list().catch(() => []);
    const resume = hasWork(survey) || (survey && !survey.archiveId && survey.name);
    main.innerHTML = `<div class="stack">
      <section class="card hero">
        <p class="eyebrow">Classificação de percursos</p>
        <h1>Classifique caminhadas e travessias pela ABNT NBR ISO 3021</h1>
        <p class="lead">Cadastre o roteiro, divida em etapas e avalie os quatro critérios. Funciona sem internet e sem login.</p>
        <button class="btn btn-dark" id="newBtn" type="button">＋ Novo roteiro</button>
      </section>
      ${resume ? `<section class="card resume"><div><p class="eyebrow">Em andamento</p><b>${esc(survey.name)}</b><span class="muted small">${survey.segments.length} ${survey.segments.length === 1 ? 'etapa cadastrada' : 'etapas cadastradas'}</span></div><button class="btn btn-primary" id="resumeBtn" type="button">Continuar roteiro</button></section>` : ''}
      <section class="steps3" aria-label="Como funciona">
        <div><span>1</span><b>Roteiro</b>Nome, atividade e (opcional) traçado GPX, KML ou KMZ.</div>
        <div><span>2</span><b>Etapas</b>Avalie severidade, orientação, terreno e esforço em cada etapa.</div>
        <div><span>3</span><b>Resultado</b>Classificação final do roteiro, pronta para imprimir.</div>
      </section>
      <section>
        <h2 style="margin:8px 0 12px">Classificações salvas neste aparelho</h2>
        <div class="hist">${items.length ? items.map(histItem).join('') : '<div class="card muted">Nenhuma classificação finalizada ainda. Ao finalizar um roteiro, ele aparece aqui.</div>'}</div>
      </section></div>`;
    $('#newBtn').onclick = newSurvey;
    if ($('#resumeBtn')) $('#resumeBtn').onclick = () => nav(survey.segments.length || survey.name ? 'etapas' : 'roteiro');
    $$('[data-hopen]').forEach(b => b.onclick = () => openArchived(b.dataset.hopen, 'resultado'));
    $$('[data-hedit]').forEach(b => b.onclick = () => openArchived(b.dataset.hedit, 'etapas'));
    $$('[data-hdel]').forEach(b => b.onclick = () => deleteArchived(b.dataset.hdel));
    updateDbInfo();
  }
  function histItem(it) {
    const a = aggregate(it.survey || { segments: [] });
    const L = (it.result && it.result.levels) || a.levels;
    return `<article class="card hist-item"><div class="hist-top"><div><b>${esc(it.name)}</b><div class="hist-meta">${esc((it.survey || {}).activity || 'Caminhada')} · ${dateBr(it.date)} · ${a.segments.length} etapas · ${fmt(a.total, 2)} km</div></div><div class="badges">${badgesHtml(L)}</div></div>
      <div class="hist-actions"><button class="btn btn-sm btn-primary" data-hopen="${esc(it.id)}">Ver classificação</button><button class="btn btn-sm btn-outline" data-hedit="${esc(it.id)}">Editar etapas</button><button class="btn btn-sm btn-ghost" data-hdel="${esc(it.id)}">Excluir</button></div></article>`;
  }
  async function newSurvey() {
    if (hasWork(survey)) {
      const ok = await confirmDialog('Já existe um roteiro em andamento', `“${survey.name}” ainda não foi finalizado. Iniciar um novo roteiro descarta o rascunho atual. Deseja continuar?`, 'Descartar e criar novo', 'Manter o atual');
      if (!ok) return;
    }
    survey = null; routeTrack = null; routeLogo = null; editIndex = null;
    await TrailDB.clearCurrent();
    nav('roteiro');
  }
  async function openArchived(id, to) {
    const it = await TrailDB.get(id); if (!it) return toast('Registro não encontrado.');
    if (hasWork(survey)) {
      const ok = await confirmDialog('Substituir o roteiro em andamento?', `“${survey.name}” ainda não foi finalizado e será descartado ao abrir outro roteiro.`, 'Descartar e abrir', 'Cancelar');
      if (!ok) return;
    }
    survey = JSON.parse(JSON.stringify(it.survey)); survey.archiveId = it.id; survey.segments = survey.segments || [];
    editIndex = null; await persist(); nav(to);
  }
  async function deleteArchived(id) {
    const ok = await confirmDialog('Excluir classificação?', 'O registro será removido deste aparelho. Exporte um backup antes se quiser guardá-lo.', 'Excluir', 'Cancelar');
    if (!ok) return;
    await TrailDB.remove(id);
    if (survey && survey.archiveId === id) { survey = null; await TrailDB.clearCurrent(); }
    toast('Classificação excluída.'); viewHome();
  }

  /* ================= ROTEIRO (passo 1) ================= */
  function stepper(n) {
    const s = (i, t) => `<span class="${i < n ? 'done' : i === n ? 'on' : ''}"><i>${i < n ? '✓' : i}</i>${t}</span>`;
    return `<nav class="stepper no-print" aria-label="Etapas do processo">${s(1, 'Roteiro')}<hr>${s(2, 'Etapas')}<hr>${s(3, 'Resultado')}</nav>`;
  }
  function viewRoute() {
    const main = $('#app'), s = survey;
    if (s) { routeTrack = routeTrack || s.track || null; routeLogo = routeLogo !== null ? routeLogo : (s.logo || null); }
    const tm = s && Number.isFinite(s.travelMinutes) ? s.travelMinutes : null;
    main.innerHTML = `${stepper(1)}<form id="routeForm" class="stack" novalidate>
      <section class="card stack">
        <div><p class="eyebrow">${s ? 'Editar roteiro' : 'Novo roteiro'}</p><h1>Dados do roteiro</h1><p class="lead">Informe o roteiro ou produto. Na próxima tela você cadastra as etapas e avalia cada critério.</p></div>
        <div class="grid">
          <label class="field wide">Nome do roteiro / produto *<input type="text" id="r-name" maxlength="90" autocomplete="off" placeholder="Ex.: Caminhada da Grande Cachoeira" value="${esc(s ? s.name : '')}"></label>
          <div class="field wide">Atividade
            <div class="seg" role="radiogroup" aria-label="Atividade">
              <label><input type="radio" name="activity" value="Caminhada" ${!s || s.activity !== 'Caminhada de longo curso' ? 'checked' : ''}><span>Caminhada<small>esforço do percurso inteiro</small></span></label>
              <label><input type="radio" name="activity" value="Caminhada de longo curso" ${s && s.activity === 'Caminhada de longo curso' ? 'checked' : ''}><span>Longo curso<small>esforço calculado por dia</small></span></label>
            </div></div>
          <label class="field">Data da avaliação<input type="date" id="r-date" value="${esc(s && s.date ? s.date : todayIso())}"></label>
          <label class="field">Organização responsável<input type="text" id="r-org" placeholder="Opcional" value="${esc(s ? s.organization || '' : '')}"></label>
          <label class="field wide">Nome do percurso / via <small>Aparece como “pelo percurso …” no documento. Opcional.</small><input type="text" id="r-via" placeholder="Ex.: Rota dos Mineiros" value="${esc(s ? s.via || '' : '')}"></label>
          <label class="field wide">Condições específicas<small>Ex.: percurso autoguiado, chuvas, época do ano, áreas alagadas, uso de equipamentos.</small><textarea id="r-cond" rows="3" placeholder="Ex.: Nublado com chuvas. Requer o uso de equipamentos e técnicas específicas.">${esc(s ? s.conditions || '' : '')}</textarea></label>
          <div class="field wide">Tempo total médio da viagem <small>Opcional. É a duração típica informada por quem opera o roteiro — diferente do índice de esforço calculado pelo app.</small>
            <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px"><label class="field">Horas<input type="number" id="r-th" min="0" step="1" inputmode="numeric" value="${tm != null ? Math.floor(tm / 60) : ''}"></label><label class="field">Minutos<input type="number" id="r-tm" min="0" max="59" step="1" inputmode="numeric" value="${tm != null ? tm % 60 : ''}"></label></div>
            <div id="durSuggest"></div></div>
        </div>
      </section>
      <section class="card stack">
        <div><h2>Traçado do roteiro <span class="muted" style="font-weight:500">(opcional)</span></h2><p class="lead" style="margin-top:4px">Importe um arquivo exportado do Google Earth, Strava, Wikiloc ou outro aplicativo. O arquivo é lido apenas neste aparelho — não há conexão direta com esses serviços.</p></div>
        <div class="imp"><div class="ico" aria-hidden="true">↥</div><div><b>GPX, KML ou KMZ</b><p>O traçado preenche mapa, perfil altimétrico e as medidas de cada etapa.</p><div class="imp-status" id="impStatus" role="status"></div></div>
          <div class="imp-act"><label class="btn btn-primary btn-sm">Selecionar arquivo<input type="file" id="r-file" accept=".gpx,.kml,.kmz,application/gpx+xml,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" hidden></label><button type="button" class="btn btn-sm btn-ghost hidden" id="impRemove">Remover traçado</button></div></div>
      </section>
      <section class="card stack">
        <div><h2>Logomarca <span class="muted" style="font-weight:500">(opcional)</span></h2><p class="lead" style="margin-top:4px">Aparece no documento impresso, no espaço previsto pelo formulário da norma.</p></div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><div id="logoPrev"></div><label class="btn btn-outline btn-sm">Escolher imagem<input type="file" id="r-logo" accept="image/*" hidden></label><button type="button" class="btn btn-sm btn-ghost hidden" id="logoRemove">Remover</button></div>
      </section>
      <div class="res-actions"><button class="btn btn-primary" type="submit">${s ? 'Salvar e voltar às etapas' : 'Cadastrar etapas →'}</button><button class="btn btn-ghost" type="button" id="routeCancel">Cancelar</button></div>
    </form>`;
    renderImpStatus(); renderLogo();
    $('#routeForm').onsubmit = saveRoute;
    $('#routeCancel').onclick = () => { routeTrack = null; routeLogo = null; nav(s ? 'etapas' : 'inicio'); };
    $('#r-file').onchange = onTrackFile; $('#impRemove').onclick = () => { routeTrack = null; renderImpStatus(); };
    $('#r-logo').onchange = onLogoFile; $('#logoRemove').onclick = () => { routeLogo = ''; renderLogo(); };
    scrollTop();
  }
  function renderImpStatus(msg, cls) {
    const el = $('#impStatus'); if (!el) return;
    const t = routeTrack;
    $('#impRemove').classList.toggle('hidden', !t);
    if (msg) { el.className = 'imp-status ' + (cls || ''); el.textContent = msg; return; }
    if (!t) { el.className = 'imp-status'; el.textContent = 'Nenhum arquivo importado.'; $('#durSuggest').innerHTML = ''; return; }
    const st = t.stats, hasEle = C.charts.trackHasElevation(t);
    el.className = 'imp-status ' + (hasEle ? 'ok' : 'warn');
    el.textContent = `${t.fileName || 'arquivo'} · ${fmt(st.distance, 2)} km` + (hasEle ? ` · +${st.ascent} m / −${st.descent} m` : ' · sem altitudes no arquivo: informe subida e descida manualmente; o perfil será apenas esquemático');
    $('#durSuggest').innerHTML = t.durationMin ? `<button type="button" class="btn btn-sm btn-soft" id="useDur">Usar duração gravada no arquivo (${minutesText(t.durationMin)})</button><small class="note" style="display:block;margin-top:4px">Inclui paradas e reflete o ritmo de quem gravou.</small>` : '';
    if ($('#useDur')) $('#useDur').onclick = () => { $('#r-th').value = Math.floor(t.durationMin / 60); $('#r-tm').value = t.durationMin % 60; };
  }
  async function onTrackFile(e) {
    const f = e.target.files[0]; if (!f) return;
    renderImpStatus('Lendo arquivo…');
    try {
      const t = await C.tracks.importFile(f); routeTrack = t;
      if (t.name && !$('#r-name').value.trim()) $('#r-name').value = t.name;
      renderImpStatus(); toast('Traçado importado.');
    } catch (err) { renderImpStatus(err.message || 'Não foi possível importar o arquivo.', 'bad'); }
    finally { e.target.value = ''; }
  }
  function renderLogo() {
    const el = $('#logoPrev'); if (!el) return;
    el.innerHTML = routeLogo ? `<img class="logo-prev" alt="Logomarca selecionada" src="${routeLogo}">` : '<span class="muted small">Nenhuma imagem selecionada.</span>';
    $('#logoRemove').classList.toggle('hidden', !routeLogo);
  }
  function onLogoFile(e) {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image(), url = URL.createObjectURL(f);
    img.onload = () => {
      const k = Math.min(1, 360 / img.width), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      routeLogo = c.toDataURL('image/png'); URL.revokeObjectURL(url); renderLogo();
    };
    img.onerror = () => { toast('Não foi possível ler a imagem.'); URL.revokeObjectURL(url); };
    img.src = url; e.target.value = '';
  }
  async function saveRoute(ev) {
    ev.preventDefault();
    const name = $('#r-name').value.trim();
    if (!name) { $('#r-name').classList.add('invalid'); $('#r-name').focus(); return toast('Informe o nome do roteiro ou produto.'); }
    const th = numOrNull($('#r-th').value), tm = numOrNull($('#r-tm').value);
    const travelMinutes = th == null && tm == null ? null : Math.round((th || 0) * 60 + (tm || 0));
    const data = {
      name, activity: $('input[name=activity]:checked').value, date: $('#r-date').value || todayIso(),
      organization: $('#r-org').value.trim(), via: $('#r-via').value.trim(), conditions: $('#r-cond').value.trim(),
      travelMinutes, track: routeTrack || null, logo: routeLogo || null
    };
    if (!survey) survey = Object.assign({ segments: [] }, data); else Object.assign(survey, data);
    routeTrack = null; routeLogo = null;
    await persist(); nav('etapas');
  }

  /* ================= ETAPAS (passo 2) ================= */
  const factorGroupHtml = () => C.SEVERITY_GROUPS.map(([g, ids]) =>
    `<div class="fgroup"><h4>${g}</h4>${ids.map(id => {
      const f = C.SEVERITY_FACTORS.find(x => x[0] === id);
      return `<label class="fac"><input type="checkbox" name="factor" value="${id}"><span><b>${id}</b>${esc(f[1])}</span></label>`;
    }).join('')}</div>`).join('');
  const levelListHtml = (kind, data) => `<div class="lvls" role="radiogroup" aria-label="${TITLES[kind]}">${data.map(([n, t, d]) =>
    `<label class="lvl"><input type="radio" name="${kind}" value="${n}"><span class="lvl-body">${C.charts.levelIcon(kind, +n, 60)}<span class="lvl-t"><em>${n}</em>${esc(t)}</span><span class="lvl-d">${esc(d)}</span></span></label>`).join('')}</div>`;
  const secHead = (img, title, sub) => `<div class="sec-h"><img src="${iconSrc(img)}" alt="" width="44" height="44"><div><h2>${title}</h2><small>${sub}</small></div></div>`;

  function viewStages() {
    const main = $('#app'), s = survey, long = s.activity === 'Caminhada de longo curso';
    const a = aggregate(s), nextDay = s.segments.length ? s.segments[s.segments.length - 1].day || 1 : 1;
    const t = s.track && s.track.points && s.track.points.length > 1 ? s.track : null;
    main.innerHTML = `${stepper(2)}<div class="stack">
      <section class="card route-sum"><div><p class="eyebrow">Roteiro em avaliação</p><h1>${esc(s.name)}</h1>
        <div class="chips"><span class="chip">${esc(s.activity)}</span><span class="chip" id="chipCount"></span>${t ? `<span class="chip">Traçado: ${fmt(t.stats.distance, 2)} km</span>` : ''}</div></div>
        <button class="btn btn-sm btn-outline" id="editRoute" type="button">Editar roteiro</button></section>
      <section id="savedBox"></section>
      <div id="editBanner" class="banner hidden"></div>
      <form id="stageForm" class="stack" novalidate autocomplete="off">
        <section class="card sec" id="secData">
          <div class="sec-h"><div class="n" id="stageNum">1</div><div><h2>Dados da etapa</h2><small>Uma etapa é uma parte do percurso com características próprias.</small></div></div>
          ${t ? `<div class="slice"><div><b>Usar o traçado importado</b><p class="note">Traçado com ${fmt(t.stats.distance, 2)} km. Informe o trecho desta etapa para preencher distância e desníveis automaticamente.</p></div>
            <div class="row"><label class="field">Do km<input type="number" id="sl-from" step="0.01" min="0" inputmode="decimal"></label><label class="field">Até o km<input type="number" id="sl-to" step="0.01" min="0" inputmode="decimal"></label><button class="btn btn-dark btn-sm" type="button" id="sl-go">Preencher</button></div><div class="note" id="sl-msg" role="status"></div></div>` : ''}
          <div class="grid">
            <label class="field wide">Nome da etapa<input type="text" id="f-name" maxlength="80" placeholder="Ex.: Entrada até a primeira travessia"></label>
            <label class="field">Ponto inicial<input type="text" id="f-start" placeholder="Ex.: Centro de visitantes"></label>
            <label class="field">Altitude inicial (m)<input type="number" id="f-salt" step="1" inputmode="numeric" placeholder="Ex.: 409"></label>
            <label class="field">Ponto final<input type="text" id="f-end" placeholder="Ex.: Grande Cachoeira"></label>
            <label class="field">Altitude final (m)<input type="number" id="f-ealt" step="1" inputmode="numeric" placeholder="Ex.: 309"></label>
            <label class="field">Distância (km) *<input type="number" id="f-dist" min="0" step="0.01" inputmode="decimal" placeholder="Ex.: 3,5"></label>
            ${long ? `<label class="field">Dia da travessia<input type="number" id="f-day" min="1" step="1" inputmode="numeric" value="${nextDay}"></label>` : ''}
            <div class="field wide">Tipo predominante de piso
              <div class="seg" role="radiogroup" aria-label="Piso">${C.SURFACES.map(p => `<label><input type="radio" name="surface" value="${p.v}" ${p.v === 3 ? 'checked' : ''}><span>${p.name}<small>${p.v} km/h</small></span></label>`).join('')}</div>
              <small id="surfHint">${C.SURFACES[1].hint}</small></div>
            <label class="field">Subida acumulada (m)<input type="number" id="f-up" min="0" step="1" inputmode="numeric" placeholder="0"></label>
            <label class="field">Descida acumulada (m)<input type="number" id="f-down" min="0" step="1" inputmode="numeric" placeholder="0"></label>
          </div>
          <div class="err hidden" id="err-dist" role="alert">Informe a distância da etapa (maior que zero).</div>
        </section>

        <section class="card sec">
          ${secHead('severity', 'Severidade do ambiente', 'Perigos e dificuldades do ambiente natural')}
          <details class="how"><summary>Como avaliar</summary><p>Marque cada fator observado <b>nesta etapa</b>, uma única vez, mesmo que ele apareça em outras etapas. O nível vem da contagem de fatores:</p><ul>${[1, 2, 3, 4, 5].map(n => `<li>Nível ${n} — ${C.SEVERITY_LABELS[n].toLowerCase()}: ${C.SEVERITY_RANGES[n]}</li>`).join('')}</ul><p>Os fatores de 1 h (o) e de 3 h (p) sem socorro são cumulativos: ao marcar “p”, o fator “o” é contado junto (duas ocorrências).</p></details>
          <div class="live"><span class="big" id="sevLive">0 fatores · nível 1</span><div class="meter" id="sevMeter" style="width:140px"><i></i><i></i><i></i><i></i><i></i></div></div>
          ${factorGroupHtml()}
        </section>

        <section class="card sec sec-ori" id="secOri">
          ${secHead('orientation', 'Orientação de navegação', 'Facilidade de seguir o itinerário')}
          <details class="how"><summary>Como avaliar</summary><p>Avalie a facilidade de manter o itinerário na etapa: clareza dos cruzamentos, continuidade da trilha, sinalização, necessidade de reconhecer relevo e pontos cardeais ou de navegar fora do percurso.</p><p>Escolha o nível que descreve a etapa. Se ela mistura situações muito diferentes, considere dividi-la — o nível final do roteiro é o da etapa de maior valor.</p></details>
          ${levelListHtml('orientation', C.ORIENTATION)}
          <div class="err hidden" id="err-orientation" role="alert">Escolha um nível de orientação.</div>
        </section>

        <section class="card sec sec-ter" id="secTer">
          ${secHead('terrain', 'Condições do terreno', 'Piso, obstáculos e técnica exigida')}
          <details class="how"><summary>Como avaliar</summary><p>Considere a dificuldade de atravessar a etapa: regularidade do piso, inclinação, degraus, pedras soltas, raízes, obstáculos, uso das mãos e eventual necessidade de técnicas verticais. Todas as passagens devem ser avaliadas.</p><p>Se houver passagens de nível 5, registre-o em “Condições específicas” do roteiro.</p></details>
          ${levelListHtml('terrain', C.TERRAIN)}
          <div class="err hidden" id="err-terrain" role="alert">Escolha um nível de condições do terreno.</div>
        </section>

        <section class="card sec">
          ${secHead('effort', 'Esforço físico', 'Calculado automaticamente')}
          <details class="how"><summary>Como funciona o cálculo</summary><p>Para um adulto não esportista com bagagem leve. Tempo horizontal = distância ÷ velocidade do piso (4, 3 ou 2 km/h). Tempo de desníveis = subida ÷ 200 m/h + descida ÷ 300 m/h.</p><p><b>Índice de esforço (IE) = maior tempo + metade do menor.</b> O IE é um grau de esforço e <b>não é a duração cronológica</b> da atividade. O nível final do esforço usa a soma das etapas (por dia, no longo curso).</p><ul>${[1, 2, 3, 4, 5].map(n => `<li>Nível ${n} — ${C.EFFORT_LABELS[n].toLowerCase()}: ${C.EFFORT_RANGES[n]}</li>`).join('')}</ul></details>
          <div class="eff-box" id="effBox"></div>
        </section>

        <section class="card summary" aria-live="polite"><div><p class="eyebrow" style="color:#cfe0d9">Resumo desta etapa</p><div class="note" style="color:#cfe0d9" id="sumName">—</div></div><div class="badges" id="sumBadges"></div></section>
      </form>
    </div>`;
    const km = fmt(a.total, 2);
    addBars(s.name, `${s.segments.length} ${s.segments.length === 1 ? 'etapa' : 'etapas'} · ${km} km`, [
      { act: 'next', cls: 'btn-outline', label: '＋ Próxima etapa' },
      { act: 'finish', cls: 'btn-primary', label: '✓ Finalizar classificação' }
    ]);
    bindStages();
    renderSaved(); loadDraft(); refreshLive();
    scrollTop();
  }

  function bindStages() {
    $$('[data-act]').forEach(b => b.onclick = () => (b.dataset.act === 'next' ? onNext() : onFinish()));
    $('#editRoute').onclick = () => { saveDraftNow(); nav('roteiro'); };
    const f = $('#stageForm');
    f.addEventListener('input', onFormChange); f.addEventListener('change', onFormChange);
    f.onsubmit = e => { e.preventDefault(); onNext(); };
    if ($('#sl-go')) {
      const t = survey.track, total = t.stats.distance, last = [...survey.segments].reverse().find(x => Number.isFinite(x.trackTo));
      $('#sl-from').value = last ? (+last.trackTo).toFixed(2) : '0.00'; $('#sl-to').value = total.toFixed(2);
      $('#sl-go').onclick = applySlice;
    }
  }
  function onFormChange(e) {
    if (e && e.target && e.target.name === 'factor') syncFactors();
    if (e && e.target && e.target.name === 'surface') $('#surfHint').textContent = (C.SURFACES.find(p => p.v === +e.target.value) || {}).hint || '';
    $$('.err').forEach(x => x.classList.add('hidden')); $$('.invalid').forEach(x => x.classList.remove('invalid'));
    refreshLive(); clearTimeout(draftTimer); draftTimer = setTimeout(saveDraftNow, 500);
  }
  function syncFactors() {
    const p = $('input[name=factor][value=p]'), o = $('input[name=factor][value=o]');
    if (p.checked) { o.checked = true; o.disabled = true; o.title = 'Contado junto com o fator “p”.'; } else { o.disabled = false; o.title = ''; }
  }

  /* ---- leitura/escrita do formulário ---- */
  function readForm() {
    const checked = n => { const e = $(`input[name=${n}]:checked`); return e ? +e.value : null; };
    const factors = $$('input[name=factor]:checked').map(x => x.value);
    if (factors.includes('p') && !factors.includes('o')) factors.push('o');
    return {
      name: $('#f-name').value.trim(), start: $('#f-start').value.trim(), startAltitude: numOrNull($('#f-salt').value),
      end: $('#f-end').value.trim(), endAltitude: numOrNull($('#f-ealt').value),
      distance: numOrNull($('#f-dist').value), surface: checked('surface') || 3,
      ascent: numOrNull($('#f-up').value) || 0, descent: numOrNull($('#f-down').value) || 0,
      day: $('#f-day') ? numOrNull($('#f-day').value) || 1 : 1,
      orientation: checked('orientation'), terrain: checked('terrain'), factors: factors.sort(),
      trackFrom: $('#sl-from') && $('#sl-from').dataset.used ? +$('#sl-from').dataset.used : undefined,
      trackTo: $('#sl-to') && $('#sl-to').dataset.used ? +$('#sl-to').dataset.used : undefined
    };
  }
  function writeForm(st) {
    const set = (id, v) => { const e = $(id); if (e) e.value = v == null ? '' : v; };
    set('#f-name', st.name); set('#f-start', st.start); set('#f-salt', st.startAltitude);
    set('#f-end', st.end); set('#f-ealt', st.endAltitude); set('#f-dist', st.distance);
    set('#f-up', st.ascent || ''); set('#f-down', st.descent || ''); if (st.day != null) set('#f-day', st.day);
    $$('input[name=surface]').forEach(r => r.checked = +r.value === (st.surface || 3));
    $$('input[name=orientation]').forEach(r => r.checked = st.orientation != null && +r.value === +st.orientation);
    $$('input[name=terrain]').forEach(r => r.checked = st.terrain != null && +r.value === +st.terrain);
    $$('input[name=factor]').forEach(r => r.checked = (st.factors || []).includes(r.value));
    syncFactors();
    const sf = $('#sl-from'), stt = $('#sl-to');
    if (sf && st.trackFrom != null) { sf.value = (+st.trackFrom).toFixed(2); stt.value = (+st.trackTo).toFixed(2); sf.dataset.used = st.trackFrom; stt.dataset.used = st.trackTo; }
    $('#surfHint').textContent = (C.SURFACES.find(p => p.v === (st.surface || 3)) || {}).hint || '';
  }
  function blankState() {
    const long = survey.activity === 'Caminhada de longo curso', last = survey.segments[survey.segments.length - 1];
    return { name: '', start: last ? last.end || '' : '', startAltitude: last && Number.isFinite(last.endAltitude) ? last.endAltitude : null, end: '', endAltitude: null, distance: null, surface: 3, ascent: 0, descent: 0, day: long && last ? last.day || 1 : 1, orientation: null, terrain: null, factors: [] };
  }
  function formIsEmpty() {
    const st = readForm(), b = blankState();
    return !st.name && st.distance == null && !st.ascent && !st.descent && st.orientation == null && st.terrain == null && !st.factors.length &&
      st.start === b.start && !st.end && st.startAltitude === b.startAltitude && st.endAltitude == null;
  }
  function saveDraftNow() {
    if (!survey || !$('#stageForm')) return;
    survey.draft = formIsEmpty() ? null : Object.assign(readForm(), { editIndex });
    persist();
  }
  function loadDraft() {
    const d = survey.draft;
    if (d && (editIndex == null)) {
      editIndex = Number.isInteger(d.editIndex) && survey.segments[d.editIndex] ? d.editIndex : null;
      writeForm(d); showBanner();
    } else { writeForm(blankState()); showBanner(); }
    updateStageNumber();
  }
  function showBanner() {
    const b = $('#editBanner');
    if (editIndex == null) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    b.innerHTML = `<span>Editando a etapa ${editIndex + 1}: ${esc(survey.segments[editIndex].name)}</span><button class="btn btn-sm btn-outline" type="button" id="cancelEdit">Cancelar edição</button>`;
    $('#cancelEdit').onclick = () => { editIndex = null; survey.draft = null; writeForm(blankState()); showBanner(); updateStageNumber(); renderSaved(); refreshLive(); persist(); };
  }
  function updateStageNumber() {
    const n = editIndex != null ? editIndex + 1 : survey.segments.length + 1;
    $('#stageNum').textContent = String(n).padStart(2, '0');
  }

  /* ---- cálculos ao vivo ---- */
  function refreshLive() {
    const st = readForm(), n = st.factors.length, lvl = C.severityLevel(n);
    $('#sevLive').textContent = `${n} ${n === 1 ? 'fator' : 'fatores'} · nível ${lvl}`;
    $$('#sevMeter i').forEach((e, i) => e.classList.toggle('on', i < lvl));
    const d = st.distance || 0, t = C.stageTimes(d, st.surface, st.ascent, st.descent), ie = C.effortIndex(t.th, t.tv), el = C.effortLevel(ie);
    $('#effBox').innerHTML = d > 0
      ? `<div class="eff-main"><span class="lv eff">${el}</span><div><div class="t">${durationText(ie)}</div><div class="note">Índice de esforço desta etapa · ${C.EFFORT_LABELS[el]}</div></div></div>
         <div class="row"><span>Tempo horizontal (${fmt(d, 2)} km ÷ ${st.surface} km/h)</span><b>${durationText(t.th)}</b></div>
         <div class="row"><span>Tempo de desníveis (↑ ${st.ascent} m ÷ 200 + ↓ ${st.descent} m ÷ 300)</span><b>${durationText(t.tv)}</b></div>
         <div class="note">O nível final do roteiro usa a soma de todas as etapas. O IE não é a duração cronológica.</div>`
      : '<div class="note">Informe a distância da etapa para calcular o esforço.</div>';
    $('#sumBadges').innerHTML = [['severity', n ? lvl : (st.factors.length === 0 ? 1 : lvl)], ['orientation', st.orientation || '–'], ['terrain', st.terrain || '–'], ['effort', d > 0 ? el : '–']]
      .map(([k, v]) => `<div class="lvbox"><span class="lv ${KIND[k]}">${v}</span><span class="lv-t">${['Severidade', 'Orientação', 'Terreno', 'Esforço'][['severity', 'orientation', 'terrain', 'effort'].indexOf(k)]}</span></div>`).join('');
    $('#sumName').textContent = st.name || (editIndex != null ? 'Etapa ' + (editIndex + 1) : 'Etapa ' + (survey.segments.length + 1));
  }

  /* ---- traçado → etapa ---- */
  function applySlice() {
    const msg = $('#sl-msg'), from = numOrNull($('#sl-from').value), to = numOrNull($('#sl-to').value);
    try {
      if (from == null || to == null) throw new Error('Informe o km inicial e o km final.');
      const r = C.tracks.sliceStats(survey.track, from, to);
      $('#f-dist').value = r.distance.toFixed(2);
      if (r.hasElevation) {
        $('#f-up').value = r.ascent; $('#f-down').value = r.descent; $('#f-salt').value = r.startEle; $('#f-ealt').value = r.endEle;
        msg.textContent = `Preenchido: ${fmt(r.distance, 2)} km · +${r.ascent} m / −${r.descent} m. Confira os valores.`;
      } else msg.textContent = `Distância preenchida (${fmt(r.distance, 2)} km). O arquivo não tem altitudes: informe subida e descida manualmente.`;
      if (!$('#f-start').value.trim()) $('#f-start').value = `${r.start.lat.toFixed(5)}, ${r.start.lon.toFixed(5)}`;
      if (!$('#f-end').value.trim()) $('#f-end').value = `${r.end.lat.toFixed(5)}, ${r.end.lon.toFixed(5)}`;
      $('#sl-from').dataset.used = from; $('#sl-to').dataset.used = to;
      onFormChange();
    } catch (e) { msg.textContent = e.message; }
  }

  /* ---- salvar / validar ---- */
  function validateForm() {
    const st = readForm(); let first = null;
    const bad = (errId, el) => { $(errId).classList.remove('hidden'); if (el) el.classList.add('invalid'); first = first || $(errId); };
    if (!(st.distance > 0)) bad('#err-dist', $('#f-dist'));
    if (st.orientation == null) bad('#err-orientation');
    if (st.terrain == null) bad('#err-terrain');
    if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('Faltam campos obrigatórios nesta etapa.'); return false; }
    return true;
  }
  function commitForm() {
    if (formIsEmpty()) return 'empty';
    if (!validateForm()) return false;
    const st = readForm(), idx = editIndex != null ? editIndex : survey.segments.length;
    const seg = C.normalizeSegment(Object.assign({}, st), idx);
    Object.keys(seg).forEach(k => seg[k] === undefined && delete seg[k]);
    if (editIndex != null) survey.segments[editIndex] = seg; else survey.segments.push(seg);
    editIndex = null; survey.draft = null; persist();
    return true;
  }
  function onNext() {
    const r = commitForm();
    if (r === 'empty') { toast('Preencha os dados da etapa antes de cadastrar a próxima.'); $('#f-dist').focus(); return; }
    if (!r) return;
    toast('Etapa salva. Cadastre a próxima.'); viewStages();
  }
  async function onFinish() {
    const r = commitForm();
    if (r === false) return;
    if (!survey.segments.length) { toast('Cadastre ao menos uma etapa para finalizar.'); return; }
    const a = aggregate(survey);
    survey.archiveId = survey.archiveId || crypto.randomUUID();
    await persist();
    try {
      await TrailDB.archive(survey, { total: a.total, up: a.up, down: a.down, horizontal: a.TH, vertical: a.TV, ie: a.worstDay.ie, levels: a.levels, notes: a.notes.map(n => n.text), app: APP_VERSION });
    } catch (_) { toast('Não foi possível salvar no histórico, mas o roteiro continua salvo.'); }
    nav('resultado');
  }
  function renderSaved() {
    const a = aggregate(survey), box = $('#savedBox');
    $('#chipCount').innerHTML = `<b>${survey.segments.length}</b> ${survey.segments.length === 1 ? 'etapa' : 'etapas'} · ${fmt(a.total, 2)} km`;
    if (!survey.segments.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<h2 style="margin:0 0 10px">Etapas cadastradas</h2><div class="stages">${a.segments.map((s, i) =>
      `<div class="stage ${editIndex === i ? 'editing' : ''}" role="button" tabindex="0" data-edit="${i}" aria-label="Editar etapa ${i + 1}: ${esc(s.name)}"><span class="n">${i + 1}</span>
        <span><b>${esc(s.name)}</b><small>${fmt(s.distance, 2)} km · ↑${s.ascent} m ↓${s.descent} m${a.multiDay ? ' · dia ' + s.day : ''}</small></span>
        <button class="icon-btn" data-del="${i}" type="button" aria-label="Excluir etapa ${i + 1}" title="Excluir">🗑</button>
        <span class="badges">${badge('severity', s.severity)}${badge('orientation', s.orientation)}${badge('terrain', s.terrain)}${badge('effort', C.effortLevel(s.effort))}</span></div>`).join('')}</div>`;
    $$('[data-edit]', box).forEach(el => {
      const go = () => startEdit(+el.dataset.edit);
      el.onclick = e => { if (e.target.closest('[data-del]')) return; go(); };
      el.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('[data-del]')) { e.preventDefault(); go(); } };
    });
    $$('[data-del]', box).forEach(b => b.onclick = async e => {
      e.stopPropagation(); const i = +b.dataset.del;
      if (!(await confirmDialog('Excluir etapa?', `A etapa ${i + 1} (“${survey.segments[i].name}”) será removida do roteiro.`, 'Excluir', 'Cancelar'))) return;
      survey.segments.splice(i, 1); if (editIndex === i) editIndex = null; else if (editIndex != null && editIndex > i) editIndex--;
      await persist(); viewStages();
    });
  }
  async function startEdit(i) {
    if (!formIsEmpty() && editIndex !== i) {
      if (!(await confirmDialog('Descartar o que está no formulário?', 'Há dados ainda não salvos na etapa em preenchimento. Abrir outra etapa para edição descarta esses dados.', 'Descartar e editar', 'Voltar'))) return;
    }
    editIndex = i; survey.draft = null; writeForm(survey.segments[i]); showBanner(); updateStageNumber(); renderSaved(); refreshLive();
    $('#secData').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ================= RESULTADO (passo 3) ================= */
  const critCell = (k, n, label) => `<div><img src="${iconSrc(k)}" alt="" width="48" height="48"><strong>${TITLES[k] === 'Orientação de navegação' ? 'Orientação de navegação do percurso' : TITLES[k]}</strong><span class="num">${n}</span><span class="lab">${esc(label)}</span></div>`;

  function docHtml(sv, a) {
    const L = a.levels, segs = a.segments, f = segs[0], l = segs[segs.length - 1];
    const alt = v => (Number.isFinite(v) ? ` (${fmt(v, 0)} m)` : '');
    const prof = C.charts.profile(sv, a), map = C.charts.map(sv);
    const act = sv.activity === 'Caminhada de longo curso' ? 'caminhada de longo curso' : 'caminhada';
    const trav = Number.isFinite(sv.travelMinutes) && sv.travelMinutes > 0 ? minutesText(sv.travelMinutes) : 'não informado';
    const effLine = a.multiDay && a.days.length > 1
      ? `${durationText(a.worstDay.ie)} no dia mais exigente (dia ${a.worstDay.day})`
      : durationText(a.IE);
    return `<article class="doc" id="doc" aria-label="Classificação do roteiro">
      <h1>Classificação de percurso de ${act}</h1>
      <div class="doc-head"><div class="doc-data"><p><b>Percurso:</b> ${esc(sv.name)}</p><p><b>Atividade:</b> ${esc(sv.activity)}</p></div>
        <div class="doc-brand"><div class="qr" aria-label="Espaço para QR Code">QR Code</div><div class="logo">${sv.logo ? `<img src="${sv.logo}" alt="Logomarca">` : (sv.organization ? `<b>${esc(sv.organization)}</b>` : 'Espaço para logomarca do percurso ou da organização responsável')}</div></div></div>
      <div class="doc-data">
        <p><b>Percurso:</b> do ponto ${esc(f.start || 'inicial (não informado)')}${alt(f.startAltitude)} ao ponto ${esc(l.end || 'final (não informado)')}${alt(l.endAltitude)}${sv.via ? ' pelo percurso ' + esc(sv.via) : ''}</p>
        <p><b>Intervalos acumulados das variações altimétricas:</b> Subidas: ${fmt(a.up, 0)} m ↗ · Descidas: ${fmt(a.down, 0)} m ↘</p>
        <p><b>Distância:</b> ${fmt(a.total, 2)} km</p>
        <p><b>Tempo total médio da viagem:</b> ${trav}</p>
        <p><b>Condições específicas:</b> ${esc(sv.conditions || 'Nenhuma registrada')}</p></div>
      <div class="crit">${critCell('severity', L.severity, C.SEVERITY_LABELS[L.severity])}${critCell('orientation', L.orientation, C.ORIENTATION[L.orientation - 1][1])}${critCell('terrain', L.terrain, C.TERRAIN[L.terrain - 1][1])}${critCell('effort', L.effort, C.EFFORT_LABELS[L.effort])}</div>
      <p class="scale">* Os graus de classificação variam entre 1 e 5. Índice de esforço: ${effLine} — grau de esforço, não duração cronológica.</p>
      ${a.notes.map(n => `<div class="doc-note">${esc(n.text)}</div>`).join('')}
      <div class="doc-vis"><figure><h2>Mapa</h2>${map.svg}<figcaption>${map.note}</figcaption></figure><figure><h2>Perfil altimétrico</h2>${prof.svg}<figcaption>${prof.note}</figcaption></figure></div>
      <p class="doc-foot">Percurso de ${act} classificado com uso da ABNT NBR ISO 3021 como referência.${sv.organization ? ' Responsável: ' + esc(sv.organization) + '.' : ''} Avaliação em ${dateBr(sv.date)}.</p></article>`;
  }

  function detailsHtml(sv, a) {
    const rows = a.segments.map((s, i) => `<tr><td>${i + 1}${a.multiDay ? ' · d' + s.day : ''}</td><td>${esc(s.name)}</td><td>${fmt(s.distance, 2)}</td><td>${s.ascent} / ${s.descent}</td><td>${(C.SURFACES.find(p => p.v === s.surface) || {}).name || ''} (${s.surface} km/h)</td><td>${s.severity} <span class="muted">(${s.factors.length})</span></td><td>${s.orientation}</td><td>${s.terrain}</td><td>${durationText(s.effort)} · ${C.effortLevel(s.effort)}</td></tr>`).join('');
    const days = a.days.map(d => `<li>${a.multiDay ? 'Dia ' + d.day + ': ' : ''}TH ${durationText(d.th)} · TV ${durationText(d.tv)} → <b>IE ${durationText(d.ie)}</b> (nível ${d.level})</li>`).join('');
    return `<section class="det"><div class="card stack"><h2>Detalhamento por etapa</h2>
      <div class="tbl"><table><thead><tr><th>#</th><th>Etapa</th><th>km</th><th>↑ / ↓ (m)</th><th>Piso</th><th>Sever. (fatores)</th><th>Orient.</th><th>Terreno</th><th>IE · nível</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="note">Níveis finais: severidade, orientação e terreno = maior valor entre as etapas; esforço = soma dos tempos das etapas (por dia, no longo curso). Os níveis de esforço por etapa são apenas informativos.</p></div>
      <div class="card stack"><h2>Memória de cálculo do esforço</h2>
        <ul style="margin:0;padding-left:18px">${days}</ul>
        <p class="note">TH = Σ distância ÷ velocidade do piso. TV = Σ subida ÷ 200 m/h + Σ descida ÷ 300 m/h. IE = maior tempo + metade do menor. Faixas: ${[1, 2, 3, 4, 5].map(n => `${n} = ${C.EFFORT_RANGES[n]}`).join('; ')}.</p></div></section>`;
  }

  function viewResult() {
    const main = $('#app'), sv = survey, a = aggregate(sv);
    main.innerHTML = `${stepper(3)}<div class="stack">
      <div class="no-print"><p class="eyebrow">Classificação final</p><h1>${esc(sv.name)}</h1><p class="lead">Documento no formato do Anexo B da norma. Use Imprimir para salvar em PDF ou imprimir.</p></div>
      <div class="res-actions no-print"><button class="btn btn-primary" id="printBtn" type="button">🖨 Imprimir / salvar PDF</button><button class="btn btn-outline" id="copyBtn" type="button">Copiar resultado</button><button class="btn btn-outline" id="reviewBtn" type="button">Revisar etapas</button></div>
      ${docHtml(sv, a)}${detailsHtml(sv, a)}
      <div class="res-actions no-print"><button class="btn btn-primary" id="printBtn2" type="button">🖨 Imprimir / salvar PDF</button><button class="btn btn-dark" id="newBtn2" type="button">＋ Novo roteiro</button><button class="btn btn-ghost" id="homeBtn2" type="button">Voltar ao início</button></div></div>`;
    $('#printBtn').onclick = $('#printBtn2').onclick = () => window.print();
    $('#reviewBtn').onclick = () => nav('etapas');
    $('#copyBtn').onclick = () => copyResult(sv, a);
    $('#newBtn2').onclick = async () => { survey = null; routeTrack = null; routeLogo = null; await TrailDB.clearCurrent(); nav('roteiro'); };
    $('#homeBtn2').onclick = () => nav('inicio');
    scrollTop();
  }
  async function copyResult(sv, a) {
    const L = a.levels;
    const txt = [`${sv.name} — ${sv.activity}`, `Classificação (ABNT NBR ISO 3021): severidade ${L.severity} (${C.SEVERITY_LABELS[L.severity]}) · orientação ${L.orientation} · terreno ${L.terrain} · esforço ${L.effort} (${C.EFFORT_LABELS[L.effort]})`,
      `Distância: ${fmt(a.total, 2)} km · Subidas: ${fmt(a.up, 0)} m · Descidas: ${fmt(a.down, 0)} m`, `Índice de esforço: ${durationText(a.worstDay.ie)} (grau de esforço, não duração cronológica)`,
      Number.isFinite(sv.travelMinutes) && sv.travelMinutes > 0 ? `Tempo total médio da viagem: ${minutesText(sv.travelMinutes)}` : '', ...a.notes.map(n => n.text)].filter(Boolean).join('\n');
    try { await navigator.clipboard.writeText(txt); toast('Resultado copiado.'); } catch (_) { toast('Não foi possível copiar neste navegador.'); }
  }

  /* ================= DADOS / PWA ================= */
  async function updateDbInfo() {
    const n = await TrailDB.count().catch(() => 0);
    $('#dbInfo').textContent = `${n} ${n === 1 ? 'classificação salva' : 'classificações salvas'} neste aparelho.`;
  }
  async function exportBackup() {
    const data = await TrailDB.exportAll(), text = JSON.stringify(data, null, 2), name = `classifica-trilha-backup-${todayIso()}.json`;
    if (window.AndroidStorage && window.AndroidStorage.saveText) { window.AndroidStorage.saveText(text, name); toast('Backup salvo na pasta Downloads.'); return; }
    const blob = new Blob([text], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast('Backup exportado.');
  }
  async function restoreBackup(e) {
    const file = e.target.files[0]; if (!file) return;
    try {
      let data; try { data = JSON.parse(await file.text()); } catch (_) { throw new Error('O arquivo não é um JSON válido.'); }
      if (!C.isBackup(data)) throw new Error('Este arquivo não é um backup do Classifica Trilha.');
      let replaceCurrent = false;
      if (data.currentSurvey) {
        if (!hasWork(survey)) replaceCurrent = true;
        else replaceCurrent = await confirmDialog('Roteiro em andamento', `O backup contém um roteiro em andamento (“${data.currentSurvey.name || 'sem nome'}”). Substituir o roteiro em andamento neste aparelho (“${survey.name}”)? As classificações salvas são sempre preservadas.`, 'Substituir', 'Manter o atual');
      }
      const r = await TrailDB.importAll(data, { replaceCurrent });
      if (r.currentRestored) survey = await TrailDB.getCurrent();
      await updateDbInfo();
      toast(`Backup restaurado: ${r.added} nova(s), ${r.updated} atualizada(s), ${r.skipped} já existente(s).`);
      if (!location.hash || location.hash === '#/' || location.hash === '#/inicio') render();
    } catch (err) { toast(err.message || 'Não foi possível restaurar o backup.'); }
    finally { e.target.value = ''; }
  }
  function updateStatus() {
    const on = navigator.onLine, pill = $('#statusPill');
    pill.classList.toggle('offline', !on);
    const ready = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
    $('#statusText').textContent = !on ? 'Sem conexão — tudo funciona' : ready ? 'Pronto para usar offline' : 'Dados salvos neste aparelho';
  }
  async function checkUpdate() {
    if (!navigator.onLine) return toast('Conecte-se à internet para verificar atualização.');
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return toast('Atualização automática indisponível neste modo.');
    const reg = await navigator.serviceWorker.getRegistration(); if (!reg) return;
    toast('Procurando atualização…'); await reg.update();
    if (reg.waiting || reg.installing) { checkUpdate.requested = true; if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING'); setTimeout(() => location.reload(), 1500); }
    else toast('Você já está na versão mais recente (' + APP_VERSION + ').');
  }
  function setupPwa() {
    const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const show = v => ['#installBtn', '#installBtn2'].forEach(s => $(s).classList.toggle('hidden', !v));
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; if (!isStandalone) show(true); });
    window.addEventListener('appinstalled', () => { show(false); toast('App instalado.'); });
    ['#installBtn', '#installBtn2'].forEach(s => $(s).onclick = async () => {
      if (!deferredInstall) return toast('No menu do navegador, escolha “Instalar app” ou “Adicionar à tela inicial”.');
      deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; show(false);
    });
    if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone) $('#iosHint').hidden = false;
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.CT_PREVIEW) {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
        reg.update().catch(() => {});
        navigator.serviceWorker.addEventListener('controllerchange', () => { updateStatus(); if (checkUpdate.requested) location.reload(); });
      }).catch(() => {});
      navigator.serviceWorker.ready.then(updateStatus);
    }
  }

  /* ================= início ================= */
  async function init() {
    try { await TrailDB.init(); survey = await TrailDB.getCurrent(); } catch (_) { toast('Falha ao abrir o banco de dados local.'); }
    if (survey) { survey.segments = survey.segments || []; }
    $('#homeBtn').onclick = () => nav('inicio');
    $('#dataBtn').onclick = () => { updateDbInfo(); $('#dataDlg').showModal(); };
    $('#dataClose').onclick = () => $('#dataDlg').close();
    $('#exportBtn').onclick = exportBackup; $('#restoreFile').onchange = restoreBackup; $('#updateBtn').onclick = checkUpdate;
    addEventListener('online', updateStatus); addEventListener('offline', updateStatus);
    addEventListener('hashchange', render);
    addEventListener('beforeunload', () => { if ($('#stageForm')) saveDraftNow(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && $('#stageForm')) saveDraftNow(); });
    setupPwa(); updateStatus(); render();
  }
  init();
})();
