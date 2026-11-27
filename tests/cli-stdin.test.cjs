'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const {join} = require('node:path');
const {spawnSync} = require('node:child_process');
const {test} = require('node:test');
const {limit} = require('../src/core.cjs');

const cli = join(__dirname,'../bin/agent-bugcard.cjs');
const example = join(__dirname,'../examples/claude.synthetic.jsonl');
const run = (args,input) => spawnSync(process.execPath,[cli,...args],{input,encoding:'utf8'});

test('CLI stdin uses the same parser and receipt options as file input', () => {
  const opts = ['--lang','zh-Hant','--format','text','--exit-codes'];
  const file = run([example,...opts]);
  const stdin = run(['--stdin',...opts],fs.readFileSync(example));
  assert.equal(file.status,0);
  assert.equal(stdin.status,0);
  assert.equal(stdin.stdout,file.stdout);
  assert.equal(stdin.stderr,file.stderr);
  assert.match(stdin.stdout,/結束碼 127/);
  assert.doesNotMatch(stdin.stdout,/sample-check/);
});

test('CLI stdin rejects conflicting sources and oversized or empty input', () => {
  const conflict = run(['--stdin',example]);
  assert.equal(conflict.status,2);
  assert.equal(conflict.stdout,'');
  const oversized = run(['--stdin'],Buffer.alloc(limit+1,32));
  assert.equal(oversized.status,2);
  assert.equal(oversized.stdout,'');
  assert.match(oversized.stderr,/20 MiB/);
  const empty = run(['--stdin'],'');
  assert.equal(empty.status,2);
  assert.equal(empty.stdout,'');
  assert.doesNotMatch(empty.stderr,/--format/);
});

test('CLI applies the byte cap even if the file size observed before reading is stale', (t) => {
  const {mkdtempSync, rmSync, writeFileSync} = fs;
  const folder = mkdtempSync(join(require('node:os').tmpdir(),'bugcard-size-'));
  t.after(() => rmSync(folder,{recursive:true,force:true}));
  const synthetic = join(folder,'synthetic.jsonl');
  const valid = fs.readFileSync(example);
  writeFileSync(synthetic,Buffer.concat([valid,Buffer.alloc(limit+1-valid.length,32)]));
  const cliSetup = `
    const fs = require('node:fs');
    const knownFile = {size: 1, isFile: () => true};
    const stat = fs.statSync, fstat = fs.fstatSync;
    const target = process.argv[3];
    fs.statSync = (name,...rest) => name===target ? knownFile : stat(name,...rest);
    fs.fstatSync = (fd,...rest) => {
      const observed = fstat(fd,...rest);
      return observed.size===${limit+1} ? knownFile : observed;
    };
    const cli = process.argv[2];
    process.argv = [process.execPath,cli,process.argv[3]];
    require(cli);
  `;
  const out = spawnSync(process.execPath,['-e',cliSetup,'--','fixture',cli,synthetic],{encoding:'utf8'});
  assert.equal(out.status,2,out.stderr);
  assert.equal(out.stdout,'');
  assert.match(out.stderr,/20 MiB/);
});

test('CLI file accepts exactly 20 MiB with an unchanged receipt', (t) => {
  const folder = fs.mkdtempSync(join(require('node:os').tmpdir(),'bugcard-size-'));
  t.after(() => fs.rmSync(folder,{recursive:true,force:true}));
  const synthetic = join(folder,'synthetic.jsonl');
  const valid = fs.readFileSync(example);
  fs.writeFileSync(synthetic,Buffer.concat([valid,Buffer.alloc(limit-valid.length,32)]));
  const out = run([synthetic]);
  const original = run([example]);
  assert.equal(out.status,0,out.stderr);
  assert.equal(out.stdout,original.stdout);
  assert.equal(out.stderr,original.stderr);
});

test('CLI distinguishes a directory from oversized input in each language', (t) => {
  const folder = fs.mkdtempSync(join(require('node:os').tmpdir(),'bugcard-folder-'));
  t.after(() => fs.rmSync(folder,{recursive:true,force:true}));
  for (const [lang,message] of [
    ['en','Choose a regular JSONL file, not a directory or other special file.'],
    ['zh-Hans','请选择普通 JSONL 文件，而不是目录或其他特殊文件。'],
    ['zh-Hant','請選擇一般 JSONL 檔案，而非資料夾或其他特殊檔案。']
  ]) {
    const out = run(['--lang',lang,folder]);
    assert.equal(out.status,2,out.stderr);
    assert.equal(out.stdout,'');
    assert.equal(out.stderr.trim(),message);
    assert.ok(!out.stderr.includes(folder));
  }
  const missing = run([join(folder,'not-here.jsonl')]);
  assert.equal(missing.status,2);
  assert.equal(missing.stdout,'');
  assert.equal(missing.stderr.trim(),'Could not read the selected file.');
});

test('CLI reports invalid UTF-8 without a partial receipt or original bytes', (t) => {
  const folder = fs.mkdtempSync(join(require('node:os').tmpdir(),'bugcard-encoding-'));
  t.after(() => fs.rmSync(folder,{recursive:true,force:true}));
  const path = join(folder,'input.jsonl');
  const fixture = fs.readFileSync(example);
  const invalid = [
    Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(fixture.toString('utf8'),'utf16le')]),
    Buffer.concat([fixture,Buffer.from('\nTEST_ONLY_RAW_123'),Buffer.from([0xe4,0xb8])])
  ];
  for (const bytes of invalid) {
    fs.writeFileSync(path,bytes);
    for (const [lang,message] of [
      ['en','Input is not valid UTF-8. Save the JSONL file as UTF-8 and try again.'],
      ['zh-Hans','输入不是有效的 UTF-8。请将 JSONL 文件保存为 UTF-8 后重试。'],
      ['zh-Hant','輸入不是有效的 UTF-8。請將 JSONL 檔案儲存為 UTF-8 後重試。']
    ]) {
      for (const result of [run(['--lang',lang,path]),run(['--lang',lang,'--stdin'],bytes)]) {
        assert.equal(result.status,2,result.stderr);
        assert.equal(result.stdout,'');
        assert.equal(result.stderr.trim(),message);
      }
    }
  }
});

test('CLI accepts a UTF-8 BOM and retains JSONL partial-parse warnings', (t) => {
  const folder = fs.mkdtempSync(join(require('node:os').tmpdir(),'bugcard-encoding-'));
  t.after(() => fs.rmSync(folder,{recursive:true,force:true}));
  const path = join(folder,'input.jsonl');
  const fixture = fs.readFileSync(example);
  const bytes = Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),fixture,Buffer.from('\n{虚构样例\n')]);
  fs.writeFileSync(path,bytes);
  for (const [args,input] of [[[path],undefined],[['--stdin'],bytes]]) {
    const result = run(args,input);
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stderr,/1 malformed lines skipped/);
    assert.match(result.stdout,/Partial input/);
    assert.doesNotMatch(result.stdout,/虚构样例/);
  }
});
