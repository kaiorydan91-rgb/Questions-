const DB_NAME = 'grafia-questoes-db';
const DB_VERSION = 4;

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao acessar o banco local.'));
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('A transação foi cancelada.'));
    tx.onerror = () => reject(tx.error || new Error('Falha na transação.'));
  });
}

export async function openDB() {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = event => {
    const db = request.result;
    const upgradeTx = event.target.transaction;
    const ensure = (name, options) => db.objectStoreNames.contains(name) ? upgradeTx.objectStore(name) : db.createObjectStore(name, options);
    const questions = ensure('questions', { keyPath: 'id' });
    if (!questions.indexNames.contains('area')) questions.createIndex('area', 'area', { unique: false });
    if (!questions.indexNames.contains('subject')) questions.createIndex('subject', 'subject', { unique: false });
    if (!questions.indexNames.contains('difficulty')) questions.createIndex('difficulty', 'difficulty', { unique: false });
    if (!questions.indexNames.contains('primaryTopic')) questions.createIndex('primaryTopic', 'primaryTopic', { unique: false });
    if (!questions.indexNames.contains('updatedAt')) questions.createIndex('updatedAt', 'updatedAt', { unique: false });

    const assets = ensure('assets', { keyPath: 'id' });
    if (!assets.indexNames.contains('fileName')) assets.createIndex('fileName', 'fileName', { unique: false });
    const assetBlobs = ensure('assetBlobs', { keyPath: 'id' });
    if (event.oldVersion < 3) {
      const cursorRequest = assets.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const value = cursor.value;
        if (value && value.blob) {
          assetBlobs.put({ id: value.id, blob: value.blob, type: value.mimeType || value.blob.type || '', updatedAt: value.updatedAt || new Date().toISOString() });
          delete value.blob;
          cursor.update(value);
        }
        cursor.continue();
      };
    }
    ensure('textBases', { keyPath: 'id' });
    const activities = ensure('activities', { keyPath: 'id' });
    if (!activities.indexNames.contains('createdAt')) activities.createIndex('createdAt', 'createdAt', { unique: false });
    const answers = ensure('answers', { keyPath: 'id' });
    if (!answers.indexNames.contains('activityId')) answers.createIndex('activityId', 'activityId', { unique: false });
    if (!answers.indexNames.contains('questionId')) answers.createIndex('questionId', 'questionId', { unique: false });
    const reviews = ensure('reviews', { keyPath: 'id' });
    if (!reviews.indexNames.contains('dueAt')) reviews.createIndex('dueAt', 'dueAt', { unique: false });
    if (!reviews.indexNames.contains('status')) reviews.createIndex('status', 'status', { unique: false });
    ensure('notes', { keyPath: 'id' });
    ensure('collections', { keyPath: 'id' });
    ensure('settings', { keyPath: 'key' });
    const imports = ensure('imports', { keyPath: 'id' });
    if (!imports.indexNames.contains('createdAt')) imports.createIndex('createdAt', 'createdAt', { unique: false });
    ensure('aliases', { keyPath: 'alias' });
    const topics = ensure('topics', { keyPath: 'id' });
    if (!topics.indexNames.contains('normalized')) topics.createIndex('normalized', 'normalized', { unique: false });
    if (!topics.indexNames.contains('label')) topics.createIndex('label', 'label', { unique: false });
    ensure('changes', { keyPath: 'seq', autoIncrement: true });
  };
  const db = await requestPromise(request);
  await ensureInitialSettings(db);
  return db;
}

async function ensureInitialSettings(db) {
  const tx = db.transaction('settings', 'readwrite');
  const done = transactionDone(tx);
  const store = tx.objectStore('settings');
  const currentReq = store.get('databaseId');
  currentReq.onsuccess = () => {
    if (!currentReq.result) store.put({ key: 'databaseId', value: crypto.randomUUID() });
    const versionReq = store.get('appVersion');
    versionReq.onsuccess = () => {
      if (versionReq.result?.value !== '1.3.0') store.put({ key: 'appVersion', value: '1.3.0' });
    };
  };
  await done;
}

