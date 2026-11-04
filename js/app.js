import { openDB, getAll, getAllStoresSnapshot, getChangesSnapshot, getOne, putRecord, deleteRecord, writeBatch, replaceAllData, mergeAllData, getSetting, setSetting, countAll } from './db.js';
import { prepareQuestionImport, mergeQuestion, normalizeSearch } from './importer.js';
import { readZip, writeZip, downloadBlob } from './zip.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
// Remove obsolete floating navigation markers left by older interface builds.
document.querySelectorAll('.nav-indicator, .nav-bubble, .nav-orb, .navigation-indicator, .floating-nav-indicator, .nav-active-indicator, .nav-marker, .active-nav-marker, .nav-active-marker, #navIndicator, #navBubble, #navMarker, [data-nav-indicator], [data-nav-bubble], [data-nav-marker]').forEach(element => element.remove());
const nowISO = () => new Date().toISOString();
const makeId = prefix => `${prefix}-${crypto.randomUUID()}`;
const STORES = ['questions', 'assets', 'assetBlobs', 'textBases', 'activities', 'answers', 'reviews', 'notes', 'collections', 'settings', 'imports', 'aliases', 'topics', 'changes'];
const DATA_STORES = STORES.filter(name => !['assetBlobs', 'changes'].includes(name));
const BANK_PAGE_SIZE = 40;
const SUBJECTS = {
  'Linguagens': ['Português', 'Literatura', 'Inglês', 'Espanhol', 'Artes', 'Educação Física'],
  'Ciências Humanas': ['História', 'Geografia', 'Filosofia', 'Sociologia'],
  'Ciências da Natureza': ['Biologia', 'Química', 'Física'],
  'Exatas': ['Matemática']
};
const state = {
  db: null, data: {}, page: 'home', importDraft: null, currentActivity: null,
  activityAnswers: new Map(), activityTimer: null, activityStart: null,
  reviewFilter: 'due', assetUrls: new Map(), restoreDraft: null, restoreConflicts: [], restoreChoices: {}, bankPage: 1, pendingBackup: null, finishingActivityId: null,
  activityFilters: { areas: [], subjects: [], topics: [] }
};

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function safeAttr(value) { return escapeHTML(value).replace(/`/g, '&#96;'); }
function normalizeWebUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch { return ''; }
}
function linkifyText(value) {
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s<>"']+)/gi;
  return String(value ?? '').replace(pattern, (match, _all, markdownLabel, markdownUrl) => {
    const isMarkdownLink = Boolean(markdownUrl);
    const trailing = isMarkdownLink ? '' : (match.match(/[.,;:!?)}\]]+$/) || [''])[0];
    const rawUrl = isMarkdownLink ? markdownUrl : (trailing ? match.slice(0, -trailing.length) : match);
    const href = normalizeWebUrl(rawUrl);
    if (!href) return escapeHTML(match);
    let host = '';
    try { host = new URL(href).hostname.replace(/^www\./i, ''); } catch {}
    const label = markdownLabel ? escapeHTML(markdownLabel) : 'Abrir link';
    return `<a class="content-link" href="${safeAttr(href)}" target="_blank" rel="noopener noreferrer" title="${safeAttr(href)}" aria-label="Abrir referência externa: ${safeAttr(host || 'link')}"><span aria-hidden="true">↗</span><span>${label}</span></a>${escapeHTML(trailing)}`;
  });
}
function richText(value) {
  return linkifyText(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
}
function renderExternalReference(url, label = 'Abrir referência') {
  const href = normalizeWebUrl(url);
  if (!href) return '';
  let host = '';
  try { host = new URL(href).hostname.replace(/^www\./i, ''); } catch {}
  return `<a class="question-reference-link" href="${safeAttr(href)}" target="_blank" rel="noopener noreferrer"><span class="reference-link-icon" aria-hidden="true">↗</span><span class="reference-link-copy"><b>${escapeHTML(label)}</b><small>${escapeHTML(host || href)}</small></span></a>`;
}
function renderQuestionReferences(question) {
  const source = question.source && typeof question.source === 'object' ? question.source : {};
  const candidates = [
    { url: typeof question.source === 'string' ? question.source : '', label: 'Fonte da questão' },
    { url: source.url || source.link || source.href || source.sourceUrl || source.sourceURL, label: source.linkLabel || source.label || source.name || 'Fonte da questão' },
    { url: question.sourceUrl || question.sourceURL || question.sourceLink || question.referenceUrl, label: 'Fonte da questão' }
  ];
  for (const item of [...(Array.isArray(question.links) ? question.links : []), ...(Array.isArray(question.references) ? question.references : [])]) {
    if (typeof item === 'string') candidates.push({ url: item, label: 'Referência da questão' });
    else if (item && typeof item === 'object') candidates.push({ url: item.url || item.href || item.link, label: item.label || item.title || item.name || 'Referência da questão' });
  }
  const seen = new Set();
  const rendered = candidates.map(item => {
    const href = normalizeWebUrl(item.url);
    if (!href || seen.has(href)) return '';
    seen.add(href);
    return renderExternalReference(href, item.label);
  }).filter(Boolean);
  return rendered.length ? `<section class="question-references" aria-label="Fontes e links da questão"><div class="reference-section-label">FONTES E LINKS</div><div class="question-reference-list">${rendered.join('')}</div></section>` : '';
}
function formatDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
}
function timeAgoSeconds(start, end = Date.now()) { return Math.max(0, Math.floor((end - new Date(start).getTime()) / 1000)); }
function durationLabel(seconds) {
  const mins = Math.floor((seconds || 0) / 60);
  const hrs = Math.floor(mins / 60);
  return hrs ? `${hrs}h ${mins % 60}min` : `${mins}min`;
}
function toast(message, duration = 2800) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.add('hidden'), duration);
}
function openModal(title, body, footer = '', eyebrow = 'GRAFIA QUESTIONS') {
  $('#modalEyebrow').textContent = eyebrow;
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = body;
  $('#modalFooter').innerHTML = footer;
  $('#modalBackdrop').classList.remove('hidden');
  $('#modal').scrollTop = 0;
}
function closeModal() {
  $('#modalBackdrop').classList.add('hidden');
  $('#modalBody').innerHTML = '';
  $('#modalFooter').innerHTML = '';
}

async function refreshData() {
  const pairs = await Promise.all(DATA_STORES.map(async name => [name, await getAll(state.db, name)]));
  state.data = Object.fromEntries(pairs);
  state.data.questions ||= [];
  state.data.assets ||= [];
  state.data.textBases ||= [];
  state.data.activities ||= [];
  state.data.answers ||= [];
  state.data.reviews ||= [];
  state.data.notes ||= [];
  state.data.collections ||= [];
  state.data.imports ||= [];
  state.data.aliases ||= [];
  state.data.topics ||= [];
  await syncTopicCatalog(state.data.questions);
  state.data.topics = await getAll(state.db, 'topics');
  renderAll();
}
function questionById(id) { return state.data.questions.find(q => q.id === id); }
function answerById(id) { return state.data.answers.find(a => a.id === id); }
function sortedQuestions() { return [...state.data.questions].sort((a, b) => (a.subject || '').localeCompare(b.subject || '') || (a.primaryTopic || '').localeCompare(b.primaryTopic || '') || a.id.localeCompare(b.id)); }
function topicValues(question) {
  return [...new Set([question.primaryTopic, ...(question.secondaryTopics || []), ...(question.subtopics || [])]
    .map(value => String(value || '').trim()).filter(Boolean))];
}
async function syncTopicCatalog(questions) {
  const current = await getAll(state.db, 'topics');
  const known = new Map(current.map(item => [item.id, item]));
  const desired = new Map();
  for (const question of questions || []) {
    const uniqueQuestionTopics = new Map();
    for (const label of topicValues(question)) {
      const normalized = normalizeSearch(label);
      if (normalized && !uniqueQuestionTopics.has(normalized)) uniqueQuestionTopics.set(normalized, label);
    }
    for (const [normalized, label] of uniqueQuestionTopics) {
      const item = desired.get(normalized) || { id: normalized, normalized, label, questionCount: 0, areas: [], subjects: [] };
      item.questionCount++;
      if (question.area && !item.areas.includes(question.area)) item.areas.push(question.area);
      if (question.subject && !item.subjects.includes(question.subject)) item.subjects.push(question.subject);
      desired.set(normalized, item);
    }
  }
  const changed = [...desired.values()].filter(item => {
    const old = known.get(item.id);
    return !old || old.label !== item.label || old.questionCount !== item.questionCount ||
      JSON.stringify([...(old.areas || [])].sort()) !== JSON.stringify([...item.areas].sort()) ||
      JSON.stringify([...(old.subjects || [])].sort()) !== JSON.stringify([...item.subjects].sort());
  });
  if (changed.length) await writeBatch(state.db, { topics: changed });
  const obsolete = current.filter(item => !desired.has(item.id));
  for (const item of obsolete) await deleteRecord(state.db, 'topics', item.id);
}
function completedAnswers() { const ids = new Set(state.data.activities.filter(item => item.status === 'completed').map(item => item.id)); return state.data.answers.filter(item => ids.has(item.activityId) && item.response !== '' && item.response != null && item.isCorrect != null); }
function clearAssetUrlCache() {
  for (const url of state.assetUrls.values()) URL.revokeObjectURL(url);
  state.assetUrls.clear();
}

function pageNavigate(page) {
  if (!page) return;
  state.page = page;
  $$('.page').forEach(element => element.classList.toggle('active', element.dataset.pageId === page));
  $$('.nav-item[data-page]').forEach(element => element.classList.toggle('active', element.dataset.page === page));
  if (page === 'home') renderHome();
  if (page === 'bank') renderBank();
  if (page === 'activity') { if (state.currentActivity?.status === 'running') { renderSession(); startActivityTimer(); } else renderActivityBuilder(); }
  if (page === 'performance') renderPerformance();
  if (page === 'reviews') renderReviews();
  if (page === 'library') renderLibrary();
  if (page === 'settings') renderSettings();
  $('#mainContent').focus({ preventScroll: true });
}

function renderAll() {
  $('#todayLabel').textContent = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date());
  renderHome(); renderBank(); renderActivityBuilder(); renderPerformance(); renderReviews(); renderLibrary(); renderSettings();
  const running = [...state.data.activities].filter(item => item.status === 'running').sort((a,b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
  if (running && !state.currentActivity) {
    state.currentActivity = running;
    loadActivityAnswers(running.id).then(() => { if (state.page === 'activity') renderSession(); });
  }
}

function renderHome() {
  const questions = state.data.questions;
  const activities = state.data.activities.filter(item => item.status === 'completed');
  const answered = completedAnswers();
  const correct = answered.filter(item => item.isCorrect).length;
  const hasQuestions = questions.length > 0;
  $('#homeEmpty').classList.toggle('hidden', hasQuestions);
  $('#homePopulated').classList.toggle('hidden', !hasQuestions);
  $('#homeQuestionCount').textContent = questions.length.toLocaleString('pt-BR');
  $('#homeActivityCount').textContent = activities.length.toLocaleString('pt-BR');
  $('#homeAccuracy').textContent = answered.length ? `${Math.round(correct / answered.length * 100)}%` : '—';
  $('#areaQuestionTotal').textContent = `${questions.length} ${questions.length === 1 ? 'questão' : 'questões'}`;
  $$('#homeAreas .area-card').forEach(card => {
    const area = card.dataset.filterArea;
    card.querySelector('strong').textContent = questions.filter(q => q.area === area).length;
  });
  if (!answered.length) {
    $('#homePerformance').classList.remove('hidden');
    $('#homePerformanceData').classList.add('hidden');
  } else {
    $('#homePerformance').classList.add('hidden');
    $('#homePerformanceData').classList.remove('hidden');
    const recent = activities.slice().sort((a,b) => Date.parse(b.endedAt || b.createdAt) - Date.parse(a.endedAt || a.createdAt)).slice(0,3);
    $('#homePerformanceData').innerHTML = `<div class="metric-row"><div class="metric"><strong>${Math.round(correct / answered.length * 100)}%</strong><span>aproveitamento geral</span></div><div class="metric"><strong>${state.data.reviews.filter(r => r.status !== 'completed').length}</strong><span>revisões pendentes</span></div></div>${recent.map(item => `<div class="compact-item"><span><b>${escapeHTML(item.title || 'Atividade')}</b><small>${formatDate(item.endedAt || item.createdAt)}</small></span><strong>${item.result?.percentage ?? 0}%</strong></div>`).join('')}`;
  }
}

function fillSubjectSelect(select, area = '') {
  if (!select) return;
  const selected = select.value;
  const available = area ? (SUBJECTS[area] || []) : Object.values(SUBJECTS).flat();
  select.innerHTML = `<option value="">Todas as matérias</option>${available.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('')}`;
  if (available.includes(selected)) select.value = selected;
}
function renderBank() {
  fillSubjectSelect($('#filterSubject'), $('#filterArea').value);
  const search = normalizeSearch($('#bankSearch').value);
  const area = $('#filterArea').value;
  const subject = $('#filterSubject').value;
  const difficulty = $('#filterDifficulty').value;
  const type = $('#filterType').value;
  const onlyFavorites = $('#onlyFavorites').checked;
  const list = sortedQuestions().filter(q => {
    const haystack = normalizeSearch([q.id, q.statement, q.primaryTopic, ...(q.secondaryTopics || []), ...(q.subtopics || []), q.subject, q.area, q.source?.name, q.source?.exam].join(' '));
    return (!search || haystack.includes(search)) && (!area || q.area === area) && (!subject || q.subject === subject) && (!difficulty || q.difficulty === difficulty) && (!type || q.type === type) && (!onlyFavorites || q.favorite);
  });
  const pageCount = Math.max(1, Math.ceil(list.length / BANK_PAGE_SIZE));
  state.bankPage = Math.min(state.bankPage, pageCount);
  const start = (state.bankPage - 1) * BANK_PAGE_SIZE;
  const visible = list.slice(start, start + BANK_PAGE_SIZE);
  $('#bankCount').textContent = `${list.length.toLocaleString('pt-BR')} ${list.length === 1 ? 'questão encontrada' : 'questões encontradas'}`;
  $('#bankEmpty').classList.toggle('hidden', state.data.questions.length > 0 || search || area || subject || difficulty || type || onlyFavorites);
  if (!list.length && state.data.questions.length) {
    $('#bankList').innerHTML = '<div class="glass-card empty-inline"><span class="empty-symbol">⌕</span><b>Nenhum resultado encontrado</b><p>Experimente remover algum filtro ou alterar os termos de busca.</p></div>';
    $('#bankPagination').innerHTML = '';
    return;
  }
  $('#bankList').innerHTML = visible.map(q => `<article class="question-row"><div class="question-number">${escapeHTML(String(q.sourceQuestionNumber || '•'))}</div><div><div class="question-meta"><span class="tag peach">${escapeHTML(q.subject || q.area)}</span><span class="tag">${escapeHTML(q.primaryTopic || 'Sem assunto')}</span><span class="tag">${escapeHTML(q.difficulty || 'Sem nível')}</span>${q.explanation || Object.keys(q.alternativeExplanations || {}).length ? '<span class="tag">Comentada</span>' : '<span class="tag">Gabarito</span>'}${q.images?.length ? '<span class="tag">Imagem</span>' : ''}${(q.relatedSubjects||[]).map(item=>`<span class="tag">Interdisciplinar: ${escapeHTML(item)}</span>`).join('')}${q.classificationConfidence != null ? `<span class="tag">Classificação ${Math.round(q.classificationConfidence*100)}% confiança</span>` : ''}</div><h3>${escapeHTML(q.id)}</h3><p>${richText(q.statement)}</p>${renderQuestionReferences(q)}</div><div class="row-actions"><button class="icon-action ${q.favorite ? 'active' : ''}" data-action="favorite" data-id="${safeAttr(q.id)}" title="${q.favorite ? 'Remover favorita' : 'Favoritar'}">${q.favorite ? '★' : '☆'}</button><button class="icon-action" data-open-question="${safeAttr(q.id)}" title="Abrir questão">↗</button></div></article>`).join('');
  $('#bankPagination').innerHTML = pageCount > 1 ? `<span class="fine-print">Página ${state.bankPage} de ${pageCount}</span><div class="pagination-actions"><button class="button secondary" data-bank-page="${Math.max(1,state.bankPage-1)}" ${state.bankPage===1?'disabled':''}>Anterior</button><button class="button secondary" data-bank-page="${Math.min(pageCount,state.bankPage+1)}" ${state.bankPage===pageCount?'disabled':''}>Próxima</button></div>` : '';
}

function eligibleQuestions() {
  const { areas, subjects, topics } = state.activityFilters;
  const difficulty = $('#activityDifficulty').value;
  const includeSolved = $('#includeSolved').checked;
  const hasContentFilters = areas.length > 0 || subjects.length > 0;
  const normalizedTopics = topics.map(normalizeSearch).filter(Boolean);
  const completedActivityIds = new Set(state.data.activities.filter(item => item.status === 'completed').map(item => item.id));
  const answeredIds = new Set(state.data.answers.filter(a => completedActivityIds.has(a.activityId) && a.response !== '' && a.response != null && a.isCorrect != null).map(a => a.questionId));
  const dueIds = new Set(state.data.reviews.filter(r => r.status !== 'completed' && Date.parse(r.dueAt) <= Date.now()).map(r => r.questionId));
  return state.data.questions.filter(q => {
    const contentMatch = !hasContentFilters || areas.includes(q.area) || subjects.includes(q.subject);
    const questionTopics = topicValues(q).map(normalizeSearch);
    const topicMatch = !normalizedTopics.length || normalizedTopics.some(topic => questionTopics.some(value => value.includes(topic)));
    return contentMatch && topicMatch && (!difficulty || q.difficulty === difficulty) && (includeSolved || !answeredIds.has(q.id));
  }).map(q => ({ ...q, isDue: dueIds.has(q.id) }));
}
function renderActivityBuilder() {
  if (state.currentActivity?.status === 'running') {
    $('.activity-layout').classList.add('hidden');
    $('#activityNoQuestions').classList.add('hidden');
    $('#activitySession').classList.remove('hidden');
    return;
  }
  $('.activity-layout').classList.remove('hidden');
  $('#activitySession').classList.add('hidden');
  const available = eligibleQuestions();
  $('#eligibleCount').textContent = `${available.length} ${available.length === 1 ? 'questão elegível' : 'questões elegíveis'}`;
  $('#eligibleHint').textContent = available.length ? 'Os filtros de áreas e matérias são combinados. Os assuntos selecionados também entram na busca.' : 'Amplie os filtros ou importe questões para começar.';
  $('#createActivity').disabled = available.length === 0;
  $('#activityNoQuestions').classList.toggle('hidden', state.data.questions.length > 0);
  $('#activityAreaFilters').innerHTML = Object.keys(SUBJECTS).map(area => `<button type="button" class="filter-chip ${state.activityFilters.areas.includes(area) ? 'selected' : ''}" data-activity-area="${safeAttr(area)}" aria-pressed="${state.activityFilters.areas.includes(area)}">${escapeHTML(area)}</button>`).join('');
  $('#activitySubjectFilters').innerHTML = Object.values(SUBJECTS).flat().map(subject => `<button type="button" class="filter-chip ${state.activityFilters.subjects.includes(subject) ? 'selected' : ''}" data-activity-subject="${safeAttr(subject)}" aria-pressed="${state.activityFilters.subjects.includes(subject)}">${escapeHTML(subject)}</button>`).join('');
  const topicLabels = [...new Set([...(state.data.topics || []).map(item => item.label), ...state.data.questions.flatMap(topicValues)])].filter(Boolean).sort((a,b) => a.localeCompare(b));
  $('#topicSuggestions').innerHTML = topicLabels.map(topic => `<option value="${safeAttr(topic)}"></option>`).join('');
  $('#selectedActivityTopics').innerHTML = state.activityFilters.topics.map(topic => `<button type="button" class="selected-topic" data-remove-activity-topic="${safeAttr(topic)}"><span>${escapeHTML(topic)}</span><b aria-hidden="true">×</b></button>`).join('');
  const correctionAtEnd = $('#correctionMode').value === 'end';
  $('#showErrors').disabled = correctionAtEnd;
  if (correctionAtEnd) $('#showErrors').checked = false;
  $('#timerMinutes').disabled = !$('#timerEnabled').checked;
  $('#timerDurationRow').style.opacity = $('#timerEnabled').checked ? '1' : '.55';
}
function addActivityTopic(value) {
  const topic = String(value || '').trim();
  if (!topic) return;
  const normalized = normalizeSearch(topic);
  if (!state.activityFilters.topics.some(item => normalizeSearch(item) === normalized)) state.activityFilters.topics.push(topic);
  $('#activityTopic').value = '';
  renderActivityBuilder();
}

function getQuestionAmount(availableCount) {
  const selected = $('.choice-pills button.selected')?.dataset.value || '10';
  if (selected === 'custom') return Math.min(500, Math.max(1, Number($('#customAmount').value) || 1));
  return Math.min(Number(selected), availableCount);
}
function randomize(items) { const list = [...items]; for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; }
async function makeActivity() {
  const storedActivities = await getAll(state.db, 'activities');
  state.data.activities = storedActivities;
  const alreadyRunning = storedActivities.filter(item => item.status === 'running').sort((a,b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
  if (alreadyRunning) {
    state.currentActivity = alreadyRunning;
    await loadActivityAnswers(alreadyRunning.id);
    pageNavigate('activity');
    startActivityTimer();
    toast('Há uma atividade em andamento. Retome-a antes de iniciar outra.');
    return;
  }
  const candidates = eligibleQuestions();
  if (!candidates.length) return toast('Não há questões elegíveis com esses filtros.');
  const amount = getQuestionAmount(candidates.length);
  if (amount > candidates.length) toast(`A quantidade foi ajustada para ${candidates.length} questões.`);
  let selected = [];
  const strategy = $('#activityStrategy').value;
  if (strategy === 'balanced') {
    const buckets = new Map();
    randomize(candidates).forEach(q => { const key = q.subject || q.area; if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(q); });
    while (selected.length < amount && [...buckets.values()].some(bucket => bucket.length)) {
      for (const bucket of buckets.values()) if (bucket.length && selected.length < amount) selected.push(bucket.shift());
    }
  } else if (strategy === 'weakness') {
    const scores = await computeQuestionAccuracy();
    selected = candidates.sort((a,b) => (scores.get(a.id)?.accuracy ?? 1) - (scores.get(b.id)?.accuracy ?? 1)).slice(0, amount);
    if (selected.every(q => !scores.has(q.id))) selected = randomize(candidates).slice(0, amount);
  } else if (strategy === 'review') {
    selected = candidates.filter(q => q.isDue).sort((a,b) => a.id.localeCompare(b.id)).slice(0, amount);
    if (selected.length < amount) selected = [...selected, ...randomize(candidates.filter(q => !selected.some(s => s.id === q.id))).slice(0, amount - selected.length)];
  } else selected = randomize(candidates).slice(0, amount);
  if (!selected.length) return toast('Não foi possível montar a atividade.');
  const activity = {
    id: makeId('activity'), title: `Atividade · ${new Date().toLocaleDateString('pt-BR')}`,
    questionIds: selected.map(q => q.id), status: 'running', createdAt: nowISO(), startedAt: nowISO(),
    config: {
      correctionMode: $('#correctionMode').value, showErrors: $('#showErrors').checked,
      commentMode: $('#commentMode').value, navigationMode: $('#navigationMode').value,
      timerEnabled: $('#timerEnabled').checked, timerMinutes: Math.min(600, Math.max(1, Number($('#timerMinutes').value) || 90)),
      negativeScoring: $('#negativeScoring').checked, strategy,
      filters: { areas: [...state.activityFilters.areas], subjects: [...state.activityFilters.subjects], topics: [...state.activityFilters.topics], difficulty: $('#activityDifficulty').value }
    }
  };
  await putRecord(state.db, 'activities', activity);
  state.data.activities = [...state.data.activities.filter(item => item.id !== activity.id), activity];
  state.currentActivity = activity;
  state.activityAnswers = new Map();
  state.activityStart = Date.now();
  pageNavigate('activity');
}

async function loadActivityAnswers(activityId) {
  // Read the persistent source of truth; the UI cache may be stale while an activity is open.
  const allAnswers = await getAll(state.db, 'answers');
  state.data.answers = allAnswers;
  const answers = allAnswers.filter(answer => answer.activityId === activityId);
  state.activityAnswers = new Map(answers.map(answer => [answer.questionId, answer]));
}
function syncAnswerCache(record) {
  state.activityAnswers.set(record.questionId, record);
  const index = state.data.answers.findIndex(item => item.id === record.id);
  if (index >= 0) state.data.answers[index] = record;
  else state.data.answers.push(record);
}
function getResponseFromQuestion(questionId, question) {
  const card = document.querySelector(`[data-question-card="${CSS.escape(questionId)}"]`);
  if (!card) return '';
  if (question.type === 'assertion_set') return $$('.statement-answer select', card).map(select => select.value || '-').join('');
  return $(`input[name="answer-${CSS.escape(questionId)}"]:checked`, card)?.value || '';
}
function responseIsComplete(question, response) {
  if (question.type === 'assertion_set') return typeof response === 'string' && response.length === question.statements.length && /^[VF]+$/i.test(response);
  return typeof response === 'string' && response.trim() !== '';
}
function getExpectedAnswer(question) {
  if (question.type === 'true_false') {
    const value = typeof question.answer === 'string' ? question.answer.toUpperCase() : '';
    return ['TRUE', 'VERDADEIRO', 'V'].includes(value) ? 'V' : ['FALSE', 'FALSO', 'F'].includes(value) ? 'F' : value;
  }
  if (question.type === 'assertion_set') {
    if (Array.isArray(question.answer)) return question.answer.map(value => String(value).toUpperCase()[0]).join('');
    if (question.answer && typeof question.answer === 'object') return Object.values(question.answer).map(value => String(value).toUpperCase()[0]).join('');
    return String(question.answer || '').toUpperCase().replace(/[^VF]/g, '');
  }
  return String(question.answer || '').trim().toUpperCase();
}
function responseIsCorrect(question, response) {
  if (response == null || response === '') return false;
  const expected = getExpectedAnswer(question);
  return String(response).trim().toUpperCase() === expected;
}
function answerCount(questionId) { const answer = state.activityAnswers.get(questionId); const question = questionById(questionId); return question && responseIsComplete(question, answer?.response) ? 1 : 0; }
function renderSingleImage(question, image) {
  const metadata = state.data.assets.find(item => item.id === image.assetId);
  if (!metadata) return `<figure><div class="empty-inline"><b>Imagem indisponível</b><small>${escapeHTML(image.alt || image.assetId)}</small></div>${renderExternalReference(image.sourceUrl, image.sourceLabel || 'Abrir imagem original')}</figure>`;
  return `<figure><img data-asset-id="${safeAttr(image.assetId)}" alt="${safeAttr(image.alt || image.caption || 'Imagem da questão')}" loading="lazy">${image.caption ? `<figcaption>${escapeHTML(image.caption)}</figcaption>` : ''}${renderExternalReference(image.sourceUrl, image.sourceLabel || 'Ver origem da imagem')}</figure>`;
}
async function hydrateAssetImages(root = document) {
  const images = $$('img[data-asset-id]', root);
  await Promise.all(images.map(async element => {
    const id = element.dataset.assetId;
    if (state.assetUrls.has(id)) { element.src = state.assetUrls.get(id); return; }
    const stored = await getOne(state.db, 'assetBlobs', id);
    if (!stored?.blob) { element.alt = `${element.alt} (arquivo ausente)`; return; }
    const metadata = state.data.assets.find(item => item.id === id);
    const typed = stored.blob.type ? stored.blob : stored.blob.slice(0, stored.blob.size, stored.type || metadata?.mimeType || 'application/octet-stream');
    const url = URL.createObjectURL(typed);
    state.assetUrls.set(id, url);
    element.src = url;
  }));
}
function renderQuestionImages(question, positions = null) {
  if (!question.images?.length) return '';
  const allowed = positions ? new Set(positions) : null;
  const selected = question.images.filter(image => !allowed || allowed.has(String(image.position || 'statement').toLowerCase()));
  if (!selected.length) return '';
  return `<div class="question-assets">${selected.map(image => renderSingleImage(question, image)).join('')}</div>`;
}
function renderOptionImages(question, key) {
  const normalized = [`option:${key}`, `alternative:${key}`, `alternativa:${key}`];
  const items = question.images?.filter(image => normalized.includes(String(image.position || '').toLowerCase())) || [];
  return items.length ? `<div class="question-assets">${items.map(image => renderSingleImage(question, image)).join('')}</div>` : '';
}
function renderQuestionTables(question, positions = ['after_statement']) {
  const selected = (question.tables || []).filter(table => positions.includes(String(table.position || 'after_statement').toLowerCase()));
  return selected.map(table => `<div class="question-table-wrapper">${table.title ? `<b class="table-title">${escapeHTML(table.title)}</b>` : ''}<table class="question-table">${table.headers?.length ? `<thead><tr>${table.headers.map(cell=>`<th>${escapeHTML(cell)}</th>`).join('')}</tr></thead>` : ''}<tbody>${(table.rows || []).map(row=>`<tr>${row.map(cell=>`<td>${escapeHTML(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>${table.caption ? `<small>${escapeHTML(table.caption)}</small>` : ''}</div>`).join('');
}
function renderQuestionEquations(question, positions = ['after_statement']) {
  const selected = (question.equations || []).filter(item => positions.includes(String(item.position || 'after_statement').toLowerCase()));
  return selected.map(item => `<div class="formula-panel">${item.label ? `<small>${escapeHTML(item.label)}</small>` : ''}<div>${escapeHTML(item.expression)}</div></div>`).join('');
}

function renderResponseOptions(question, current = '', answerRecord = {}, config = null, final = false) {
  if (question.type === 'true_false') {
    return `<div class="answer-options" id="options-q-${safeAttr(question.id)}">${[['V','Verdadeiro'],['F','Falso']].map(([value,label]) => `<label class="answer-option"><input type="radio" name="answer-${safeAttr(question.id)}" value="${value}" ${current === value ? 'checked' : ''}><span><b>${value}</b> — ${label}</span></label>`).join('')}</div>`;
  }
  if (question.type === 'assertion_set') {
    const chars = String(current || '').split('');
    return `<div class="answer-options" id="options-q-${safeAttr(question.id)}">${question.statements.map((item,index) => `<label class="statement-answer"><span><b>${index + 1}.</b> ${richText(item.text)}</span><select data-statement-index="${index}" aria-label="Resposta da afirmação ${index + 1}"><option value="">Selecione</option><option value="V" ${chars[index] === 'V' ? 'selected' : ''}>Verdadeiro</option><option value="F" ${chars[index] === 'F' ? 'selected' : ''}>Falso</option></select></label>`).join('')}</div>`;
  }
  const eliminated = new Set(answerRecord?.eliminatedOptions || []);
  const canShowComment = final ? config?.commentMode !== 'hidden' : config?.commentMode === 'available' && config?.correctionMode === 'immediate';
  const selectedKey = String(current || '').trim().toUpperCase();
  const isComplete = responseIsComplete(question, current);
  const isCorrect = isComplete && responseIsCorrect(question, current);
  const alternativeExplanations = question.alternativeExplanations || {};
  return `<div class="answer-options" id="options-q-${safeAttr(question.id)}">${Object.entries(question.alternatives || {}).map(([key,value]) => {
    const selected = selectedKey === key.toUpperCase();
    const crossed = eliminated.has(key);
    const specificComment = selected && canShowComment && isComplete ? (alternativeExplanations[key] || alternativeExplanations[key.toLowerCase()] || '') : '';
    return `<div class="answer-option-row"><label class="answer-option ${crossed ? 'eliminated' : ''}"><input type="radio" name="answer-${safeAttr(question.id)}" value="${safeAttr(key)}" ${selected ? 'checked' : ''}><span class="option-content"><b>${escapeHTML(key)})</b> ${richText(value)}${renderOptionImages(question,key)}</span></label><button type="button" class="eliminate-option ${crossed ? 'active' : ''}" data-action="toggle-eliminated-option" data-id="${safeAttr(question.id)}" data-option="${safeAttr(key)}" aria-pressed="${crossed}">${crossed ? 'Restaurar' : 'Riscar'}</button>${specificComment ? `<div class="alternative-comment ${isCorrect ? 'correct' : 'wrong'}"><b>${isCorrect ? 'Comentário da alternativa marcada' : `Por que a alternativa ${escapeHTML(key)} está incorreta`}</b><p>${richText(specificComment)}</p></div>` : ''}</div>`;
  }).join('')}</div>`;
}

function renderQuestionFeedback(question, answer, config, final = false) {
  if (!answer?.response || !responseIsComplete(question, answer.response)) return '';
  const reveal = final || (config.correctionMode === 'immediate' && config.showErrors);
  const showComment = final ? config.commentMode !== 'hidden' : config.commentMode === 'available' && config.correctionMode === 'immediate';
  if (!reveal && !(showComment && question.explanation)) return '';
  const correct = responseIsCorrect(question, answer.response);
  const expected = getExpectedAnswer(question);
  const answerLabel = question.type === 'multiple_choice' ? `${expected}) ${question.alternatives?.[expected] || ''}` : expected;
  const kind = correct ? 'correct' : 'wrong';
  const explanation = showComment && question.explanation ? `<p>${richText(question.explanation)}</p>` : '';
  if (!reveal && !explanation) return '';
  return `<div class="answer-feedback ${reveal ? kind : 'neutral'}">${reveal ? `<b>${correct ? 'Resposta correta' : 'Resposta incorreta'}</b> · Gabarito: ${escapeHTML(answerLabel)}` : '<b>Comentário disponível</b>'}${explanation}</div>`;
}

async function renderSession() {
  if (!state.currentActivity) return;
  const activity = state.currentActivity;
  const questions = activity.questionIds.map(questionById).filter(Boolean);
  await loadActivityAnswers(activity.id);
  const answered = questions.filter(q => answerCount(q.id)).length;
  const html = `<div class="exam-shell"><div class="exam-top"><div><div class="eyebrow">ATIVIDADE EM ANDAMENTO</div><div class="exam-title">${escapeHTML(activity.title)}</div><div class="exam-meta">${questions.length} questões · Salvamento automático local</div></div><div class="exam-meta" id="activityTimerDisplay">${activity.config.timerEnabled ? '⏱ 00:00' : 'Sem cronômetro'}</div></div><div class="exam-progress"><i id="examProgressBar" style="width:${questions.length ? answered / questions.length * 100 : 0}%"></i></div><div class="exam-layout"><div class="exam-questions">${questions.map((q,index) => {
    const answer = state.activityAnswers.get(q.id);
    const textBase = state.data.textBases.find(item => item.id === q.textBaseId);
    return `<article class="glass-card exam-question" data-question-card="${safeAttr(q.id)}" id="exam-q-${safeAttr(q.id)}"><div class="exam-q-head"><b>Questão ${index + 1}</b><div class="question-meta"><span class="tag peach">${escapeHTML(q.subject || q.area)}</span><span class="tag">${q.explanation || Object.keys(q.alternativeExplanations || {}).length ? 'Comentada' : 'Gabarito'}</span><button class="icon-action ${answer?.markedForReview ? 'active' : ''}" data-action="mark-review" data-id="${safeAttr(q.id)}" title="Marcar para revisar">⚑</button></div></div>${textBase ? `<div class="base-text"><b>${escapeHTML(textBase.title || 'Texto-base')}</b><br>${richText(textBase.content)}</div>` : ''}${renderQuestionImages(q,['after_text_base','after-text-base'])}${renderQuestionTables(q,['after_text_base','after-text-base'])}${renderQuestionEquations(q,['after_text_base','after-text-base'])}${renderQuestionImages(q,['before_statement','before-statement'])}<div class="exam-stem" data-statement-for="${safeAttr(q.id)}">${richText(q.statement)}</div>${renderQuestionImages(q,['statement','enunciado','after_statement','after-statement'])}${renderQuestionTables(q,['statement','after_statement'])}${renderQuestionEquations(q,['statement','after_statement'])}${renderQuestionReferences(q)}${renderResponseOptions(q, answer?.response || '', answer, activity.config)}${renderQuestionImages(q,['after_alternatives','after-alternatives'])}${renderQuestionTables(q,['after_alternatives','after-alternatives'])}${renderQuestionEquations(q,['after_alternatives','after-alternatives'])}<div class="question-tools"><label class="confidence-select"><span>Como se sentiu?</span><select data-confidence="${safeAttr(q.id)}"><option value="unsure" ${answer?.confidence === 'unsure' || !answer?.confidence ? 'selected' : ''}>Com dúvida</option><option value="guess" ${answer?.confidence === 'guess' ? 'selected' : ''}>Chutei</option><option value="confident" ${answer?.confidence === 'confident' ? 'selected' : ''}>Confiante</option></select></label><span class="save-indicator" id="saved-${safeAttr(q.id)}">${answer?.response ? (responseIsComplete(q, answer.response) ? 'Resposta salva' : 'Resposta parcial salva') : 'Ainda não respondida'}</span></div><div id="feedback-${safeAttr(q.id)}">${renderQuestionFeedback(q, answer, activity.config)}</div></article>`;
  }).join('')}</div><aside class="glass-card exam-side"><h3>Navegação</h3><div class="exam-number-grid">${questions.map((q,index) => `<button class="exam-number ${answerCount(q.id) ? 'answered' : ''} ${state.activityAnswers.get(q.id)?.markedForReview ? 'review-mark' : ''}" data-jump="${safeAttr(q.id)}" type="button">${index + 1}</button>`).join('')}</div><div class="fine-print">● Respondida · traço inferior: revisar</div><button class="button primary" data-action="finish-activity">Entregar atividade</button><button class="button secondary" data-action="exit-activity">Sair e continuar depois</button><button class="button danger" data-action="discard-activity">Descartar e criar outra</button></aside></div><div class="exam-bottom"><span class="exam-meta" id="examAnsweredCount">${answered} de ${questions.length} respondidas</span><button class="text-button" data-action="finish-activity">Entregar atividade ↗</button></div><div id="textSelectionToolbar" class="text-selection-toolbar hidden"><button type="button" data-action="toggle-text-highlight">Grifar trecho</button></div></div>`;
  $('#activitySession').innerHTML = html;
  $('.activity-layout').classList.add('hidden');
  $('#activityNoQuestions').classList.add('hidden');
  $('#activitySession').classList.remove('hidden');
  await hydrateAssetImages($('#activitySession'));
  for (const question of questions) applyTextMarks($(`[data-statement-for="${CSS.escape(question.id)}"]`), state.activityAnswers.get(question.id)?.highlights || []);
  if (activity.config.timerEnabled) updateTimerLabel();
}
async function saveQuestionResponse(questionId) {
  const question = questionById(questionId);
  if (!question || !state.currentActivity) return;
  const previous = state.activityAnswers.get(questionId) || {};
  const response = getResponseFromQuestion(questionId, question);
  const complete = responseIsComplete(question, response);
  const record = {
    ...previous, id: `${state.currentActivity.id}::${questionId}`, activityId: state.currentActivity.id,
    questionId, response, confidence: previous.confidence || 'unsure', markedForReview: previous.markedForReview || false,
    answeredAt: complete ? nowISO() : null, isCorrect: complete ? responseIsCorrect(question, response) : null,
    updatedAt: nowISO()
  };
  await putRecord(state.db, 'answers', record);
  syncAnswerCache(record);
  const card = document.querySelector(`[data-question-card="${CSS.escape(questionId)}"]`);
  if (!card) return;
  const options = $('#options-q-' + CSS.escape(questionId));
  if (options) options.outerHTML = renderResponseOptions(question, record.response || '', record, state.currentActivity.config);
  const feedback = $('#feedback-' + CSS.escape(questionId));
  if (feedback) feedback.innerHTML = renderQuestionFeedback(question, record, state.currentActivity.config);
  const saved = $('#saved-' + CSS.escape(questionId));
  if (saved) saved.textContent = response ? (complete ? 'Resposta salva automaticamente' : 'Resposta parcial salva automaticamente') : 'Ainda não respondida';
  const count = state.currentActivity.questionIds.filter(id => answerCount(id)).length;
  $('#examAnsweredCount').textContent = `${count} de ${state.currentActivity.questionIds.length} respondidas`;
  $('#examProgressBar').style.width = `${count / state.currentActivity.questionIds.length * 100}%`;
  $$('.exam-number').forEach(button => {
    const id = button.dataset.jump;
    button.classList.toggle('answered', Boolean(answerCount(id)));
    button.classList.toggle('review-mark', Boolean(state.activityAnswers.get(id)?.markedForReview));
  });
}
async function setConfidence(questionId, confidence) {
  const old = state.activityAnswers.get(questionId) || { id: `${state.currentActivity.id}::${questionId}`, activityId: state.currentActivity.id, questionId, response: '' };
  const next = { ...old, confidence, updatedAt: nowISO() };
  await putRecord(state.db, 'answers', next);
  syncAnswerCache(next);
}
async function toggleReviewMark(questionId) {
  const old = state.activityAnswers.get(questionId) || { id: `${state.currentActivity.id}::${questionId}`, activityId: state.currentActivity.id, questionId, response: '' };
  const next = { ...old, markedForReview: !old.markedForReview, updatedAt: nowISO() };
  await putRecord(state.db, 'answers', next);
  syncAnswerCache(next);
  const button = document.querySelector(`[data-action="mark-review"][data-id="${CSS.escape(questionId)}"]`);
  if (button) button.classList.toggle('active', next.markedForReview);
  $$('.exam-number').forEach(item => { if (item.dataset.jump === questionId) item.classList.toggle('review-mark', next.markedForReview); });
}
function startActivityTimer() {
  clearInterval(state.activityTimer);
  if (!state.currentActivity?.config.timerEnabled) return;
  state.activityStart = Date.parse(state.currentActivity.startedAt) || Date.now();
  state.activityTimer = setInterval(() => {
    const limit = state.currentActivity.config.timerMinutes * 60;
    const remaining = limit - timeAgoSeconds(state.activityStart);
    updateTimerLabel(remaining);
    if (remaining <= 0) { clearInterval(state.activityTimer); finishActivity(true).catch(error => { state.finishingActivityId = null; console.error(error); toast('Não foi possível concluir a atividade automaticamente. Suas respostas continuam salvas.', 6000); }); }
  }, 1000);
}
function updateTimerLabel(remaining = null) {
  const element = $('#activityTimerDisplay');
  if (!element || !state.currentActivity?.config.timerEnabled) return;
  const total = state.currentActivity.config.timerMinutes * 60;
  const left = remaining == null ? Math.max(0, total - timeAgoSeconds(state.activityStart || state.currentActivity.startedAt)) : remaining;
  const h = Math.floor(left / 3600); const m = Math.floor(left % 3600 / 60); const s = Math.floor(left % 60);
  element.textContent = `⏱ ${h ? `${String(h).padStart(2,'0')}:` : ''}${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
async function finishActivity(timeExpired = false) {
  if (!state.currentActivity || state.currentActivity.status !== 'running') return;
  const finishingId = state.currentActivity.id;
  if (state.finishingActivityId === finishingId) return;
  if (!timeExpired && !confirm('Entregar esta atividade? As respostas salvas serão corrigidas e o resultado ficará no histórico.')) return;
  state.finishingActivityId = finishingId;
  clearInterval(state.activityTimer);
  const activity = state.currentActivity;
  const questions = activity.questionIds.map(questionById).filter(Boolean);
  await loadActivityAnswers(activity.id);
  const responseRecords = [];
  let correct = 0; let wrong = 0; let blank = 0; let netScore = 0;
  for (const question of questions) {
    const answer = state.activityAnswers.get(question.id) || { response: '', confidence: 'unsure', markedForReview: false };
    const hasResponse = responseIsComplete(question, answer.response);
    const isCorrect = hasResponse && responseIsCorrect(question, answer.response);
    if (!hasResponse) blank++;
    else if (isCorrect) correct++;
    else wrong++;
    if (isCorrect) netScore += 1;
    else if (hasResponse && activity.config.negativeScoring && question.type === 'multiple_choice') {
      const count = Object.keys(question.alternatives || {}).length;
      if (count > 1) netScore -= 1 / (count - 1);
    }
    const updated = { ...answer, id: `${activity.id}::${question.id}`, activityId: activity.id, questionId: question.id, isCorrect: hasResponse ? isCorrect : null, completedAt: nowISO(), updatedAt: nowISO() };
    await putRecord(state.db, 'answers', updated);
    state.activityAnswers.set(question.id, updated);
    const oldReview = state.data.reviews.find(item => item.questionId === question.id && item.status !== 'completed');
    if (hasResponse && isCorrect && answer.confidence === 'confident' && !answer.markedForReview && oldReview) {
      await putRecord(state.db, 'reviews', { ...oldReview, status: 'completed', completedAt: nowISO(), updatedAt: nowISO() });
    } else if ((hasResponse && (!isCorrect || answer.confidence !== 'confident')) || answer.markedForReview) {
      const days = !hasResponse ? 1 : !isCorrect ? 1 : answer.confidence === 'guess' ? 2 : 4;
      const reason = !hasResponse ? 'Marcada durante a atividade' : !isCorrect ? 'Resposta incorreta' : answer.markedForReview ? 'Marcada durante a atividade' : 'Resposta com baixa confiança';
      const review = { id: oldReview?.id || makeId('review'), questionId: question.id, sourceActivityId: activity.id, status: 'pending', reason, dueAt: new Date(Date.now() + days * 86400000).toISOString(), createdAt: oldReview?.createdAt || nowISO(), updatedAt: nowISO() };
      await putRecord(state.db, 'reviews', review);
    }
    responseRecords.push({ question, answer: updated, isCorrect, hasResponse });
  }
  const durationSecs = timeAgoSeconds(activity.startedAt, Date.now());
  const result = {
    total: questions.length, answered: correct + wrong, correct, wrong, blank,
    percentage: questions.length ? Math.round(correct / questions.length * 100) : 0,
    netScore: Number(netScore.toFixed(3)), rawScore: correct,
    durationSecs, timeExpired, finishedAt: nowISO()
  };
  const completed = { ...activity, status: 'completed', endedAt: nowISO(), durationSecs, result, updatedAt: nowISO() };
  await putRecord(state.db, 'activities', completed);
  state.currentActivity = completed;
  await refreshData();
  state.finishingActivityId = null;
  await renderResult(completed);
}
async function renderResult(activity) {
  const questions = activity.questionIds.map(questionById).filter(Boolean);
  await loadActivityAnswers(activity.id);
  const result = activity.result || {};
  $('#activitySession').innerHTML = `<div class="exam-shell"><div class="exam-top"><div><div class="eyebrow">RESULTADO DA ATIVIDADE</div><div class="exam-title">${escapeHTML(activity.title)}</div><div class="exam-meta">Concluída em ${formatDate(activity.endedAt, true)} · ${durationLabel(result.durationSecs)}</div></div><button class="button secondary" data-action="new-activity">Nova atividade</button></div><article class="glass-card result-hero"><div class="eyebrow">APROVEITAMENTO</div><div class="result-score"><strong>${result.percentage ?? 0}%</strong><span>${result.correct ?? 0} acertos de ${result.total ?? 0} questões</span></div><div class="metric-row"><div class="metric"><strong>${result.wrong ?? 0}</strong><span>erros</span></div><div class="metric"><strong>${result.blank ?? 0}</strong><span>em branco</span></div><div class="metric"><strong>${Number(result.netScore ?? 0).toFixed(2).replace('.', ',')}</strong><span>pontuação líquida</span></div><div class="metric"><strong>${durationLabel(result.durationSecs)}</strong><span>tempo</span></div></div></article><div class="eyebrow">REVISÃO DAS RESPOSTAS</div><div style="height:10px"></div><div>${questions.map((q,index) => {
    const answer = state.activityAnswers.get(q.id) || {};
    const correctAnswer = getExpectedAnswer(q);
    const complete = responseIsComplete(q, answer.response);
    const status = complete ? (responseIsCorrect(q, answer.response) ? 'Correta' : 'Incorreta') : 'Em branco';
    const userValue = complete ? escapeHTML(answer.response) : (answer.response ? `Parcial (${escapeHTML(answer.response)}) — não contabilizada` : 'Sem resposta');
    const rightLabel = q.type === 'multiple_choice' ? `${correctAnswer}) ${q.alternatives?.[correctAnswer] || ''}` : correctAnswer;
    const selectedKey = String(answer.response || '').trim().toUpperCase();
    const selectedAlternativeExplanation = q.type === 'multiple_choice' ? (q.alternativeExplanations?.[selectedKey] || q.alternativeExplanations?.[selectedKey.toLowerCase()] || '') : '';
    return `<article class="result-question"><h3><span>Questão ${index+1} · ${escapeHTML(q.subject || '')}</span><span class="tag ${status === 'Correta' ? 'peach' : ''}">${status}</span></h3><p class="result-statement" data-result-statement-for="${safeAttr(q.id)}">${richText(q.statement)}</p>${renderQuestionReferences(q)}<p>Sua resposta: <b>${userValue}</b> · Gabarito: <b>${escapeHTML(rightLabel)}</b></p>${q.explanation ? `<p>${richText(q.explanation)}</p>` : '<p>Esta questão não possui resolução comentada.</p>'}${selectedAlternativeExplanation ? `<div class="alternative-comment ${complete && responseIsCorrect(q, answer.response) ? 'correct' : 'wrong'}"><b>Comentário da alternativa selecionada (${escapeHTML(selectedKey)})</b><p>${richText(selectedAlternativeExplanation)}</p></div>` : ''}<button class="text-button" data-open-question="${safeAttr(q.id)}">Abrir questão completa ↗</button></article>`;
  }).join('')}</div><div class="exam-bottom"><button class="button secondary" data-page="performance">Ver desempenho</button><button class="button primary" data-action="new-activity">Voltar ao gerador</button></div></div>`;
  $('.activity-layout').classList.add('hidden'); $('#activityNoQuestions').classList.add('hidden'); $('#activitySession').classList.remove('hidden');
  for (const question of questions) applyTextMarks($(`[data-result-statement-for="${CSS.escape(question.id)}"]`), state.activityAnswers.get(question.id)?.highlights || []);
}

async function computeQuestionAccuracy() {
  const map = new Map();
  for (const answer of completedAnswers()) {
    const current = map.get(answer.questionId) || { attempts: 0, correct: 0 };
    current.attempts++; if (answer.isCorrect) current.correct++;
    current.accuracy = current.correct / current.attempts;
    map.set(answer.questionId, current);
  }
  return map;
}
function renderPerformance() {
  const answers = completedAnswers();
  const completedActivities = state.data.activities.filter(a => a.status === 'completed').sort((a,b) => Date.parse(a.endedAt || a.createdAt) - Date.parse(b.endedAt || b.createdAt));
  $('#performanceEmpty').classList.toggle('hidden', answers.length > 0);
  $('#performanceData').classList.toggle('hidden', answers.length === 0);
  if (!answers.length) return;
  const correct = answers.filter(a => a.isCorrect).length;
  const wrong = answers.length - correct;
  const pending = state.data.reviews.filter(r => r.status !== 'completed').length;
  const totalStudySeconds = completedActivities.reduce((sum, activity) => sum + (Number(activity.durationSecs) || 0), 0);
  $('#performanceMetrics').innerHTML = `<div class="metric-card"><strong>${Math.round(correct/answers.length*100)}%</strong><span>taxa de acerto</span></div><div class="metric-card"><strong>${correct}</strong><span>respostas corretas</span></div><div class="metric-card"><strong>${wrong}</strong><span>respostas incorretas</span></div><div class="metric-card"><strong>${pending}</strong><span>revisões pendentes</span></div><div class="metric-card"><strong>${durationLabel(totalStudySeconds)}</strong><span>tempo registrado em atividades</span></div>`;
  const confidenceNames = { unsure: 'Com dúvida', guess: 'Chutei', confident: 'Confiante' };
  const confidenceSummary = ['unsure','guess','confident'].map(level => {
    const subset = answers.filter(answer => (answer.confidence || 'unsure') === level);
    const hits = subset.filter(answer => answer.isCorrect).length;
    return `<div class="confidence-stat"><span>${confidenceNames[level]}</span><b>${subset.length ? `${Math.round(hits/subset.length*100)}%` : '—'}</b><small>${hits}/${subset.length} acertos</small></div>`;
  }).join('');
  $('#confidenceStats').innerHTML = confidenceSummary;
  const areaStats = Object.keys(SUBJECTS).map(area => {
    const ids = new Set(state.data.questions.filter(q => q.area === area).map(q => q.id));
    const selected = answers.filter(a => ids.has(a.questionId));
    return { area, correct: selected.filter(a => a.isCorrect).length, total: selected.length, percentage: selected.length ? Math.round(selected.filter(a => a.isCorrect).length / selected.length * 100) : 0 };
  });
  $('#areaBars').innerHTML = areaStats.map(item => `<div class="bar-item"><div class="bar-label"><span>${escapeHTML(item.area)}</span><b>${item.total ? `${item.percentage}% · ${item.total} respostas` : 'Sem dados'}</b></div><div class="bar-track"><i style="width:${item.percentage}%"></i></div></div>`).join('');
  const subjectStats = Object.values(SUBJECTS).flat().map(subject => {
    const ids = new Set(state.data.questions.filter(q => q.subject === subject).map(q => q.id));
    const selected = answers.filter(a => ids.has(a.questionId));
    const hits = selected.filter(a => a.isCorrect).length;
    return { subject, total: selected.length, percentage: selected.length ? Math.round(hits / selected.length * 100) : 0 };
  }).filter(item => item.total).sort((a,b) => b.total - a.total || a.subject.localeCompare(b.subject));
  $('#subjectBars').innerHTML = subjectStats.length ? subjectStats.map(item => `<div class="bar-item"><div class="bar-label"><span>${escapeHTML(item.subject)}</span><b>${item.percentage}% · ${item.total}</b></div><div class="bar-track"><i style="width:${item.percentage}%"></i></div></div>`).join('') : '<div class="empty-inline">Ainda não há respostas por matéria.</div>';
  const topicMap = new Map();
  answers.forEach(answer => {
    const question = questionById(answer.questionId); if (!question) return;
    const key = `${question.subject || question.area} · ${question.primaryTopic || 'Sem assunto'}`;
    const item = topicMap.get(key) || { total: 0, correct: 0 };
    item.total++; if (answer.isCorrect) item.correct++;
    topicMap.set(key,item);
  });
  const weak = [...topicMap.entries()].map(([name,item]) => ({name,...item,accuracy:item.correct/item.total})).sort((a,b)=>a.accuracy-b.accuracy).slice(0,6);
  $('#weakTopics').innerHTML = weak.length ? weak.map(item => `<div class="compact-item"><span><b>${escapeHTML(item.name)}</b><small>${item.correct}/${item.total} acertos</small></span><strong>${Math.round(item.accuracy*100)}%</strong></div>`).join('') : '<div class="empty-inline">Ainda não há assuntos suficientes.</div>';
  const errorPatterns = new Map();
  answers.filter(answer => answer.isCorrect === false).forEach(answer => {
    const question = questionById(answer.questionId);
    for (const category of question?.errorCategories || []) {
      const label = String(category).trim();
      if (!label) continue;
      errorPatterns.set(label, (errorPatterns.get(label) || 0) + 1);
    }
  });
  const rankedErrors = [...errorPatterns.entries()].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,8);
  $('#errorPatternList').innerHTML = rankedErrors.length ? rankedErrors.map(([name,count]) => `<div class="compact-item"><span><b>${escapeHTML(name)}</b><small>Questões incorretas associadas</small></span><strong>${count}</strong></div>`).join('') : '<div class="empty-inline">As questões importadas ainda não fornecem categorias de erro suficientes, ou nenhuma questão classificada foi respondida incorretamente.</div>';
  $('#activityHistory').innerHTML = completedActivities.slice().reverse().slice(0,8).map(item => `<div class="history-row"><span><b>${escapeHTML(item.title)}</b><small>${formatDate(item.endedAt || item.createdAt)} · ${item.result?.total || 0} questões · ${durationLabel(item.durationSecs)}</small></span><span class="history-score">${item.result?.percentage ?? 0}%</span></div>`).join('') || '<div class="empty-inline">Nenhuma atividade concluída.</div>';
  renderTriEstimate(answers);
}
function renderTriEstimate(answers) {
  const byActivity = new Map();
  for (const answer of answers) {
    const question = questionById(answer.questionId);
    const tri = question?.triParameters;
    if (!tri || ![tri.a,tri.b,tri.c].every(Number.isFinite) || tri.a <= 0 || tri.c < 0 || tri.c >= 1) continue;
    if (!byActivity.has(answer.activityId)) byActivity.set(answer.activityId, []);
    byActivity.get(answer.activityId).push({ ...tri, correct: Boolean(answer.isCorrect) });
  }
  const candidate = [...byActivity.values()].sort((a,b)=>b.length-a.length)[0];
  if (!candidate || candidate.length < 5) {
    $('#triPanel').innerHTML = '<div class="empty-inline"><b>Estimativa ainda indisponível</b><p>São necessários pelo menos cinco itens respondidos com parâmetros a, b e c importados. Não usamos parâmetros inventados.</p></div>';
    return;
  }
  let bestTheta = 0; let bestLikelihood = -Infinity;
  for (let theta = -4; theta <= 4.001; theta += .025) {
    let logLikelihood = 0;
    for (const item of candidate) {
      const probability = item.c + (1-item.c)/(1+Math.exp(-1.7*item.a*(theta-item.b)));
      logLikelihood += item.correct ? Math.log(Math.max(probability,1e-9)) : Math.log(Math.max(1-probability,1e-9));
    }
    if (logLikelihood > bestLikelihood) { bestLikelihood = logLikelihood; bestTheta = theta; }
  }
  $('#triPanel').innerHTML = `<div class="metric-row"><div class="metric"><strong>θ ${bestTheta.toFixed(2).replace('.',',')}</strong><span>estimativa experimental</span></div><div class="metric"><strong>${candidate.length}</strong><span>itens parametrizados</span></div></div><p class="fine-print">Estimativa por verossimilhança usando parâmetros importados. Não representa uma nota oficial do ENEM.</p>`;
}

function renderReviews() {
  const all = [...state.data.reviews].sort((a,b)=>Date.parse(a.dueAt)-Date.parse(b.dueAt));
  const due = all.filter(r => r.status !== 'completed' && Date.parse(r.dueAt) <= Date.now());
  const pending = all.filter(r => r.status !== 'completed');
  const completed = all.filter(r => r.status === 'completed');
  $('#reviewSummary').innerHTML = `<div class="metric-card"><strong>${due.length}</strong><span>para hoje ou atrasadas</span></div><div class="metric-card"><strong>${pending.length}</strong><span>pendentes</span></div><div class="metric-card"><strong>${completed.length}</strong><span>concluídas</span></div>`;
  let list = state.reviewFilter === 'all' ? all : state.reviewFilter === 'completed' ? completed : pending;
  $('#reviewEmpty').classList.toggle('hidden', list.length > 0);
  $('#reviewList').innerHTML = list.map(review => {
    const question = questionById(review.questionId);
    return `<article class="review-item"><div><div class="question-meta"><span class="tag peach">${escapeHTML(question?.subject || 'Questão removida')}</span><span class="tag">${review.status === 'completed' ? 'Concluída' : formatDate(review.dueAt)}</span></div><h3>${escapeHTML(question?.id || review.questionId)} · ${escapeHTML(question?.primaryTopic || 'Sem assunto')}</h3><p>${escapeHTML(review.reason || 'Revisão pessoal')}${question ? ` · ${escapeHTML(question.statement.slice(0,170))}` : ''}</p></div><div class="review-actions">${review.status !== 'completed' ? `<button class="button small secondary" data-action="review-now" data-id="${safeAttr(review.questionId)}">Resolver</button><button class="button small primary" data-action="complete-review" data-id="${safeAttr(review.id)}">Concluir</button>` : '<span class="tag peach">Concluída</span>'}</div></article>`;
  }).join('');
  $$('[data-review-filter]').forEach(button => button.classList.toggle('active', button.dataset.reviewFilter === state.reviewFilter));
}

function renderLibrary() {
  const notes = [...state.data.notes].sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
  $('#notesEmpty').classList.toggle('hidden', notes.length > 0);
  $('#notesList').innerHTML = notes.map(note => `<article class="note-card"><h3>${escapeHTML(note.title || 'Anotação sem título')}</h3><p>${escapeHTML(note.content || '')}</p><div class="note-actions"><button class="text-button" data-action="edit-note" data-id="${safeAttr(note.id)}">Editar</button><button class="text-button" data-action="delete-note" data-id="${safeAttr(note.id)}">Excluir</button></div></article>`).join('');
  const favorites = state.data.questions.filter(q => q.favorite);
  $('#favoritesEmpty').classList.toggle('hidden', favorites.length > 0);
  $('#favoriteList').innerHTML = favorites.slice(0,12).map(q => `<div class="compact-item"><span><b>${escapeHTML(q.id)} · ${escapeHTML(q.primaryTopic || q.subject)}</b><small>${escapeHTML(q.subject)}</small></span><button class="text-button" data-open-question="${safeAttr(q.id)}">Abrir</button></div>`).join('');
  $('#collectionsEmpty').classList.toggle('hidden', state.data.collections.length > 0);
  $('#collectionsList').innerHTML = state.data.collections.map(collection => `<button class="collection-chip" data-action="open-collection" data-id="${safeAttr(collection.id)}">▣ ${escapeHTML(collection.title)} <small>${collection.questionIds?.length || 0}</small></button>`).join('');
}

async function renderSettings() {
  const counts = await countAll(state.db);
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  const usage = estimate?.usage ?? null; const quota = estimate?.quota ?? null;
  $('#storageDiagnostics').innerHTML = `<div class="diagnostic-row"><span>Questões</span><b>${counts.questions}</b></div><div class="diagnostic-row"><span>Imagens e arquivos</span><b>${counts.assets}</b></div><div class="diagnostic-row"><span>Atividades</span><b>${counts.activities}</b></div><div class="diagnostic-row"><span>Respostas registradas</span><b>${counts.answers}</b></div><div class="diagnostic-row"><span>Revisões</span><b>${counts.reviews}</b></div><div class="diagnostic-row"><span>Espaço utilizado pelo navegador</span><b>${usage == null ? 'Não informado' : formatBytes(usage)}</b></div><div class="diagnostic-row"><span>Limite estimado</span><b>${quota == null ? 'Não informado' : formatBytes(quota)}</b></div><div class="diagnostic-row"><span>Armazenamento persistente</span><b>${persisted ? 'Concedido' : 'Não concedido'}</b></div>`;
  const imports = [...state.data.imports].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,20);
  $('#importHistoryEmpty').classList.toggle('hidden', imports.length > 0);
  $('#importHistory').innerHTML = imports.map(item => {
    const ids = importRecordQuestionIds(item);
    const total = Number(item.packageQuestionCount) || ids.length || Number(item.importedCount) || 0;
    const canCreate = ids.length > 0 && ['Concluída', 'Parcial'].includes(item.status || 'Concluída');
    const unavailable = !ids.length ? '<small class="import-history-note">Este registro é de uma versão anterior e não contém a associação das questões. Reimporte o pacote para habilitar a criação da atividade.</small>' : '';
    return `<div class="history-row import-history-row"><div class="import-history-main"><b>${escapeHTML(item.packageName || item.fileName || 'Operação')}</b><small>${formatDate(item.createdAt, true)} · ${escapeHTML(item.operation || 'Importação')} · ${total} questões no pacote</small>${unavailable}</div><div class="import-history-actions"><span class="tag peach">${escapeHTML(item.status || 'Concluída')}</span>${canCreate ? `<button class="button primary" type="button" data-action="create-activity-from-import" data-id="${safeAttr(item.id)}">Criar atividade ↗</button>` : ''}</div></div>`;
  }).join('');
}
function importRecordQuestionIds(item) {
  const direct = Array.isArray(item?.questionIds) ? item.questionIds : [];
  const sourceExam = state.data.collections.find(collection => collection.type === 'sourceExam' && collection.packageId === item?.packageId);
  const fallback = sourceExam?.originalOrder?.length ? sourceExam.originalOrder : (sourceExam?.questionIds || []);
  return [...new Set((direct.length ? direct : fallback).filter(id => Boolean(questionById(id))))];
}
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  const units = ['B','KB','MB','GB']; let value = bytes; let index = 0;
  while (value >= 1024 && index < units.length-1) { value /= 1024; index++; }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

async function openQuestionDetail(id) {
  const question = questionById(id); if (!question) return toast('Questão não encontrada.');
  const textBase = state.data.textBases.find(item => item.id === question.textBaseId);
  let expected = getExpectedAnswer(question);
  const answerLabel = question.type === 'multiple_choice' ? `${expected}) ${question.alternatives?.[expected] || ''}` : expected;
  const alternatives = question.type === 'multiple_choice' ? Object.entries(question.alternatives || {}).map(([key,value]) => `<div class="answer-option"><div class="option-content"><b>${escapeHTML(key)})</b> ${richText(value)}${renderOptionImages(question,key)}</div></div>`).join('') : question.type === 'assertion_set' ? question.statements.map((item,index) => `<p><b>${index+1}.</b> ${richText(item.text)}</p>`).join('') : question.type === 'true_false' ? '<div class="answer-options"><div class="answer-option"><span><b>V</b> — Verdadeiro</span></div><div class="answer-option"><span><b>F</b> — Falso</span></div></div>' : '';
  const beforeStemHtml = `${renderQuestionImages(question,['after_text_base'])}${renderQuestionTables(question,['after_text_base'])}${renderQuestionEquations(question,['after_text_base'])}${renderQuestionImages(question,['before_statement','before-statement'])}`;
  const afterStemHtml = `${renderQuestionImages(question,['statement','enunciado','after_statement','after-statement'])}${renderQuestionTables(question,['statement','after_statement'])}${renderQuestionEquations(question,['statement','after_statement'])}`;
  openModal(question.id, `<div class="question-meta"><span class="tag peach">${escapeHTML(question.area)}</span><span class="tag">${escapeHTML(question.subject)}</span><span class="tag">${escapeHTML(question.primaryTopic)}</span><span class="tag">${escapeHTML(question.difficulty || 'Sem nível')}</span>${(question.relatedSubjects||[]).map(subject=>`<span class="tag">Interdisciplinar: ${escapeHTML(subject)}</span>`).join('')}${question.classificationConfidence != null ? `<span class="tag">Classificação ${Math.round(question.classificationConfidence*100)}% confiança</span>` : ''}</div>${textBase ? `<div class="base-text"><b>${escapeHTML(textBase.title || 'Texto-base')}</b><br>${richText(textBase.content)}</div>` : ''}${beforeStemHtml}<div class="exam-stem">${richText(question.statement)}</div>${afterStemHtml}${renderQuestionReferences(question)}<div class="answer-options">${alternatives}</div>${renderQuestionImages(question,['after_alternatives'])}${renderQuestionTables(question,['after_alternatives'])}${renderQuestionEquations(question,['after_alternatives'])}<div class="answer-feedback correct"><b>Gabarito: ${escapeHTML(answerLabel)}</b>${question.explanation ? `<p>${richText(question.explanation)}</p>` : '<p>Esta questão possui somente o gabarito, sem resolução comentada.</p>'}</div>${question.alternativeExplanations && Object.keys(question.alternativeExplanations).length ? `<h3>Comentários das alternativas</h3>${Object.entries(question.alternativeExplanations).map(([key,value])=>`<p class="fine-print"><b>${escapeHTML(key)}:</b> ${richText(value)}</p>`).join('')}` : ''}<div class="fine-print">Origem: ${escapeHTML(question.source?.name || question.source?.exam || 'Não informada')} · Identificador: ${escapeHTML(question.id)}</div>`, `<button class="button secondary" data-action="question-review" data-id="${safeAttr(id)}">Adicionar revisão</button><button class="button secondary" data-action="edit-question" data-id="${safeAttr(id)}">Editar classificação</button><button class="button primary" data-action="favorite" data-id="${safeAttr(id)}">${question.favorite ? '★ Favorita' : '☆ Favoritar'}</button>`, 'BANCO DE QUESTÕES');
  await hydrateAssetImages($('#modalBody'));
}
async function toggleFavorite(id) {
  const question = questionById(id); if (!question) return;
  await putRecord(state.db, 'questions', { ...question, favorite: !question.favorite, updatedAt: nowISO() });
  await refreshData();
  toast(question.favorite ? 'Questão removida das favoritas.' : 'Questão adicionada às favoritas.');
}
async function addReview(questionId, reason = 'Revisão adicionada manualmente') {
  const existing = state.data.reviews.find(item => item.questionId === questionId && item.status !== 'completed');
  const review = { id: existing?.id || makeId('review'), questionId, status: 'pending', reason, dueAt: nowISO(), createdAt: existing?.createdAt || nowISO(), updatedAt: nowISO() };
  await putRecord(state.db, 'reviews', review);
  await refreshData(); toast('Questão adicionada às revisões.');
}
function openEditQuestion(id) {
  const q = questionById(id); if (!q) return;
  openModal('Editar classificação', `<form id="editQuestionForm" class="modal-form"><label>Área<select name="area">${Object.keys(SUBJECTS).map(area=>`<option ${q.area===area?'selected':''}>${escapeHTML(area)}</option>`).join('')}</select></label><label>Matéria<select name="subject">${Object.values(SUBJECTS).flat().map(subject=>`<option ${q.subject===subject?'selected':''}>${escapeHTML(subject)}</option>`).join('')}</select></label><label>Assunto principal<input name="primaryTopic" value="${safeAttr(q.primaryTopic)}"></label><label>Assuntos secundários (separados por vírgula)<input name="secondaryTopics" value="${safeAttr((q.secondaryTopics||[]).join(', '))}"></label><label>Matérias relacionadas (interdisciplinaridade)<input name="relatedSubjects" value="${safeAttr((q.relatedSubjects||[]).join(', '))}"></label><label>Confiança da classificação (0 a 1)<input name="classificationConfidence" type="number" min="0" max="1" step="0.01" value="${safeAttr(q.classificationConfidence ?? '')}"></label><label>Subassuntos (separados por vírgula)<input name="subtopics" value="${safeAttr((q.subtopics||[]).join(', '))}"></label><label>Conhecimentos necessários (separados por vírgula)<input name="prerequisites" value="${safeAttr((q.prerequisites||[]).join(', '))}"></label><label>Habilidades (separadas por vírgula)<input name="skills" value="${safeAttr((q.skills||[]).join(', '))}"></label><label>Observação sobre a classificação<textarea name="classificationNote">${escapeHTML(q.classificationNote||'')}</textarea></label><label>Dificuldade<select name="difficulty"><option value="" ${!q.difficulty?'selected':''}>Não informada</option><option value="Fácil" ${q.difficulty==='Fácil'?'selected':''}>Fácil</option><option value="Média" ${q.difficulty==='Média'?'selected':''}>Média</option><option value="Difícil" ${q.difficulty==='Difícil'?'selected':''}>Difícil</option></select></label></form>`, `<button class="button secondary" data-action="close-modal">Cancelar</button><button class="button primary" data-action="save-question-edit" data-id="${safeAttr(id)}">Salvar classificação</button>`);
}
async function saveQuestionEdit(id) {
  const q = questionById(id); const form = $('#editQuestionForm'); if (!q || !form) return;
  const formData = new FormData(form);
  const area = String(formData.get('area') || '');
  const subject = String(formData.get('subject') || '');
  if (!(SUBJECTS[area] || []).includes(subject)) return toast('A matéria selecionada não pertence à área escolhida.');
  const confidenceRaw = String(formData.get('classificationConfidence') || '').trim();
  const confidence = confidenceRaw ? Number(confidenceRaw) : null;
  if (confidence !== null && !Number.isFinite(confidence)) return toast('Informe uma confiança entre 0 e 1.');
  const record = { ...q, area, subject, primaryTopic: String(formData.get('primaryTopic') || '').trim(), secondaryTopics: String(formData.get('secondaryTopics') || '').split(',').map(v=>v.trim()).filter(Boolean), relatedSubjects: String(formData.get('relatedSubjects') || '').split(',').map(v=>v.trim()).filter(Boolean), classificationConfidence: confidence === null ? null : Math.max(0,Math.min(1,confidence)), subtopics: String(formData.get('subtopics') || '').split(',').map(v=>v.trim()).filter(Boolean), prerequisites: String(formData.get('prerequisites') || '').split(',').map(v=>v.trim()).filter(Boolean), skills: String(formData.get('skills') || '').split(',').map(v=>v.trim()).filter(Boolean), classificationNote: String(formData.get('classificationNote') || '').trim(), difficulty: formData.get('difficulty'), updatedAt: nowISO() };
  await putRecord(state.db, 'questions', record); closeModal(); await refreshData(); toast('Classificação atualizada.');
}

function openImportModal() {
  state.importDraft = null;
  openModal('Importar pacote de questões', `<div class="modal-form"><div class="import-drop"><span class="empty-symbol">{ }</span><b>Arquivo de dados · obrigatório</b><small>Selecione o JSON preparado para o Grafia Questions.</small><input type="file" id="importJsonFile" accept=".json,application/json"></div><div class="import-drop"><span class="empty-symbol">▧</span><b>Arquivo de imagens · opcional</b><small>Selecione o ZIP que contém as imagens referenciadas pelo JSON.</small><input type="file" id="importZipFile" accept=".zip,application/zip"></div><label>Após importar<select id="importMode"><option value="bank">Adicionar ao banco</option><option value="solve">Importar e resolver agora</option></select></label><p class="fine-print">O arquivo JSON deve ter schemaVersion "1.0.0" e uma lista "questions". Se houver imagens, os identificadores e nomes dos arquivos precisam corresponder. A prévia apontará itens incompletos antes de salvar.</p><button class="button secondary" type="button" data-action="download-template">Baixar modelo JSON vazio</button><div id="importPreview"></div></div>`, `<button class="button secondary" data-action="close-modal">Cancelar</button><button class="button primary" id="analyzeImport" type="button">Analisar pacote</button>`, 'IMPORTAÇÃO E VALIDAÇÃO');
}
async function analyzeImport() {
  const json = $('#importJsonFile')?.files?.[0];
  const zip = $('#importZipFile')?.files?.[0] || null;
  if (!json) return toast('Selecione o arquivo JSON de questões.');
  const analyze = $('#analyzeImport'); analyze.disabled = true; analyze.textContent = 'Analisando…';
  try {
    // Parse JSON and ZIP in a module Worker so large packages do not freeze the interface.
    if (typeof Worker !== 'undefined') {
      state.importWorker?.terminate?.();
      const worker = new Worker('./js/import-worker.js', { type: 'module' });
      state.importWorker = worker;
      const draft = await new Promise((resolve, reject) => {
        worker.onmessage = event => event.data?.ok ? resolve(event.data.draft) : reject(new Error(event.data?.error || 'Falha ao analisar o pacote.'));
        worker.onerror = event => reject(new Error(event.message || 'Falha no processamento em segundo plano.'));
        worker.postMessage({ jsonFile: json, zipFile: zip });
      });
      worker.terminate(); state.importWorker = null;
      state.importDraft = draft;
    } else {
      state.importDraft = await prepareQuestionImport(state.db, json, zip);
    }
    state.importDraft.mode = $('#importMode').value;
    renderImportPreview();
    analyze.disabled = false; analyze.textContent = 'Analisar novamente';
  } catch (error) {
    state.importWorker?.terminate?.(); state.importWorker = null;
    toast(error.message || 'Não foi possível analisar o pacote.', 6500);
    analyze.disabled = false; analyze.textContent = 'Tentar novamente';
  }
}
function validateDraftQuestion(q, draft) {
  const issues = [];
  if (!(SUBJECTS[q.area] || []).length) issues.push('Área de conhecimento não reconhecida');
  if (!(SUBJECTS[q.area] || []).includes(q.subject)) issues.push('A matéria não corresponde à área selecionada');
  if (!q.primaryTopic) issues.push('Assunto principal não informado');
  if (!q.statement) issues.push('Enunciado vazio');
  if (!q.answer || (typeof q.answer === 'string' && !q.answer.trim())) issues.push('Gabarito ausente');
  if (q.type === 'multiple_choice') {
    const keys = Object.keys(q.alternatives || {});
    if (keys.length < 2) issues.push('Alternativas insuficientes');
    if (typeof q.answer !== 'string' || !keys.includes(q.answer)) issues.push('Gabarito não corresponde às alternativas');
  }
  if (q.type === 'assertion_set') {
    const expected = Array.isArray(q.answer) ? q.answer.join('') : (typeof q.answer === 'object' && q.answer ? Object.values(q.answer).join('') : String(q.answer || ''));
    if ((q.statements || []).length < 2) issues.push('Afirmações insuficientes');
    if (!/^[VF]+$/i.test(expected) || expected.length !== (q.statements || []).length) issues.push('Gabarito das afirmações incompleto');
  }
  if (q.type === 'true_false' && !['V','F','TRUE','FALSE','VERDADEIRO','FALSO'].includes(String(q.answer).toUpperCase())) issues.push('Gabarito V/F inválido');
  if (q.textBaseId && !draft.textBases.some(item => item.id === q.textBaseId) && !state.data.textBases.some(item => item.id === q.textBaseId)) issues.push('Texto-base ausente');
  for (const image of q.images || []) {
    if (draft.invalidAssetIds?.includes(image.assetId)) issues.push(`Imagem inválida ou corrompida: ${image.fileName || image.assetId}`);
    else if (!draft.assets.some(item => item.id === image.assetId) && !state.data.assets.some(item => item.id === image.assetId)) issues.push(`Imagem ausente: ${image.fileName || image.assetId}`);
  }
  return issues;
}
function renderImportPreview() {
  const draft = state.importDraft; if (!draft) return;
  const issues = draft.questions.map(q => ({ q, issues: validateDraftQuestion(q, draft) })).filter(item => item.issues.length);
  const conflicts = draft.duplicates.filter(item => item.conflict);
  const cleanCount = draft.questions.length - issues.length;
  const duplicateCount = draft.duplicates.length;
  const html = `<div class="import-summary"><div><strong>${draft.questions.length}</strong><span>questões lidas</span></div><div><strong>${cleanCount}</strong><span>sem pendências</span></div><div><strong>${draft.assets.length}</strong><span>imagens localizadas</span></div></div><p class="fine-print">Pacote: ${escapeHTML(draft.packageName)} · ${escapeHTML(draft.schemaVersion)} · ${draft.filesFound} arquivos no ZIP. ${duplicateCount} duplicatas identificadas.</p>${issues.length ? `<h3>Questões incompletas (${issues.length})</h3><div class="issue-list">${issues.map(({q,issues: qIssues}) => `<div class="preview-q"><b>${escapeHTML(q.id)} · ${escapeHTML(q.subject || 'Matéria pendente')}</b><p>${escapeHTML(qIssues.join(' · '))}</p><div class="note-actions"><button class="text-button" data-action="edit-import-question" data-id="${safeAttr(q.id)}">Completar</button><button class="text-button" data-action="remove-import-question" data-id="${safeAttr(q.id)}">Excluir do pacote</button></div></div>`).join('')}</div>` : '<div class="issue-item">Todas as questões passaram na verificação básica.</div>'}${duplicateCount ? `<h3>Duplicatas encontradas (${duplicateCount})</h3><div class="issue-list">${draft.duplicates.map(item=>`<div class="preview-q"><b>${escapeHTML(item.incomingId)} → ${escapeHTML(item.existingId)}</b><p>${item.conflict ? 'Os gabaritos divergem. Escolha como resolver.' : 'Os registros podem ser enriquecidos sem criar uma questão separada.'}</p>${item.conflict ? `<label class="field-label">Resolução<select data-duplicate-choice="${safeAttr(item.incomingId)}"><option value="unresolved" ${item.resolution==='unresolved'?'selected':''}>Escolher…</option><option value="keep" ${item.resolution==='keep'?'selected':''}>Manter gabarito existente</option><option value="replace" ${item.resolution==='replace'?'selected':''}>Usar gabarito importado e guardar histórico</option></select></label>` : '<span class="tag peach">Enriquecimento automático</span>'}</div>`).join('')}</div>` : ''}<div class="field-label" style="margin-top:13px">${draft.sourceExam ? `Prova de origem identificada: ${escapeHTML(draft.sourceExam.title || draft.sourceExam.name || 'Simulado / prova')}` : 'Sem prova de origem declarada.'}</div>`;
  $('#importPreview').innerHTML = html;
  $('#modalFooter').innerHTML = `<button class="button secondary" data-action="close-modal">Cancelar</button><button class="button primary" data-action="commit-import" ${issues.length || conflicts.some(item=>item.resolution==='unresolved') ? 'disabled' : ''}>${draft.mode === 'solve' ? 'Importar e resolver' : 'Adicionar ao banco'} (${cleanCount})</button>`;
}
function editImportQuestion(id) {
  const draft = state.importDraft; const q = draft?.questions.find(item => item.id === id); if (!q) return;
  const imageRows = (q.images || []).map(image => {
    const locked = image.essential || image.kind === 'essential';
    return `<label class="check-row"><input type="checkbox" data-keep-image="${safeAttr(image.assetId)}" checked ${locked ? 'disabled' : ''}><span><b>${escapeHTML(image.assetId)}</b><small>${escapeHTML(image.fileName || 'Arquivo não identificado')} ${locked ? '· essencial (não pode ser removida)' : '· opcional'}</small></span></label>`;
  }).join('');
  const alternatives = JSON.stringify(q.alternatives || {}, null, 2);
  const statements = (q.statements || []).map(item => item.text).join('\n');
  openModal(`Completar ${q.id}`, `<form id="editImportForm" class="modal-form"><label>Área<select name="area">${Object.keys(SUBJECTS).map(area=>`<option ${q.area===area?'selected':''}>${escapeHTML(area)}</option>`).join('')}</select></label><label>Matéria<select name="subject">${Object.values(SUBJECTS).flat().map(subject=>`<option ${q.subject===subject?'selected':''}>${escapeHTML(subject)}</option>`).join('')}</select></label><label>Assunto principal<input name="primaryTopic" value="${safeAttr(q.primaryTopic)}"></label><label>Enunciado<textarea name="statement">${escapeHTML(q.statement)}</textarea></label>${q.type === 'multiple_choice' ? `<label>Alternativas em JSON<textarea name="alternatives" spellcheck="false">${escapeHTML(alternatives)}</textarea><small>Use um objeto com chaves A, B, C… e o texto de cada alternativa.</small></label>` : ''}${q.type === 'assertion_set' ? `<label>Afirmações (uma por linha)<textarea name="statements">${escapeHTML(statements)}</textarea></label>` : ''}<label>Gabarito${q.type === 'assertion_set' ? ' (sequência V/F, por exemplo VFV)' : q.type === 'true_false' ? ' (V ou F)' : ' (letra da alternativa)'}<input name="answer" value="${safeAttr(typeof q.answer==='string'?q.answer:JSON.stringify(q.answer))}"></label><label>Resolução geral (opcional)<textarea name="explanation">${escapeHTML(q.explanation || '')}</textarea></label><div><span class="field-title">Imagens vinculadas</span>${imageRows || '<small>Esta questão não referencia imagens.</small>'}</div></form>`, `<button class="button secondary" data-action="back-import-preview">Voltar</button><button class="button primary" data-action="save-import-question" data-id="${safeAttr(id)}">Salvar alterações</button>`, 'REVISÃO DO PACOTE');
}
function saveImportQuestion(id) {
  const draft = state.importDraft; const q = draft?.questions.find(item => item.id === id); const form = $('#editImportForm'); if (!q || !form) return;
  const fd = new FormData(form);
  q.area = String(fd.get('area') || ''); q.subject = String(fd.get('subject') || ''); q.primaryTopic = String(fd.get('primaryTopic') || '').trim(); q.statement = String(fd.get('statement') || '').trim();
  q.answer = String(fd.get('answer') || '').trim().toUpperCase();
  q.explanation = String(fd.get('explanation') || '').trim();
  if (q.type === 'multiple_choice' && fd.has('alternatives')) {
    try { const parsed = JSON.parse(String(fd.get('alternatives') || '{}')); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); q.alternatives = Object.fromEntries(Object.entries(parsed).map(([key,value])=>[String(key).toUpperCase(),String(value)])); }
    catch { return toast('As alternativas precisam ser um objeto JSON válido.'); }
  }
  if (q.type === 'assertion_set' && fd.has('statements')) q.statements = String(fd.get('statements') || '').split('\n').map((text,index)=>({id:q.statements?.[index]?.id || `S${index+1}`,text:text.trim()})).filter(item=>item.text);
  const keep = new Set($$('[data-keep-image]:checked', form).map(el => el.dataset.keepImage));
  q.images = (q.images || []).filter(image => (image.essential || image.kind === 'essential') || keep.has(image.assetId));
  q.importIssues = validateDraftQuestion(q, draft); q.incomplete = q.importIssues.length > 0;
  closeModal();
  openImportModalShellForDraft();
  renderImportPreview();
}
function openImportModalShellForDraft() {
  const draft = state.importDraft;
  openModal('Importar pacote de questões', `<div class="modal-form"><div class="import-drop"><b>${escapeHTML(draft.fileName)}</b><small>Arquivo de dados analisado.</small></div><div class="import-drop"><b>${escapeHTML(draft.imageFileName || 'Nenhum ZIP selecionado')}</b><small>As referências das imagens já foram verificadas.</small></div><label>Após importar<select id="importMode"><option value="bank" ${draft.mode==='bank'?'selected':''}>Adicionar ao banco</option><option value="solve" ${draft.mode==='solve'?'selected':''}>Importar e resolver agora</option></select></label><div id="importPreview"></div></div>`, '', 'IMPORTAÇÃO E VALIDAÇÃO');
}
async function commitImport() {
  const draft = state.importDraft; if (!draft) return;
  draft.mode = $('#importMode')?.value || draft.mode;
  const issues = draft.questions.map(q=>validateDraftQuestion(q,draft)).filter(items=>items.length);
  if (issues.length) return toast('Ainda existem questões incompletas. Complete ou exclua os itens sinalizados.');
  if (draft.duplicates.some(item=>item.conflict && item.resolution==='unresolved')) return toast('Resolva os conflitos de gabarito antes de importar.');
  const incomingById = new Map(draft.questions.map(q=>[q.id,q]));
  const currentById = new Map(state.data.questions.map(q=>[q.id,q]));
  const aliases = [];
  const questionsToWrite = [];
  const newQuestionIds = [];
  const incomingToFinalId = new Map();
  for (const incoming of draft.questions) {
    const duplicate = draft.duplicates.find(item=>item.incomingId===incoming.id);
    if (!duplicate) { questionsToWrite.push(incoming); newQuestionIds.push(incoming.id); incomingToFinalId.set(incoming.id, incoming.id); continue; }
    const existing = currentById.get(duplicate.existingId);
    if (!existing) { questionsToWrite.push(incoming); newQuestionIds.push(incoming.id); incomingToFinalId.set(incoming.id, incoming.id); continue; }
    if (duplicate.conflict && duplicate.resolution === 'keep') {
      aliases.push({ alias: incoming.id, questionId: existing.id, updatedAt: nowISO() });
      newQuestionIds.push(existing.id);
      incomingToFinalId.set(incoming.id, existing.id);
      continue;
    }
    const enriched = mergeQuestion(existing, incoming);
    if (duplicate.conflict && duplicate.resolution === 'replace') {
      enriched.answerHistory = [...(existing.answerHistory || []), { answer: existing.answer, source: existing.source || {}, changedAt: nowISO() }];
      enriched.answer = incoming.answer;
    }
    questionsToWrite.push(enriched);
    if (incoming.id !== existing.id) aliases.push({ alias: incoming.id, questionId: existing.id, updatedAt: nowISO() });
    newQuestionIds.push(existing.id);
    incomingToFinalId.set(incoming.id, existing.id);
  }
  const packageQuestionIds = [...new Set(newQuestionIds)];
  const importRecord = { id: makeId('import'), packageId: draft.packageId, packageName: draft.packageName, fileName: draft.fileName, imageFileName: draft.imageFileName, operation: draft.mode === 'solve' ? 'Importar e resolver' : 'Importação de questões', importedCount: questionsToWrite.length, packageQuestionCount: packageQuestionIds.length, questionIds: packageQuestionIds, status: 'Concluída', createdAt: nowISO(), updatedAt: nowISO() };
  const usedAssetIds = new Set(draft.questions.flatMap(q => (q.images || []).map(image => image.assetId)));
  const usedAssets = draft.assets.filter(asset => usedAssetIds.has(asset.id));
  const usedAssetIdsForBlobs = new Set(usedAssets.map(asset => asset.id));
  const records = { questions: questionsToWrite, assets: usedAssets, assetBlobs: (draft.assetBlobs || []).filter(asset => usedAssetIdsForBlobs.has(asset.id)), textBases: draft.textBases, imports: [importRecord] };
  if (draft.sourceExam) {
    const exam = draft.sourceExam;
    const requestedOrder = Array.isArray(exam.originalOrder) ? exam.originalOrder : (Array.isArray(exam.questionIds) ? exam.questionIds : draft.questions.map(q=>q.id));
    const originalOrder = [...new Set(requestedOrder.map(value => String(value)).map(id => incomingToFinalId.get(id) || (questionById(id) ? id : null)).filter(Boolean))];
    const orderedQuestions = [...new Set([...originalOrder, ...newQuestionIds])];
    const existingExam = state.data.collections.find(item => item.type === 'sourceExam' && item.packageId === draft.packageId);
    records.collections = [{ id: existingExam?.id || makeId('exam'), packageId: draft.packageId, type: 'sourceExam', title: String(exam.title || exam.name || existingExam?.title || 'Prova importada'), description: String(exam.description || exam.source || existingExam?.description || ''), questionIds: orderedQuestions, originalOrder: originalOrder.length ? originalOrder : orderedQuestions, source: exam, createdAt: existingExam?.createdAt || nowISO(), updatedAt: nowISO() }];
  }
  const button = $('#modalFooter button.primary'); if (button) { button.disabled = true; button.textContent = 'Salvando em lotes…'; }
  try {
    const importStarted = { ...importRecord, status: 'Em andamento', importedCount: 0 };
    await writeBatch(state.db, { textBases: records.textBases, imports: [importStarted], ...(records.collections ? { collections: records.collections } : {}) }, aliases);
    const batchSize = 200;
    for (let offset = 0; offset < questionsToWrite.length; offset += batchSize) {
      const batch = questionsToWrite.slice(offset, offset + batchSize);
      await writeBatch(state.db, { questions: batch });
      importStarted.importedCount = Math.min(offset + batch.length, questionsToWrite.length);
      importStarted.status = 'Parcial';
      importStarted.updatedAt = nowISO();
      await writeBatch(state.db, { imports: [importStarted] });
    }
    const assetBatchSize = 100;
    for (let offset = 0; offset < usedAssets.length; offset += assetBatchSize) {
      const assetBatch = usedAssets.slice(offset, offset + assetBatchSize);
      const ids = new Set(assetBatch.map(asset => asset.id));
      await writeBatch(state.db, { assets: assetBatch, assetBlobs: (draft.assetBlobs || []).filter(asset => ids.has(asset.id)) });
    }
    importStarted.importedCount = questionsToWrite.length;
    importStarted.status = 'Concluída';
    importStarted.updatedAt = nowISO();
    await writeBatch(state.db, { imports: [importStarted] });
    const mode = draft.mode; state.importDraft = null; closeModal(); if ((draft.assetBlobs || []).length) clearAssetUrlCache(); await refreshData();
    toast(`${questionsToWrite.length} questões adicionadas ou enriquecidas.`);
    if (mode === 'solve' && newQuestionIds.length) await createActivityFromIds([...new Set(newQuestionIds)], `Atividade de importação · ${draft.packageName}`);
    else pageNavigate('bank');
  } catch (error) {
    if (button) { button.disabled = false; button.textContent = 'Tentar novamente'; }
    toast(`Importação interrompida após uma gravação parcial: ${error.message}. Reanalise o mesmo pacote; os identificadores e duplicatas permitem continuar sem criar cópias desnecessárias.`, 8000);
    await refreshData();
  }
}

async function createActivityFromIds(ids, title) {
  const storedActivities = await getAll(state.db, 'activities');
  state.data.activities = storedActivities;
  const running = storedActivities.filter(item => item.status === 'running').sort((a,b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
  if (running) {
    state.currentActivity = running;
    await loadActivityAnswers(running.id);
    pageNavigate('activity');
    toast('Há uma atividade em andamento. Retome-a antes de iniciar outra.');
    return;
  }
  const validIds = [...new Set(ids.filter(id=>questionById(id)))]; if (!validIds.length) return;
  const activity = { id: makeId('activity'), title, questionIds: validIds, status: 'running', createdAt: nowISO(), startedAt: nowISO(), config: { correctionMode: 'end', showErrors: false, commentMode: 'available', navigationMode: 'free', timerEnabled: false, timerMinutes: 90, negativeScoring: false, strategy: 'import' } };
  await putRecord(state.db, 'activities', activity); state.currentActivity = activity; state.activityAnswers = new Map(); state.activityStart = Date.now(); await refreshData(); pageNavigate('activity');
}

async function createReviewActivity() {
  const ids = state.data.reviews.filter(item=>item.status!=='completed' && Date.parse(item.dueAt)<=Date.now()).map(item=>item.questionId).filter(id=>questionById(id));
  if (!ids.length) return toast('Não há revisões vencidas para resolver.');
  await createActivityFromIds([...new Set(ids)], 'Sessão de revisão');
}

function openNoteEditor(note = null) {
  openModal(note ? 'Editar anotação' : 'Nova anotação', `<form id="noteForm" class="modal-form"><label>Título<input name="title" value="${safeAttr(note?.title || '')}" required placeholder="Nome da anotação"></label><label>Matéria (opcional)<select name="subject"><option value="">Sem matéria específica</option>${Object.values(SUBJECTS).flat().map(subject=>`<option ${note?.subject===subject?'selected':''}>${escapeHTML(subject)}</option>`).join('')}</select></label><label>Conteúdo<textarea name="content" required placeholder="Escreva sua anotação…">${escapeHTML(note?.content || '')}</textarea></label></form>`, `<button class="button secondary" data-action="close-modal">Cancelar</button><button class="button primary" data-action="save-note" data-id="${safeAttr(note?.id || '')}">Salvar anotação</button>`);
}
async function saveNote(id = '') {
  const form = $('#noteForm'); if (!form) return;
  const fd = new FormData(form); const existing = id ? state.data.notes.find(item=>item.id===id) : null;
  const record = { id: existing?.id || makeId('note'), title: String(fd.get('title')||'').trim(), subject: String(fd.get('subject')||''), content: String(fd.get('content')||'').trim(), createdAt: existing?.createdAt || nowISO(), updatedAt: nowISO() };
  if (!record.title || !record.content) return toast('Preencha o título e o conteúdo da anotação.');
  await putRecord(state.db, 'notes', record); closeModal(); await refreshData(); toast('Anotação salva.');
}
function openCollectionEditor() {
  openModal('Criar coleção', `<form id="collectionForm" class="modal-form"><label>Nome da coleção<input name="title" required placeholder="Ex.: Questões para revisar"></label><label>Descrição (opcional)<textarea name="description" placeholder="Objetivo desta lista"></textarea></label><p class="fine-print">Depois de criar, você poderá adicionar questões a partir do banco.</p></form>`, `<button class="button secondary" data-action="close-modal">Cancelar</button><button class="button primary" data-action="save-collection">Criar coleção</button>`);
}
async function saveCollection() {
  const form = $('#collectionForm'); const fd = new FormData(form);
  const title = String(fd.get('title')||'').trim(); if (!title) return toast('Informe um nome para a coleção.');
  await putRecord(state.db, 'collections', { id: makeId('collection'), title, description: String(fd.get('description')||''), questionIds: [], createdAt: nowISO(), updatedAt: nowISO() });
  closeModal(); await refreshData(); toast('Coleção criada.');
}
function openCollection(id) {
  const collection = state.data.collections.find(item=>item.id===id); if (!collection) return;
  const orderedIds = collection.type === 'sourceExam' && Array.isArray(collection.originalOrder) && collection.originalOrder.length ? collection.originalOrder : (collection.questionIds || []);
  const items = orderedIds.map(questionId=>questionById(questionId)).filter(Boolean);
  const solveAction = collection.type === 'sourceExam' && items.length ? `<button class="button primary" data-action="solve-collection" data-id="${safeAttr(id)}">Resolver prova na ordem original ↗</button>` : '';
  openModal(collection.title, `<p class="lead">${escapeHTML(collection.description || (collection.type === 'sourceExam' ? 'Prova de origem preservada com suas questões no banco geral.' : 'Coleção pessoal'))}</p><div class="compact-list">${items.map(q=>`<div class="compact-item"><span><b>${escapeHTML(q.id)} · ${escapeHTML(q.primaryTopic)}</b><small>${escapeHTML(q.subject)}</small></span><button class="text-button" data-open-question="${safeAttr(q.id)}">Abrir</button></div>`).join('') || '<div class="empty-inline">Esta coleção ainda não possui questões.</div>'}</div>${solveAction}<button class="button secondary" data-action="add-to-collection" data-id="${safeAttr(id)}">Adicionar questões do banco</button>`, `<button class="button secondary" data-action="close-modal">Fechar</button>`);
}
function openAddToCollection(id) {
  const collection = state.data.collections.find(item=>item.id===id); if (!collection) return;
  openModal('Adicionar questões', `<div class="modal-form"><p class="fine-print">Selecione as questões que deseja incluir em ${escapeHTML(collection.title)}.</p><div class="compact-list">${state.data.questions.map(q=>`<label class="check-row"><input type="checkbox" data-collection-question="${safeAttr(q.id)}" ${(collection.questionIds||[]).includes(q.id)?'checked':''}><span><b>${escapeHTML(q.id)} · ${escapeHTML(q.primaryTopic)}</b><small>${escapeHTML(q.subject)}</small></span></label>`).join('') || '<div class="empty-inline">O banco está vazio.</div>'}</div></div>`, `<button class="button secondary" data-action="close-modal">Cancelar</button><button class="button primary" data-action="save-collection-questions" data-id="${safeAttr(id)}">Salvar seleção</button>`);
}
async function saveCollectionQuestions(id) {
  const collection = state.data.collections.find(item=>item.id===id); if (!collection) return;
  const ids = $$('[data-collection-question]:checked').map(item=>item.dataset.collectionQuestion);
  const record = { ...collection, questionIds: ids, updatedAt: nowISO() };
  if (collection.type === 'sourceExam') {
    const previousOrder = collection.originalOrder?.length ? collection.originalOrder : (collection.questionIds || []);
    record.originalOrder = [...previousOrder.filter(id => ids.includes(id)), ...ids.filter(id => !previousOrder.includes(id))];
  }
  await putRecord(state.db, 'collections', record); closeModal(); await refreshData(); toast('Coleção atualizada.');
}

function buildBackupRecord(record, table, assetEntries, index) {
  if (table !== 'assetBlobs') return record;
  const path = `assets/${String(index).padStart(6,'0')}-${String(record.id).replace(/[^a-zA-Z0-9_-]/g,'_')}.bin`;
  assetEntries.push({ name: path, data: record.blob });
  const { blob, ...metadata } = record;
  return { ...metadata, blobPath: path };
}
async function buildFullBackup() {
  const records = await getAllStoresSnapshot(state.db, STORES);
  const assets = [];
  records.assetBlobs = records.assetBlobs.map((record,index)=>buildBackupRecord(record,'assetBlobs',assets,index));
  const databaseId = records.settings.find(item => item.key === 'databaseId')?.value;
  if (!databaseId) throw new Error('Não foi possível identificar o banco de origem deste backup.');
  const createdAt = nowISO();
  const checkpointSeq = records.changes.reduce((max, item) => Math.max(max, Number(item.seq) || 0), 0);
  const backup = { format: 'grafia-questoes-backup', backupVersion: '1.0.0', backupType: 'full', backupId: makeId('backup'), databaseId, createdAt, checkpointSeq, records };
  const entries = [{ name: 'grafia-backup/manifest.json', data: JSON.stringify({ format: backup.format, backupVersion: backup.backupVersion, backupType: backup.backupType, databaseId, backupId: backup.backupId, createdAt, checkpointSeq, files: assets.map(item=>item.name) }, null, 2) }, { name: 'grafia-backup/data.json', data: JSON.stringify(backup) }, ...assets.map(item=>({ name: `grafia-backup/${item.name}`, data: item.data }))];
  const blob = await writeZip(entries);
  return { blob, backup };
}
async function buildIncrementalBackup() {
  const databaseIdBefore = await getSetting(state.db, 'databaseId');
  const savedCheckpoint = await getSetting(state.db, 'backupCheckpoint', null);
  if (savedCheckpoint == null || !Number.isSafeInteger(Number(savedCheckpoint)) || Number(savedCheckpoint) < 0) throw new Error('Faça um backup completo antes do primeiro backup incremental.');
  const checkpointSeq = Number(savedCheckpoint);
  const snapshot = await getChangesSnapshot(state.db, checkpointSeq);
  const changes = snapshot.changes;
  if (!changes.length) throw new Error('Não há alterações desde o último backup.');
  const nextCheckpointSeq = snapshot.checkpointSeq;
  const latest = new Map();
  for (const change of changes) latest.set(`${change.table}:${change.id}`, change);
  const assets = []; const incremental = [];
  let assetIndex = 0;
  for (const change of latest.values()) {
    if (change.table === 'changes' || change.table === '__checkpoint__') continue;
    if (change.table === 'settings' && ['backupCheckpoint','lastBackupType','appVersion','databaseId'].includes(change.id)) continue;
    if (change.action === 'delete') { incremental.push({ table: change.table, id: change.id, action: 'delete' }); continue; }
    let record = change.record;
    if (change.table === 'assetBlobs') record = await getOne(state.db, 'assetBlobs', change.id);
    if (!record) { incremental.push({ table: change.table, id: change.id, action: 'delete' }); continue; }
    const serialized = buildBackupRecord(record, change.table, assets, assetIndex++);
    incremental.push({ table: change.table, id: change.id, action: 'upsert', record: serialized });
  }
  const databaseId = await getSetting(state.db, 'databaseId');
  if (!databaseId || databaseId !== databaseIdBefore) throw new Error('O banco foi reiniciado durante a preparação do backup. Gere o incremental novamente.');
  const createdAt = nowISO();
  const backup = { format: 'grafia-questoes-backup', backupVersion: '1.0.0', backupType: 'incremental', databaseId, baseCheckpointSeq: checkpointSeq, checkpointSeq: nextCheckpointSeq, createdAt, changes: incremental };
  const entries = [{ name: 'grafia-backup/manifest.json', data: JSON.stringify({ format: backup.format, backupVersion: backup.backupVersion, backupType: backup.backupType, databaseId, baseCheckpointSeq: checkpointSeq, checkpointSeq: nextCheckpointSeq, createdAt }, null, 2) }, { name: 'grafia-backup/data.json', data: JSON.stringify(backup) }, ...assets.map(item=>({ name: `grafia-backup/${item.name}`, data: item.data }))];
  const blob = await writeZip(entries);
  return { blob, backup };
}
async function exportQuestionPackage() {
  const referenced = new Set(state.data.questions.flatMap(q => (q.images || []).map(img=>img.assetId)));
  const assets = state.data.assets.filter(asset => referenced.has(asset.id));
  const missingMetadata = [...referenced].filter(id => !assets.some(asset => asset.id === id));
  if (missingMetadata.length) throw new Error(`Não foi possível exportar: faltam metadados para ${missingMetadata.length} imagem(ns).`);
  const entries = [];
  const fileByAssetId = new Map();
  for (const asset of assets) {
    const stored = await getOne(state.db, 'assetBlobs', asset.id);
    if (!stored?.blob) throw new Error(`Não foi possível exportar o pacote: o arquivo da imagem ${asset.id} está ausente no banco local.`);
    const rawExt = String(asset.fileName || '').split('.').pop().toLowerCase();
    const mimeExt = ({'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/svg+xml':'svg','image/gif':'gif'})[asset.mimeType] || '';
    const ext = ['png','jpg','jpeg','webp','svg','gif'].includes(rawExt) ? rawExt : (mimeExt || 'webp');
    const safeAssetId = String(asset.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const path = `imagens/${safeAssetId}.${ext}`;
    fileByAssetId.set(asset.id, path);
    entries.push({ name: path, data: stored.blob });
  }
  const questions = state.data.questions.map(q => {
    const { incomplete, importIssues, createdAt, updatedAt, favorite, ...exportable } = q;
    return {
      ...exportable,
      id: q.id,
      area: q.area,
      subject: q.subject,
      primaryTopic: q.primaryTopic,
      images: (q.images || []).map(image => ({
        id: image.assetId,
        file: fileByAssetId.get(image.assetId) || image.fileName || '',
        position: image.position,
        alt: image.alt,
        caption: image.caption,
        sourceUrl: image.sourceUrl || '',
        sourceLabel: image.sourceLabel || '',
        kind: image.kind,
        essential: image.essential
      }))
    };
  });
  const relatedExams = state.data.collections.filter(collection => collection.type === 'sourceExam' && (collection.questionIds || []).some(id => questions.some(q => q.id === id)));
  const pkg = { schemaVersion: '1.0.0', packageId: makeId('package'), packageName: 'Pacote exportado do Grafia Questions', generatedAt: nowISO(), source: { name: 'Grafia Questions', exportedAt: nowISO() }, ...(relatedExams.length === 1 ? { sourceExam: { title: relatedExams[0].title, description: relatedExams[0].description, questionIds: relatedExams[0].questionIds, originalOrder: relatedExams[0].originalOrder } } : {}), questions, textBases: state.data.textBases };
  const jsonBlob = new Blob([JSON.stringify(pkg,null,2)], {type:'application/json'});
  const zipBlob = entries.length ? await writeZip(entries) : null;
  const stamp = Date.now();
  downloadBlob(jsonBlob, `grafia-questions-${stamp}.json`);
  if (zipBlob) downloadBlob(zipBlob, `grafia-questions-imagens-${stamp}.zip`);
  toast(`Exportação preparada: JSON${entries.length ? ' e ZIP de imagens' : ''}.`);
}
async function downloadBackup(type) {
  try {
    const { blob, backup } = type === 'full' ? await buildFullBackup() : await buildIncrementalBackup();
    downloadBlob(blob, `grafia-backup-${type}-${Date.now()}.zip`);
    state.pendingBackup = { checkpointSeq: backup.checkpointSeq, type, databaseId: backup.databaseId };
    openModal('Confirme o arquivo de backup', `<div class="empty-inline"><span class="empty-symbol">⇧</span><b>O arquivo foi preparado para download.</b><p>Depois de verificar que o ZIP foi salvo em seus arquivos, confirme abaixo. Só então o Grafia Questions atualizará o ponto de partida do próximo backup incremental. Se não confirmar, as alterações continuarão incluídas nos próximos backups.</p><span class="tag peach">${type === 'full' ? 'Backup completo' : 'Backup incremental'}</span></div>`, `<button class="button secondary" data-action="close-modal">Ainda não salvei</button><button class="button primary" data-action="confirm-backup-checkpoint">Confirmei que salvei</button>`, 'PROTEÇÃO DOS DADOS');
  } catch (error) { toast(error.message || 'Não foi possível criar o backup.', 5000); }
}
async function confirmBackupCheckpoint() {
  const pending = state.pendingBackup;
  if (!pending) return;
  const currentId = await getSetting(state.db, 'databaseId');
  if (currentId !== pending.databaseId) throw new Error('O banco mudou desde a preparação do backup. Gere outro arquivo antes de atualizar o checkpoint.');
  const tx = state.db.transaction('settings', 'readwrite');
  tx.objectStore('settings').put({ key: 'backupCheckpoint', value: pending.checkpointSeq, updatedAt: nowISO() });
  tx.objectStore('settings').put({ key: 'lastBackupType', value: pending.type, updatedAt: nowISO() });
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error); });
  state.pendingBackup = null;
  closeModal(); await refreshData();
  toast('Checkpoint atualizado. O próximo backup incremental partirá deste arquivo.');
}
async function parseBackup(file) {
  const files = await readZip(file);
  const dataBlob = files.get('grafia-backup/data.json');
  if (!dataBlob) throw new Error('O arquivo não contém grafia-backup/data.json.');
  const backup = JSON.parse(await dataBlob.text());
  if (backup.format !== 'grafia-questoes-backup' || backup.backupVersion !== '1.0.0') throw new Error('Formato ou versão de backup não reconhecidos.');
  if (typeof backup.databaseId !== 'string' || !backup.databaseId) throw new Error('O backup não identifica o banco de origem.');
  if (backup.backupType === 'full') {
    if (!Number.isSafeInteger(backup.checkpointSeq) || backup.checkpointSeq < 0) throw new Error('O backup completo não contém um checkpoint de integridade válido.');
    if (!backup.records || typeof backup.records !== 'object' || Array.isArray(backup.records)) throw new Error('A estrutura de dados do backup completo está inválida.');
    if (!Array.isArray(backup.records.topics)) backup.records.topics = [];
    for (const table of STORES) if (!Array.isArray(backup.records[table])) throw new Error(`O backup completo não contém uma lista válida para ${table}.`);
    const blobIds = new Set();
    for (const asset of backup.records.assetBlobs) {
      if (!asset.id || !asset.blobPath || blobIds.has(asset.id)) throw new Error('O backup contém uma referência de imagem inválida ou duplicada.');
      blobIds.add(asset.id);
      const blob = files.get(`grafia-backup/${asset.blobPath}`);
      if (!blob) throw new Error(`Arquivo de imagem do backup ausente: ${asset.blobPath}`);
      asset.blob = blob.slice(0, blob.size, asset.type || 'application/octet-stream');
      delete asset.blobPath;
    }
  } else if (backup.backupType === 'incremental') {
    if (!Number.isSafeInteger(backup.baseCheckpointSeq) || !Number.isSafeInteger(backup.checkpointSeq) || backup.baseCheckpointSeq < 0 || backup.checkpointSeq < backup.baseCheckpointSeq) throw new Error('Os checkpoints do backup incremental são inválidos.');
    if (!Array.isArray(backup.changes) || backup.changes.length > 1000000) throw new Error('A lista de alterações do backup incremental é inválida ou excede o limite.');
    for (const change of backup.changes) {
      if (!change || !STORES.includes(change.table) || change.table === 'changes' || change.id == null || !['upsert','delete'].includes(change.action)) throw new Error('O backup incremental contém uma alteração inválida.');
      if (change.action === 'upsert' && (!change.record || typeof change.record !== 'object')) throw new Error('Uma alteração do backup incremental não contém registro válido.');
      if (change.table === 'assetBlobs' && change.action === 'upsert') {
        if (!change.record.blobPath) throw new Error('Uma imagem do backup incremental não contém referência ao arquivo binário.');
        const blob = files.get(`grafia-backup/${change.record.blobPath}`);
        if (!blob) throw new Error(`Imagem ausente no backup incremental: ${change.record.blobPath}`);
        change.record.blob = blob.slice(0, blob.size, change.record.type || 'application/octet-stream');
        delete change.record.blobPath;
      }
    }
  } else throw new Error('Tipo de backup desconhecido.');
  return backup;
}
function restoreConflictKey(table, id) { return `${table}:${id}`; }
function restoreCompare(record, table) {
  if (!record) return '';
  const copy = { ...record };
  delete copy.updatedAt;
  if (table === 'assetBlobs') {
    delete copy.blob;
    copy.blobSize = record.blob?.size ?? null;
    copy.blobType = record.type || record.blob?.type || null;
    copy.blobUpdatedAt = record.updatedAt || null;
  }
  return JSON.stringify(copy);
}
async function findRestoreConflicts(backup) {
  const results = [];
  for (const table of STORES.filter(name => name !== 'changes')) {
    const incomingItems = backup.records?.[table] || [];
    if (!incomingItems.length) continue;
    const currentItems = await getAll(state.db, table);
    const currentMap = new Map(currentItems.map(item => [item.id ?? item.key ?? item.alias, item]));
    for (const incoming of incomingItems) {
      const id = incoming.id ?? incoming.key ?? incoming.alias;
      const existing = currentMap.get(id);
      if (existing && restoreCompare(existing, table) !== restoreCompare(incoming, table)) {
        results.push({ table, id, existingUpdatedAt: existing.updatedAt || '', incomingUpdatedAt: incoming.updatedAt || '' });
      }
    }
  }
  return results;
}
function renderRestoreConflicts() {
  const container = $('#restoreConflictList');
  if (!container) return;
  const isMerge = $('#restoreMode')?.value === 'merge';
  container.classList.toggle('hidden', !isMerge || !state.restoreConflicts.length);
  if (!isMerge || !state.restoreConflicts.length) { container.innerHTML = ''; return; }
  container.innerHTML = `<h3>Registros com identificadores iguais (${state.restoreConflicts.length})</h3><p class="fine-print">Escolha qual versão deve permanecer em cada conflito. A opção “mais recente” compara a data de atualização e mantém o registro local em caso de empate.</p><div class="issue-list">${state.restoreConflicts.slice(0,100).map(conflict => {
    const key = restoreConflictKey(conflict.table, conflict.id);
    const choice = state.restoreChoices[key] || 'newer';
    return `<label class="issue-item"><b>${escapeHTML(conflict.table)} · ${escapeHTML(conflict.id)}</b><select data-restore-conflict="${safeAttr(key)}"><option value="newer" ${choice==='newer'?'selected':''}>Manter o mais recente</option><option value="keep" ${choice==='keep'?'selected':''}>Manter o existente neste dispositivo</option><option value="backup" ${choice==='backup'?'selected':''}>Usar a versão do backup</option></select></label>`;
  }).join('')}</div>${state.restoreConflicts.length>100 ? `<p class="fine-print">Exibindo os primeiros 100 conflitos; os demais usarão a regra de versão mais recente.</p>` : ''}`;
}

async function beginRestore(file) {
  try {
    const backup = await parseBackup(file);
    if (backup.backupType === 'incremental') {
      const localId = await getSetting(state.db, 'databaseId');
      const savedLocalCheckpoint = await getSetting(state.db, 'backupCheckpoint', null);
      const localCheckpoint = Number(savedLocalCheckpoint);
      if (backup.databaseId !== localId) throw new Error('Este backup incremental pertence a outro banco. Restaure primeiro o backup completo correspondente.');
      if (savedLocalCheckpoint == null || !Number.isSafeInteger(localCheckpoint) || localCheckpoint < 0 || backup.baseCheckpointSeq !== localCheckpoint) throw new Error('Este backup incremental não parte do último checkpoint deste dispositivo. Restaure os incrementais na sequência correta.');
      const localJournal = await getChangesSnapshot(state.db, 0);
      const localChangesAfterCheckpoint = localJournal.changes.filter(change => (Number(change.seq) || 0) > localCheckpoint && !(change.table === 'settings' && ['backupCheckpoint','lastBackupType','appVersion','databaseId'].includes(change.id)));
      if (localChangesAfterCheckpoint.length) throw new Error('Este dispositivo tem alterações locais depois do último checkpoint. Gere um novo backup completo antes de continuar.');
    }
    state.restoreDraft = backup;
    state.restoreChoices = {};
    const full = backup.backupType === 'full';
    state.restoreConflicts = full ? await findRestoreConflicts(backup) : [];
    const records = full ? backup.records : null;
    const currentCounts = await countAll(state.db);
    const incomingQuestions = full ? (records.questions || []).length : (backup.changes || []).filter(c=>c.table==='questions' && c.action==='upsert').length;
    openModal('Conferir restauração', `<div class="import-summary"><div><strong>${full ? 'Completo' : 'Incremental'}</strong><span>tipo de backup</span></div><div><strong>${incomingQuestions}</strong><span>questões afetadas</span></div><div><strong>${full ? (records.assets||[]).length : backup.changes.filter(c=>c.table==='assets').length}</strong><span>imagens afetadas</span></div></div><p class="fine-print">Criado em ${formatDate(backup.createdAt, true)}. Banco local atual: ${currentCounts.questions} questões, ${currentCounts.activities} atividades e ${currentCounts.assets} imagens.</p>${full ? `<label class="field-label">Modo de restauração<select id="restoreMode"><option value="merge">Mesclar com o banco atual</option><option value="replace">Substituir o banco atual</option></select></label><p class="fine-print">Na mesclagem, cada conflito pode manter a versão local, a do backup ou a mais recente. Na substituição, um backup de segurança será gerado antes da transação.</p><div id="restoreConflictList"></div>` : '<div class="issue-item">Este incremental será aplicado ao banco de origem correspondente. Não é possível usá-lo como restauração independente.</div>'}`, `<button class="button secondary" data-action="close-modal">Cancelar</button><button class="button primary" data-action="confirm-restore">Continuar restauração</button>`, 'BACKUP E RESTAURAÇÃO');
    renderRestoreConflicts();
  } catch (error) { toast(error.message || 'Falha ao ler o backup.', 6000); }
}
async function restoreBackup() {
  const backup = state.restoreDraft; if (!backup) return;
  const mode = $('#restoreMode')?.value || 'merge';
  try {
    if (backup.backupType === 'full' && mode === 'replace') {
      const safety = await buildFullBackup();
      downloadBlob(safety.blob, `grafia-backup-seguranca-antes-da-restauracao-${Date.now()}.zip`);
      if (!confirm('O download do backup de segurança foi solicitado. Verifique se o arquivo ZIP foi salvo antes de continuar. Deseja substituir o banco agora?')) return;
      const records = { ...backup.records };
      records.settings = (records.settings || []).filter(item=>item.key !== 'backupCheckpoint' && item.key !== 'databaseId');
      records.settings.push({ key: 'databaseId', value: backup.databaseId, updatedAt: nowISO() });
      records.settings.push({ key: 'backupCheckpoint', value: backup.checkpointSeq, updatedAt: nowISO() });
      await replaceAllData(state.db, records);
      toast('Banco substituído. O backup de segurança foi baixado.');
    } else if (backup.backupType === 'full') {
      const records = { ...backup.records, settings: (backup.records.settings || []).filter(item => !['databaseId','backupCheckpoint'].includes(item.key)) };
      const report = await mergeAllData(state.db, records, state.restoreChoices);
      await setSetting(state.db, 'lastRestoreReport', report);
      if (backup.databaseId === await getSetting(state.db, 'databaseId') && (await getSetting(state.db, 'backupCheckpoint', null)) == null) await setSetting(state.db, 'backupCheckpoint', backup.checkpointSeq);
      toast(`Mesclagem concluída: ${report.inserted} novos, ${report.updated} atualizados, ${report.kept} mantidos. ${report.conflicts.length} conflitos identificados.`);
    } else {
      const txTables = [...new Set((backup.changes || []).map(change=>change.table).filter(name=>STORES.includes(name) && name !== 'changes'))];
      const tx = state.db.transaction([...new Set([...txTables, 'changes', 'settings'])], 'readwrite');
      const changeStore = tx.objectStore('changes');
      for (const change of backup.changes || []) {
        if (!STORES.includes(change.table) || change.table === 'changes') continue;
        const store = tx.objectStore(change.table);
        if (change.action === 'delete') store.delete(change.id);
        else store.put(change.record);
      }
      // Preserve the source sequence instead of creating a second local journal lineage.
      changeStore.put({ seq: backup.checkpointSeq, table: '__checkpoint__', id: 'incremental-restore', action: 'checkpoint', changedAt: nowISO() });
      tx.objectStore('settings').put({ key: 'backupCheckpoint', value: backup.checkpointSeq, updatedAt: nowISO() });
      await new Promise((resolve,reject)=>{ tx.oncomplete=resolve; tx.onabort=()=>reject(tx.error); tx.onerror=()=>reject(tx.error); });
      toast('Backup incremental aplicado.');
    }
    state.restoreDraft = null; closeModal(); clearAssetUrlCache(); await refreshData(); pageNavigate('home');
  } catch (error) { toast(`A restauração não foi concluída: ${error.message}`, 6500); }
}

async function downloadTemplate() {
  const template = {
    schemaVersion: '1.0.0', packageId: 'pacote-identificador-unico', packageName: 'Nome do pacote', generatedAt: nowISO(),
    source: { name: '', exam: '', year: null },
    textBases: [],
    questions: []
  };
  downloadBlob(new Blob([JSON.stringify(template,null,2)], {type:'application/json'}), 'modelo-pacote-grafia-questions.json');
}
async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return toast('Este navegador não oferece solicitação de armazenamento persistente.');
  const granted = await navigator.storage.persist();
  await renderSettings();
  toast(granted ? 'O navegador concedeu armazenamento persistente.' : 'O navegador não concedeu armazenamento persistente. Continue fazendo backups.');
}
async function clearDatabase() {
  if (!confirm('Apagar todas as questões, imagens, atividades, respostas, revisões, notas e configurações deste dispositivo? Esta ação não pode ser desfeita. Exporte um backup antes.')) return;
  const tx = state.db.transaction(STORES, 'readwrite');
  for (const store of STORES) tx.objectStore(store).clear();
  await new Promise((resolve,reject)=>{ tx.oncomplete=resolve; tx.onabort=()=>reject(tx.error); tx.onerror=()=>reject(tx.error); });
  await setSetting(state.db, 'databaseId', crypto.randomUUID());
  await setSetting(state.db, 'appVersion', '1.1.0');
  state.currentActivity = null; state.activityAnswers.clear();
  clearAssetUrlCache();
  await refreshData(); pageNavigate('home'); toast('Dados locais removidos.');
}

function showSettings() { pageNavigate('settings'); }
function newActivityFromBuilder() { state.currentActivity = null; clearInterval(state.activityTimer); pageNavigate('activity'); renderActivityBuilder(); }
async function discardCurrentActivity() {
  const activity = state.currentActivity;
  if (!activity || activity.status !== 'running') return;
  if (!confirm('Descartar esta atividade? As respostas, grifos e alternativas riscadas desta sessão serão apagados. Ela não entrará nas estatísticas nem no histórico de atividades concluídas.')) return;
  clearInterval(state.activityTimer);
  const savedAnswers = await getAll(state.db, 'answers');
  const related = savedAnswers.filter(item => item.activityId === activity.id);
  for (const answer of related) await deleteRecord(state.db, 'answers', answer.id);
  await putRecord(state.db, 'activities', { ...activity, status: 'discarded', discardedAt: nowISO(), updatedAt: nowISO() });
  state.currentActivity = null;
  state.activityAnswers.clear();
  state.activityStart = null;
  await refreshData();
  pageNavigate('activity');
  toast('Atividade descartada. Você já pode montar outra.');
}
function getTextPoint(root, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node; let consumed = 0;
  while ((node = walker.nextNode())) {
    const end = consumed + node.nodeValue.length;
    if (offset <= end) return { node, offset: Math.max(0, offset - consumed) };
    consumed = end;
  }
  return null;
}
function wrapTextRange(root, start, end) {
  const startPoint = getTextPoint(root, start);
  const endPoint = getTextPoint(root, end);
  if (!startPoint || !endPoint || end <= start) return;
  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  const mark = document.createElement('mark');
  mark.className = 'text-highlight';
  mark.appendChild(range.extractContents());
  range.insertNode(mark);
}
function applyTextMarks(root, marks = []) {
  if (!root || !marks?.length) return;
  [...marks].filter(mark => Number.isFinite(mark.start) && Number.isFinite(mark.end) && mark.end > mark.start)
    .sort((a,b) => b.start - a.start).forEach(mark => wrapTextRange(root, mark.start, mark.end));
}
let pendingTextSelection = null;
function hideTextSelectionToolbar() {
  const toolbar = $('#textSelectionToolbar');
  if (toolbar) toolbar.classList.add('hidden');
  pendingTextSelection = null;
}
function updateTextSelectionToolbar() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount || !state.currentActivity || state.currentActivity.status !== 'running') return hideTextSelectionToolbar();
  const range = selection.getRangeAt(0);
  const stem = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer.closest?.('.exam-stem') || range.commonAncestorContainer.querySelector?.('.exam-stem')
    : range.commonAncestorContainer.parentElement?.closest('.exam-stem');
  if (!stem || !stem.contains(range.startContainer) || !stem.contains(range.endContainer)) return hideTextSelectionToolbar();
  const selectedText = selection.toString().trim();
  if (!selectedText) return hideTextSelectionToolbar();
  const prefix = range.cloneRange();
  prefix.selectNodeContents(stem);
  prefix.setEnd(range.startContainer, range.startOffset);
  const throughEnd = range.cloneRange();
  throughEnd.selectNodeContents(stem);
  throughEnd.setEnd(range.endContainer, range.endOffset);
  const start = prefix.toString().length;
  const end = throughEnd.toString().length;
  if (end <= start) return hideTextSelectionToolbar();
  const questionId = stem.closest('[data-question-card]')?.dataset.questionCard;
  if (!questionId) return hideTextSelectionToolbar();
  const answer = state.activityAnswers.get(questionId) || {};
  const overlaps = (answer.highlights || []).some(mark => start < mark.end && end > mark.start);
  pendingTextSelection = { questionId, start, end, text: selectedText, remove: overlaps };
  const toolbar = $('#textSelectionToolbar');
  const button = toolbar?.querySelector('button');
  if (!toolbar || !button) return;
  button.textContent = overlaps ? 'Remover grifo' : 'Grifar trecho';
  const rect = range.getBoundingClientRect();
  toolbar.style.left = `${Math.max(10, Math.min(window.innerWidth - 170, rect.left))}px`;
  toolbar.style.top = `${Math.max(10, Math.min(window.innerHeight - 52, rect.bottom + 8))}px`;
  toolbar.classList.remove('hidden');
}
async function toggleTextHighlight() {
  const selected = pendingTextSelection;
  if (!selected || !state.currentActivity) return;
  const question = questionById(selected.questionId);
  if (!question) return hideTextSelectionToolbar();
  const old = state.activityAnswers.get(selected.questionId) || { id: `${state.currentActivity.id}::${selected.questionId}`, activityId: state.currentActivity.id, questionId: selected.questionId, response: '' };
  const marks = [...(old.highlights || [])];
  const nextMarks = selected.remove
    ? marks.filter(mark => !(selected.start < mark.end && selected.end > mark.start))
    : [...marks, { start: selected.start, end: selected.end, text: selected.text }].sort((a,b) => a.start - b.start);
  const next = { ...old, highlights: nextMarks, updatedAt: nowISO() };
  await putRecord(state.db, 'answers', next);
  syncAnswerCache(next);
  const stem = $(`[data-statement-for="${CSS.escape(selected.questionId)}"]`);
  if (stem) { stem.innerHTML = richText(question.statement); applyTextMarks(stem, nextMarks); }
  hideTextSelectionToolbar();
  window.getSelection()?.removeAllRanges();
}
async function toggleEliminatedOption(questionId, option) {
  if (!state.currentActivity || state.currentActivity.status !== 'running') return;
  const old = state.activityAnswers.get(questionId) || { id: `${state.currentActivity.id}::${questionId}`, activityId: state.currentActivity.id, questionId, response: '' };
  const options = new Set(old.eliminatedOptions || []);
  if (options.has(option)) options.delete(option); else options.add(option);
  const next = { ...old, eliminatedOptions: [...options], updatedAt: nowISO() };
  await putRecord(state.db, 'answers', next);
  syncAnswerCache(next);
  const question = questionById(questionId);
  const container = $(`#options-q-${CSS.escape(questionId)}`);
  if (container && question) container.outerHTML = renderResponseOptions(question, next.response || '', next, state.currentActivity.config);
}

