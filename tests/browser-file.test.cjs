'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const vm = require('node:vm');
const {Blob} = require('node:buffer');
const {TextDecoder} = require('node:util');

function openBuiltPage(clipboard, png) {
  const html = fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
  const script = html.match(/<script id="app-source">([\s\S]+?)<\/script>/)[1];
  const nodes = new Map();
  const makeNode = () => ({
    options: [], checked: true,
    classList: {toggle() {}},
    add(option) { this.options.push(option); },
    setAttribute() {},
    focus() {}, select() {},
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
      createElement: tag => png.createElement(tag),
      querySelectorAll: () => []
    },
    navigator: {language:'en', clipboard}, location: {search:''},
    URL: png?.url, Image: png?.Image, setTimeout: () => {},
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

test('后完成的旧复制请求不会覆盖最近请求的预览提示', async () => {
  const writes = [];
  const page = openBuiltPage({writeText(text) {
    return new Promise((resolve,reject) => writes.push({text,resolve,reject}));
  }});
  await page.select(new Blob([trace]));
  const first = page.node('copyText').onclick();
  const latest = page.node('copy').onclick();
  assert.equal(writes.length,2);
  assert.notEqual(writes[0].text,writes[1].text);
  writes[1].resolve();
  await latest;
  const feedback = page.node('feedback').textContent;
  const preview = page.node('md').value;
  assert.match(feedback,/^Copied\./);
  assert.equal(preview,writes[1].text);
  writes[0].reject(new Error('blocked'));
  await first;
  assert.equal(page.node('feedback').textContent,feedback);
  assert.equal(page.node('md').value,preview);
});

test('最近一次复制失败仍可选中相应纯文本', async () => {
  const writes = [];
  const page = openBuiltPage({writeText(text) {
    writes.push(text);
    return Promise.reject(new Error('blocked'));
  }});
  await page.select(new Blob([trace]));
  await page.node('copyText').onclick();
  assert.equal(page.node('exact').open,true);
  assert.equal(page.node('md').value,writes[0]);
  assert.match(page.node('feedback').textContent,/copy/i);
});

function openPngPage() {
  const images = [], encoders = [], saved = [];
  const page = openBuiltPage(undefined, {
    Image: class {
      constructor() {
        this.naturalWidth = 10;
        this.naturalHeight = 10;
        images.push(this);
      }
    },
    createElement(tag) {
      if (tag === 'canvas') {
        return {getContext: () => ({drawImage() {}}), toBlob: callback => encoders.push(callback)};
      }
      assert.equal(tag,'a');
      return {click() { saved.push([this.href,this.download]); }};
    },
    url: {createObjectURL: blob => blob.id}
  });
  return {images,encoders,saved,node:page.node};
}

test('PNG 编码完成前修改设置，即使改回也取消原下载', async () => {
  const {images,encoders,saved,node} = openPngPage();
  const download = node('savePng').onclick();
  images[0].onload();
  await Promise.resolve();
  node('nearby').checked = false;
  node('nearby').onchange();
  node('nearby').checked = true;
  node('nearby').onchange();
  assert.equal(encoders.length,1);
  encoders[0]({id:'obsolete-png'});
  await download;
  assert.deepEqual(saved,[]);
});

test('旧 PNG 失败不会在更新的下载完成后显示错误', async () => {
  const {images,encoders,saved,node} = openPngPage();
  const earlier = node('savePng').onclick();
  const latest = node('savePng').onclick();
  images[1].onload();
  await Promise.resolve();
  encoders[0]({id:'current-png'});
  await latest;
  images[0].onerror(new Error('old failure'));
  await earlier;
  assert.deepEqual(saved,[['current-png','agent-bugcard.png']]);
  assert.equal(node('feedback').textContent,'');
});
