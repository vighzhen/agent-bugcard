'use strict';
const Bugcard = (() => {
  const languages = typeof module !== 'undefined' && module.exports
    ? require('./locale.cjs') : BugcardLanguages;
  // Only this fixed vocabulary and derived counts may reach either renderer.
  const groups = new Map(Object.entries({
    Bash:'Shell',PowerShell:'Shell',exec_command:'Shell',write_stdin:'Shell',shell:'Shell',shell_command:'Shell',
    Read:'Read',read_file:'Read',View:'Read',Edit:'Edit',Write:'Edit',MultiEdit:'Edit',NotebookEdit:'Edit',apply_patch:'Edit',
    Glob:'Search',Grep:'Search',WebSearch:'Search',WebFetch:'Fetch',Task:'Delegate',Agent:'Delegate'
  }));
  const limit=20*1024*1024;
  const kind=(s)=>groups.get(s)||'Other';
  const present=(x)=>typeof x==='string' && x.length>0;
  function firstText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content) && content[0]?.type === 'text') return content[0].text;
    return null;
  }

  function codexShellHeader(output) {
    const blocks = Array.isArray(output) ? output : [{type: 'text', text: output}];
    for (const block of blocks) {
      if (!['text', 'input_text', 'output_text'].includes(block?.type) || typeof block.text !== 'string') continue;
      const match = /^Chunk ID: [^\r\n]{1,128}\r?\nWall time: [\d.]+ seconds\r?\nProcess exited with code (-?\d{1,10})(?=\r?\n|$)/.exec(block.text.slice(0, 512));
      if (match) return {code: Number(match[1])};
      if (/^Chunk ID: [^\r\n]{1,128}\r?\nWall time: [\d.]+ seconds\r?\nProcess running with session ID \d{1,20}(?=\r?\n|$)/.test(block.text.slice(0, 512))) {
        return {pending: true};
      }
    }
    return null;
  }

  function legacyShellExit(output) {
    // The legacy shell tool wraps stdout and measured duration in a JSON envelope.
    if (typeof output !== 'string' || !output.startsWith('{')) return null;
    let envelope;
    try { envelope = JSON.parse(output); }
    catch { return null; }
    const meta = envelope?.metadata;
    if (typeof envelope?.output !== 'string' || !Number.isFinite(meta?.duration_seconds)
        || meta.duration_seconds < 0 || !Number.isInteger(meta.exit_code)) return null;
    return meta.exit_code;
  }

  function claudeExit(block, message) {
    if (block.is_error !== true) return null;
    const flags = message.tool_result_meta ?? message.toolResultMeta;
    if (Array.isArray(flags) && flags.some(item => item?.non_execution_kind)) return null;
    const content = firstText(block.content);
    if (typeof content !== 'string') return null;
    const match = /^Exit code ([1-9]\d{0,2})(?=\r?\n|$)/.exec(content.slice(0, 40));
    return match ? Number(match[1]) : null;
  }

  function parse(text) {
    const calls = new Map();
    const results = new Map();
    const completions = new Map();
    const sessions = {'Claude Code': '', 'Codex CLI': ''};
    let invalid = 0;
    function key(format, id) {
      return JSON.stringify([format, sessions[format], id]);
    }
    function add(format, id, name) {
      if (!present(id) || !present(name)) return;
      const callKey = key(format, id);
      if (!calls.has(callKey)) calls.set(callKey, {format, name});
    }
    function end(format, id, state, code, legacyCode = null, pending = false) {
      if (!present(id)) return;
      const callKey = key(format, id);
      const previous = results.get(callKey);
      results.set(callKey, {
        state: previous?.state === 'Error' ? 'Error' : state,
        pending: pending || previous?.pending === true,
        code: previous?.code ? previous.code : code ?? previous?.code,
        legacyCode: previous?.legacyCode ? previous.legacyCode : legacyCode ?? previous?.legacyCode
      });
    }
    function complete(id, code, failed = false) {
      const callKey = key('Codex CLI', id);
      const previous = completions.get(callKey);
      // 结构化结果可能重复；后来的成功镜像不能覆盖已经明确的失败。
      const nonzero = Number.isInteger(code) && code !== 0;
      const priorNonzero = Number.isInteger(previous?.code) && previous.code !== 0;
      const state = failed || nonzero || previous?.state === 'Error' ? 'Error' : 'Returned';
      completions.set(callKey, {state, code: nonzero || !priorNonzero ? code ?? previous?.code : previous.code});
    }
    // Tolerate one UTF-8 BOM at the file boundary without masking malformed later records.
    const jsonl = text.startsWith('\uFEFF') ? text.slice(1) : text;
    for (const line of jsonl.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); }
      catch { invalid++; continue; }
      if (!event || typeof event !== 'object') continue;
      const payload = event.payload;
      if (event.type === 'assistant' || event.type === 'user') {
        if (present(event.sessionId)) sessions['Claude Code'] = event.sessionId;
        if (!Array.isArray(event.message?.content)) continue;
        for (const block of event.message.content) {
          if (event.type === 'assistant' && block?.type === 'tool_use') add('Claude Code', block.id, block.name);
          if (event.type === 'user' && block?.type === 'tool_result') {
            end('Claude Code', block.tool_use_id, block.is_error === true ? 'Error' : 'Returned', claudeExit(block, event));
          }
        }
      } else if (event.type === 'session_meta' && present(payload?.id)) {
        sessions['Codex CLI'] = payload.id;
      } else if (event.type === 'response_item' && payload) {
        if (['function_call', 'custom_tool_call'].includes(payload.type)) add('Codex CLI', payload.call_id, payload.name);
        if (['function_call_output', 'custom_tool_call_output'].includes(payload.type)) {
          const header = codexShellHeader(payload.output);
          end('Codex CLI', payload.call_id, 'Returned', header?.code, legacyShellExit(payload.output), header?.pending);
        }
      } else if (event.type === 'event_msg' && payload) {
        if (payload.type === 'exec_command_end' && present(payload.call_id) && Number.isSafeInteger(payload.exit_code)) {
          complete(payload.call_id, payload.exit_code);
        }
        const item = payload.item;
        if (['item_started', 'item_completed'].includes(payload.type) && item?.type === 'CommandExecution' && present(item.id)) {
          add('Codex CLI', item.id, 'exec_command');
          if (payload.type === 'item_completed') {
            const code = Number.isSafeInteger(item.exit_code) ? item.exit_code : null;
            const failed = ['failed','declined'].includes(item.status);
            // The record name alone is not terminal evidence and must not erase a known result.
            if (code !== null || failed || item.status === 'completed') {
              complete(item.id, code, failed);
            }
          }
        }
      }
    }

    const rows = [];
    const formats = new Set();
    for (const [id, call] of calls) {
      const group = kind(call.name);
      formats.add(call.format);
      const result = results.get(id);
      const completion = group === 'Shell' ? completions.get(id) : undefined;
      // Claude's textual exit header is recognized only on a Bash error result.
      const acceptsExit = call.format === 'Codex CLI' ? group === 'Shell' : call.name === 'Bash';
      const legacyCode = call.name === 'shell' || call.name === 'shell_command' ? result?.legacyCode : null;
      // 结构化非零值优先；结构化零值不能抹掉明确的输出失败证据。
      const candidates = [completion?.code, result?.code, legacyCode];
      const code = acceptsExit
        ? candidates.find(value => Number.isInteger(value) && value !== 0)
          ?? completion?.code ?? result?.code ?? legacyCode
        : null;
      const awaitingExit = group === 'Shell' && call.format === 'Codex CLI' && result?.pending;
      let state = completion?.state ?? (awaitingExit ? 'Unpaired' : result?.state ?? 'Unpaired');
      // A contradictory zero exit must not erase a known terminal failure.
      if (Number.isInteger(code) && state !== 'Error') state = code === 0 ? 'Returned' : 'Error';
      const row = {n: rows.length + 1, kind: group, state};
      // Preserve failures outside 1..255 as errors, but never export that number.
      if (Number.isInteger(code) && code > 0 && code <= 255) row.exitCode = code;
      rows.push(row);
    }
    let unmatched = 0;
    for (const id of new Set([...results.keys(), ...completions.keys()])) {
      if (!calls.has(id)) unmatched++;
    }
    return {
      format: formats.size > 1 ? 'Mixed formats' : [...formats][0] || 'Unknown',
      count: rows.length, errors: rows.filter(call => call.state === 'Error').length,
      unpaired: rows.filter(call => call.state === 'Unpaired').length, calls: rows, invalid, unmatched
    };
  }
  function coverage(report, lang = 'en') {
    const notes = [];
    if (report.invalid) notes.push(languages.text(lang, 'invalid', {n: report.invalid}));
    if (report.unmatched) notes.push(languages.text(lang, 'unmatched', {n: report.unmatched}));
    return notes.join(lang === 'en' ? '; ' : '，');
  }
  function notice(report, lang = 'en') {
    return coverage(report, lang) || languages.text(lang, 'ready');
  }

  function details(report, options) {
    const showRows = options.nearby !== false;
    const showCategories = options.categories !== false;
    const shareCodes = showRows && showCategories && options.exitCodes === true;
    const target = report.calls.find(call => call.state === 'Error' && call.n === options.call)
      || report.calls.find(call => call.state === 'Error');
    const start = target
      ? Math.max(0, Math.min(target.n - 3, report.count - 5))
      : Math.max(0, report.count - 5);
    const rows = showRows ? report.calls.slice(start, start + 5) : [];
    const lang = languages.select([options.lang]);
    const t = (key, data) => languages.text(lang, key, data);
    const outcome = call => shareCodes && call.exitCode !== undefined && call.state === 'Error'
      ? t('exit', {n:call.exitCode}) : t(call.state);
    const hint = shareCodes && target && [126,127].includes(target.exitCode)
      ? t('hint' + target.exitCode) : '';
    return {
      lang, t, target: showRows ? target : undefined, rows, showCategories, outcome, hint,
      category: call => t(call.kind),
      format: ['Unknown','Mixed formats'].includes(report.format) ? t(report.format) : report.format
    };
  }

  function heading(view) {
    if (!view.target) return '';
    return [view.t('numbered', {n:view.target.n}), view.showCategories ? view.category(view.target) : '', view.outcome(view.target)]
      .filter(Boolean).join(' · ');
  }

  function written(report, options, plain) {
    const view = details(report, options);
    const {lang, t} = view;
    const bold = content => plain ? content : '**' + content + '**';
    const colon = lang === 'en' ? ': ' : '：';
    const lines = [bold('Agent Bugcard · ' + view.format), ''];
    if (options.example) lines.push(plain ? t('example') : '_' + t('example') + '_', '');
    lines.push(languages.counts(lang, report, true));
    if (view.target) {
      lines.push('', bold(heading(view)));
      if (view.hint) lines.push('', t('next') + colon + view.hint);
    }
    if (view.rows.length) {
      lines.push('');
      const labels = [t('call'), ...(view.showCategories ? [t('category')] : []), t('outcome')];
      if (!plain) {
        lines.push('| ' + labels.join(' | ') + ' |', '| ---: | ' + labels.slice(1).map(()=>'---').join(' | ') + ' |');
      }
      for (const call of view.rows) {
        const cells = [plain ? '#' + call.n : String(call.n), ...(view.showCategories ? [view.category(call)] : []), view.outcome(call)];
        lines.push(plain ? cells.join(' · ') : '| ' + cells.join(' | ') + ' |');
      }
    }
    if (view.rows.some(call=>call.state==='Returned')) lines.push('', t('legend'));
    const warnings = coverage(report, lang);
    if (warnings) lines.push('', t('partial') + colon + warnings);
    if (!plain) lines.push('', t('generated') + ' [Agent Bugcard](https://github.com/vighzhen/agent-bugcard).');
    return lines.join('\n');
  }
  function markdown(report, options = {}) { return written(report, options, false); }
  function plainText(report, options = {}) { return written(report, options, true); }

  function svg(report, options = {}) {
    const view = details(report, options);
    const ink = '#f3f1e9', muted = '#c1cfc6', green = '#ddedab', orange = '#ffbd98';
    const xml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const text = (x, y, value, size, color = ink, weight = 500, mono = false) =>
      '<text x="' + x + '" y="' + y + '" font-family="' + (mono ? 'monospace' : 'Arial, sans-serif') +
      '" font-size="' + size + '" font-weight="' + weight + '" fill="' + color + '">' + xml(value) + '</text>';
    const line = y => '<path d="M26 ' + y + 'H694" stroke="#4b6056"/>';
    const draw = [];
    const {t,lang} = view;
    draw.push(text(26, 33, 'Agent Bugcard', 20, green, 700), text(543, 33, view.format, 15, muted, 600), line(49));
    let y = 87;
    if (view.target) {
      const kind = view.showCategories ? '  /  ' + view.category(view.target) : '';
      draw.push(text(26, y, t('numbered', {n:view.target.n}) + kind + '  /  ' + view.outcome(view.target), 29, ink, 700));
      y += 32;
      if (view.hint) {
        draw.push(text(26, y, view.hint, 18, green, 600));
        y += 33;
      }
    }
    draw.push(text(26, y, languages.counts(lang, report), 18, muted));
    y += 19;
    if (view.rows.length) {
      draw.push(line(y));
      y += 24;
      draw.push(text(32, y, t('call').toUpperCase(), 12, muted, 650, true),
        text(138, y, view.showCategories ? t('category').toUpperCase() : '', 12, muted, 650, true),
        text(449, y, t('outcome').toUpperCase(), 12, muted, 650, true));
      for (const call of view.rows) {
        y += 34;
        const selected = call === view.target;
        if (selected) draw.push('<rect x="18" y="' + (y - 23) + '" width="684" height="31" rx="5" fill="#4a4438"/>');
        draw.push(text(32,y,'#'+call.n,17,selected ? orange : muted,600,true),
          text(138,y,view.showCategories ? view.category(call) : '',17,ink,600),
          text(449,y,view.outcome(call),17,call.state === 'Error' ? orange : muted,600));
      }
      y += 18;
    }
    draw.push(line(y));
    if (coverage(report, lang)) {
      y += 23;
      draw.push(text(26, y, t('partial') + ' · ' + coverage(report, lang), 14, orange));
    }
    y += 25;
    const note = view.rows.some(call => call.state === 'Returned') ? t('legend') : t('localNote');
    draw.push(text(26, y, note, 14, muted));
    if(options.example) draw.push(text(535,y,t('example'),14,muted,600));
    const height = y + 18;
    return '<svg xmlns="http://www.w3.org/2000/svg" xml:lang="' + lang + '" viewBox="0 0 720 ' + height + '" width="720" height="' +
      height + '" role="img"><title>' + xml(view.format) + ' ' + t('svgTitle') + '</title><rect width="720" height="' +
      height + '" rx="13" fill="#20372e"/>' + draw.join('') + '</svg>';
  }
  return {parse,notice,details,heading,markdown,plainText,svg,limit};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=Bugcard;
