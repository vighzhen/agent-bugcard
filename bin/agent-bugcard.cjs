#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const {TextDecoder} = require('node:util');
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
const inputError = {
  en: {kind:'Choose a regular JSONL file, not a directory or other special file.', size:'Input exceeds 20 MiB.', encoding:'Input is not valid UTF-8. Save the JSONL file as UTF-8 and try again.'},
  'zh-Hans': {kind:'请选择普通 JSONL 文件，而不是目录或其他特殊文件。', size:'输入超过 20 MiB。', encoding:'输入不是有效的 UTF-8。请将 JSONL 文件保存为 UTF-8 后重试。'},
  'zh-Hant': {kind:'請選擇一般 JSONL 檔案，而非資料夾或其他特殊檔案。', size:'輸入超過 20 MiB。', encoding:'輸入不是有效的 UTF-8。請將 JSONL 檔案儲存為 UTF-8 後重試。'}
}[lang];
const NOT_REGULAR = Symbol('not a regular file');
const usage = t('cliUsage') + ': node bin/agent-bugcard.cjs [--lang en|zh-Hans|zh-Hant] [--format md|svg|text] [--summary-only] [--hide-categories] [--exit-codes] [--call NUMBER] ([--] FILE | --stdin)';
if (args.includes('--help') || args.includes('-h')) { console.log(usage); process.exit(0); }

let file, format, nearby=true, categories=true, exitCodes=false, call, stdin=false;
for (let i=0; i<args.length; i++) {
  switch (args[i]) {
    case '--lang': if (i !== localeIndex) fail(usage); i++; break;
    case '--format': if (format !== undefined) fail(usage); format=args[++i]; if (!['md','svg','text'].includes(format)) fail(usage); break;
    case '--stdin': if (stdin) fail(usage); stdin=true; break;
    case '--summary-only': nearby=false; break;
    case '--hide-categories': categories=false; break;
    case '--exit-codes': exitCodes=true; break;
    case '--call': {
      if (call !== undefined) fail(usage);
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
if (stdin === Boolean(file)) fail(usage);

function renderReceipt(bytes) {
  let raw;
  try {
    // 保留开头的 BOM，由共用解析器处理；不以替换字符掩盖损坏的编码。
    raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  } catch { fail(inputError.encoding); }
  const receipt=core.parse(raw);
  if (!receipt.count) fail(t('cliNone'));
  if (call && !receipt.calls.some(row=>row.n===call && row.state==='Error')) fail(t('cliCall'));
  if (receipt.invalid || receipt.unmatched) console.error(core.notice(receipt,lang));
  const render={md:core.markdown,svg:core.svg,text:core.plainText}[format ?? 'md'];
  process.stdout.write(render(receipt,{lang,nearby,categories,exitCodes,call})+'\n');
}

async function readStdin() {
  const chunks=[];
  let size=0;
  for await (const chunk of process.stdin) {
    size+=chunk.length;
    if (size>core.limit) fail(inputError.size);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks,size);
}

function readFileBounded(path) {
  // 某些平台不能以文件方式打开目录；仍须检查实际打开的描述符。
  if (!fs.statSync(path).isFile()) return NOT_REGULAR;
  const fd=fs.openSync(path,fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0));
  try {
    const stat=fs.fstatSync(fd);
    if (!stat.isFile()) return NOT_REGULAR;
    if (stat.size>core.limit) return null;
    const chunks=[];
    let size=0;
    // The opened file can grow after fstat; bound the bytes actually read.
    for (;;) {
      const chunk=Buffer.allocUnsafe(Math.min(64*1024,core.limit+1-size));
      const count=fs.readSync(fd,chunk,0,chunk.length,null);
      if (!count) return Buffer.concat(chunks,size);
      size+=count;
      if (size>core.limit) return null;
      chunks.push(chunk.subarray(0,count));
    }
  } finally {
    fs.closeSync(fd);
  }
}

if (stdin) {
  if (process.stdin.isTTY) fail(usage);
  readStdin().then(renderReceipt,()=>fail(t('cliRead')));
} else {
  let raw;
  try {
    raw=readFileBounded(file);
  } catch { fail(t('cliRead')); }
  if (raw===NOT_REGULAR) fail(inputError.kind);
  if (raw===null) fail(inputError.size);
  renderReceipt(raw);
}
