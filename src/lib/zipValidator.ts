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

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
};

const TEXT_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.svg',
  '.txt',
  '.xml',
  '.csv',
  '.glsl',
  '.vert',
  '.frag',
  '.wgsl',
  '.gltf',
  '.md',
]);

export const MAX_GAME_FILES = 150;
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 25 * 1024 * 1024; // 25MB

export function inferMimeType(filePath: string): string {
  const clean = filePath.split(/[?#]/)[0].toLowerCase();
  const dot = clean.lastIndexOf('.');
  if (dot >= 0) {
    const ext = clean.slice(dot);
    if (MIME_TYPES[ext]) return MIME_TYPES[ext];
  }
  return 'application/octet-stream';
}

export function isTextArchiveFile(filePath: string): boolean {
  const clean = filePath.split(/[?#]/)[0].toLowerCase();
  const dot = clean.lastIndexOf('.');
  if (dot < 0) return true;
  return TEXT_EXTENSIONS.has(clean.slice(dot));
}

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
  return rawPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').trim();
}

function normalizeRelativeSegments(parts: string[]): string {
  const stack: string[] = [];
  for (const seg of parts) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (stack.length > 0) stack.pop();
    } else {
      stack.push(seg);
    }
  }
  return stack.join('/');
}

function isExternalOrSpecialUrl(url: string): boolean {
  const trimmed = url.trim();
  return (
    !trimmed ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('//') ||
    /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)
  );
}

function resolveArchiveAssetPath(
  normalizedMap: Record<string, string>,
  currentDir: string,
  entryDir: string,
  rawRef: string,
): string | null {
  if (isExternalOrSpecialUrl(rawRef)) return null;
  const cleanRef = rawRef.split(/[?#]/)[0].replace(/\\/g, '/').trim();
  if (!cleanRef) return null;

  const candidates: string[] = [];
  if (cleanRef.startsWith('/')) {
    const rootRel = cleanRef.replace(/^\/+/, '');
    if (entryDir) {
      candidates.push(normalizeRelativeSegments([...entryDir.split('/'), ...rootRel.split('/')]));
    }
    candidates.push(normalizeRelativeSegments(rootRel.split('/')));
  } else {
    const baseParts = currentDir ? currentDir.split('/') : [];
    candidates.push(normalizeRelativeSegments([...baseParts, ...cleanRef.split('/')]));
    if (entryDir && entryDir !== currentDir) {
      candidates.push(normalizeRelativeSegments([...entryDir.split('/'), ...cleanRef.split('/')]));
    }
    candidates.push(normalizeRelativeSegments(cleanRef.split('/')));
  }

  for (const candidate of candidates) {
    if (candidate && normalizedMap[candidate] !== undefined) {
      return candidate;
    }
  }
  return null;
}

function toDataUri(filePath: string, content: string): string {
  if (content.startsWith('data:')) return content;
  const mime = inferMimeType(filePath);
  if (mime === 'image/svg+xml') {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
  }
  return `data:${mime};charset=utf-8,${encodeURIComponent(content)}`;
}

function parseAttributes(rawAttrs: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const regex = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawAttrs)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = val;
  }
  return attrs;
}

function escapeInlineScript(code: string): string {
  return code.replace(/<\/(script)/gi, '<\\/$1');
}

function escapeInlineStyle(code: string): string {
  return code.replace(/<\/(style)/gi, '<\\/$1');
}

