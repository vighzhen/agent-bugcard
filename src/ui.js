'use strict';

const element = id => document.getElementById(id);
const preferenceKey = 'agent-bugcard-ui-language';
let report = null;
let source = '';
let revision = 0;
let noticeKey = '';
let previewKind = 'md';
let uiLanguage = initialLanguage();

function initialLanguage() {
  const requested = new URLSearchParams(location.search).get('lang');
  let preference = '';
  try { preference = localStorage.getItem(preferenceKey); } catch { /* Optional on file URLs. */ }
  return BugcardLanguages.select([requested, preference, ...(navigator.languages || []), navigator.language]);
}
function t(key, values) { return BugcardLanguages.text(uiLanguage,key,values); }
function applyLanguage() {
  document.documentElement.lang = uiLanguage;
  document.title = t('title');
  document.querySelector('meta[name=description]').content = t('intro');
  element('uiLang').value = uiLanguage;
  for (const node of document.querySelectorAll('[data-t]')) node.textContent = t(node.dataset.t);
  for (const node of document.querySelectorAll('[data-label]')) node.setAttribute('aria-label',t(node.dataset.label));
  for (const option of element('focus').options) option.textContent = t('numbered',{n:option.value});
}
function options() {
  const choice = element('cardLang').value;
  return {
    lang: choice === 'auto' ? uiLanguage : choice,
    nearby: element('nearby').checked, categories: element('categories').checked,
    exitCodes: element('exitCodes').checked, call: Number(element('focus').value),
    example: source === 'claude' || source === 'codex'
  };
}
function writePreview() {
  const opts = options();
  const plain = previewKind === 'text';
  element('previewLabel').textContent = t(plain ? 'textPreview' : 'exact');
  element('md').setAttribute('aria-label', element('previewLabel').textContent);
  element('md').lang = opts.lang;
  element('md').value = report?.count ? (plain ? Bugcard.plainText : Bugcard.markdown)(report,opts) : '';
}
function render() {
  const sharing = options();
  const ready = Boolean(report?.count);
  const ct = (key,values) => BugcardLanguages.text(sharing.lang,key,values);
  for (const id of ['copy','copyText','saveSvg','saveMd']) element(id).disabled = !ready;
  element('card').lang = sharing.lang;
  element('nearby').disabled = !ready;
  element('categories').disabled = !ready || !sharing.nearby;
  const hasExit = report?.calls.some(call => call.exitCode !== undefined);
  element('exitCodes').disabled = !hasExit || !sharing.categories || !sharing.nearby;
  element('focusOpt').hidden = !sharing.nearby || !(report?.errors > 1);
  element('feedback').textContent = '';
  element('notice').textContent = noticeKey ? t(noticeKey) : '';
  element('exact').hidden = !ready;
  for (const id of ['claude','codex']) element(id).setAttribute('aria-pressed',String(source === id));
  element('source').textContent = ct(sharing.example ? 'example' : 'local');
  element('format').textContent = '';
  element('demoInput').hidden = !sharing.example;
  element('sampleText').textContent = sharing.example ? exampleExcerpt(source) : '';
  element('scope').textContent = ready ? t(!sharing.nearby ? 'summaryScope' : hasExit ? 'codeScope' : 'noCode') : '';
  element('rows').replaceChildren();
  element('timeline').hidden = true;
  element('stats').textContent = '';
  element('tip').textContent = '';
  element('legend').textContent = '';
  previewKind = 'md';
  writePreview();
  if (!ready) { element('headline').textContent = ct('noCard'); return; }
  const view = Bugcard.details(report,sharing);
  element('format').textContent = view.format;
  element('headline').textContent = view.target ? Bugcard.heading(view) : ct(sharing.nearby ? 'last' : 'summary');
  element('tip').textContent = view.hint;
  element('stats').textContent = BugcardLanguages.counts(sharing.lang,report);
  element('timeline').hidden = !view.rows.length;
  element('callHead').textContent = ct('call');
  element('categoryHead').textContent = ct('category');
  element('categoryHead').hidden = !view.showCategories;
  element('outcomeHead').textContent = ct('outcome');
  for (const call of view.rows) {
    const row = element('rows').insertRow();
    if (call === view.target) row.className = 'focus';
    row.insertCell().textContent = '#' + call.n;
    if (view.showCategories) row.insertCell().textContent = view.category(call);
    row.insertCell().textContent = view.outcome(call);
  }
  const notes = [];
  if (view.rows.some(call=>call.state==='Returned')) notes.push(ct('legend'));
  if (report.invalid || report.unmatched) notes.push(ct('partial') + ' · ' + Bugcard.notice(report,sharing.lang));
  element('legend').textContent = notes.join(' ');
}

