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
