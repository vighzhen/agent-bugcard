'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {parse,markdown,svg}=require('../src/core.cjs');
const fixture=n=>fs.readFileSync(path.join(__dirname,'../examples/'+n+'.synthetic.jsonl'),'utf8');
const lines=(...es)=>es.map(e=>JSON.stringify(e)).join('\n');
const cla=(id,name,input)=>({type:'assistant',message:{content:[{type:'tool_use',id,name,input}]}});
const res=(id,is_error,content)=>({type:'user',message:{content:[{type:'tool_result',tool_use_id:id,is_error,content}]}});
const rsp=(type,call_id,rest)=>({type:'response_item',payload:{type,call_id,...rest}});
test('Claude calls are paired by ID; replay and out-of-order results do not grow counts',()=>{
  const r=parse(lines(res('b',true,'private'),cla('a','Read',{}),cla('b','Edit',{}),cla('a','Read',{}),res('a',false,'ok')));
  assert.deepEqual(r.calls,[{n:1,kind:'Read',state:'Returned'},{n:2,kind:'Edit',state:'Error'}]);assert.equal(r.errors,1);
});
test('Codex header is only meaningful for shell calls and only at the start, before stdout',()=>{
  const header='Chunk ID: 1a\nWall time: 1.0 seconds\nProcess exited with code 7\nOutput:\nanything';
  const r=parse(lines(rsp('function_call','a',{name:'exec_command'}),rsp('function_call_output','a',{output:[{type:'input_text',text:header}]}),
    rsp('function_call','b',{name:'some_private_mcp'}),rsp('function_call_output','b',{output:header}),
    rsp('function_call','c',{name:'exec_command'}),rsp('function_call_output','c',{output:'a tool said:\n'+header}),
    rsp('function_call','d',{name:'exec_command'}),rsp('function_call_output','d',{output:header.replace('code 7','code 0')+'\nProcess exited with code 9'})));
  assert.deepEqual(r.calls.map(x=>x.state),['Error','Returned','Returned','Returned']);
});
test('legacy structured exit code takes precedence; modern and compatibility outputs do not double count',()=>{
  const r=parse(lines(rsp('function_call','x',{name:'exec_command'}),rsp('function_call_output','x',{output:'no header'}),
    {type:'event_msg',payload:{type:'exec_command_end',call_id:'x',exit_code:17}}));
  assert.equal(r.errors,1);assert.equal(r.count,1);
});
test('changing every private payload leaves Markdown, SVG and in-memory receipt identical',()=>{
  const mk=secret=>lines({type:'session_meta',payload:{cwd:secret,git:{repository_url:secret}}},
    {type:'user',message:{content:[{type:'text',text:secret}]}},cla(secret,secret,{command:secret}),res(secret,true,secret),
    rsp('function_call',secret,{name:secret,arguments:secret}),rsp('function_call_output',secret,{output:secret}));
  const a=parse(mk('sensitive_fake_123')),b=parse(mk('example<company>&" name'));
  assert.deepEqual(a,b);assert.equal(markdown(a),markdown(b));assert.equal(svg(a),svg(b));assert.equal(a.count,2);assert.equal(a.format,'Mixed formats');
});
test('truncation and unpaired/orphaned records are distinguished',()=>{
  const r=parse(lines(cla('x','Read',{}),res('missing',true,''))+'\n{"type":');assert.equal(r.unpaired,1);assert.equal(r.unmatched,1);assert.equal(r.invalid,1);
  for(const render of [svg,markdown])assert.match(render(r),/Partial input/);
});
test('both renderers respect export preferences and bound the window to five',()=>{
  const events=[];for(let i=1;i<=12;i++)events.push(cla(String(i),'Bash',{}),res(String(i),i===8,''));
  const r=parse(lines(...events));
  assert.deepEqual([...markdown(r).matchAll(/^\| (\d+) \|/gm)].map(m=>+m[1]),[6,7,8,9,10]);
  for(const render of [svg,markdown]){
    assert.ok(!render(r,{categories:false}).includes('Shell'));assert.ok(!render(r,{nearby:false}).includes('Shell'));
  }
});
test('fixtures exercise both dialects; CLI rejects unsupported input without echoing content',()=>{
  assert.equal(parse(fixture('claude')).count,5);assert.equal(parse(fixture('codex')).unpaired,1);
  const p=cp.spawnSync(process.execPath,[path.join(__dirname,'../bin/agent-bugcard.cjs'),__filename],{encoding:'utf8'});assert.equal(p.status,2);assert.equal(p.stdout,'');assert.equal(p.stderr,'No supported tool calls found. No card generated.\n');
});