// Event delegation keeps the interface small and allows pages to be redrawn safely.
document.addEventListener('click', async event => {
  const areaChip = event.target.closest('[data-activity-area]');
  if (areaChip) { const value = areaChip.dataset.activityArea; state.activityFilters.areas = state.activityFilters.areas.includes(value) ? state.activityFilters.areas.filter(item => item !== value) : [...state.activityFilters.areas, value]; renderActivityBuilder(); return; }
  const subjectChip = event.target.closest('[data-activity-subject]');
  if (subjectChip) { const value = subjectChip.dataset.activitySubject; state.activityFilters.subjects = state.activityFilters.subjects.includes(value) ? state.activityFilters.subjects.filter(item => item !== value) : [...state.activityFilters.subjects, value]; renderActivityBuilder(); return; }
  const removeTopic = event.target.closest('[data-remove-activity-topic]');
  if (removeTopic) { const value = removeTopic.dataset.removeActivityTopic; state.activityFilters.topics = state.activityFilters.topics.filter(item => item !== value); renderActivityBuilder(); return; }
  if (!event.target.closest('#textSelectionToolbar') && !event.target.closest('.exam-stem')) hideTextSelectionToolbar();
  const pageButton = event.target.closest('[data-page]');
  if (pageButton) { event.preventDefault(); pageNavigate(pageButton.dataset.page); return; }
  const areaButton = event.target.closest('[data-filter-area]');
  if (areaButton) { pageNavigate('bank'); $('#filterArea').value = areaButton.dataset.filterArea; renderBank(); return; }
  const openQuestion = event.target.closest('[data-open-question]');
  if (openQuestion) { await openQuestionDetail(openQuestion.dataset.openQuestion); return; }
  const jump = event.target.closest('[data-jump]');
  if (jump) {
    const ids = state.currentActivity?.questionIds || [];
    const targetIndex = ids.indexOf(jump.dataset.jump);
    if (state.currentActivity?.config.navigationMode === 'sequential' && targetIndex > 0) {
      const previous = ids.slice(0,targetIndex).find(id=>!answerCount(id));
      if (previous) return toast('Responda às questões anteriores para seguir a navegação sequencial.');
    }
    document.getElementById(`exam-q-${CSS.escape(jump.dataset.jump)}`)?.scrollIntoView({behavior:'smooth',block:'start'}); return;
  }
  const reviewFilter = event.target.closest('[data-review-filter]');
  if (reviewFilter) { state.reviewFilter = reviewFilter.dataset.reviewFilter; renderReviews(); return; }
  const bankPageButton = event.target.closest('[data-bank-page]');
  if (bankPageButton) { state.bankPage = Number(bankPageButton.dataset.bankPage) || 1; renderBank(); return; }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  try {
    if (action === 'open-settings') showSettings();
    else if (action === 'open-import') openImportModal();
    else if (action === 'close-modal') closeModal();
    else if (action === 'analyze-import') await analyzeImport();
    else if (action === 'download-template') await downloadTemplate();
    else if (action === 'edit-import-question') editImportQuestion(actionButton.dataset.id);
    else if (action === 'remove-import-question') {
      state.importDraft.questions = state.importDraft.questions.filter(q=>q.id!==actionButton.dataset.id);
      state.importDraft.duplicates = state.importDraft.duplicates.filter(item=>item.incomingId!==actionButton.dataset.id);
      renderImportPreview();
    }
    else if (action === 'back-import-preview') { closeModal(); openImportModalShellForDraft(); renderImportPreview(); }
    else if (action === 'save-import-question') saveImportQuestion(actionButton.dataset.id);
    else if (action === 'commit-import') await commitImport();
    else if (action === 'create-activity-from-import') {
      const importedPackage = state.data.imports.find(item => item.id === actionButton.dataset.id);
      const ids = importedPackage ? importRecordQuestionIds(importedPackage) : [];
      if (!ids.length) toast('Nenhuma questão desse pacote está disponível no banco. Reimporte o pacote para continuar.');
      else {
        const title = `Pacote · ${importedPackage.packageName || importedPackage.fileName || 'Questões importadas'}`;
        await createActivityFromIds(ids, title);
      }
    }
    else if (action === 'favorite') { closeModal(); await toggleFavorite(actionButton.dataset.id); }
    else if (action === 'question-review') { closeModal(); await addReview(actionButton.dataset.id); }
    else if (action === 'edit-question') openEditQuestion(actionButton.dataset.id);
    else if (action === 'save-question-edit') await saveQuestionEdit(actionButton.dataset.id);
    else if (action === 'finish-activity') await finishActivity(false);
    else if (action === 'discard-activity') await discardCurrentActivity();
    else if (action === 'toggle-text-highlight') await toggleTextHighlight();
    else if (action === 'toggle-eliminated-option') await toggleEliminatedOption(actionButton.dataset.id, actionButton.dataset.option);
    else if (action === 'exit-activity') { pageNavigate('home'); toast('Atividade salva automaticamente. Volte à área Atividades para continuar.'); }
    else if (action === 'mark-review') await toggleReviewMark(actionButton.dataset.id);
    else if (action === 'new-activity') newActivityFromBuilder();
    else if (action === 'review-now') await createActivityFromIds([actionButton.dataset.id], 'Revisão de questão');
    else if (action === 'complete-review') { const review = state.data.reviews.find(r=>r.id===actionButton.dataset.id); if (review) { await putRecord(state.db,'reviews',{...review,status:'completed',completedAt:nowISO(),updatedAt:nowISO()}); await refreshData(); toast('Revisão concluída.'); } }
    else if (action === 'new-note') openNoteEditor();
    else if (action === 'edit-note') openNoteEditor(state.data.notes.find(note=>note.id===actionButton.dataset.id));
    else if (action === 'save-note') await saveNote(actionButton.dataset.id);
    else if (action === 'delete-note') { if (confirm('Excluir esta anotação?')) { await deleteRecord(state.db,'notes',actionButton.dataset.id); await refreshData(); } }
    else if (action === 'new-collection') openCollectionEditor();
    else if (action === 'save-collection') await saveCollection();
    else if (action === 'open-collection') openCollection(actionButton.dataset.id);
    else if (action === 'solve-collection') { const collection = state.data.collections.find(item=>item.id===actionButton.dataset.id); const ids = collection?.originalOrder?.length ? collection.originalOrder : (collection?.questionIds || []); closeModal(); await createActivityFromIds(ids, collection?.title || 'Prova importada'); }
    else if (action === 'add-to-collection') openAddToCollection(actionButton.dataset.id);
    else if (action === 'save-collection-questions') await saveCollectionQuestions(actionButton.dataset.id);
    else if (action === 'export-full') await downloadBackup('full');
    else if (action === 'export-incremental') await downloadBackup('incremental');
    else if (action === 'export-package') await exportQuestionPackage();
    else if (action === 'confirm-backup-checkpoint') await confirmBackupCheckpoint();
    else if (action === 'confirm-restore') await restoreBackup();
    else if (action === 'clear-database') await clearDatabase();
  } catch (error) { if (action === 'finish-activity') state.finishingActivityId = null; console.error(error); toast(error.message || 'A operação não pôde ser concluída.', 5500); }
});

