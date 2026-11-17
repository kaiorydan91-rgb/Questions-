const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

const ZIP_LIMITS = Object.freeze({
  archiveBytes: 512 * 1024 * 1024,
  entries: 20000,
  singleFileBytes: 100 * 1024 * 1024,
  totalUncompressedBytes: 512 * 1024 * 1024
});
const ZIP32_MAX = 0xFFFFFFFF;
const EOCD_SIGNATURE = 0x06054B50;
const CENTRAL_SIGNATURE = 0x02014B50;
const LOCAL_SIGNATURE = 0x04034B50;
const DESCRIPTOR_SIGNATURE = 0x08074B50;
const UTF8_FLAG = 0x0800;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const ALLOWED_FLAGS = 0x080E; // Deflate options, data descriptor, and UTF-8 names.

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

const CP437_HIGH = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';

function decodeZipName(bytes, flags) {
  if (flags & UTF8_FLAG) {
    try { return decoder.decode(bytes); }
    catch { throw new Error('O ZIP contém um nome de arquivo UTF-8 inválido. Recompacte usando nomes UTF-8.'); }
  }
  // ZIP names without general-purpose bit 11 use CP437 by specification.
  let output = '';
  for (const byte of bytes) output += byte < 0x80 ? String.fromCharCode(byte) : CP437_HIGH[byte - 0x80];
  return output;
}

async function readBlobBytes(fileOrBlob) {
  let arrayBufferError = null;
  try {
    const buffer = await fileOrBlob.arrayBuffer();
    const expected = Number(fileOrBlob.size) || 0;
    if (!expected || buffer.byteLength === expected) return new Uint8Array(buffer);
    arrayBufferError = `arrayBuffer() retornou ${buffer.byteLength} bytes, mas o arquivo declara ${expected} bytes`;
  } catch (error) {
    arrayBufferError = error?.message || String(error);
  }

  // Some Android document providers expose a File that can be selected but whose
  // arrayBuffer() result is incomplete inside a module Worker. FileReader is a
  // second independent read path before rejecting the selected file.
  if (typeof FileReader !== 'undefined') {
    try {
      const buffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('Falha ao ler o arquivo com FileReader.'));
        reader.onabort = () => reject(new Error('A leitura do arquivo foi cancelada.'));
        reader.onload = () => resolve(reader.result);
        reader.readAsArrayBuffer(fileOrBlob);
      });
      const expected = Number(fileOrBlob.size) || 0;
      if (buffer instanceof ArrayBuffer && (!expected || buffer.byteLength === expected)) return new Uint8Array(buffer);
      throw new Error(`FileReader retornou ${buffer?.byteLength ?? 'um resultado inválido'} bytes; tamanho declarado: ${expected || 'desconhecido'}.`);
    } catch (error) {
      throw new Error(`Não foi possível ler o arquivo selecionado por dois métodos. ${arrayBufferError}; segunda tentativa: ${error?.message || String(error)}`);
    }
  }
  throw new Error(`Não foi possível ler o arquivo selecionado. ${arrayBufferError}`);
}

function hexPreview(bytes, fromEnd = false) {
  const slice = fromEnd ? bytes.slice(Math.max(0, bytes.length - 24)) : bytes.slice(0, 8);
  return [...slice].map(value => value.toString(16).padStart(2, '0')).join(' ');
}

function findEndOfCentralDirectory(view, bytesLength) {
  const minimum = Math.max(0, bytesLength - 22 - 65535);
  for (let offset = bytesLength - 22; offset >= minimum; offset--) {
    if (view.getUint32(offset, true) !== EOCD_SIGNATURE) continue;
    const commentLength = view.getUint16(offset + 20, true);
    // EOCD and its declared comment must end exactly at EOF. Validate the comment
    // length as well, so a false signature inside compressed data is not accepted.
    if (offset + 22 + commentLength === bytesLength) return offset;
  }
  return -1;
}

function rejectZip64Extra(extraBytes, contextName) {
  let offset = 0;
  while (offset + 4 <= extraBytes.length) {
    const id = extraBytes[offset] | (extraBytes[offset + 1] << 8);
    const length = extraBytes[offset + 2] | (extraBytes[offset + 3] << 8);
    offset += 4;
    if (offset + length > extraBytes.length) throw new Error(`O campo extra do arquivo ${contextName} está truncado.`);
    if (id === 0x0001) throw new Error('Este ZIP usa extensões ZIP64, que ainda não são aceitas nesta versão.');
    offset += length;
  }
  if (offset !== extraBytes.length) throw new Error(`O campo extra do arquivo ${contextName} está malformado.`);
}

