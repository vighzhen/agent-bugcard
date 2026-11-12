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
  function exitStatus(output){
    let s=output;
    if(Array.isArray(s)){
      for(const x of s){if(x && ['input_text','output_text','text'].includes(x.type) && typeof x.text==='string'){const state=exitStatus(x.text);if(state)return state;}}
      return null;
    }
    if(typeof s!=='string')return null;
    // Only inspect the known execution header. Never search arbitrary stdout for an error phrase.
    const m=/^Chunk ID: [^\r\n]{1,128}\r?\nWall time: [\d.]+ seconds\r?\nProcess exited with code (-?\d{1,6})(?=\r?\n|$)/.exec(s.slice(0,512));
    return m ? (Number(m[1])===0?'Returned':'Error') : null;
  }
  function parse(text){
    const calls=new Map(),results=new Map(),execEnds=new Map(); let invalid=0;
    const sessions={'Claude Code':'','Codex CLI':''};
    const key=(f,id)=>JSON.stringify([f,sessions[f],id]);
    function add(f,id,name){
      if(!present(id)||!present(name))return;
      const k=key(f,id);if(!calls.has(k))calls.set(k,{f,kind:kind(name)});
    }
    function end(f,id,result,header=null){
      if(!present(id))return;
      const k=key(f,id),prev=results.get(k);
      // A repeated content block is still the same call. Preserve any reported error.
      results.set(k,{result:prev?.result==='Error'?'Error':result,header:prev?.header==='Error'?'Error':header||prev?.header});
    }
    for(const line of text.split(/\r?\n/)){
      if(!line.trim())continue;
      let e;try{e=JSON.parse(line);}catch{invalid++;continue;}
      if(!e || typeof e!=='object')continue;
      const p=e.payload;
      if((e.type==='assistant'||e.type==='user') && present(e.sessionId))sessions['Claude Code']=e.sessionId;
      if(e.type==='session_meta' && present(p?.id))sessions['Codex CLI']=p.id;
      if((e.type==='assistant'||e.type==='user')&&Array.isArray(e.message?.content)){
        for(const b of e.message.content){
          if(!b)continue;
          if(e.type==='assistant'&&b.type==='tool_use')add('Claude Code',b.id,b.name);
          if(e.type==='user'&&b.type==='tool_result')end('Claude Code',b.tool_use_id,b.is_error===true?'Error':'Returned');
        }
      }else if(e.type==='response_item' && p){
        if(p.type==='function_call'||p.type==='custom_tool_call')add('Codex CLI',p.call_id,p.name);
        if(p.type==='function_call_output'||p.type==='custom_tool_call_output')end('Codex CLI',p.call_id,'Returned',exitStatus(p.output));
      }else if(e.type==='event_msg'&&p?.type==='exec_command_end'&&present(p.call_id)&&Number.isSafeInteger(p.exit_code)){
        execEnds.set(key('Codex CLI',p.call_id),p.exit_code===0?'Returned':'Error');
      }
    }
    const callsOut=[];const formats=new Set();
    for(const [id,c] of calls){
      formats.add(c.f);const r=results.get(id);
      const state=c.kind==='Shell' && c.f==='Codex CLI' ? (execEnds.get(id)||r?.header||r?.result||'Unpaired') : (r?.result||'Unpaired');
      callsOut.push({n:callsOut.length+1,kind:c.kind,state});
    }
    // Drop every join key and every raw value before rendering.
    let unmatched=0;for(const id of new Set([...results.keys(),...execEnds.keys()]))if(!calls.has(id))unmatched++;
    return {format:formats.size>1?'Mixed formats':[...formats][0]||'Unknown',count:callsOut.length,
      errors:callsOut.filter(c=>c.state==='Error').length,unpaired:callsOut.filter(c=>c.state==='Unpaired').length,calls:callsOut,invalid,unmatched};
  }
  function notice(r){
    const notes=[];if(r.invalid)notes.push(r.invalid+' malformed JSON line(s) skipped.');
    if(r.unmatched)notes.push(r.unmatched+' result ID(s) without a matching call ignored.');
    return notes.join(' ')||'Ready for review. Only recognized calls are counted.';
  }
  function windowRows(r){
    const i=r.calls.findIndex(c=>c.state==='Error');
    const start=i<0?Math.max(0,r.count-5):Math.max(0,Math.min(i-2,r.count-5));
    return r.calls.slice(start,start+5);
  }
  const caption=r=>r.errors?'FIRST REPORTED ERROR':'LAST OBSERVED CALLS';
  const coverage=r=>[r.invalid?r.invalid+' malformed lines skipped':'',r.unmatched?r.unmatched+' unmatched result IDs':''].filter(Boolean).join('; ');
  const label=(n,s)=>n+' '+s+(n===1?'':'s');
  function markdown(r,o={}){
    const show=o.nearby!==false,cat=o.categories!==false;
    const lines=['**Agent Bugcard · '+r.format+'**','',label(r.count,'recognized tool call')+' · '+label(r.errors,'reported error')+' · '+label(r.unpaired,'unpaired call')+'.'];
    if(show){lines.push('',r.errors?'Around the first reported error:':'Last observed calls:','',cat?'| Call | Category | Outcome |':'| Call | Outcome |',cat?'| ---: | --- | --- |':'| ---: | --- |');
      for(const c of windowRows(r))lines.push('| '+c.n+' | '+(cat?c.kind+' | ':'')+c.state+' |');}
    lines.push('','Returned = a tool response was recorded; success is not implied.');
    if(coverage(r))lines.push('Partial input: '+coverage(r)+'.');
    lines.push('','Generated locally with Agent Bugcard. No transcript text included.');return lines.join('\n');
  }
  function svg(r,o={}){
    const show=o.nearby!==false,cat=o.categories!==false,rows=show?windowRows(r):[];
    const ink='#eaf3e8',secondary='#abc2b4',muted='#8eae9d',acid='#d6f587',warn='#ffbd9d',w=720;
    const y0=205, base=show?y0+rows.length*36+9:166,partial=coverage(r),h=base+58+(partial?20:0);
    const txt=(x,y,s,size=15,col=ink,weight=500,mono=false)=>'<text x="'+x+'" y="'+y+'" font-family="'+(mono?'monospace':'Arial, sans-serif')+'" font-size="'+size+'" font-weight="'+weight+'" fill="'+col+'">'+s+'</text>';
    const rule=y=>'<path d="M28 '+y+'H692" stroke="#3c594d"/>';
    let body='<title>Agent Bugcard: '+r.format+'; '+r.count+' calls and '+r.errors+' reported errors</title><rect width="720" height="'+h+'" rx="13" fill="#18372c"/>';
    body+=txt(28,33,'AGENT BUGCARD   /   DIAGNOSTIC RECEIPT',13,acid,650,true)+txt(565,33,r.format,15,ink,700)+rule(50);
    const m=[[28,r.count,'TOOL CALLS'],[258,r.errors,'REPORTED ERRORS'],[484,r.unpaired,'UNPAIRED CALLS']];
    for(const [x,n,l] of m)body+=txt(x,109,n,46,l==='REPORTED ERRORS'&&n?warn:ink,700)+txt(x,134,l,13,secondary,600,true);
    body+=rule(152);
    if(show){
      body+=txt(28,181,caption(r),13,acid,650,true)+txt(545,181,'OUTCOME',12,secondary,600,true);
      rows.forEach((c,i)=>{const y=y0+i*36,focus=c.state==='Error';
        if(focus)body+='<rect x="21" y="'+(y-12)+'" width="678" height="32" rx="6" fill="#4b4534"/>';
        body+=txt(32,y+9,'#'+c.n,16,focus?warn:muted,600,true)+txt(146,y+9,cat?c.kind:'Tool call',19,ink,650)+txt(545,y+9,c.state,16,focus?warn:secondary,650);
      });body+=rule(base);
    }
    body+=txt(28,base+22,'Returned = response recorded; success is not implied.',14,secondary);
    body+=txt(28,base+42,'No transcript text included.',13,muted);
    if(partial)body+=txt(28,base+61,'Partial input: '+partial+'.',13,warn);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" width="'+w+'" height="'+h+'" role="img">'+body+'</svg>';
  }
  return {parse,notice,markdown,svg,limit};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=Bugcard;
