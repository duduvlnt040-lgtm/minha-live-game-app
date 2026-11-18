import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIsolatedHtmlBundle, validateArchiveEntryPath } from './zipValidator';

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