async function inflateRaw(bytes, maxBytes, name) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(`O arquivo ${name} está compactado em DEFLATE, mas este navegador não oferece suporte à descompactação necessária. Atualize o navegador ou recompacte o ZIP sem compressão.`);
  }
  let stream;
  try {
    stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  } catch {
    throw new Error(`Não foi possível iniciar a descompactação DEFLATE do arquivo ${name}. Atualize o navegador ou recompacte o ZIP sem compressão.`);
  }
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
        throw new Error(`O conteúdo descompactado do arquivo ${name} ultrapassou o tamanho declarado ou o limite de segurança.`);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof Error && /ultrapassou o tamanho declarado/.test(error.message)) throw error;
    throw new Error(`O conteúdo DEFLATE do arquivo ${name} está corrompido ou usa um formato não compatível.`);
  } finally {
    try { reader.releaseLock(); } catch { /* reader may already be detached by the stream */ }
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

export async function readZip(fileOrBlob) {
  if (!fileOrBlob || typeof fileOrBlob.arrayBuffer !== 'function') throw new Error('Selecione um arquivo ZIP válido.');
  const bytes = await readBlobBytes(fileOrBlob);
  if (bytes.byteLength > ZIP_LIMITS.archiveBytes) throw new Error('O ZIP ultrapassa o limite de 512 MB desta versão.');
  if (bytes.length < 22) throw new Error(`O arquivo selecionado é pequeno demais para ser um ZIP válido (${bytes.length} bytes).`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view, bytes.length);
  if (eocd < 0) {
    const name = String(fileOrBlob.name || 'arquivo sem nome');
    const declared = Number(fileOrBlob.size) || 0;
    const type = String(fileOrBlob.type || 'não informado');
    throw new Error(`O conteúdo recebido não contém o final de um ZIP válido. Arquivo: ${name}; tamanho declarado: ${declared || 'não informado'} bytes; bytes lidos: ${bytes.length}; tipo: ${type}; início: [${hexPreview(bytes)}]; final: [${hexPreview(bytes, true)}]. Confirme se selecionou o ZIP concluído, não um atalho, pré-visualização ou arquivo parcial.`);
  }

  const diskNumber = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const entriesOnDisk = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error('Este ZIP é dividido em vários volumes. Exporte novamente como um único arquivo ZIP.');
  }
  if (entryCount === 0xFFFF || centralOffset === ZIP32_MAX || centralSize === ZIP32_MAX) {
    throw new Error('Este ZIP usa extensões ZIP64, que ainda não são aceitas nesta versão. Recompacte no formato ZIP32.');
  }
  if (entryCount > ZIP_LIMITS.entries) throw new Error(`O ZIP contém arquivos demais. O limite desta versão é ${ZIP_LIMITS.entries.toLocaleString('pt-BR')} entradas.`);
  const centralEnd = centralOffset + centralSize;
  if (centralEnd !== eocd || centralEnd > bytes.length) {
    throw new Error('O índice central do ZIP está incompleto, deslocado ou contém dados extras. Gere novamente o arquivo ZIP.');
  }

  const files = new Map();
  const localRanges = [];
  let totalUncompressed = 0;
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index++) {
    if (cursor + 46 > centralEnd || view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      throw new Error(`O registro ${index + 1} do índice de arquivos ZIP está inválido ou truncado.`);
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const startDisk = view.getUint16(cursor + 34, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (recordEnd > centralEnd) throw new Error(`O registro ${index + 1} do índice ZIP ultrapassa o limite declarado.`);
    if (startDisk !== 0) throw new Error('O ZIP contém arquivos distribuídos em vários volumes.');
    if ([compressedSize, uncompressedSize, localOffset].includes(ZIP32_MAX)) {
      throw new Error('Este ZIP usa extensões ZIP64, que ainda não são aceitas nesta versão. Recompacte no formato ZIP32.');
    }
    if (flags & (0x0001 | 0x0040 | 0x2000)) throw new Error('O ZIP contém arquivos criptografados. Remova a senha e exporte novamente.');
    if (flags & ~ALLOWED_FLAGS) throw new Error('O ZIP usa opções de compactação não suportadas. Exporte no formato ZIP padrão.');
    if ((flags & 0x0006) && method !== 8) throw new Error('O ZIP contém opções DEFLATE incompatíveis com o método de compactação declarado.');
    if (method !== 0 && method !== 8) throw new Error(`O ZIP usa o método de compactação ${method}, que não é suportado. Use ZIP armazenado ou DEFLATE.`);
    const nameBytes = bytes.slice(cursor + 46, cursor + 46 + nameLength);
    const rawName = decodeZipName(nameBytes, flags);
    const isDirectory = rawName.endsWith('/');
    const name = safePath(rawName);
    const extraBytes = bytes.slice(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength);
    rejectZip64Extra(extraBytes, name || `entrada ${index + 1}`);
    cursor = recordEnd;
    if (!name) throw new Error(`O ZIP contém um caminho vazio na entrada ${index + 1}.`);

    if (uncompressedSize > ZIP_LIMITS.singleFileBytes) throw new Error(`O arquivo ${name} ultrapassa o limite individual de 100 MB.`);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > ZIP_LIMITS.totalUncompressedBytes) throw new Error('O conteúdo descompactado ultrapassa o limite total de 512 MB.');

    if (localOffset + 30 > centralOffset || localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      throw new Error(`Cabeçalho local inválido ou ausente no arquivo ${name}.`);
    }
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localCrc = view.getUint32(localOffset + 14, true);
    const localCompressedSize = view.getUint32(localOffset + 18, true);
    const localUncompressedSize = view.getUint32(localOffset + 22, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const localHeaderEnd = localOffset + 30 + localNameLength + localExtraLength;
    if (localHeaderEnd > centralOffset) throw new Error(`Cabeçalho local incompleto no arquivo ${name}.`);
    if (localFlags !== flags || localMethod !== method) throw new Error(`Os cabeçalhos local e central divergem no arquivo ${name}.`);
    const localNameBytes = bytes.slice(localOffset + 30, localOffset + 30 + localNameLength);
    const localName = decodeZipName(localNameBytes, localFlags);
    if (localName !== rawName) throw new Error(`O nome do arquivo ${name} diverge entre os cabeçalhos do ZIP.`);
    const localExtraBytes = bytes.slice(localOffset + 30 + localNameLength, localHeaderEnd);
    rejectZip64Extra(localExtraBytes, name);
    if (localCompressedSize === ZIP32_MAX || localUncompressedSize === ZIP32_MAX) throw new Error('Este ZIP usa extensões ZIP64, que ainda não são aceitas nesta versão.');
    const hasDescriptor = Boolean(flags & DATA_DESCRIPTOR_FLAG);
    if (!hasDescriptor && (localCrc !== expectedCrc || localCompressedSize !== compressedSize || localUncompressedSize !== uncompressedSize)) {
      throw new Error(`Os tamanhos ou o CRC do cabeçalho local não conferem no arquivo ${name}.`);
    }
    if (hasDescriptor && !((localCrc === 0 || localCrc === expectedCrc) && (localCompressedSize === 0 || localCompressedSize === compressedSize) && (localUncompressedSize === 0 || localUncompressedSize === uncompressedSize))) {
      throw new Error(`Os dados preliminares do cabeçalho local não conferem no arquivo ${name}.`);
    }

    const dataStart = localHeaderEnd;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > centralOffset || dataEnd > bytes.length) throw new Error(`Conteúdo compactado incompleto no arquivo ${name}.`);
    let recordDataEnd = dataEnd;
    if (hasDescriptor) {
      if (recordDataEnd + 12 > centralOffset) throw new Error(`O descritor de dados do arquivo ${name} está truncado.`);
      let descriptorStart = recordDataEnd;
      if (view.getUint32(descriptorStart, true) === DESCRIPTOR_SIGNATURE) descriptorStart += 4;
      if (descriptorStart + 12 > centralOffset) throw new Error(`O descritor de dados do arquivo ${name} está incompleto.`);
      const descriptorCrc = view.getUint32(descriptorStart, true);
      const descriptorCompressed = view.getUint32(descriptorStart + 4, true);
      const descriptorUncompressed = view.getUint32(descriptorStart + 8, true);
      if (descriptorCrc !== expectedCrc || descriptorCompressed !== compressedSize || descriptorUncompressed !== uncompressedSize) {
        throw new Error(`O descritor de integridade do arquivo ${name} não confere.`);
      }
      recordDataEnd = descriptorStart + 12;
    }
    localRanges.push({ start: localOffset, end: recordDataEnd, name });

    const compressed = bytes.slice(dataStart, dataEnd);
    let content;
    if (method === 0) {
      if (compressedSize !== uncompressedSize) throw new Error(`O tamanho compactado do arquivo ${name} não confere com o método armazenado.`);
      content = compressed;
    } else {
      content = await inflateRaw(compressed, Math.min(ZIP_LIMITS.singleFileBytes, uncompressedSize), name);
    }
    if (content.length !== uncompressedSize) throw new Error(`O tamanho do arquivo ${name} não confere após a extração.`);
    if (crc32(content) !== expectedCrc) throw new Error(`A verificação de integridade CRC do arquivo ${name} falhou.`);
    if (!isDirectory) {
      if (files.has(name)) throw new Error(`O ZIP contém o caminho duplicado ${name}.`);
      files.set(name, new Blob([content]));
    }
  }
  if (cursor !== centralEnd) throw new Error('O índice central do ZIP contém bytes extras ou registros não declarados.');
  localRanges.sort((a, b) => a.start - b.start);
  for (let index = 1; index < localRanges.length; index++) {
    if (localRanges[index].start < localRanges[index - 1].end) {
      throw new Error(`Os dados dos arquivos ${localRanges[index - 1].name} e ${localRanges[index].name} se sobrepõem dentro do ZIP.`);
    }
  }
  return files;
}

