import { getAll } from './db.js';
import { readZip } from './zip.js';

const SUBJECT_AREA = {
  'Português': 'Linguagens', 'Literatura': 'Linguagens', 'Inglês': 'Linguagens', 'Espanhol': 'Linguagens', 'Artes': 'Linguagens', 'Educação Física': 'Linguagens',
  'História': 'Ciências Humanas', 'Geografia': 'Ciências Humanas', 'Filosofia': 'Ciências Humanas', 'Sociologia': 'Ciências Humanas',
  'Biologia': 'Ciências da Natureza', 'Química': 'Ciências da Natureza', 'Física': 'Ciências da Natureza', 'Matemática': 'Exatas'
};
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const str = value => typeof value === 'string' ? value.trim() : (value == null ? '' : String(value).trim());
const makeId = () => `q-${crypto.randomUUID()}`;
const toArray = value => Array.isArray(value) ? value : (value == null || value === '' ? [] : [value]);

export function normalizeSearch(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
}

function normalizeOptions(raw) {
  if (Array.isArray(raw)) return Object.fromEntries(raw.map((item, index) => [LETTERS[index] || `O${index + 1}`, typeof item === 'string' ? item : str(item.text ?? item.statement)]));
  if (raw && typeof raw === 'object') return Object.fromEntries(Object.entries(raw).map(([key, value]) => [String(key).toUpperCase(), typeof value === 'string' ? value : str(value?.text ?? value?.statement)]));
  return {};
}

function normalizeExplanationMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [String(key).toUpperCase(), str(typeof value === 'object' && value ? value.text ?? value.comment ?? value.explanation : value)]).filter(([, value]) => value));
}

