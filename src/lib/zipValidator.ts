export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const DANGEROUS_EXTENSIONS = [
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.bash',
  '.ps1',
  '.dll',
  '.so',
  '.dylib',
  '.php',
  '.py',
  '.rb',
  '.pl',
  '.cgi',
  '.msi',
  '.apk',
];

export const MAX_GAME_FILES = 150;
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 25 * 1024 * 1024; // 25MB

export function validateArchiveEntryPath(rawPath: string): ValidationResult {
  if (!rawPath || typeof rawPath !== 'string') {
    return { valid: false, error: 'Caminho de arquivo vazio ou inválido.' };
  }
  if (rawPath.includes('\0')) {
    return { valid: false, error: `Caractere nulo detectado no caminho: ${rawPath}` };
  }

  const normalized = rawPath.replace(/\\/g, '/').trim();
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return { valid: false, error: `Caminho absoluto não permitido: ${rawPath}` };
  }

  const segments = normalized.split('/');
  if (segments.some((seg) => seg === '..' || seg === '.')) {
    return { valid: false, error: `Travessia de diretório bloqueada: ${rawPath}` };
  }

  const lower = normalized.toLowerCase();
  for (const ext of DANGEROUS_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return { valid: false, error: `Tipo de arquivo bloqueado por segurança (${ext}): ${rawPath}` };
    }
  }

  return { valid: true };
}

export function normalizeEntryPath(rawPath: string): string {
  return rawPath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

export const MLG_BRIDGE_SCRIPT = `
<script data-mlg-bridge="1">
(function() {
  if (window.MinhaLiveGames) return;
  var listeners = { event: [], command: [], control: [] };
  window.MinhaLiveGames = {
    version: '1.0.0',
    onEvent: function(cb) { if (typeof cb === 'function') listeners.event.push(cb); },
    onCommand: function(cb) { if (typeof cb === 'function') listeners.command.push(cb); },
    onControl: function(cb) { if (typeof cb === 'function') listeners.control.push(cb); },
    emitScore: function(score) {
      window.parent.postMessage({ type: 'MLG:SCORE_UPDATE', score: Number(score) || 0 }, '*');
    },
    emitStatus: function(status) {
      window.parent.postMessage({ type: 'MLG:STATUS', status: String(status || '') }, '*');
    },
    log: function(message) {
      window.parent.postMessage({ type: 'MLG:LOG', message: String(message || '') }, '*');
    }
  };
  window.addEventListener('message', function(ev) {
    var data = ev && ev.data;
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
    if (data.type === 'MLG:EVENT') {
      listeners.event.forEach(function(fn) { try { fn(data.event); } catch (e) {} });
    } else if (data.type === 'MLG:COMMAND') {
      listeners.command.forEach(function(fn) { try { fn(data.command); } catch (e) {} });
    } else if (data.type.indexOf('MLG:') === 0) {
      listeners.control.forEach(function(fn) { try { fn(data); } catch (e) {} });
    }
  });
  window.addEventListener('DOMContentLoaded', function() {
    window.parent.postMessage({ type: 'MLG:READY' }, '*');
  });
})();
</script>
`;

export function buildIsolatedHtmlBundle(
  entryPath: string,
  files: Record<string, string>,
  baseOrigin?: string,
): { html: string; fileList: string[]; error?: string } {
  const normalizedMap: Record<string, string> = {};
  const fileList: string[] = [];

  for (const [rawKey, content] of Object.entries(files)) {
    const check = validateArchiveEntryPath(rawKey);
    if (!check.valid) {
      return { html: '', fileList: [], error: check.error };
    }
    const cleanKey = normalizeEntryPath(rawKey);
    normalizedMap[cleanKey] = content;
    fileList.push(cleanKey);
  }

  if (fileList.length > MAX_GAME_FILES) {
    return { html: '', fileList: [], error: `Limite máximo de ${MAX_GAME_FILES} arquivos excedido.` };
  }

  const cleanEntry = normalizeEntryPath(entryPath);
  const entryHtml = normalizedMap[cleanEntry];
  if (typeof entryHtml !== 'string') {
    return {
      html: '',
      fileList,
      error: `Arquivo principal "${cleanEntry}" não encontrado no pacote.`,
    };
  }

  let output = entryHtml;

  // Inline local <link rel="stylesheet" href="..."> references present in the archive
  output = output.replace(
    /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
    (fullTag, href: string) => {
      const target = normalizeEntryPath(href);
      if (normalizedMap[target] !== undefined) {
        return `<style data-inline-href="${target}">\n${normalizedMap[target]}\n</style>`;
      }
      return fullTag;
    },
  );

  // Inline local <script src="..."> references present in the archive
  output = output.replace(
    /<script\b([^>]*)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
    (fullTag, before: string, src: string, after: string) => {
      const target = normalizeEntryPath(src);
      if (normalizedMap[target] !== undefined) {
        return `<script ${before} ${after} data-inline-src="${target}">\n${normalizedMap[target]}\n</script>`;
      }
      return fullTag;
    },
  );

  const baseTag = baseOrigin ? `<base href="${baseOrigin.replace(/"/g, '')}/">` : '';
  const headInjection = `${baseTag}${MLG_BRIDGE_SCRIPT}`;

  if (/<head[^>]*>/i.test(output)) {
    output = output.replace(/<head[^>]*>/i, (match) => `${match}\n${headInjection}`);
  } else if (/<html[^>]*>/i.test(output)) {
    output = output.replace(/<html[^>]*>/i, (match) => `${match}\n<head>${headInjection}</head>`);
  } else {
    output = `<!doctype html><html><head><meta charset="utf-8">${headInjection}</head><body>${output}</body></html>`;
  }

  return { html: output, fileList };
}