export async function getAll(db, storeName) {
  const tx = db.transaction(storeName, 'readonly');
  const done = transactionDone(tx);
  const result = await requestPromise(tx.objectStore(storeName).getAll());
  await done;
  return result;
}

export async function getAllStoresSnapshot(db, storeNames) {
  const names = [...new Set(storeNames)];
  const tx = db.transaction(names, 'readonly');
  const done = transactionDone(tx);
  const pairs = await Promise.all(names.map(async name => [name, await requestPromise(tx.objectStore(name).getAll())]));
  await done;
  return Object.fromEntries(pairs);
}

export async function getChangesSnapshot(db, afterSequence = 0) {
  const tx = db.transaction('changes', 'readonly');
  const done = transactionDone(tx);
  const changes = await requestPromise(tx.objectStore('changes').getAll());
  await done;
  const checkpointSeq = changes.reduce((max, item) => Math.max(max, Number(item.seq) || 0), 0);
  return { changes: changes.filter(item => (Number(item.seq) || 0) > Number(afterSequence || 0)), checkpointSeq };
}

export async function getOne(db, storeName, id) {
  const tx = db.transaction(storeName, 'readonly');
  const done = transactionDone(tx);
  const result = await requestPromise(tx.objectStore(storeName).get(id));
  await done;
  return result;
}

export async function putRecord(db, storeName, record, action = 'upsert') {
  const now = new Date().toISOString();
  const copy = { ...record, updatedAt: record.updatedAt || now };
  const tx = db.transaction([storeName, 'changes'], 'readwrite');
  tx.objectStore(storeName).put(copy);
  const changeRecord = storeName === 'assetBlobs' ? { id: copy.id, size: copy.blob?.size ?? 0, type: copy.type || copy.blob?.type || '' } : copy;
  tx.objectStore('changes').add({ table: storeName, id: copy.id ?? copy.key ?? copy.alias, action, record: changeRecord, changedAt: now });
  await transactionDone(tx);
  return copy;
}

export async function deleteRecord(db, storeName, id) {
  const now = new Date().toISOString();
  const tx = db.transaction([storeName, 'changes'], 'readwrite');
  tx.objectStore(storeName).delete(id);
  tx.objectStore('changes').add({ table: storeName, id, action: 'delete', changedAt: now });
  await transactionDone(tx);
}

export async function writeBatch(db, recordsByStore, aliases = []) {
  const storeNames = [...new Set([...Object.keys(recordsByStore), ...(aliases.length ? ['aliases'] : []), 'changes'])];
  const tx = db.transaction(storeNames, 'readwrite');
  const now = new Date().toISOString();
  for (const [storeName, records] of Object.entries(recordsByStore)) {
    const store = tx.objectStore(storeName);
    const changes = tx.objectStore('changes');
    for (const record of records || []) {
      const shaped = { ...record, updatedAt: record.updatedAt || now };
      store.put(shaped);
      const changeRecord = storeName === 'assetBlobs' ? { id: shaped.id, size: shaped.blob?.size ?? 0, type: shaped.type || shaped.blob?.type || '' } : shaped;
      changes.add({ table: storeName, id: shaped.id ?? shaped.key ?? shaped.alias, action: 'upsert', record: changeRecord, changedAt: now });
    }
  }
  if (aliases.length) {
    const store = tx.objectStore('aliases');
    const changes = tx.objectStore('changes');
    for (const alias of aliases) {
      store.put(alias);
      changes.add({ table: 'aliases', id: alias.alias, action: 'upsert', record: alias, changedAt: now });
    }
  }
  await transactionDone(tx);
}

export async function replaceAllData(db, recordsByStore) {
  const names = ['questions', 'assets', 'assetBlobs', 'textBases', 'activities', 'answers', 'reviews', 'notes', 'collections', 'settings', 'imports', 'aliases', 'topics', 'changes'];
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) {
    const store = tx.objectStore(name);
    store.clear();
    for (const record of recordsByStore[name] || []) store.put(record);
  }
  await transactionDone(tx);
}

