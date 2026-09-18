const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSurfaceDiagnostics } = require('../src/surface-diagnostics');

test('diagnóstico exclui conteúdo operacional e limita os arquivos por rotação', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'central-surface-test-'));
  try {
    const diagnostics = createSurfaceDiagnostics(directory, { maxBytes: 1 });
    for (let i = 0; i < 5; i++) diagnostics.record('blank', {
      contentsId: i, freeMemoryMB: 123, profileId: 'private-id', message: 'private-content', url: 'private-url'
    });
    assert.equal(fs.readdirSync(directory).length, 2);
    for (const name of fs.readdirSync(directory)) {
      const text = fs.readFileSync(path.join(directory, name), 'utf8');
      assert.equal(text.includes('private'), false);
      assert.equal(JSON.parse(text).freeMemoryMB, 123);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
