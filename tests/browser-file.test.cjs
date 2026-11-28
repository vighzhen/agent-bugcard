'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const vm = require('node:vm');
const {Blob} = require('node:buffer');
const {TextDecoder} = require('node:util');

function openBuiltPage() {
  const html = fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
  const script = html.match(/<script id="app-source">([\s\S]+?)<\/script>/)[1];
  const nodes = new Map();
  const makeNode = () => ({
    options: [], checked: true,
    classList: {toggle() {}},
    add(option) { this.options.push(option); },
    setAttribute() {},
    replaceChildren() { this.options.length = 0; },
    insertRow() { return {insertCell: makeNode}; }
  });
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, makeNode());
    return nodes.get(id);
  };
  node('cardLang').value = 'auto';
  const ctx = vm.createContext({
    document: {
      documentElement: {}, getElementById: node, querySelector: makeNode,
      querySelectorAll: () => []
    },
    navigator: {language:'en'}, location: {search:''},
    URLSearchParams, TextDecoder, Option: function(label,value) { Object.assign(this,{label,value}); }
  });
  vm.runInContext(script, ctx);
  return {
    node,
    async select(blob) {
      const file = node('file');
      file.files = [blob];
      await file.onchange();
    }
  };
}
const trace = fs.readFileSync(path.join(__dirname,'../examples/claude.synthetic.jsonl'));
test('browser file input rejects invalid UTF-8 even if the trace would otherwise parse', async () => {
  const page = openBuiltPage();
  await page.select(new Blob([trace,'\n{"sentinel":"',Uint8Array.of(255),'"}']));
  assert.match(page.node('notice').textContent, /not valid UTF-8/);
  assert.equal(page.node('saveMd').disabled, true);
  assert.equal(page.node('md').value, '');
});
test('browser accepts UTF-8 BOM and still reports a separate malformed JSONL line', async () => {
  const page = openBuiltPage();
  await page.select(new Blob([Uint8Array.of(239,187,191),trace,'\n{broken']));
  assert.equal(page.node('saveMd').disabled, false);
  assert.match(page.node('legend').textContent, /1/);
  assert.ok(page.node('md').value);
});
test('a read failure is not reported as a UTF-8 failure', async () => {
  const page = openBuiltPage();
  await page.select({size: 2, async arrayBuffer() { throw new Error('unreadable'); }});
  assert.equal(page.node('notice').textContent, 'Could not read the selected file.');
  assert.equal(page.node('saveMd').disabled, true);
});
test('an earlier invalid selection cannot overwrite a newer valid one', async () => {
  const page = openBuiltPage();
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const first = page.select({size: 1, arrayBuffer: () => pending});
  await page.select(new Blob([trace]));
  resolve(Uint8Array.of(255).buffer);
  await first;
  assert.equal(page.node('notice').textContent, '');
  assert.equal(page.node('saveMd').disabled, false);
});