export async function mergeAllData(db, recordsByStore, perConflict = {}) {
  const names = Object.keys(recordsByStore).filter(name => name !== 'changes');
  const existingByStore = {};
  for (const name of names) {
    const all = await getAll(db, name);
    existingByStore[name] = new Map(all.map(item => [item.id ?? item.key ?? item.alias, item]));
  }
  const tx = db.transaction([...new Set([...names, 'changes'])], 'readwrite');
  const now = new Date().toISOString();
  const report = { inserted: 0, updated: 0, kept: 0, conflicts: [] };
  for (const name of names) {
    const store = tx.objectStore(name);
    const changes = tx.objectStore('changes');
    const existingMap = existingByStore[name];
    for (const incoming of recordsByStore[name] || []) {
      const key = incoming.id ?? incoming.key ?? incoming.alias;
      const existing = existingMap.get(key);
      if (!existing) {
        store.put(incoming);
        const logRecord = name === 'assetBlobs' ? { id: incoming.id, size: incoming.blob?.size ?? 0, type: incoming.type || incoming.blob?.type || '' } : incoming;
        changes.add({ table: name, id: key, action: 'upsert', record: logRecord, changedAt: now });
        report.inserted++;
      } else {
        const same = recordsEquivalent(existing, incoming, name);
        if (same) { report.kept++; continue; }
        const choice = perConflict[`${name}:${key}`] || 'newer';
        const useIncoming = choice === 'backup' || (choice === 'newer' && Date.parse(incoming.updatedAt || 0) > Date.parse(existing.updatedAt || 0));
        report.conflicts.push({ table: name, id: key, existingUpdatedAt: existing.updatedAt || null, incomingUpdatedAt: incoming.updatedAt || null, choice: useIncoming ? 'backup' : 'keep-existing' });
        if (choice === 'keep') report.kept++;
        else if (useIncoming) {
          store.put(incoming);
          const logRecord = name === 'assetBlobs' ? { id: incoming.id, size: incoming.blob?.size ?? 0, type: incoming.type || incoming.blob?.type || '' } : incoming;
          changes.add({ table: name, id: key, action: 'upsert', record: logRecord, changedAt: now });
          report.updated++;
        } else {
          report.kept++;
        }
      }
    }
  }
  await transactionDone(tx);
  return report;
}

function recordsEquivalent(existing, incoming, storeName) {
  if (storeName === 'assetBlobs') {
    return (existing.blob?.size ?? 0) === (incoming.blob?.size ?? 0) &&
      (existing.type || existing.blob?.type || '') === (incoming.type || incoming.blob?.type || '') &&
      (existing.updatedAt || '') === (incoming.updatedAt || '');
  }
  const left = { ...existing }; const right = { ...incoming };
  delete left.updatedAt; delete right.updatedAt;
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function getSetting(db, key, fallback = null) {
  const item = await getOne(db, 'settings', key);
  return item ? item.value : fallback;
}

export async function setSetting(db, key, value) {
  const now = new Date().toISOString();
  const tx = db.transaction(['settings', 'changes'], 'readwrite');
  const record = { key, value, updatedAt: now };
  tx.objectStore('settings').put(record);
  tx.objectStore('changes').add({ table: 'settings', id: key, action: 'upsert', record, changedAt: now });
  await transactionDone(tx);
}

export async function listChanges(db, afterSequence = 0) {
  const { changes } = await getChangesSnapshot(db, afterSequence);
  return changes;
}

export async function countAll(db) {
  const names = ['questions', 'assets', 'activities', 'answers', 'reviews', 'notes', 'collections', 'imports', 'topics'];
  const tx = db.transaction(names, 'readonly');
  const done = transactionDone(tx);
  const counts = await Promise.all(names.map(name => requestPromise(tx.objectStore(name).count())));
  await done;
  return Object.fromEntries(names.map((name, index) => [name, counts[index]]));
}
