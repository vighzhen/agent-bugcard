'use strict';
const Bugcard = (() => {
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

  function codexExit(output) {
    const blocks = Array.isArray(output) ? output : [{type: 'text', text: output}];
    for (const block of blocks) {
      if (!['text', 'input_text', 'output_text'].includes(block?.type) || typeof block.text !== 'string') continue;
      const match = /^Chunk ID: [^\r\n]{1,128}\r?\nWall time: [\d.]+ seconds\r?\nProcess exited with code (-?\d{1,10})(?=\r?\n|$)/.exec(block.text.slice(0, 512));
      if (match) return Number(match[1]);
    }
    return null;
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
    function end(format, id, state, code) {
      if (!present(id)) return;
      const callKey = key(format, id);
      const previous = results.get(callKey);
      results.set(callKey, {
        state: previous?.state === 'Error' ? 'Error' : state,
        code: previous?.code ? previous.code : code ?? previous?.code
      });
    }
    for (const line of text.split(/\r?\n/)) {
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
          end('Codex CLI', payload.call_id, 'Returned', codexExit(payload.output));
        }
      } else if (event.type === 'event_msg' && payload) {
        if (payload.type === 'exec_command_end' && present(payload.call_id) && Number.isSafeInteger(payload.exit_code)) {
          completions.set(key('Codex CLI', payload.call_id), {code: payload.exit_code});
        }
        const item = payload.item;
        if (['item_started', 'item_completed'].includes(payload.type) && item?.type === 'CommandExecution' && present(item.id)) {
          add('Codex CLI', item.id, 'exec_command');
          if (payload.type === 'item_completed') {
            completions.set(key('Codex CLI', item.id), {
              code: Number.isSafeInteger(item.exit_code) ? item.exit_code : null,
              state: ['failed','declined'].includes(item.status) ? 'Error' : 'Returned'
            });
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
      const code = acceptsExit ? completion?.code ?? result?.code : null;
      let state = completion?.state ?? result?.state ?? 'Unpaired';
      if (Number.isInteger(code)) state = code === 0 ? 'Returned' : 'Error';
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
  function notice(r){
    const notes=[];if(r.invalid)notes.push(r.invalid+' malformed JSON line(s) skipped.');
    if(r.unmatched)notes.push(r.unmatched+' result ID(s) without a matching call ignored.');
    return notes.join(' ')||'Ready for review. Only recognized calls are counted.';
  }
  const coverage=r=>[r.invalid?r.invalid+' malformed lines skipped':'',r.unmatched?r.unmatched+' unmatched result IDs':''].filter(Boolean).join('; ');
  function label(number, singular) {
    return number + ' ' + singular + (number === 1 ? '' : 's');
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
    const outcome = call => shareCodes && call.exitCode !== undefined && call.state === 'Error'
      ? 'Error (exit ' + call.exitCode + ')' : call.state;
    const hints = {
      126: 'On a POSIX shell, check whether the command can be executed.',
      127: 'On a POSIX shell, check the command name and PATH.'
    };
    return {
      target: showRows ? target : undefined, rows, showCategories, outcome,
      hint: shareCodes && target ? hints[target.exitCode] : undefined
    };
  }

  function markdown(report, options = {}) {
    const view = details(report, options);
    const lines = ['**Agent Bugcard · ' + report.format + '**', ''];
    if (options.example) lines.push('_Synthetic example_', '');
    lines.push(label(report.count, 'recognized tool call') + ' · ' +
      label(report.errors, 'reported error') + ' · ' + label(report.unpaired, 'unpaired call') + '.');
    if (view.target) {
      const category = view.showCategories ? ' · ' + view.target.kind : '';
      lines.push('', '**Call #' + view.target.n + category + ' · ' + view.outcome(view.target) + '**');
      if (view.hint) lines.push('', 'Next check: ' + view.hint);
    }
    if (view.rows.length) {
      const column = view.showCategories ? ' Category |' : '';
      const divider = view.showCategories ? ' --- |' : '';
      lines.push('', '| Call |' + column + ' Outcome |', '| ---: |' + divider + ' --- |');
      for (const call of view.rows) {
        const category = view.showCategories ? ' ' + call.kind + ' |' : '';
        lines.push('| ' + call.n + ' |' + category + ' ' + view.outcome(call) + ' |');
      }
    }
    if (view.rows.some(call => call.state === 'Returned')) {
      lines.push('', 'Returned means a response was recorded.');
    }
    if (coverage(report)) lines.push('', 'Partial input: ' + coverage(report) + '.');
    lines.push('', 'Generated locally with [Agent Bugcard](https://github.com/vighzhen/agent-bugcard).');
    return lines.join('\n');
  }

  function svg(report, options = {}) {
    const view = details(report, options);
    const ink = '#f3f1e9', muted = '#c1cfc6', green = '#ddedab', orange = '#ffbd98';
    const xml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const text = (x, y, value, size, color = ink, weight = 500, mono = false) =>
      '<text x="' + x + '" y="' + y + '" font-family="' + (mono ? 'monospace' : 'Arial, sans-serif') +
      '" font-size="' + size + '" font-weight="' + weight + '" fill="' + color + '">' + xml(value) + '</text>';
    const line = y => '<path d="M26 ' + y + 'H694" stroke="#4b6056"/>';
    const draw = [];
    draw.push(text(26, 33, 'Agent Bugcard', 20, green, 700), text(543, 33, report.format, 15, muted, 600), line(49));
    let y = 87;
    if (view.target) {
      const kind = view.showCategories ? '  /  ' + view.target.kind : '';
      draw.push(text(26, y, 'Call #' + view.target.n + kind + '  /  ' + view.outcome(view.target), 29, ink, 700));
      y += 32;
      if (view.hint) {
        draw.push(text(26, y, view.hint, 18, green, 600));
        y += 33;
      }
    }
    draw.push(text(26, y, label(report.count,'call') + '   ·   ' + label(report.errors,'reported error') +
      '   ·   ' + report.unpaired + ' unpaired', 18, muted));
    y += 19;
    if (view.rows.length) {
      draw.push(line(y));
      y += 24;
      draw.push(text(32, y, 'CALL', 12, muted, 650, true),
        text(138, y, view.showCategories ? 'CATEGORY' : '', 12, muted, 650, true),
        text(449, y, 'OUTCOME', 12, muted, 650, true));
      for (const call of view.rows) {
        y += 34;
        const selected = call === view.target;
        if (selected) draw.push('<rect x="18" y="' + (y - 23) + '" width="684" height="31" rx="5" fill="#4a4438"/>');
        draw.push(text(32,y,'#'+call.n,17,selected ? orange : muted,600,true),
          text(138,y,view.showCategories ? call.kind : '',17,ink,600),
          text(449,y,view.outcome(call),17,call.state === 'Error' ? orange : muted,600));
      }
      y += 18;
    }
    draw.push(line(y));
    if (coverage(report)) {
      y += 23;
      draw.push(text(26, y, 'Partial input: ' + coverage(report) + '.', 14, orange));
    }
    y += 25;
    const note = view.rows.some(call => call.state === 'Returned') ? 'Returned = response recorded.' : 'Generated locally.';
    draw.push(text(26, y, note, 14, muted));
    if(options.example) draw.push(text(535,y,'Synthetic example',14,muted,600));
    const height = y + 18;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 ' + height + '" width="720" height="' +
      height + '" role="img"><title>' + xml(report.format) + ' tool-call receipt</title><rect width="720" height="' +
      height + '" rx="13" fill="#20372e"/>' + draw.join('') + '</svg>';
  }
  return {parse,notice,markdown,svg,limit};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=Bugcard;
