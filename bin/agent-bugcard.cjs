#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const core = require('../src/core.cjs');
const args = process.argv.slice(2);
const usage = 'Usage: node bin/agent-bugcard.cjs FILE [--format md|svg] [--summary-only] [--hide-categories]';
if (args.includes('--help') || args.includes('-h')) { console.log(usage); process.exit(0); }
function fail(msg) { console.error(msg); process.exit(2); }
let file, format='md', nearby=true, categories=true;
for (let i=0;i<args.length;i++) {
  if (args[i]==='--format') { format=args[++i]; if (!['md','svg'].includes(format)) fail(usage); }
  else if (args[i]==='--summary-only') nearby=false;
  else if (args[i]==='--hide-categories') categories=false;
  else if (!file && !args[i].startsWith('-')) file=args[i];
  else fail(usage);
}
if (!file) fail(usage);
let raw;
try {
  const s=fs.statSync(file);
  if (!s.isFile() || s.size>core.limit) fail('Choose a regular JSONL file up to 20 MiB.');
  raw=fs.readFileSync(file,'utf8');
} catch { fail('Could not read the selected file.'); }
const receipt=core.parse(raw); raw=null;
if (!receipt.count) fail('No supported tool calls found. No card generated.');
const opts={nearby,categories};
if (receipt.invalid || receipt.unmatched) console.error(core.notice(receipt));
process.stdout.write((format==='svg'?core.svg:core.markdown)(receipt,opts)+'\n');
