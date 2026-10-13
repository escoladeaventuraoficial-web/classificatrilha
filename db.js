/* Classifica Trilha 2.0 — armazenamento local (IndexedDB).
   Mantém o MESMO banco e o MESMO formato de backup da v1.11, para que dados
   e backups antigos continuem funcionando. */
(function (root) {
  'use strict';
  const DB_NAME = 'classifica-trilha-db', DB_VERSION = 1;
  let dbPromise;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('app')) db.createObjectStore('app', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('classifications')) {
          const s = db.createObjectStore('classifications', { keyPath: 'id' });
          s.createIndex('date', 'date'); s.createIndex('name', 'name');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function run(storeName, mode, op) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode), store = tx.objectStore(storeName);
      let r;
      try { r = op(store); } catch (e) { reject(e); return; }
      tx.oncomplete = () => resolve(r && r.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  const getCurrent = async () => ((await run('app', 'readonly', s => s.get('currentSurvey'))) || {}).value || null;
  const saveCurrent = v => run('app', 'readwrite', s => s.put({ key: 'currentSurvey', value: v, updatedAt: new Date().toISOString() }));
  const clearCurrent = () => run('app', 'readwrite', s => s.delete('currentSurvey'));

  async function init() {
    await open();
    // migração da v1.0 (localStorage), sem sobrescrever nada existente
    try {
      const legacy = localStorage.getItem('iso3021Survey');
      if (legacy && !(await getCurrent())) { await saveCurrent(JSON.parse(legacy)); localStorage.removeItem('iso3021Survey'); }
    } catch (_) { /* ignora */ }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }

  async function archive(survey, result) {
    const id = survey.archiveId || crypto.randomUUID();
    await run('classifications', 'readwrite', s => s.put({
      id, name: survey.name, date: survey.date || new Date().toISOString().slice(0, 10),
      savedAt: new Date().toISOString(), survey: Object.assign({}, survey, { archiveId: id }), result
    }));
    return id;
  }
  const list = async () => ((await run('classifications', 'readonly', s => s.getAll())) || []).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  const get = id => run('classifications', 'readonly', s => s.get(id));
  const remove = id => run('classifications', 'readwrite', s => s.delete(id));
  const count = () => run('classifications', 'readonly', s => s.count());

  async function exportAll() {
    return {
      format: 'classifica-trilha-backup', version: 1, exportedAt: new Date().toISOString(),
      app: 'classifica-trilha-2.0', currentSurvey: await getCurrent(), classifications: await list()
    };
  }

  /* Restauração aditiva: nunca apaga registros existentes.
     Para o mesmo id, prevalece o registro salvo mais recentemente.
     Devolve quantos itens foram adicionados/atualizados. */
  async function importAll(data, { replaceCurrent = false } = {}) {
    if (!root.CT.isBackup(data)) throw new Error('Arquivo de backup inválido.');
    const existing = new Map((await list()).map(i => [i.id, i]));
    let added = 0, updated = 0, skipped = 0;
    const toPut = [];
    for (const item of data.classifications) {
      if (!item || !item.id) { skipped++; continue; }
      const old = existing.get(item.id);
      if (!old) { toPut.push(item); added++; }
      else if (String(item.savedAt) > String(old.savedAt)) { toPut.push(item); updated++; }
      else skipped++;
    }
    if (toPut.length) await run('classifications', 'readwrite', store => { toPut.forEach(i => store.put(i)); });
    let currentRestored = false;
    if (data.currentSurvey && replaceCurrent) { await saveCurrent(data.currentSurvey); currentRestored = true; }
    return { added, updated, skipped, currentRestored };
  }

  root.TrailDB = { init, getCurrent, saveCurrent, clearCurrent, archive, list, get, remove, count, exportAll, importAll };
})(window);
