import { openDB } from './db.js';
import { prepareQuestionImport } from './importer.js';

self.addEventListener('message', async event => {
  const { jsonFile, zipFile } = event.data || {};
  try {
    const db = await openDB();
    const draft = await prepareQuestionImport(db, jsonFile, zipFile || null);
    self.postMessage({ ok: true, draft });
    db.close();
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || 'Falha ao analisar o pacote.' });
  }
});
