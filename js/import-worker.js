import { openDB } from './db.js';
import { prepareQuestionImport } from './importer.js';

self.addEventListener('message', async event => {
  const { jsonFile, zipFile } = event.data || {};
  let db = null;
  try {
    if (!jsonFile || typeof jsonFile.arrayBuffer !== 'function' || typeof jsonFile.text !== 'function') {
      throw new Error('O arquivo selecionado não pôde ser lido. Feche a janela de importação, selecione o ZIP novamente e tente outra vez.');
    }
    db = await openDB();
    const draft = await prepareQuestionImport(db, jsonFile, zipFile || null);
    // Draft contains Blob values; structured cloning supports them without transferring
    // or detaching the original image data.
    self.postMessage({ ok: true, draft });
  } catch (error) {
    self.postMessage({ ok: false, error: error?.message || 'Falha ao analisar o pacote.' });
  } finally {
    try { db?.close(); } catch { /* database may already be closed */ }
  }
});
