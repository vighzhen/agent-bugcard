'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const language = require('../src/locale.cjs');
const card = require('../src/core.cjs');
const example = path.join(__dirname,'../examples/claude.synthetic.jsonl');
const report = card.parse(fs.readFileSync(example,'utf8'));

test('explicit scripts, regional conventions and ordered preferences choose the correct UI', () => {
  for (const tag of ['zh','zh-CN','zh-SG','zh-Hans-TW','cmn-Hans','zh_CHS','zh-CN-u-rg-twzzzz']) {
    assert.equal(language.match(tag),'zh-Hans',tag);
  }
  for (const tag of ['zh-HK','zh-MO','zh-TW','zh-Hant-CN','zh-hant','zh_CHT']) {
    assert.equal(language.match(tag),'zh-Hant',tag);
  }
  assert.equal(language.select(['fr','zh-HK','en']),'zh-Hant');
  assert.equal(language.select(['en-US','zh-CN']),'en');
  assert.equal(language.select(['fr',null]),'en');
});

test('all three export formats honor the chosen script and privacy controls', () => {
  for (const [lang,code,call,returned] of [
    ['zh-CN','退出码 127','第 3 次调用','已返回'],
    ['zh-HK','結束碼 127','第 3 次呼叫','已傳回'],
    ['en','exit 127','Call #3','Returned']
  ]) {
    for (const render of [card.markdown,card.plainText,card.svg]) {
      const body = render(report,{lang,exitCodes:true});
      for (const term of [code,call,returned,'PATH']) assert.ok(body.includes(term),term);
      for (const opts of [{},{categories:false,exitCodes:true},{nearby:false,exitCodes:true}]) {
        const hidden = render(report,{lang,...opts});
        assert.ok(!hidden.includes(code));assert.ok(!hidden.includes('PATH'));
      }
      assert.ok(!body.includes('sample-check'));
    }
    assert.ok(!card.plainText(report,{lang}).includes('|'));
  }
});

test('CLI localizes its reports and diagnostics', () => {
  const cli = path.join(__dirname,'../bin/agent-bugcard.cjs');
  const result = spawnSync(process.execPath,[cli,example,'--format','text','--lang','zh-Hant','--exit-codes'],{encoding:'utf8'});
  assert.equal(result.status,0);assert.match(result.stdout,/結束碼 127/);
  const error = spawnSync(process.execPath,[cli,example,'--lang','zh-CN','--call','99'],{encoding:'utf8'});
  assert.equal(error.status,2);assert.match(error.stderr,/调用编号/);
});