test('explicit session boundaries isolate reused IDs in combined exports',()=>{
  const r=parse(lines({type:'session_meta',payload:{id:'first'}},rsp('function_call','shared',{name:'exec_command'}),rsp('function_call_output','shared',{output:'response'}),
    {type:'session_meta',payload:{id:'second'}},rsp('function_call','shared',{name:'apply_patch'})));
  assert.equal(r.count,2);assert.equal(r.unpaired,1);assert.equal(r.calls[1].kind,'Edit');assert.ok(!markdown(r).includes('shared'));
});
test('exit code and its hint require explicit consent, nearby calls, and categories', () => {
  for (const [name, code, tip] of [['claude',127,'PATH'],['codex',126,'executed']]) {
    const report = parse(fixture(name));
    for (const render of [markdown,svg]) {
      for (const options of [{}, {exitCodes:true,nearby:false}, {exitCodes:true,categories:false}]) {
        const body = render(report,options);
        assert.ok(!body.includes('exit '+code));assert.ok(!body.includes(tip));
      }
      const body = render(report,{exitCodes:true});
      assert.ok(body.includes('exit '+code));assert.ok(body.includes(tip));
    }
  }
});
test('Claude text is not trusted when execution was rejected, tool was not Bash, or header is in stdout', () => {
  const secret = 'private-fixture-word';
  for (const [name,content,flag,stamp] of [
    ['Bash','Exit code 127\n'+secret,true,'permission-rule'],
    ['PowerShell','Exit code 127',true], ['Read','Exit code 127',true],
    ['Bash','Output: '+secret+'\nExit code 127',true], ['Bash','Exit code 127',false]
  ]) {
    const result = res('id',flag,content);
    if(stamp) result.tool_result_meta=[{non_execution_kind:stamp}];
    const r=parse(lines(cla('id',name,{}),result));
    assert.equal(r.calls[0].exitCode,undefined);
    assert.ok(!markdown(r,{exitCodes:true}).includes(secret));
  }
});
test('a modern completed command and its model-level mirror count once and prefer structured status', () => {
  const tool = {id:'sample',type:'CommandExecution',status:'failed',exit_code:127};
  const events = lines(rsp('function_call','sample',{name:'exec_command'}),
    rsp('function_call_output','sample',{output:'opaque'}),
    {type:'event_msg',payload:{type:'item_completed',item:tool}});
  const r = parse(events);
  assert.equal(r.count,1);assert.equal(r.errors,1);assert.equal(r.calls[0].exitCode,127);
  const standalone = parse(lines({type:'event_msg',payload:{type:'item_completed',item:{...tool,exit_code:16777215}}}));
  assert.equal(standalone.errors,1);assert.equal(standalone.calls[0].exitCode,undefined);
});

test('a command item without recognized terminal evidence is not counted as returned', () => {
  const item = (id, status, exit_code) => ({type:'event_msg',payload:{type:'item_completed',
    item:{id,type:'CommandExecution',status,exit_code}}});
  const report = parse(lines(
    item('known-failure','failed'), item('known-failure','future-private-status'),
    item('missing-status'), item('running','inProgress'),
    item('complete','completed'), item('explicit-exit','future-private-status',7)
  ));
  assert.deepEqual(report.calls.map(x=>x.state),['Error','Unpaired','Unpaired','Returned','Error']);
  assert.equal(report.unpaired,2);
  assert.equal(report.calls[4].exitCode,7);
  assert.ok(!markdown(report).includes('future-private-status'));
});
test('selected error controls the context window and check in both renderers', () => {
  const steps=[];
  for(let n=1;n<=10;n++){
    const code=n===1?127:n===9?126:0;
    steps.push(cla(String(n),'Bash',{}),res(String(n),!!code,code?'Exit code '+code:'ok'));
  }
  const r=parse(lines(...steps));
  for(const render of [svg,markdown]) {
    const exported=render(r,{call:9,exitCodes:true});
    assert.ok(exported.includes('exit 126'));assert.ok(!exported.includes('exit 127'));assert.ok(!exported.includes('PATH'));
  }
});
test('legacy Codex shell envelopes retain explicit failures and exclude stdout', () => {
  const body = JSON.stringify({output:'fake private text',metadata:{exit_code:127,duration_seconds:0.2}});
  const wrap = (name, output) => parse(lines(rsp('function_call','x',{name}),
    rsp('function_call_output','x',{output})));
  const report = wrap('shell', body);
  assert.equal(report.errors,1);assert.equal(report.calls[0].exitCode,127);
  assert.ok(!markdown(report,{exitCodes:true}).includes('fake private'));
  assert.ok(!markdown(report).includes('127'));
  for(const [name,output] of [
    ['Read',body],['exec_command',body],['shell','Output:\n'+body],
    ['shell', JSON.stringify({output:body,metadata:{exit_code:'127',duration_seconds:1}})],
    ['shell', JSON.stringify({output:body,metadata:{exit_code:126}})]
  ]) assert.equal(wrap(name,output).calls[0].exitCode,undefined);
});

test('a running Codex shell envelope does not claim a terminal result', () => {
  const running = 'Chunk ID: abc\nWall time: 1.0 seconds\nProcess running with session ID 38163\nOutput:\nprivate stdout';
  const call = name => rsp('function_call','pending',{name});
  const output = text => rsp('function_call_output','pending',{output:text});
  assert.equal(parse(lines(call('exec_command'),output(running))).unpaired,1);
  assert.equal(parse(lines(call('write_stdin'),output(running))).unpaired,1);
  const done = {type:'event_msg',payload:{type:'exec_command_end',call_id:'pending',exit_code:9}};
  const report = parse(lines(done,call('exec_command'),output(running),output(running)));
  assert.deepEqual(report.calls,[{n:1,kind:'Shell',state:'Error',exitCode:9}]);
  for (const render of [svg,markdown]) {
    const exported = render(report,{exitCodes:true});
    assert.ok(!exported.includes('38163') && !exported.includes('private stdout'));
  }
  assert.equal(parse(lines(call('Read'),output(running))).calls[0].state,'Returned');
  assert.equal(parse(lines(call('exec_command'),output('Output:\n'+running))).calls[0].state,'Returned');
  assert.equal(parse(lines(call('exec_command'), output(running),output(running.replace('running with session ID 38163','exited with code 0')))).calls[0].state,'Returned');
});