function normalizeQuestion(raw, packageMeta = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Há um item de questão que não é um objeto válido.');
  const subject = str(raw.subject ?? raw.materia);
  const area = str(raw.area) || SUBJECT_AREA[subject] || '';
  const rawType = str(raw.type ?? raw.questionType ?? raw.tipo).toLowerCase();
  const type = ['true_false', 'verdadeiro_falso', 'vf'].includes(rawType) ? 'true_false'
    : ['assertion_set', 'multiple_assertions', 'afirmacoes', 'assercoes'].includes(rawType) ? 'assertion_set'
      : 'multiple_choice';
  const options = normalizeOptions(raw.alternatives ?? raw.options ?? raw.alternativas);
  const statements = Array.isArray(raw.statements ?? raw.assertions ?? raw.afirmacoes)
    ? (raw.statements ?? raw.assertions ?? raw.afirmacoes).map((item, index) => ({ id: str(item.id) || `S${index + 1}`, text: str(typeof item === 'string' ? item : item.text ?? item.statement), answer: str(item.answer ?? item.gabarito).toUpperCase() })) : [];
  let answer = raw.answer ?? raw.correctAnswer ?? raw.gabarito ?? raw.correct ?? '';
  if (type === 'assertion_set') {
    if (Array.isArray(answer)) answer = answer.map(value => String(value).trim().toUpperCase()[0] || '').join('');
    else if (answer && typeof answer === 'object') answer = statements.map((item, index) => String(answer[item.id] ?? answer[String(index + 1)] ?? answer[index] ?? '').trim().toUpperCase()[0] || '').join('');
    else answer = str(answer).toUpperCase().replace(/[\s,;]+/g, '');
  } else if (answer && typeof answer === 'object' && !Array.isArray(answer)) {
    answer = str(answer.value ?? answer.key ?? answer.answer ?? answer.gabarito).toUpperCase();
  } else answer = str(answer).toUpperCase();
  const imageRefs = raw.images ?? raw.imagens ?? raw.assets ?? [];
  const images = (Array.isArray(imageRefs) ? imageRefs : []).map((item, index) => ({
    assetId: str(item.id ?? item.assetId ?? item.asset_id) || `ASSET-${str(raw.id) || 'NOID'}-${index + 1}`,
    fileName: str(item.file ?? item.fileName ?? item.filename ?? item.path ?? item.arquivo),
    position: str(item.position ?? item.posicao) || 'statement',
    alt: str(item.alt ?? item.description ?? item.descricao),
    caption: str(item.caption ?? item.legenda),
    sourceUrl: str(item.sourceUrl ?? item.sourceURL ?? item.url ?? item.href),
    sourceLabel: str(item.sourceLabel ?? item.source_label ?? item.sourceTitle),
    kind: str(item.kind ?? item.tipo) || 'illustrative',
    essential: item.essential === true || item.essential === 'true' || item.essencial === true || str(item.kind ?? item.tipo).toLowerCase() === 'essential'
  }));
  const topic = str(raw.primaryTopic ?? raw.topic ?? raw.assuntoPrincipal ?? raw.assunto);
  const difficulty = str(raw.difficulty ?? raw.dificuldade);
  const tri = raw.triParameters ?? raw.tri ?? null;
  const classificationRaw = raw.classificationConfidence ?? raw.classification_confidence;
  const classificationConfidence = classificationRaw === undefined || classificationRaw === null || classificationRaw === '' ? null : Number(classificationRaw);
  const id = str(raw.id ?? raw.questionId) || makeId();
  return {
    id, area, subject, primaryTopic: topic, sourceQuestionNumber: raw.sourceQuestionNumber ?? raw.originalNumber ?? raw.numeroOriginal ?? null,
    secondaryTopics: toArray(raw.secondaryTopics ?? raw.assuntosSecundarios).map(str).filter(Boolean),
    relatedSubjects: toArray(raw.relatedSubjects ?? raw.interdisciplinarySubjects ?? raw.materiasRelacionadas).map(str).filter(Boolean),
    classificationConfidence: Number.isFinite(classificationConfidence) ? Math.max(0, Math.min(1, classificationConfidence)) : null,
    classificationNote: str(raw.classificationNote ?? raw.classification_note),
    subtopics: toArray(raw.subtopics ?? raw.subassuntos).map(str).filter(Boolean),
    prerequisites: toArray(raw.prerequisites ?? raw.knowledgePrerequisites ?? raw.conhecimentosNecessarios).map(str).filter(Boolean),
    skills: toArray(raw.skills ?? raw.habilidades).map(str).filter(Boolean),
    difficulty: ['Fácil', 'Média', 'Difícil'].includes(difficulty) ? difficulty : (difficulty ? difficulty[0].toUpperCase() + difficulty.slice(1).toLowerCase() : ''),
    type, statement: str(raw.statement ?? raw.stem ?? raw.enunciado ?? raw.question),
    alternatives: options, statements,
    answer,
    explanation: str(raw.explanation ?? raw.resolution ?? raw.resolucao ?? raw.resoluçãoComentada),
    alternativeExplanations: normalizeExplanationMap(raw.alternativeExplanations ?? raw.explanationsByAlternative ?? raw.comentariosAlternativas),
    tables: Array.isArray(raw.tables ?? raw.tabelas) ? (raw.tables ?? raw.tabelas).map(table => ({ title: str(table.title ?? table.titulo), caption: str(table.caption ?? table.legenda), headers: Array.isArray(table.headers ?? table.cabecalho) ? (table.headers ?? table.cabecalho).map(str) : [], rows: Array.isArray(table.rows ?? table.linhas) ? (table.rows ?? table.linhas).map(row => Array.isArray(row) ? row.map(str) : []) : [], position: str(table.position ?? table.posicao) || 'after_statement' })) : [],
    equations: Array.isArray(raw.equations ?? raw.formulas) ? (raw.equations ?? raw.formulas).map(item => ({ label: str(item.label ?? item.rotulo), expression: str(item.expression ?? item.latex ?? item.formula ?? item.expressao), position: str(item.position ?? item.posicao) || 'after_statement' })) : [],
    textBaseId: str(raw.textBaseId ?? raw.text_base_id ?? raw.textoBaseId),
    images,
    links: toArray(raw.links ?? raw.references ?? raw.referencias).map(item => typeof item === 'string' ? item : ({ url: str(item?.url ?? item?.href ?? item?.link), label: str(item?.label ?? item?.title ?? item?.name) })).filter(item => typeof item === 'string' ? item : item.url),
    sourceUrl: str(raw.sourceUrl ?? raw.sourceURL ?? raw.sourceLink ?? raw.referenceUrl),
    source: raw.source ?? raw.provenance ?? packageMeta.source ?? {},
    errorCategories: toArray(raw.errorCategories ?? raw.categoriasDeErro).map(str).filter(Boolean),
    triParameters: tri && typeof tri === 'object' ? { a: Number(tri.a), b: Number(tri.b), c: Number(tri.c) } : null,
    favorite: raw.favorite === true,
    createdAt: str(raw.createdAt) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    incomplete: false
  };
}

