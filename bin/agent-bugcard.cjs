#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const core = require('../src/core.cjs');
const languages = require('../src/locale.cjs');
const argv = process.argv.slice(2);
const delimiter = argv.indexOf('--');
const args = delimiter === -1 ? argv : argv.slice(0, delimiter);
const positionals = delimiter === -1 ? [] : argv.slice(delimiter + 1);
const localeIndex = args.indexOf('--lang');
const lang = localeIndex === -1 ? 'en' : languages.match(args[localeIndex + 1]);
function fail(message) { console.error(message); process.exit(2); }
if (!lang) fail('--lang: en | zh-Hans | zh-Hant');
const t = key => languages.text(lang,key);
const usage = t('cliUsage') + ': node bin/agent-bugcard.cjs [--lang en|zh-Hans|zh-Hant] [--format md|svg|text] [--summary-only] [--hide-categories] [--exit-codes] [--call NUMBER] [--] FILE';
if (args.includes('--help') || args.includes('-h')) { console.log(usage); process.exit(0); }

let file, format='md', nearby=true, categories=true, exitCodes=false, call;
for (let i=0; i<args.length; i++) {
  switch (args[i]) {
    case '--lang': if (i !== localeIndex) fail(usage); i++; break;
    case '--format': format=args[++i]; if (!['md','svg','text'].includes(format)) fail(usage); break;
    case '--summary-only': nearby=false; break;
    case '--hide-categories': categories=false; break;
    case '--exit-codes': exitCodes=true; break;
    case '--call': {
      const value = args[++i];
      call=Number(value);
      if (!value || /[^0-9]/.test(value) || !Number.isSafeInteger(call) || call<1) fail(t('cliNumber'));
      break;
    }
    default:
      if (file || args[i].startsWith('-')) fail(usage);
      file=args[i];
  }
}
if (delimiter !== -1) {
  if (file || positionals.length !== 1) fail(usage);
  [file] = positionals;
}
if (!file) fail(usage);
let raw;
try {
  const stat=fs.statSync(file);
  if (!stat.isFile() || stat.size>core.limit) fail(t('cliSize'));
  raw=fs.readFileSync(file,'utf8');
} catch { fail(t('cliRead')); }
const receipt=core.parse(raw);
raw=null;
if (!receipt.count) fail(t('cliNone'));
if (call && !receipt.calls.some(row=>row.n===call && row.state==='Error')) fail(t('cliCall'));
if (receipt.invalid || receipt.unmatched) console.error(core.notice(receipt,lang));
const render={md:core.markdown,svg:core.svg,text:core.plainText}[format];
process.stdout.write(render(receipt,{lang,nearby,categories,exitCodes,call})+'\n');
