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