document.addEventListener('change', async event => {
  const target = event.target;
  if (target.id === 'importJsonFile' || target.id === 'importZipFile') return;
  if (target.matches('[data-restore-conflict]')) { state.restoreChoices[target.dataset.restoreConflict] = target.value; return; }
  if (target.id === 'restoreMode') { renderRestoreConflicts(); return; }
  if (target.matches('[data-duplicate-choice]')) {
    const item = state.importDraft?.duplicates.find(d=>d.incomingId===target.dataset.duplicateChoice);
    if (item) { item.resolution = target.value; renderImportPreview(); }
    return;
  }
  if (target.matches('[data-confidence]')) { await setConfidence(target.dataset.confidence, target.value); return; }
  if (target.matches('[data-statement-index]')) {
    const card = target.closest('[data-question-card]'); if (card) await saveQuestionResponse(card.dataset.questionCard); return;
  }
  if (target.matches('input[name^="answer-"]')) {
    const card = target.closest('[data-question-card]'); if (card) await saveQuestionResponse(card.dataset.questionCard); return;
  }
  if (target.id === 'importMode' && state.importDraft) { state.importDraft.mode = target.value; return; }
  if (target.id === 'restoreFile' && target.files?.[0]) { await beginRestore(target.files[0]); target.value = ''; return; }
  if (target.id === 'filterArea') { state.bankPage=1; fillSubjectSelect($('#filterSubject'), target.value); renderBank(); }
  if (target.id === 'filterSubject' || target.id === 'filterDifficulty' || target.id === 'filterType' || target.id === 'onlyFavorites') { state.bankPage=1; renderBank(); }
  if (target.id === 'activityDifficulty' || target.id === 'includeSolved') renderActivityBuilder();
  if (target.id === 'timerEnabled') renderActivityBuilder();
  if (target.id === 'correctionMode') {
    const correctionAtEnd = target.value === 'end';
    $('#showErrors').disabled = correctionAtEnd;
    if (correctionAtEnd) $('#showErrors').checked = false;
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'bankSearch') { state.bankPage=1; renderBank(); }
});
document.addEventListener('keydown', event => {
  if (event.target.id === 'activityTopic' && event.key === 'Enter') { event.preventDefault(); addActivityTopic(event.target.value); }
});
document.addEventListener('pointerup', event => { if (!event.target.closest?.('#textSelectionToolbar')) setTimeout(updateTextSelectionToolbar, 0); });
document.addEventListener('touchend', event => { if (!event.target.closest?.('#textSelectionToolbar')) setTimeout(updateTextSelectionToolbar, 0); }, { passive: true });
document.addEventListener('mousedown', event => { if (event.target.closest?.('#textSelectionToolbar button')) event.preventDefault(); });

