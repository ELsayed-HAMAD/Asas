import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roadmapCsv, downloadRoadmapCsv } from '../src/lib/roadmapExport.js';

test('empty roadmap exports headers without needing a selected task', () => {
  const csv = roadmapCsv([]);
  assert.ok(csv.startsWith('\uFEFF"Phase","Task ID"'));
  assert.equal(csv.split('\r\n').length, 2);
});

test('exports actual tasks across phases, preserves zero progress and escapes CSV', () => {
  const csv = roadmapCsv([{ title: 'Phase, one', tasks: [{ id: 'task-1', title: 'A "quoted" task', progressPct: 0, description: 'First\nSecond' }] }, { title: 'Two', tasks: [{ id: 'task-2', title: 'Next task', progressPct: 50 }] }]);
  assert.ok(csv.includes('"Phase, one","task-1"'));
  assert.ok(csv.includes('"A ""quoted"" task"'));
  assert.ok(csv.includes('"0","First\nSecond"'));
  assert.ok(csv.includes('"Two","task-2"'));
  assert.ok(!csv.includes('undefined'));
});

test('neutralizes spreadsheet formulas including leading whitespace and controls', () => {
  for (const title of ['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '  =1', '\tformula', '\rformula', '\nformula']) {
    const csv = roadmapCsv([{ title: 'Phase', tasks: [{ title }] }]);
    assert.ok(csv.includes(`"'${title}"`));
  }
});

test('starts a real CSV download and cleans up the link and blob URL', () => {
  const originals = { document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL, timeout: globalThis.setTimeout };
  let clicked = false;
  let removed = false;
  let revoked = null;
  let cleanup;
  let blob;
  const link = { click() { clicked = true; }, remove() { removed = true; } };
  try {
    globalThis.document = { createElement: () => link, body: { appendChild() {} } };
    URL.createObjectURL = value => { blob = value; return 'blob:csv'; };
    URL.revokeObjectURL = value => { revoked = value; };
    globalThis.setTimeout = callback => { cleanup = callback; };
    downloadRoadmapCsv([]);
    assert.equal(link.href, 'blob:csv');
    assert.equal(link.download, 'roadmap.csv');
    assert.equal(blob.type, 'text/csv;charset=utf-8');
    assert.ok(clicked && removed);
    assert.equal(revoked, null);
    cleanup();
    assert.equal(revoked, 'blob:csv');
  } finally {
    globalThis.document = originals.document;
    URL.createObjectURL = originals.create;
    URL.revokeObjectURL = originals.revoke;
    globalThis.setTimeout = originals.timeout;
  }
});