function questionSignature(question) {
  const opts = Object.entries(question.alternatives || {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${normalizeSearch(v)}`).join('|');
  const images = (question.images || []).map(image => image.assetId).sort().join('|');
  const statements = (question.statements || []).map(item => normalizeSearch(item.text)).join('|');
  return `${question.type}::${normalizeSearch(question.statement)}::${opts}::${statements}::${normalizeSearch(question.textBaseId)}::${images}`;
}

function questionCoreSignature(question) {
  const opts = Object.entries(question.alternatives || {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${normalizeSearch(v)}`).join('|');
  const statements = (question.statements || []).map(item => normalizeSearch(item.text)).join('|');
  return `${question.type}::${normalizeSearch(question.statement)}::${opts}::${statements}`;
}

async function sameBlobContent(left, right) {
  if (!left || !right || left.size !== right.size) return false;
  if (globalThis.crypto?.subtle?.digest) {
    const digest = async blob => new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
    const [a, b] = await Promise.all([digest(left), digest(right)]);
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }
  // Fallback for older secure-context implementations without SubtleCrypto.
  const [a, b] = await Promise.all([left.arrayBuffer(), right.arrayBuffer()]);
  if (a.byteLength !== b.byteLength) return false;
  const aa = new Uint8Array(a); const bb = new Uint8Array(b);
  for (let index = 0; index < aa.length; index++) if (aa[index] !== bb[index]) return false;
  return true;
}

async function detectImageMime(blob) {
  if (!blob || typeof blob.slice !== 'function') return '';
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const starts = (...values) => values.every((value, index) => bytes[index] === value);
  if (starts(0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A)) return 'image/png';
  if (starts(0xFF,0xD8,0xFF)) return 'image/jpeg';
  if (starts(0x47,0x49,0x46,0x38,0x37,0x61) || starts(0x47,0x49,0x46,0x38,0x39,0x61)) return 'image/gif';
  if (starts(0x52,0x49,0x46,0x46) && bytes[8]===0x57 && bytes[9]===0x45 && bytes[10]===0x42 && bytes[11]===0x50) return 'image/webp';
  const text = (await blob.slice(0, 4096).text()).replace(/^\uFEFF/, '').trimStart();
  if (/<svg[\s>]/i.test(text) || (/^<\?xml[\s>]/i.test(text) && /<svg[\s>]/i.test(text))) return 'image/svg+xml';
  return '';
}

function validateQuestion(question, index, textBaseIds, assetMap, invalidAssetIds = new Set()) {
  const issues = [];
  const validAreas = new Set(['Linguagens', 'Ciências Humanas', 'Ciências da Natureza', 'Exatas']);
  if (!question.area) issues.push('Área de conhecimento não identificada.');
  else if (!validAreas.has(question.area)) issues.push(`Área não reconhecida: ${question.area}.`);
  if (!question.subject) issues.push('Matéria não identificada.');
  else if (!SUBJECT_AREA[question.subject]) issues.push(`Matéria não reconhecida: ${question.subject}.`);
  else if (question.area && SUBJECT_AREA[question.subject] !== question.area) issues.push(`A matéria ${question.subject} pertence à área ${SUBJECT_AREA[question.subject]}, não a ${question.area}.`);
  if (!question.primaryTopic) issues.push('Assunto principal não informado.');
  if (!question.statement) issues.push('Enunciado vazio.');
  if (!question.answer || (typeof question.answer === 'string' && !question.answer.trim())) issues.push('Gabarito não informado.');
  if (question.type === 'multiple_choice') {
    const keys = Object.keys(question.alternatives);
    if (keys.length < 2) issues.push('A questão precisa de pelo menos duas alternativas.');
    if (typeof question.answer !== 'string') issues.push('O gabarito de múltipla escolha precisa ser uma letra de alternativa.');
    else if (keys.length && !keys.includes(question.answer)) issues.push('O gabarito não corresponde às alternativas.');
  }
  if (question.type === 'assertion_set') {
    if (question.statements.length < 2) issues.push('A questão de múltiplas afirmações precisa conter pelo menos duas afirmações.');
    const expected = Array.isArray(question.answer) ? question.answer.join('') : (typeof question.answer === 'object' && question.answer ? Object.values(question.answer).join('') : String(question.answer || ''));
    if (!/^[VF]+$/i.test(expected) || expected.length !== question.statements.length) issues.push('O gabarito das afirmações precisa informar V/F para cada afirmação.');
  }
  if (question.type === 'true_false' && !['V','F','TRUE','FALSE','VERDADEIRO','FALSO'].includes(String(question.answer).toUpperCase())) issues.push('O gabarito de verdadeiro ou falso precisa ser V ou F.');
  if (question.textBaseId && !textBaseIds.has(question.textBaseId)) issues.push(`Texto-base ${question.textBaseId} não encontrado no pacote.`);
  for (const image of question.images) {
    if (invalidAssetIds.has(image.assetId)) issues.push(`O arquivo vinculado à imagem ${image.assetId} não é uma imagem compatível ou está corrompido.`);
    else if (!image.fileName && !assetMap.has(image.assetId)) issues.push(`A imagem ${image.assetId} não possui arquivo identificado.`);
    else if (!assetMap.has(image.assetId)) issues.push(`Arquivo de imagem ausente: ${image.fileName || image.assetId}.`);
  }
  question.incomplete = issues.length > 0;
  question.importIssues = issues;
  question._importIndex = index;
  return issues;
}

function findAssetFile(files, ref) {
  if (!files?.size) return null;
  const requested = String(ref.fileName || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (requested && files.has(requested)) return { path: requested, blob: files.get(requested) };
  const basename = requested.split('/').pop();
  const byBasename = basename ? [...files.entries()].filter(([path]) => path.split('/').pop() === basename) : [];
  if (byBasename.length > 1) throw new Error(`Há mais de um arquivo chamado "${basename}" no ZIP. Use caminhos completos e únicos nas referências das imagens.`);
  if (byBasename.length === 1) return { path: byBasename[0][0], blob: byBasename[0][1] };
  const byAssetId = [...files.entries()].filter(([path]) => path.split('/').pop().startsWith(`${ref.assetId}.`));
  if (byAssetId.length > 1) throw new Error(`Há mais de um arquivo associado ao identificador de imagem ${ref.assetId}. Informe o caminho completo no JSON.`);
  if (byAssetId.length === 1) return { path: byAssetId[0][0], blob: byAssetId[0][1] };
  return null;
}

export async function prepareQuestionImport(db, jsonFile, zipFile = null) {
  if (Number(jsonFile?.size || 0) > 100 * 1024 * 1024) throw new Error('O JSON ultrapassa o limite de 100 MB. Divida o pacote em lotes menores.');
  const rawText = await jsonFile.text();
  let pkg;
  try { pkg = JSON.parse(rawText); } catch { throw new Error('O arquivo de questões não contém JSON válido.'); }
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new Error('A estrutura do arquivo precisa ser um objeto JSON.');
  if (!['1.0', '1.0.0'].includes(String(pkg.schemaVersion ?? pkg.schema_version ?? ''))) throw new Error('Versão de pacote não suportada. Use schemaVersion "1.0.0".');
  if (!str(pkg.packageId ?? pkg.package_id)) throw new Error('O pacote precisa de um packageId estável para permitir identificação e retomada da importação.');
  if (!Array.isArray(pkg.questions)) throw new Error('O pacote precisa conter uma lista "questions".');
  if (pkg.questions.length === 0) throw new Error('O pacote não contém questões. Adicione pelo menos uma questão antes de importar.');
  if (pkg.questions.length > 100000) throw new Error('O pacote excede o limite de 100.000 questões por arquivo. Divida em lotes menores.');
  const packageMeta = { source: pkg.source ?? pkg.provenance ?? {} };
  const supportedTypes = new Set(['multiple_choice','multiple-choice','mcq','multipla_escolha','múltipla escolha','true_false','verdadeiro_falso','vf','assertion_set','multiple_assertions','afirmacoes','assercoes']);
  const unsupported = pkg.questions.find(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
    const type = str(raw.type ?? raw.questionType ?? raw.tipo).toLowerCase();
    return type && !supportedTypes.has(type);
  });
  pkg.questions.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`A questão na posição ${index + 1} não é um objeto válido.`);
    if (!str(raw.id ?? raw.questionId)) throw new Error(`A questão na posição ${index + 1} não possui um ID estável. Cada questão precisa de um identificador único para evitar cópias ou substituições indevidas.`);
    const listFields = [
      ['images', raw.images ?? raw.imagens ?? raw.assets, false],
      ['statements', raw.statements ?? raw.assertions ?? raw.afirmacoes, true],
      ['tables', raw.tables ?? raw.tabelas, false],
      ['equations', raw.equations ?? raw.formulas, false]
    ];
    for (const [field, value, allowText] of listFields) {
      if (value == null) continue;
      if (!Array.isArray(value)) throw new Error(`O campo ${field} da questão ${str(raw.id) || index + 1} precisa ser uma lista.`);
      if (value.some(item => allowText ? (item == null || !['string','object'].includes(typeof item) || Array.isArray(item)) : (!item || typeof item !== 'object' || Array.isArray(item)))) {
        throw new Error(`O campo ${field} da questão ${str(raw.id) || index + 1} contém um item inválido.`);
      }
    }
  });
  if (unsupported) {
    const type = str(unsupported.type ?? unsupported.questionType ?? unsupported.tipo);
    throw new Error(`O pacote contém o tipo de questão "${type}" (ID ${str(unsupported.id) || 'sem ID'}), que não é aceito nesta versão. Questões discursivas não são convertidas automaticamente.`);
  }
  const questions = pkg.questions.map(raw => normalizeQuestion(raw, packageMeta));
  const seenIds = new Set();
  for (const q of questions) {
    if (seenIds.has(q.id)) throw new Error(`O identificador ${q.id} aparece mais de uma vez no pacote.`);
    seenIds.add(q.id);
  }
  const textBasesRaw = pkg.textBases ?? pkg.text_bases ?? pkg.textosBase ?? [];
  if (!Array.isArray(textBasesRaw)) throw new Error('A lista textBases precisa ser um array.');
  if (textBasesRaw.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('Há um texto-base que não está em um formato de objeto válido.');
  const textBases = textBasesRaw.map(item => ({ id: str(item.id), title: str(item.title ?? item.titulo), content: str(item.content ?? item.text ?? item.conteudo), source: item.source ?? {}, updatedAt: new Date().toISOString() }));
  const textBaseIds = new Set(textBases.map(item => item.id));
  if (textBases.some(item => !item.id || !item.content)) throw new Error('Há um texto-base sem identificador ou conteúdo.');
  if (textBaseIds.size !== textBases.length) throw new Error('Há identificadores repetidos na lista de textos-base do pacote.');
  const existingTextBases = await getAll(db, 'textBases');
  const existingTextBaseMap = new Map(existingTextBases.map(item => [item.id, item]));
  for (const item of textBases) {
    const existing = existingTextBaseMap.get(item.id);
    if (existing && (normalizeSearch(existing.content) !== normalizeSearch(item.content) || normalizeSearch(existing.title) !== normalizeSearch(item.title))) {
      throw new Error(`O texto-base ${item.id} já existe com conteúdo diferente. Use outro ID ou resolva o conflito antes de importar, para evitar sobrescrever o texto existente.`);
    }
  }
  for (const item of existingTextBases) textBaseIds.add(item.id);
  const textBasesToWrite = textBases.filter(item => !existingTextBaseMap.has(item.id));

  let zipFiles = new Map();
  if (zipFile) zipFiles = await readZip(zipFile);
  const assets = [];
  const assetBlobs = [];
  const assetMap = new Map();
  const invalidAssetIds = new Set();
  const usedZipPaths = new Set();
  const storedAssets = await getAll(db, 'assets');
  const storedAssetBlobs = await getAll(db, 'assetBlobs');
  const storedAssetMap = new Map(storedAssets.map(asset => [asset.id, asset]));
  const storedBlobMap = new Map(storedAssetBlobs.map(asset => [asset.id, asset]));
  for (const q of questions) {
    for (const ref of q.images) {
      if (assetMap.has(ref.assetId)) continue;
      const zipMatch = findAssetFile(zipFiles, ref);
      const incomingBlob = zipMatch?.blob || null;
      if (zipMatch) usedZipPaths.add(zipMatch.path);
      const storedMeta = storedAssetMap.get(ref.assetId);
      const storedBlob = storedBlobMap.get(ref.assetId);
      if (incomingBlob && storedBlob?.blob && !(await sameBlobContent(incomingBlob, storedBlob.blob))) {
        throw new Error(`O identificador de imagem ${ref.assetId} já existe no banco com outro conteúdo. Use um novo assetId para não substituir imagens usadas por questões existentes.`);
      }
      const blob = incomingBlob || storedBlob?.blob || null;
      if (blob) {
        const mimeType = await detectImageMime(blob);
        if (!mimeType) { invalidAssetIds.add(ref.assetId); continue; }
        const ext = (ref.fileName.split('.').pop() || '').toLowerCase();
        const preferredExt = ({ 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp', 'image/gif':'gif', 'image/svg+xml':'svg' })[mimeType] || ext;
        const asset = { id: ref.assetId, fileName: ref.fileName.split('/').pop() || storedMeta?.fileName || `${ref.assetId}.${preferredExt}`, mimeType, size: blob?.size ?? storedMeta?.size ?? 0, updatedAt: new Date().toISOString() };
        if (!storedMeta || incomingBlob) assets.push(asset);
        if (incomingBlob) assetBlobs.push({ id: ref.assetId, blob: incomingBlob.slice(0, incomingBlob.size, mimeType), type: mimeType, updatedAt: new Date().toISOString() });
        assetMap.set(ref.assetId, asset);
      }
    }
  }
  const extraZipFiles = [...zipFiles.keys()].filter(path => !usedZipPaths.has(path));
  if (extraZipFiles.length) {
    const preview = extraZipFiles.slice(0, 8).join(', ');
    throw new Error(`O ZIP contém ${extraZipFiles.length} arquivo(s) que não são referenciados por nenhuma imagem do JSON: ${preview}${extraZipFiles.length > 8 ? ', …' : ''}. Remova os arquivos extras ou vincule-os a uma questão.`);
  }

  const incomplete = [];
  questions.forEach((question, index) => {
    const issues = validateQuestion(question, index, textBaseIds, assetMap, invalidAssetIds);
    if (issues.length) incomplete.push({ id: question.id, subject: question.subject, index, issues });
  });

  const currentQuestions = await getAll(db, 'questions');
  const currentAliases = await getAll(db, 'aliases');
  const aliasMap = new Map(currentAliases.map(item => [item.alias, item.questionId]));
  const currentById = new Map(currentQuestions.map(item => [item.id, item]));
  const signatureMap = new Map();
  for (const existing of currentQuestions) if (existing.statement) signatureMap.set(questionSignature(existing), existing);
  const duplicates = [];
  for (const question of questions) {
    const aliasTarget = aliasMap.get(question.id);
    const directMatch = currentById.get(aliasTarget || question.id);
    if (directMatch && questionCoreSignature(directMatch) !== questionCoreSignature(question)) {
      throw new Error(`O ID ${question.id} já existe no banco, mas o enunciado ou as alternativas são diferentes. Para evitar mesclar questões distintas, gere um ID globalmente único para esta questão e tente novamente.`);
    }
    const match = directMatch || (question.statement ? signatureMap.get(questionSignature(question)) : null);
    if (match) {
      const conflict = match.answer && question.answer && JSON.stringify(match.answer) !== JSON.stringify(question.answer);
      duplicates.push({ incomingId: question.id, existingId: match.id, conflict: Boolean(conflict), incoming: question, existing: match, resolution: conflict ? 'unresolved' : 'enrich' });
    }
  }
  const sourceExam = pkg.sourceExam ?? pkg.exam ?? pkg.prova ?? null;
  return {
    packageId: str(pkg.packageId ?? pkg.package_id) || crypto.randomUUID(),
    packageName: str(pkg.packageName ?? pkg.name ?? pkg.nome) || jsonFile.name,
    schemaVersion: String(pkg.schemaVersion),
    questions, textBases: textBasesToWrite, assets, assetBlobs, incomplete, duplicates, sourceExam,
    filesFound: zipFiles.size,
    invalidAssetIds: [...invalidAssetIds],
    fileName: jsonFile.name,
    imageFileName: zipFile?.name || '',
    packageSource: packageMeta.source,
    totalQuestions: questions.length
  };
}

export function mergeQuestion(existing, incoming) {
  const merged = { ...existing };
  const scalarFields = ['area', 'subject', 'primaryTopic', 'difficulty', 'statement', 'explanation', 'textBaseId'];
  for (const field of scalarFields) if (!merged[field] && incoming[field]) merged[field] = incoming[field];
  for (const field of ['secondaryTopics', 'relatedSubjects', 'subtopics', 'prerequisites', 'skills', 'errorCategories']) merged[field] = [...new Set([...(merged[field] || []), ...(incoming[field] || [])])];
  merged.alternatives = { ...(existing.alternatives || {}) };
  for (const [key, value] of Object.entries(incoming.alternatives || {})) if (!merged.alternatives[key]) merged.alternatives[key] = value;
  merged.alternativeExplanations = { ...(existing.alternativeExplanations || {}) };
  for (const [key, value] of Object.entries(incoming.alternativeExplanations || {})) if (!merged.alternativeExplanations[key]) merged.alternativeExplanations[key] = value;
  const imageMap = new Map((existing.images || []).map(image => [image.assetId, { ...image }]));
  for (const image of (incoming.images || [])) {
    const previous = imageMap.get(image.assetId) || {};
    imageMap.set(image.assetId, {
      ...previous, ...image,
      alt: image.alt || previous.alt || '',
      caption: image.caption || previous.caption || '',
      sourceUrl: image.sourceUrl || previous.sourceUrl || '',
      sourceLabel: image.sourceLabel || previous.sourceLabel || '',
      fileName: image.fileName || previous.fileName || ''
    });
  }
  merged.images = [...imageMap.values()];
  for (const field of ['tables', 'equations']) {
    const keyFn = item => JSON.stringify(item);
    merged[field] = [...new Map([...(existing[field] || []), ...(incoming[field] || [])].map(item => [keyFn(item), item])).values()];
  }
  if (!merged.answer && incoming.answer) merged.answer = incoming.answer;
  if (!merged.triParameters && incoming.triParameters) merged.triParameters = incoming.triParameters;
  if (incoming.sourceQuestionNumber != null && merged.sourceQuestionNumber == null) merged.sourceQuestionNumber = incoming.sourceQuestionNumber;
  if (incoming.classificationConfidence != null && (merged.classificationConfidence == null || incoming.classificationConfidence > merged.classificationConfidence)) {
    merged.classificationConfidence = incoming.classificationConfidence;
    if (incoming.classificationNote) merged.classificationNote = incoming.classificationNote;
  } else if (!merged.classificationNote && incoming.classificationNote) merged.classificationNote = incoming.classificationNote;
  if (incoming.explanation && incoming.explanation.length > String(merged.explanation || '').length) merged.explanation = incoming.explanation;
  merged.alternatives = Object.fromEntries(Object.entries(merged.alternatives).map(([key, value]) => [key, incoming.alternatives?.[key] && incoming.alternatives[key].length > String(value || '').length ? incoming.alternatives[key] : value]));
  merged.alternativeExplanations = Object.fromEntries(Object.entries(merged.alternativeExplanations).map(([key, value]) => [key, incoming.alternativeExplanations?.[key] && incoming.alternativeExplanations[key].length > String(value || '').length ? incoming.alternativeExplanations[key] : value]));
  if (existing.source || incoming.source) {
    const existingSource = typeof existing.source === 'string' ? { url: existing.source } : (existing.source && typeof existing.source === 'object' && !Array.isArray(existing.source) ? existing.source : {});
    const incomingSource = typeof incoming.source === 'string' ? { url: incoming.source } : (incoming.source && typeof incoming.source === 'object' && !Array.isArray(incoming.source) ? incoming.source : {});
    merged.source = { ...existingSource, ...incomingSource };
  }
  merged.links = [...new Map([...(existing.links || []), ...(incoming.links || [])].map(item => [JSON.stringify(item), item])).values()];
  if (!merged.sourceUrl && incoming.sourceUrl) merged.sourceUrl = incoming.sourceUrl;
  merged.updatedAt = new Date().toISOString();
  const sourceHistory = [...(existing.sourceHistory || [existing.source || {}]), ...(incoming.sourceHistory || [incoming.source || {}])];
  merged.sourceHistory = [...new Map(sourceHistory.map(item => [JSON.stringify(item), item])).values()];
  return merged;
}