// This panel reads only the bundled fictional examples.
function exampleExcerpt(id) {
  const entries = DEMOS[id].trim().split('\n').map(line=>JSON.parse(line));
  let command, output;
  if (id === 'claude') {
    const blocks = entries.flatMap(entry=>entry.message.content);
    const error = blocks.find(block=>block.type==='tool_result' && block.is_error);
    command = blocks.find(block=>block.type==='tool_use' && block.id===error.tool_use_id).input.command;
    output = error.content;
  } else {
    const calls = entries.map(entry=>entry.payload);
    command = JSON.parse(calls.find(item=>item.type==='function_call').arguments).cmd;
    output = calls.find(item=>item.type==='function_call_output').output;
  }
  return t('command') + ' · ' + command + '\n' + t('result') + '\n' + output;
}
function loadTrace(text,kind) {
  report = Bugcard.parse(text);
  source = kind;
  element('exitCodes').checked = kind !== 'file';
  const focus = element('focus');
  focus.replaceChildren();
  for (const call of report.calls) {
    if (call.state === 'Error') focus.add(new Option(t('numbered',{n:call.n}),String(call.n)));
  }
  noticeKey = report.count ? '' : 'none';
  render();
}
function demo(kind) {
  revision++;
  element('file').value = '';
  loadTrace(DEMOS[kind],kind);
}
element('uiLang').onchange = () => {
  uiLanguage = element('uiLang').value;
  try { localStorage.setItem(preferenceKey,uiLanguage); } catch { /* Optional preference. */ }
  if (/^https?:$/.test(location.protocol)) {
    const address = new URL(location.href);
    address.searchParams.set('lang',uiLanguage);
    try { history.replaceState(null,'',address); } catch { /* The selected language still works. */ }
  }
  applyLanguage();
  render();
};
for (const id of ['claude','codex']) element(id).onclick = () => demo(id);
for (const id of ['nearby','categories','exitCodes','focus','cardLang']) element(id).onchange = render;
element('file').onchange = async () => {
  const file = element('file').files[0];
  if (!file) return;
  const request = ++revision;
  element('file').value = '';
  element('exitCodes').checked = false;
  element('demoInput').open = false;
  source = 'file';
  report = null;
  noticeKey = file.size > Bugcard.limit ? 'large' : 'loading';
  render();
  if (file.size > Bugcard.limit) return;
  try {
    const text = await file.text();
    if (request === revision) loadTrace(text,'file');
  } catch {
    if (request === revision) { noticeKey = 'unreadable'; render(); }
  }
};
function download(format) {
  if (!report?.count) return;
  const body = (format === 'svg' ? Bugcard.svg : Bugcard.markdown)(report,options());
  const type = format === 'svg' ? 'image/svg+xml' : 'text/markdown';
  const url = URL.createObjectURL(new Blob([body+'\n'],{type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'agent-bugcard.' + format;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function copy(kind) {
  if (!report?.count) return;
  const opts = options();
  const request = revision;
  const body = (kind === 'md' ? Bugcard.markdown : Bugcard.plainText)(report,opts);
  const stillCurrent = () => request === revision && JSON.stringify(opts) === JSON.stringify(options());
  try {
    await navigator.clipboard.writeText(body);
    if (stillCurrent()) element('feedback').textContent = t(kind === 'md' ? 'copiedMd' : 'copiedText');
  } catch {
    if (!stillCurrent()) return;
    previewKind = kind;
    writePreview();
    element('exact').open = true;
    element('md').focus();
    element('md').select();
    element('feedback').textContent = t('manual');
  }
}
element('copy').onclick = () => copy('md');
element('copyText').onclick = () => copy('text');
element('saveSvg').onclick = () => download('svg');
element('saveMd').onclick = () => download('md');
// Download the static document itself, never a serialization of a user's loaded session.
const offlineAddress = new URL(location.href);
offlineAddress.hash = '';
offlineAddress.search = '';
if (offlineAddress.pathname.endsWith('/')) offlineAddress.pathname += 'index.html';
element('offline').href = offlineAddress.href;
applyLanguage();
demo('claude');
