'use strict';

const element = id => document.getElementById(id);
let report = null;
let source = '';
let revision = 0;

function options() {
  return {
    nearby: element('nearby').checked,
    categories: element('categories').checked,
    exitCodes: element('exitCodes').checked,
    call: Number(element('focus').value),
    example: source === 'claude' || source === 'codex'
  };
}

function render() {
  const sharing = options();
  const ready = Boolean(report?.count);
  for (const id of ['copy','saveSvg','saveMd']) element(id).disabled = !ready;
  element('nearby').disabled = !ready;
  element('categories').disabled = !ready || !sharing.nearby;
  const hasExit = report?.calls.some(call => call.exitCode !== undefined);
  element('exitCodes').disabled = !hasExit || !sharing.categories || !sharing.nearby;
  element('focusOpt').hidden = !sharing.nearby || !(report?.errors > 1);
  element('feedback').textContent = '';
  element('exact').hidden = !ready;
  for (const id of ['claude','codex']) element(id).setAttribute('aria-pressed',String(source === id));
  element('source').textContent = sharing.example ? 'Synthetic example' : 'Local session';
  element('format').textContent = ready ? report.format : '';
  element('demoInput').hidden = !sharing.example;
  element('sampleText').textContent = sharing.example ? exampleExcerpt(source) : '';
  element('scope').textContent = !ready ? '' : !sharing.nearby
    ? 'Only counts, agent format and parsing notes are shared.'
    : hasExit ? 'Turning off exit codes also removes the related troubleshooting hint.'
    : 'This session contains no recognized shell failure code.';
  element('rows').replaceChildren();
  element('timeline').hidden = true;
  element('stats').textContent = '';
  element('tip').textContent = '';
  element('legend').textContent = '';
  if (!ready) {
    element('headline').textContent = 'No receipt to export';
    element('md').value = '';
    return;
  }
  const view = Bugcard.details(report,sharing);
  const selected = view.target;
  const title = selected ? ['Call #' + selected.n, view.showCategories ? selected.kind : '', view.outcome(selected)].filter(Boolean).join(' / ')
    : sharing.nearby ? 'Last observed calls' : 'Session summary';
  element('headline').textContent = title;
  element('tip').textContent = view.hint || '';
  const count = (n,noun) => n + ' ' + noun + (n === 1 ? '' : 's');
  element('stats').textContent = count(report.count,'call') + ' · ' + count(report.errors,'reported error') + ' · ' + report.unpaired + ' unpaired';
  element('timeline').hidden = !view.rows.length;
  element('categoryHead').hidden = !view.showCategories;
  for (const call of view.rows) {
    const row = element('rows').insertRow();
    if (call === selected) row.className = 'focus';
    row.insertCell().textContent = '#' + call.n;
    if (view.showCategories) row.insertCell().textContent = call.kind;
    row.insertCell().textContent = view.outcome(call);
  }
  element('legend').textContent = view.rows.some(call=>call.state==='Returned') ? 'Returned means a response was recorded.' : '';
  if (report.invalid || report.unmatched) element('legend').textContent += ' Partial input. ' + Bugcard.notice(report);
  element('md').value = Bugcard.markdown(report,sharing);
}

// Only the two bundled, invented examples can supply content to this panel.
function exampleExcerpt(id) {
  const entries = DEMOS[id].trim().split('\n').map(line=>JSON.parse(line));
  if (id === 'claude') {
    const error = entries.flatMap(e=>e.message.content).find(b=>b.type==='tool_result' && b.is_error);
    const call = entries.flatMap(e=>e.message.content).find(b=>b.type==='tool_use' && b.id===error.tool_use_id);
    return 'Command: ' + call.input.command + '\nResult:\n' + error.content;
  }
  const call = entries.find(e=>e.payload.type==='function_call').payload;
  const result = entries.find(e=>e.payload.type==='function_call_output').payload;
  return 'Command: ' + JSON.parse(call.arguments).cmd + '\nResult:\n' + result.output;
}

function loadTrace(text, kind) {
  report = Bugcard.parse(text);
  source = kind;
  element('exitCodes').checked = kind !== 'file';
  const focus = element('focus');
  focus.replaceChildren();
  for (const call of report.calls) {
    if (call.state === 'Error') focus.add(new Option('Call #' + call.n, String(call.n)));
  }
  element('notice').textContent = report.count
    ? '' : 'No supported tool calls found. Choose a Claude Code or Codex CLI session JSONL.';
  render();
}

function demo(kind) {
  revision++;
  element('file').value = '';
  loadTrace(DEMOS[kind],kind);
}

for (const id of ['claude','codex']) element(id).onclick = () => demo(id);
for (const id of ['nearby','categories','exitCodes','focus']) element(id).onchange = render;
element('file').onchange = async () => {
  const file = element('file').files[0];
  if (!file) return;
  const request = ++revision;
  element('file').value = '';
  element('exitCodes').checked = false;
  element('demoInput').open = false;
  source = 'file';
  report = null;
  render();
  if (file.size > Bugcard.limit) {
    element('notice').textContent = 'Choose a single JSONL file up to 20 MiB.';
    return;
  }
  element('notice').textContent = 'Reading the file locally…';
  try {
    const text = await file.text();
    if (request === revision) loadTrace(text,'file');
  } catch {
    if (request === revision) element('notice').textContent = 'Could not read the selected file.';
  }
};

function download(format) {
  if (!report?.count) return;
  const body = format === 'svg' ? Bugcard.svg(report,options()) : element('md').value;
  const type = format === 'svg' ? 'image/svg+xml' : 'text/markdown';
  const url = URL.createObjectURL(new Blob([body+'\n'],{type}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'agent-bugcard.' + format;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

element('copy').onclick = async () => {
  if (!report?.count) return;
  const request = revision;
  const body = element('md').value;
  const stillCurrent = () => request === revision && body === element('md').value;
  try {
    await navigator.clipboard.writeText(body);
    if (stillCurrent()) element('feedback').textContent = 'Copied. Paste into your issue and describe what you expected.';
  } catch {
    if (!stillCurrent()) return;
    element('exact').open = true;
    element('md').focus();
    element('md').select();
    element('feedback').textContent = 'Markdown selected. Press Ctrl+C or ⌘C to copy it.';
  }
};
element('saveSvg').onclick = () => download('svg');
element('saveMd').onclick = () => download('md');
demo('claude');
