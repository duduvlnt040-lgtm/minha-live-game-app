import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIsolatedHtmlBundle,
  preparePlayableHtml,
  validateArchiveEntryPath,
} from './zipValidator';

test('blocks directory traversal and absolute paths', () => {
  assert.equal(validateArchiveEntryPath('../secret.txt').valid, false);
  assert.equal(validateArchiveEntryPath('assets/../../etc/passwd').valid, false);
  assert.equal(validateArchiveEntryPath('/etc/passwd').valid, false);
  assert.equal(validateArchiveEntryPath('C:\\windows\\system32\\cmd.exe').valid, false);
});

test('blocks dangerous executable extensions', () => {
  assert.equal(validateArchiveEntryPath('scripts/payload.exe').valid, false);
  assert.equal(validateArchiveEntryPath('run.sh').valid, false);
  assert.equal(validateArchiveEntryPath('index.php').valid, false);
  assert.equal(validateArchiveEntryPath('index.html').valid, true);
  assert.equal(validateArchiveEntryPath('src/game.js').valid, true);
});

test('inlines local css/js and injects MinhaLiveGames bridge script', () => {
  const built = buildIsolatedHtmlBundle(
    'index.html',
    {
      'index.html': '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><script src="app.js"></script></body></html>',
      'style.css': 'body { background: #000; }',
      'app.js': 'console.log("ok");',
    },
    'http://localhost:3000',
  );

  assert.equal(built.error, undefined);
  assert.ok(built.html.includes('window.MinhaLiveGames'));
  assert.ok(built.html.includes('body { background: #000; }'));
  assert.ok(built.html.includes('console.log("ok");'));
  assert.ok(built.html.includes('<base href="http://localhost:3000/">'));
});

test('supports Vite/AI Studio dist subfolders, reversed link attributes, media assets, and </script> escaping', () => {
  const fakePng = 'data:image/png;base64,iVBORw0KGgo=';
  const built = buildIsolatedHtmlBundle(
    'dist/index.html',
    {
      'dist/index.html':
        '<!doctype html><html><head><script type="importmap">{"imports":{"three":"https://cdn.example/three.js"}}</script><link crossorigin href="/assets/app.css" rel="stylesheet"></head><body><img src="./assets/hero.png"><script type="module" crossorigin src="/assets/app.js"></script></body></html>',
      'dist/assets/app.css': 'body { background-image: url("./hero.png"); }',
      'dist/assets/app.js': 'import { helper } from "./chunk.js"; window.__TAG__ = "</script>"; helper();',
      'dist/assets/chunk.js': 'export function helper() { return true; }',
      'dist/assets/hero.png': fakePng,
    },
    'https://minha-live-game-app.vercel.app',
  );

  assert.equal(built.error, undefined);
  // Stylesheet with href before rel was inlined and CSS url() rewritten
  assert.ok(built.html.includes(`background-image: url("${fakePng}")`));
  // Media <img> rewritten to embedded data URI
  assert.ok(built.html.includes(`<img src="${fakePng}">`));
  // </script> inside bundled JS was safely escaped
  assert.ok(built.html.includes('<\\/script>'));
  // Runtime asset map includes binary/chunk assets
  assert.ok(built.html.includes('window.__MLG_ASSETS__'));
  // importmap stays ahead of injected bridge script
  const importMapIdx = built.html.indexOf('type="importmap"');
  const bridgeIdx = built.html.indexOf('data-mlg-bridge="1"');
  assert.ok(importMapIdx > -1 && bridgeIdx > importMapIdx);
});

test('preparePlayableHtml upgrades legacy bundleHtml with sandbox cookie/storage shim idempotently', () => {
  const legacyBundle =
    '<!doctype html><html><head><base href="https://old.example/"><script data-mlg-bridge="1">(function(){ window.MinhaLiveGames = {}; })();</script></head><body><div>Game</div></body></html>';

  const upgraded = preparePlayableHtml(legacyBundle, 'https://minha-live-game-app.vercel.app');
  assert.ok(upgraded.includes('data-mlg-version="2"'));
  assert.ok(upgraded.includes('__mlgCookieJar'));
  assert.ok(upgraded.includes('__mlgInstallStorageShim'));
  assert.equal((upgraded.match(/data-mlg-bridge="1"/g) || []).length, 1);

  // Calling twice remains idempotent
  const upgradedAgain = preparePlayableHtml(upgraded, 'https://minha-live-game-app.vercel.app');
  assert.equal((upgradedAgain.match(/data-mlg-bridge="1"/g) || []).length, 1);
});
