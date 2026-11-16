import { openDB, getAll, getAllStoresSnapshot, getChangesSnapshot, getOne, putRecord, deleteRecord, deleteRecords, writeBatch, replaceAllData, mergeAllData, getSetting, setSetting, countAll } from './db.js';
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
const BANK_PAGE_SIZE = 30;
let sortedQuestionsSource = null;
let sortedQuestionsCache = [];
let activityTopicCache = { questions: null, topics: null, items: [], counts: new Map() };
let bankSearchTimer = null;
let questionMapSource = null;
let questionByIdMap = new Map();
let textBaseMapSource = null;
let textBaseByIdMap = new Map();
let answerMapSource = null;
let answerByIdMap = new Map();
let assetImageObserver = null;
const assetLoadPromises = new Map();
const questionSearchCache = new WeakMap();
const SUBJECTS = {
  'Linguagens': ['Português', 'Literatura', 'Inglês', 'Espanhol', 'Artes', 'Educação Física'],
  'Ciências Humanas': ['História', 'Geografia', 'Filosofia', 'Sociologia'],
  'Ciências da Natureza': ['Biologia', 'Química', 'Física'],
  'Exatas': ['Matemática']
};
const TOPIC_CATALOG = {"Matemática":["Matemática Básica","Razão e Proporção","Porcentagem","Escala","Interpretação de Gráficos e Tabelas","Estatística","Média, Moda e Mediana","Função do 1º Grau","Função do 2º Grau","Geometria Plana","Geometria Espacial","Matemática Financeira","Probabilidade","Análise Combinatória","Trigonometria"],"Linguagens":["Interpretação de Texto","Gêneros Literários e Textuais","Estratégias Argumentativas","Variedades Linguísticas","Funções da Linguagem","Escolas Literárias","Linguagem Digital"],"Biologia":["Ecologia","Biomas","Fisiologia Humana","Metabolismo Energético","Citologia","Genética e Biotecnologia","Parasitologia","Bioquímica"],"Química":["Estudo da Matéria","Estrutura Atômica","Tabela Periódica","Funções Inorgânicas","Estequiometria","Solubilidade","Termoquímica","Cinética","Equilíbrio Químico","Eletroquímica","Química Orgânica","Isomeria","Reações Orgânicas","Química Ambiental","Separação de Misturas"],"Física":["Unidades de Medida","Movimento e Lançamentos","Dinâmica e Leis de Newton","Hidrostática","Trabalho e Energia","Termologia","Óptica Geométrica","Ondas","Eletrostática","Eletrodinâmica"],"Geografia":["Agricultura","Geografia Urbana","Geografia Populacional","Globalização","Cartografia","Estrutura da Terra","Fontes de Energia","Questão Ambiental","Atualidades"],"História do Brasil":["Expansão Mercantil","Grandes Navegações","Sistema Colonial","Expansão Territorial","Economia Mineradora","Processo de Independência","Segundo Reinado","República Oligárquica","Era Vargas","Regime Militar","Brasil Atual"],"História Geral":["Grécia Antiga","Civilização Romana","Sistema Feudal","Baixa Idade Média","Renascimento e Mercantilismo","Absolutismo e Revolução Industrial","Iluminismo e Independência dos EUA","Revolução Francesa","Era Napoleônica e Neocolonialismo","1ª e 2ª Guerra Mundial","Guerra Fria"],"Filosofia":["Escola Helenística","Escola Sofística","Aristóteles, Sócrates e Platão","Racionalismo Moderno","Kant e Nietzsche","Filosofia Medieval e Moderna"],"Sociologia":["Cidadania, Cultura e Educação","Política, Poder e Estado","Capitalismo","Economia e Sociedade","Indústria Cultural","Max Weber","Sociologia Contemporânea","O Mundo Globalizado"]};
const TOPIC_SUBJECTS = {
  'Matemática': ['Matemática'], 'Linguagens': ['Português','Literatura','Inglês','Espanhol','Artes','Educação Física'],
  'Biologia': ['Biologia'], 'Química': ['Química'], 'Física': ['Física'], 'Geografia': ['Geografia'],
  'História do Brasil': ['História'], 'História Geral': ['História'], 'Filosofia': ['Filosofia'], 'Sociologia': ['Sociologia']
};
const SUBJECT_AREAS = Object.fromEntries(Object.entries(SUBJECTS).flatMap(([area, subjects]) => subjects.map(subject => [subject, area])));
const state = {
  db: null, data: {}, page: 'home', importDraft: null, currentActivity: null,
  activityAnswers: new Map(), activityTimer: null, activityStart: null,
  reviewFilter: 'due', assetUrls: new Map(), restoreDraft: null, restoreConflicts: [], restoreChoices: {}, bankPage: 1, pendingBackup: null, finishingActivityId: null,
  bankTab: 'questions', performancePeriod: 'all', performanceArea: '', performanceSubject: '', performanceTopic: '', importTaskDraft: null, selectedPackageKeys: new Set(),
  activityFilters: { areas: [], subjects: [], topics: [] },
  activityTopicPickerOpen: false, activityTopicSearch: '', longPressTimer: null, longPressFiredAt: 0, longPressPointerId: null
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
    const label = markdownLabel ? escapeHTML(markdownLabel) : escapeHTML(host || 'referência');
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
  return `<a class="question-reference-link" href="${safeAttr(href)}" target="_blank" rel="noopener noreferrer" title="${safeAttr(label)} · ${safeAttr(href)}" aria-label="Abrir ${safeAttr(label)} (${safeAttr(host || 'referência')})"><span class="reference-link-icon" aria-hidden="true">↗</span><span class="reference-link-copy"><b>${escapeHTML(host || 'referência externa')}</b></span></a>`;
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
  unobserveAssetImages($('#modalBody'));
  $('#modalBody').innerHTML = '';
  $('#modalFooter').innerHTML = '';
}