document.addEventListener('click', event => {
  if (event.target.closest('#addActivityTopic')) { addActivityTopic($('#activityTopic').value); return; }
  const selectionButton = event.target.closest('#textSelectionToolbar button');
  if (selectionButton) { event.preventDefault(); return; }
  const amount = event.target.closest('#questionAmount button');
  if (amount) {
    $$('#questionAmount button').forEach(button=>button.classList.toggle('selected',button===amount));
    $('#customAmountWrap').classList.toggle('hidden',amount.dataset.value!=='custom');
    return;
  }
  if (event.target.id === 'clearFilters') {
    state.bankPage=1; $('#bankSearch').value=''; $('#filterArea').value=''; fillSubjectSelect($('#filterSubject')); $('#filterSubject').value=''; $('#filterDifficulty').value=''; $('#filterType').value=''; $('#onlyFavorites').checked=false; renderBank();
  }
  if (event.target.id === 'createActivity') makeActivity();
  if (event.target.id === 'analyzeImport') analyzeImport();
  if (event.target.id === 'persistStorage') requestPersistentStorage();
});

async function initialize() {
  try {
    if (!('indexedDB' in window)) throw new Error('Este navegador não oferece IndexedDB, necessário para armazenar seu banco local.');
    state.db = await openDB();
    await refreshData();
    const running = state.data.activities.filter(item=>item.status==='running').sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt))[0];
    if (running) {
      state.currentActivity = running;
      await loadActivityAnswers(running.id);
    }
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(error=>console.warn('Service Worker não registrado:',error));
    }
  } catch (error) {
    console.error(error);
    openModal('Não foi possível iniciar o banco local', `<p>${escapeHTML(error.message)}</p><p class="fine-print">Abra o Grafia Questions por uma origem HTTPS (como GitHub Pages) ou localhost. Alguns navegadores não permitem armazenamento completo quando o HTML é aberto diretamente como arquivo.</p>`, '', 'INICIALIZAÇÃO');
  }
}

initialize();
