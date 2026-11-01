const encoder = new TextEncoder();
const decoder = new TextDecoder();
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function safePath(path) {
  const value = String(path).replace(/\\/g, '/');
  if (!value || value.startsWith('/') || /^[a-zA-Z]:/.test(value) || value.includes('\0')) {
    throw new Error('O ZIP contém um caminho de arquivo inválido.');
  }
  const parts = value.split('/');
  if (parts.some(part => part === '..')) throw new Error('O ZIP contém um caminho que tenta sair da pasta de imagens.');
  return parts.filter(part => part && part !== '.').join('/');
}

const ZIP_LIMITS = Object.freeze({
  archiveBytes: 512 * 1024 * 1024,
  entries: 20000,
  singleFileBytes: 100 * 1024 * 1024,
  totalUncompressedBytes: 512 * 1024 * 1024
});

async function inflateRaw(bytes, maxBytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não oferece suporte à descompactação ZIP necessária. Atualize o navegador.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('Limite de descompactação excedido.');
        throw new Error('O conteúdo descompactado excedeu o tamanho declarado no ZIP ou o limite de segurança.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

export async function readZip(fileOrBlob) {
  if (!fileOrBlob || typeof fileOrBlob.arrayBuffer !== 'function') throw new Error('Arquivo ZIP inválido.');
  if (Number(fileOrBlob.size || 0) > ZIP_LIMITS.archiveBytes) throw new Error('O ZIP ultrapassa o limite de 512 MB desta versão.');
  const bytes = new Uint8Array(await fileOrBlob.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const min = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= min; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('O arquivo selecionado não parece ser um ZIP válido.');
  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (entryCount === 0xFFFF || centralOffset === 0xFFFFFFFF || centralSize === 0xFFFFFFFF) throw new Error('ZIPs com extensões ZIP64 ainda não são aceitos nesta versão.');
  if (entryCount > ZIP_LIMITS.entries) throw new Error('O ZIP contém arquivos demais. O limite desta versão é 20.000 entradas.');
  if (centralOffset + centralSize > eocd || centralOffset + centralSize > bytes.length) throw new Error('Índice interno do ZIP está incompleto ou fora dos limites.');
  const files = new Map();
  let totalUncompressed = 0;
  let cursor = centralOffset;
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Índice de arquivos do ZIP inválido.');
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (recordEnd > centralOffset + centralSize) throw new Error('Registro de arquivo ZIP truncado.');
    const nameBytes = bytes.slice(cursor + 46, cursor + 46 + nameLength);
    const rawName = decoder.decode(nameBytes);
    const isDirectory = rawName.endsWith('/');
    const name = safePath(rawName);
    cursor = recordEnd;
    if (!name || isDirectory) continue;
    if (flags & 0x1) throw new Error(`O arquivo ${name} está criptografado. Envie um ZIP sem senha.`);
    if (flags & 0x40) throw new Error(`O arquivo ${name} usa criptografia forte, que não é aceita nesta versão.`);
    if (uncompressedSize > ZIP_LIMITS.singleFileBytes) throw new Error(`O arquivo ${name} ultrapassa o limite individual de 100 MB.`);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > ZIP_LIMITS.totalUncompressedBytes) throw new Error('O conteúdo descompactado ultrapassa o limite total de 512 MB.');
    if (localOffset + 30 > centralOffset || localOffset + 30 > bytes.length) throw new Error(`Cabeçalho local inválido no arquivo ${name}.`);
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`Cabeçalho local inválido no arquivo ${name}.`);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const localHeaderEnd = localOffset + 30 + localNameLength + localExtraLength;
    if (localHeaderEnd > centralOffset) throw new Error(`Cabeçalho local incompleto no arquivo ${name}.`);
    const localName = decoder.decode(bytes.slice(localOffset + 30, localOffset + 30 + localNameLength));
    if (safePath(localName) !== name) throw new Error(`O nome local e o índice central divergem no arquivo ${name}.`);
    if (view.getUint16(localOffset + 8, true) !== method) throw new Error(`O método de compactação diverge no arquivo ${name}.`);
    const dataStart = localHeaderEnd;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > centralOffset || dataEnd > bytes.length) throw new Error(`Conteúdo compactado incompleto no arquivo ${name}.`);
    const compressed = bytes.slice(dataStart, dataEnd);
    let content;
    if (method === 0) content = compressed;
    else if (method === 8) content = await inflateRaw(compressed, Math.min(ZIP_LIMITS.singleFileBytes, uncompressedSize));
    else throw new Error(`O formato de compactação do arquivo ${name} não é suportado.`);
    if (content.length !== uncompressedSize) throw new Error(`O tamanho do arquivo ${name} não confere após a extração.`);
    if (crc32(content) !== expectedCrc) throw new Error(`A verificação de integridade do arquivo ${name} falhou.`);
    if (files.has(name)) throw new Error(`O ZIP contém o caminho duplicado ${name}.`);
    files.set(name, new Blob([content]));
  }
  return files;
}

export async function writeZip(entries) {
  if (!Array.isArray(entries)) throw new Error('A lista de arquivos do ZIP é inválida.');
  if (entries.length > ZIP_LIMITS.entries) throw new Error('O pacote contém arquivos demais para esta versão.');
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  let totalUncompressed = 0;
  const seenNames = new Set();
  for (const entry of entries) {
    const name = safePath(entry.name);
    if (!name) continue;
    if (seenNames.has(name)) throw new Error(`O ZIP não pode conter o arquivo duplicado ${name}.`);
    seenNames.add(name);
    let data;
    if (entry.data instanceof Blob) data = new Uint8Array(await entry.data.arrayBuffer());
    else if (entry.data instanceof Uint8Array) data = entry.data;
    else if (entry.data instanceof ArrayBuffer) data = new Uint8Array(entry.data);
    else if (typeof entry.data === 'string') data = encoder.encode(entry.data);
    else data = new Uint8Array();
    if (data.length > ZIP_LIMITS.singleFileBytes) throw new Error(`O arquivo ${name} ultrapassa o limite de 100 MB.`);
    totalUncompressed += data.length;
    if (totalUncompressed > ZIP_LIMITS.totalUncompressedBytes) throw new Error('O conteúdo do ZIP ultrapassa o limite total de 512 MB.');
    const nameBytes = encoder.encode(name);
    if (nameBytes.length > 65535) throw new Error('O nome de um arquivo do ZIP é longo demais.');
    if (data.length > 0xFFFFFFFF || offset > 0xFFFFFFFF) throw new Error('O pacote excede os limites do formato ZIP32.');
    const checksum = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, checksum, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const centralOffset = offset;
  const count = centralParts.length;
  if (count > 65535 || centralSize > 0xFFFFFFFF || centralOffset > 0xFFFFFFFF) throw new Error('O pacote excede os limites do formato ZIP32.');
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, count, true);
  ev.setUint16(10, count, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);
  ev.setUint16(20, 0, true);
  return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