async function refreshData(render = true) {
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
  // The activity picker only exposes the fixed 100-topic catalog and topics
  // deliberately saved by the user. Legacy question-derived entries are purged.
  const savedTopics = state.data.topics.filter(isCustomTopic);
  const obsoleteTopicIds = state.data.topics.filter(topic => !isCustomTopic(topic)).map(topic => topic.id);
  if (obsoleteTopicIds.length) await deleteRecords(state.db, 'topics', obsoleteTopicIds);
  state.data.topics = savedTopics;
  activityTopicCache = { questions: null, topics: null, items: [], counts: new Map() };
  if (render) renderAll();
}
function questionById(id) {
  if (questionMapSource !== state.data.questions) {
    questionMapSource = state.data.questions;
    questionByIdMap = new Map(questionMapSource.map(question => [question.id, question]));
  }
  return questionByIdMap.get(id);
}
function textBaseById(id) {
  if (textBaseMapSource !== state.data.textBases) {
    textBaseMapSource = state.data.textBases;
    textBaseByIdMap = new Map(textBaseMapSource.map(item => [item.id, item]));
  }
  return textBaseByIdMap.get(id);
}
function questionTextBaseIds(question) {
  return [...new Set([question?.textBaseId, ...(Array.isArray(question?.textBaseIds) ? question.textBaseIds : [])].filter(Boolean).map(String))];
}
function questionDisplayNumber(question, activityIndex = 0) {
  const original = String(question?.sourceQuestionNumber ?? '').trim();
  return original || String(activityIndex + 1).padStart(2, '0');
}
function textBaseUsageMap(questionIds = state.data.questions.map(question => question.id)) {
  const usage = new Map();
  for (const id of questionIds) {
    const question = questionById(id);
    if (!question) continue;
    for (const textBaseId of questionTextBaseIds(question)) {
      if (!usage.has(textBaseId)) usage.set(textBaseId, []);
      usage.get(textBaseId).push(question.id);
    }
  }
  return usage;
}
function sharedTextBaseIds(questionIds = state.data.questions.map(question => question.id)) {
  return new Set([...textBaseUsageMap(questionIds)].filter(([, ids]) => ids.length > 1).map(([id]) => id));
}
function splitQuestionCommand(statement) {
  const text = String(statement || '').trim();
  const commandStart = /^(?:Assinale|Marque|Indique|Identifique|Determine|Calcule|Selecione|Considere|Analise|Avalie|Explique|Com base|De acordo|A partir|Tendo em vista|É correto afirmar|Pode-se afirmar|A alternativa que|O trecho que|A opção que|Em relação|Sobre o texto|No contexto)\b/i;
  if (commandStart.test(text)) return { context: '', command: text };
  const commandPattern = /(?:^|\n+|(?<=[.!?])\s+)(?=(?:Assinale|Marque|Indique|Identifique|Determine|Calcule|Selecione|Considere|Analise|Avalie|Explique|Com base|De acordo|A partir|Tendo em vista|É correto afirmar|Pode-se afirmar|A alternativa que|O trecho que|A opção que|Em relação|Sobre o texto|No contexto)\b)/gi;
  let match, last = null;
  while ((match = commandPattern.exec(text)) !== null) {
    const offset = match.index + match[0].length;
    if (offset > 0 && offset < text.length - 12) last = offset;
  }
  if (last == null) return { context: text, command: '' };
  const context = text.slice(0, last);
  const command = text.slice(last);
  return command.trim().length >= 12 ? { context, command } : { context: text, command: '' };
}
function renderQuestionStem(statement, questionId = '') {
  const parts = splitQuestionCommand(statement);
  if (!parts.command) return `<div class="exam-statement-root" data-statement-for="${safeAttr(questionId)}"><div class="exam-stem">${richText(statement)}</div></div>`;
  return `<div class="exam-statement-root" data-statement-for="${safeAttr(questionId)}">${parts.context ? `<div class="exam-stem">${richText(parts.context)}</div>` : ''}<div class="exam-command">${richText(parts.command)}</div></div>`;
}
function responseNavigationLabel(question, answer) {
  if (!answer?.response || !responseIsComplete(question, answer.response)) return '';
  const response = String(answer.response).toUpperCase();
  return response.length <= 3 ? response : `${response.slice(0, 2)}…`;
}
function answerById(id) {
  if (answerMapSource !== state.data.answers) {
    answerMapSource = state.data.answers;
    answerByIdMap = new Map(answerMapSource.map(answer => [answer.id, answer]));
  }
  return answerByIdMap.get(id);
}
function sortedQuestions() {
  if (sortedQuestionsSource !== state.data.questions) {
    sortedQuestionsSource = state.data.questions;
    sortedQuestionsCache = [...state.data.questions].sort((a, b) => (a.subject || '').localeCompare(b.subject || '') || (a.primaryTopic || '').localeCompare(b.primaryTopic || '') || a.id.localeCompare(b.onst t