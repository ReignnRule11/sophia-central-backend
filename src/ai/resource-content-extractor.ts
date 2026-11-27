import { inflateRawSync, inflateSync } from 'node:zlib';

const MAX_ARCHIVE_ENTRIES = 2500;

function decodeXmlText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/>|<a:tab\b[^>]*\/>/g, ' ')
    .replace(/<w:br\b[^>]*\/>|<a:br\b[^>]*\/>/g, '\n')
    .replace(/<\/(?:w:p|a:p|w:tr|a:sp)>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65558); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Invalid Office document archive');
  const count = Math.min(buffer.readUInt16LE(eocd + 10), MAX_ARCHIVE_ENTRIES);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map<string, Buffer>();
  for (let i = 0; i < count && offset + 46 <= buffer.length; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (uncompressedSize <= 12 * 1024 * 1024 && localOffset + 30 <= buffer.length && buffer.readUInt32LE(localOffset) === 0x04034b50) {
      const localName = buffer.readUInt16LE(localOffset + 26);
      const localExtra = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localName + localExtra;
      const compressed = buffer.subarray(start, start + compressedSize);
      if (start + compressedSize <= buffer.length) {
        try {
          entries.set(name, method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed, { maxOutputLength: 12 * 1024 * 1024 }) : Buffer.alloc(0));
        } catch { /* Ignore malformed individual entries. */ }
      }
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function extractOfficeText(buffer: Buffer, extension: string): string {
  const entries = readZipEntries(buffer);
  const names = [...entries.keys()].filter(name =>
    extension === 'docx' ? /^word\/(document|header[0-9]*|footer[0-9]*)\.xml$/i.test(name)
      : /^ppt\/slides\/slide[0-9]+\.xml$/i.test(name),
  ).sort();
  return names.map(name => decodeXmlText(entries.get(name)!.toString('utf8'))).filter(Boolean).join('\n');
}

function unescapePdfLiteral(value: string): string {
  const replacements: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '', f: '' };
  return value.replace(/\\([nrtbf()\\])/g, (_, c) => replacements[c] ?? c)
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\\r?\n/g, '');
}

function extractPdfText(buffer: Buffer): string {
  const source = buffer.toString('latin1');
  const candidates = [source];
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamPattern.exec(source)) !== null) {
    const raw = Buffer.from(match[1], 'latin1');
    try { candidates.push(inflateSync(raw, { maxOutputLength: 12 * 1024 * 1024 }).toString('latin1')); } catch { /* Uncompressed or unsupported filter. */ }
  }
  const text: string[] = [];
  for (const candidate of candidates) {
    const literalPattern = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
    let literal: RegExpExecArray | null;
    while ((literal = literalPattern.exec(candidate)) !== null) text.push(unescapePdfLiteral(literal[1]));
    const hexPattern = /<([0-9a-f\s]+)>\s*Tj/gi;
    let hex: RegExpExecArray | null;
    while ((hex = hexPattern.exec(candidate)) !== null) {
      const bytes = Buffer.from(hex[1].replace(/\s/g, ''), 'hex');
      text.push(bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff
        ? bytes.subarray(2).swap16().toString('utf16le')
        : bytes.toString('latin1'));
    }
    const arrayPattern = /\[((?:\\.|[^\]])*)\]\s*TJ/g;
    let array: RegExpExecArray | null;
    while ((array = arrayPattern.exec(candidate)) !== null) {
      const parts = array[1].match(/\(((?:\\.|[^\\)])*)\)/g) ?? [];
      text.push(parts.map(part => unescapePdfLiteral(part.slice(1, -1))).join(''));
    }
  }
  return text.join(' ').replace(/\s+/g, ' ').trim();
}

export function extractAcademicDocumentText(buffer: Buffer, filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'txt' || extension === 'text' || extension === 'md' || extension === 'csv') {
    return buffer.toString('utf8').replace(/\u0000/g, '').trim();
  }
  if (extension === 'docx' || extension === 'pptx') return extractOfficeText(buffer, extension);
  if (extension === 'pdf') return extractPdfText(buffer);
  throw new Error('This file format is not supported for Sophis AI. Use PDF, DOCX, PPTX or TXT.');
}