export const MLG_BRIDGE_SCRIPT = `
<script data-mlg-bridge="1" data-mlg-version="2">
(function() {
  // 1. Pre-boot sandbox compatibility runtime (protects opaque srcdoc origins)
  try {
    void document.cookie;
  } catch (_cookieErr) {
    try {
      var __mlgCookieJar = Object.create(null);
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        get: function() {
          return Object.keys(__mlgCookieJar)
            .map(function(k) { return k + '=' + __mlgCookieJar[k]; })
            .join('; ');
        },
        set: function(raw) {
          var str = String(raw || '');
          var eq = str.indexOf('=');
          if (eq <= 0) return;
          var name = str.slice(0, eq).trim();
          var rest = str.slice(eq + 1).split(';')[0].trim();
          if (/max-age=0/i.test(str) || /expires=Thu, 01 Jan 1970/i.test(str)) {
            delete __mlgCookieJar[name];
          } else {
            __mlgCookieJar[name] = rest;
          }
        }
      });
    } catch (_e) {}
  }

  function __mlgInstallStorageShim(propName) {
    try {
      var nativeStore = window[propName];
      if (nativeStore) {
        var probe = '__mlg_probe__';
        nativeStore.setItem(probe, '1');
        nativeStore.removeItem(probe);
        return;
      }
    } catch (_storageErr) {
      // Fall through to in-memory shim
    }
    try {
      var storeMap = new Map();
      var memoryStorage = {
        get length() { return storeMap.size; },
        clear: function() { storeMap.clear(); },
        getItem: function(k) { return storeMap.has(String(k)) ? storeMap.get(String(k)) : null; },
        key: function(i) {
          var keys = Array.from(storeMap.keys());
          return i >= 0 && i < keys.length ? keys[i] : null;
        },
        removeItem: function(k) { storeMap.delete(String(k)); },
        setItem: function(k, v) { storeMap.set(String(k), String(v)); }
      };
      Object.defineProperty(window, propName, {
        configurable: true,
        get: function() { return memoryStorage; }
      });
    } catch (_e) {}
  }
  __mlgInstallStorageShim('localStorage');
  __mlgInstallStorageShim('sessionStorage');

  try {
    if (window.history) {
      var __mlgWrapHistory = function(methodName) {
        var orig = window.history[methodName];
        if (typeof orig !== 'function') return;
        window.history[methodName] = function(state, title, url) {
          try {
            return orig.apply(window.history, arguments);
          } catch (_histErr) {
            return undefined;
          }
        };
      };
      __mlgWrapHistory('pushState');
      __mlgWrapHistory('replaceState');
    }
  } catch (_e) {}

  // 2. Virtual asset resolver for ZIP assets inside srcdoc
  function __mlgResolveAsset(rawUrl) {
    var map = window.__MLG_ASSETS__;
    if (!map || typeof rawUrl !== 'string') return null;
    var clean = rawUrl.trim();
    if (!clean || clean.indexOf('data:') === 0 || clean.indexOf('blob:') === 0) return null;
    try {
      if (clean.indexOf('http://') === 0 || clean.indexOf('https://') === 0) {
        var parsed = new URL(clean);
        if (window.location && parsed.origin !== window.location.origin && parsed.origin !== 'null') {
          var pathOnly = parsed.pathname.replace(/^\\/+/, '');
          if (map[pathOnly]) return map[pathOnly];
        }
        clean = parsed.pathname;
      }
    } catch (_uErr) {}
    clean = clean.split('?')[0].split('#')[0].replace(/\\\\/g, '/').replace(/^\\.\\//, '').replace(/^\\/+/, '');
    if (Object.prototype.hasOwnProperty.call(map, clean)) return map[clean];
    return null;
  }

  if (typeof window.fetch === 'function' && !window.__MLG_FETCH_PATCHED__) {
    window.__MLG_FETCH_PATCHED__ = true;
    var __origFetch = window.fetch.bind(window);
    window.fetch = function(input, init) {
      try {
        var targetUrl = typeof input === 'string' ? input : (input && typeof input.url === 'string' ? input.url : '');
        var resolved = __mlgResolveAsset(targetUrl);
        if (resolved !== null) {
          return __origFetch(resolved, init);
        }
      } catch (_fErr) {}
      return __origFetch(input, init);
    };
  }

  if (typeof window.Audio === 'function' && !window.__MLG_AUDIO_PATCHED__) {
    window.__MLG_AUDIO_PATCHED__ = true;
    var __OrigAudio = window.Audio;
    window.Audio = function(src) {
      var nextSrc = typeof src === 'string' ? (__mlgResolveAsset(src) || src) : src;
      return new __OrigAudio(nextSrc);
    };
    window.Audio.prototype = __OrigAudio.prototype;
  }

  // 3. MinhaLiveGames SDK & Parent Bridge
  if (window.MinhaLiveGames) return;
  var listeners = { event: [], command: [], control: [] };
  window.MinhaLiveGames = {
    version: '1.1.0',
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
      if (data.type === 'MLG:AUDIO') {
        try {
          var mediaEls = document.querySelectorAll('audio, video');
          for (var i = 0; i < mediaEls.length; i++) {
            mediaEls[i].muted = Boolean(data.muted);
            if (typeof data.volume === 'number') mediaEls[i].volume = Math.max(0, Math.min(1, data.volume));
          }
        } catch (_mErr) {}
      }
      listeners.control.forEach(function(fn) { try { fn(data); } catch (e) {} });
    }
  });

  function __mlgEmitReady() {
    try { window.parent.postMessage({ type: 'MLG:READY' }, '*'); } catch (_e) {}
  }
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', __mlgEmitReady);
  } else {
    __mlgEmitReady();
  }
  window.addEventListener('load', __mlgEmitReady);
})();
</script>
`;