export async function writeZip(entries) {
  if (!Array.isArray(entries)) throw new Error('A lista de arquivos do ZIP é inválida.');
  if (entries.length > ZIP_LIMITS.entries || entries.length > 65534) throw new Error('O pacote contém arquivos demais para esta versão do formato ZIP32.');
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  let totalUncompressed = 0;
  const seenNames = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || !('name' in entry)) throw new Error('Há um item de arquivo inválido na lista do ZIP.');
    const name = safePath(entry.name);
    if (!name) throw new Error('O ZIP não pode conter um arquivo sem nome.');
    if (seenNames.has(name)) throw new Error(`O ZIP não pode conter o arquivo duplicado ${name}.`);
    seenNames.add(name);
    let data;
    if (entry.data instanceof Blob) data = new Uint8Array(await entry.data.arrayBuffer());
    else if (entry.data instanceof Uint8Array) data = entry.data;
    else if (entry.data instanceof ArrayBuffer) data = new Uint8Array(entry.data);
    else if (typeof entry.data === 'string') data = encoder.encode(entry.data);
    else throw new Error(`O conteúdo do arquivo ${name} precisa ser Blob, ArrayBuffer, Uint8Array ou texto.`);
    if (data.length > ZIP_LIMITS.singleFileBytes) throw new Error(`O arquivo ${name} ultrapassa o limite de 100 MB.`);
    totalUncompressed += data.length;
    if (totalUncompressed > ZIP_LIMITS.totalUncompressedBytes) throw new Error('O conteúdo do ZIP ultrapassa o limite total de 512 MB.');
    const nameBytes = encoder.encode(name);
    if (!nameBytes.length || nameBytes.length > 65535) throw new Error('O nome de um arquivo do ZIP é vazio ou longo demais.');
    const localLength = 30 + nameBytes.length;
    if (data.length > ZIP32_MAX || offset + localLength + data.length > ZIP32_MAX) throw new Error('O pacote excede os limites de tamanho do formato ZIP32.');
    const checksum = crc32(data);

    // DOS date 0x0021 means 1980-01-01. A zero date encodes month/day as
    // 0/0 (invalid); some ZIP readers reject files created with that value.
    const dosTime = 0x0000;
    const dosDate = 0x0021;
    const flags = UTF8_FLAG;

    const local = new Uint8Array(localLength);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOCAL_SIGNATURE, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, flags, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, checksum, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, CENTRAL_SIGNATURE, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
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
    offset += localLength + data.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const centralOffset = offset;
  const count = centralParts.length;
  const archiveSize = centralOffset + centralSize + 22;
  if (count > 65534 || centralSize > ZIP32_MAX || centralOffset > ZIP32_MAX || archiveSize > ZIP32_MAX) {
    throw new Error('O pacote excede os limites do formato ZIP32.');
  }
  if (archiveSize > ZIP_LIMITS.archiveBytes) throw new Error('O ZIP final ultrapassa o limite de 512 MB desta versão.');
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, EOCD_SIGNATURE, true);
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