/**
 * Ensures any game HTML bundle (including legacy games already saved in storage)
 * receives the latest MinhaLiveGames bridge + sandbox cookie/storage compatibility runtime.
 */
export function preparePlayableHtml(rawHtml: string, baseOrigin?: string): string {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  // Strip any older injected bridge script so we upgrade cleanly and idempotently
  let output = rawHtml.replace(
    /<script\b[^>]*data-mlg-bridge=["'][^"']*["'][^>]*>[\s\S]*?<\/script>\s*/gi,
    '',
  );

  const hasBaseTag = /<base\b[^>]*>/i.test(output);
  const cleanOrigin = baseOrigin ? baseOrigin.replace(/"/g, '').replace(/\/+$/, '') : '';
  const baseTag = cleanOrigin && !hasBaseTag ? `<base href="${cleanOrigin}/">\n` : '';

  if (/<head[^>]*>/i.test(output)) {
    // Keep <base> at top of <head>
    if (baseTag) {
      output = output.replace(/<head[^>]*>/i, (match) => `${match}\n${baseTag}`);
    }
    // Keep declarative <script type="importmap"> ahead of executable scripts if present
    const importMapMatch = output.match(/<script\b[^>]*type=["']importmap["'][^>]*>[\s\S]*?<\/script>/i);
    if (importMapMatch && typeof importMapMatch.index === 'number') {
      const insertAt = importMapMatch.index + importMapMatch[0].length;
      output = `${output.slice(0, insertAt)}\n${MLG_BRIDGE_SCRIPT}${output.slice(insertAt)}`;
    } else if (/<base\b[^>]*>/i.test(output)) {
      output = output.replace(/<base\b[^>]*>/i, (match) => `${match}\n${MLG_BRIDGE_SCRIPT}`);
    } else {
      output = output.replace(/<head[^>]*>/i, (match) => `${match}\n${MLG_BRIDGE_SCRIPT}`);
    }
  } else if (/<html[^>]*>/i.test(output)) {
    output = output.replace(/<html[^>]*>/i, (match) => `${match}\n<head>\n${baseTag}${MLG_BRIDGE_SCRIPT}</head>`);
  } else {
    output = `<!doctype html><html><head><meta charset="utf-8">\n${baseTag}${MLG_BRIDGE_SCRIPT}</head><body>${output}</body></html>`;
  }

  return output;
}

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

  const entrySlashIdx = cleanEntry.lastIndexOf('/');
  const entryDir = entrySlashIdx >= 0 ? cleanEntry.slice(0, entrySlashIdx) : '';

  const rewriteCssUrls = (cssText: string, cssDir: string, stack = new Set<string>()): string => {
    let rewritten = cssText.replace(
      /@import\s+(?:url\(\s*)?(["']?)([^"')\s]+)\1\s*\)?\s*;?/gi,
      (full, _q: string, ref: string) => {
        const target = resolveArchiveAssetPath(normalizedMap, cssDir, entryDir, ref);
        if (!target || stack.has(target)) return full;
        stack.add(target);
        const targetDir = target.includes('/') ? target.slice(0, target.lastIndexOf('/')) : '';
        return rewriteCssUrls(normalizedMap[target], targetDir, stack);
      },
    );

    rewritten = rewritten.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (full, _q: string, ref: string) => {
      const target = resolveArchiveAssetPath(normalizedMap, cssDir, entryDir, ref);
      if (!target) return full;
      return `url("${toDataUri(target, normalizedMap[target])}")`;
    });

    return escapeInlineStyle(rewritten);
  };

  const buildModuleDataUri = (scriptPath: string, stack = new Set<string>()): string => {
    if (stack.has(scriptPath)) {
      return `data:text/javascript;charset=utf-8,${encodeURIComponent(normalizedMap[scriptPath])}`;
    }
    const nextStack = new Set(stack);
    nextStack.add(scriptPath);
    const scriptDir = scriptPath.includes('/') ? scriptPath.slice(0, scriptPath.lastIndexOf('/')) : '';
    const transformed = rewriteModuleSpecifiers(normalizedMap[scriptPath], scriptDir, nextStack);
    return `data:text/javascript;charset=utf-8,${encodeURIComponent(transformed)}`;
  };

  const rewriteModuleSpecifiers = (
    jsText: string,
    scriptDir: string,
    stack = new Set<string>(),
  ): string => {
    return jsText.replace(
      /(\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?|\bimport\s*\(\s*)(["'])([^"']+)\2/g,
      (full, prefix: string, quote: string, spec: string) => {
        const target = resolveArchiveAssetPath(normalizedMap, scriptDir, entryDir, spec);
        if (!target) return full;
        if (/\.(?:js|mjs|cjs)$/i.test(target)) {
          return `${prefix}${quote}${buildModuleDataUri(target, stack)}${quote}`;
        }
        return `${prefix}${quote}${toDataUri(target, normalizedMap[target])}${quote}`;
      },
    );
  };

  let output = entryHtml;

  // 1. Rewrite CSS <link> tags regardless of attribute order (href before rel, crossorigin, etc.)
  output = output.replace(/<link\b([^>]*)>/gi, (fullTag, rawAttrs: string) => {
    const attrs = parseAttributes(rawAttrs);
    const rel = (attrs.rel || '').toLowerCase();
    const href = attrs.href;
    if (!href) return fullTag;

    const target = resolveArchiveAssetPath(normalizedMap, entryDir, entryDir, href);
    if (!target) return fullTag;

    if (rel.split(/\s+/).includes('stylesheet')) {
      const cssDir = target.includes('/') ? target.slice(0, target.lastIndexOf('/')) : '';
      const inlinedCss = rewriteCssUrls(normalizedMap[target], cssDir);
      return `<style data-inline-href="${target}">\n${inlinedCss}\n</style>`;
    }

    if (rel === 'modulepreload') {
      // Script will be inlined directly; drop modulepreload so it doesn't 404 on host
      return '';
    }

    if (rel.includes('icon') || rel === 'preload') {
      const dataUri = toDataUri(target, normalizedMap[target]);
      return fullTag.replace(href, dataUri);
    }

    return fullTag;
  });

  // 2. Rewrite inline <style> local url(...) references
  output = output.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_full, attrs: string, cssBody: string) => {
    return `<style${attrs}>${rewriteCssUrls(cssBody, entryDir)}</style>`;
  });

  // 3. Inline local <script src="..."> references (supports arbitrary attributes, module chains, and </script escaping)
  output = output.replace(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/gi,
    (fullTag, rawAttrs: string, _inner: string) => {
      const attrs = parseAttributes(rawAttrs);
      const src = attrs.src;
      if (!src) return fullTag;

      const target = resolveArchiveAssetPath(normalizedMap, entryDir, entryDir, src);
      if (!target) return fullTag;

      const targetDir = target.includes('/') ? target.slice(0, target.lastIndexOf('/')) : '';
      const isModule = (attrs.type || '').toLowerCase() === 'module';
      const rawCode = isModule
        ? rewriteModuleSpecifiers(normalizedMap[target], targetDir)
        : normalizedMap[target];

      // Strip external src, integrity, and crossorigin when inlining
      const cleanedAttrs = rawAttrs
        .replace(/\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\bintegrity\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\bcrossorigin(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, '')
        .trim();

      return `<script${cleanedAttrs ? ` ${cleanedAttrs}` : ''} data-inline-src="${target}">\n${escapeInlineScript(rawCode)}\n</script>`;
    },
  );

  // 4. Rewrite local media URLs in <img>, <audio>, <video>, <source>, <track>
  output = output.replace(
    /<(img|audio|video|source|track)\b([^>]*)>/gi,
    (fullTag, tagName: string, rawAttrs: string) => {
      const replaced = rawAttrs.replace(
        /\b(src|poster)\s*=\s*(["'])([^"']+)\2/gi,
        (attrMatch, attrName: string, quote: string, val: string) => {
          const target = resolveArchiveAssetPath(normalizedMap, entryDir, entryDir, val);
          if (!target) return attrMatch;
          return `${attrName}=${quote}${toDataUri(target, normalizedMap[target])}${quote}`;
        },
      );
      return `<${tagName}${replaced}>`;
    },
  );

  // 5. Build runtime lookup table for dynamic fetch()/Audio() calls in ZIP packages
  const assetEntries: Record<string, string> = {};
  for (const [key, val] of Object.entries(normalizedMap)) {
    if (key === cleanEntry) continue;
    const uri = toDataUri(key, val);
    assetEntries[key] = uri;
    if (entryDir && key.startsWith(`${entryDir}/`)) {
      assetEntries[key.slice(entryDir.length + 1)] = uri;
    }
  }

  if (Object.keys(assetEntries).length > 0) {
    const assetScript = `<script data-mlg-assets="1">window.__MLG_ASSETS__ = Object.assign(window.__MLG_ASSETS__ || {}, ${escapeInlineScript(JSON.stringify(assetEntries))});</script>`;
    if (/<head[^>]*>/i.test(output)) {
      output = output.replace(/<head[^>]*>/i, (match) => `${match}\n${assetScript}`);
    } else {
      output = `${assetScript}\n${output}`;
    }
  }

  return { html: preparePlayableHtml(output, baseOrigin), fileList };
}
