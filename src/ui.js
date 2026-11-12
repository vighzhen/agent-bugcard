'use strict';
const el=id=>document.getElementById(id);
let report=null, source='',epoch=0;
function render(){
  const yes=!!report?.count,opts={nearby:el('nearby').checked,categories:el('categories').checked};
  el('saveSvg').disabled=el('saveMd').disabled=!yes;
  el('categories').disabled=!opts.nearby;
  el('scope').textContent=opts.nearby?'Shows counts and up to five calls around the first reported error, or the last five if none was reported.':'Summary only: agent format, call counts, and outcome counts.';
  if(yes){el('card').innerHTML=Bugcard.svg(report,opts);el('md').textContent=Bugcard.markdown(report,opts);}
  else{el('card').textContent='No receipt to export.';el('md').textContent='';}
  el('source').textContent=source==='file'?'Local session':source==='claude'||source==='codex'?'Synthetic example':'No session';
  for(const k of ['claude','codex'])el(k).setAttribute('aria-pressed',String(k===source));
}
function setData(raw,k){report=Bugcard.parse(raw);source=k;el('notice').textContent=report.count?Bugcard.notice(report):'No supported tool calls found. Try a Claude Code or Codex CLI JSONL file.';render();}
function demo(k){epoch++;el('file').value='';setData(DEMOS[k],k);}
for(const k of ['claude','codex'])el(k).onclick=()=>demo(k);
el('file').onchange=async()=>{
  const f=el('file').files[0];if(!f)return;const request=++epoch;
  report=null;source='file';render();el('file').value='';
  if(f.size>Bugcard.limit){el('notice').textContent='File exceeds 20 MiB. No data was loaded.';return;}
  el('notice').textContent='Reading locally…';
  try{const raw=await f.text();if(request===epoch)setData(raw,'file');}catch{if(request===epoch)el('notice').textContent='Could not read the local file.';}
};
for(const k of ['nearby','categories'])el(k).onchange=render;
function save(kind){
  if(!report?.count)return;
  const opts={nearby:el('nearby').checked,categories:el('categories').checked};
  const body=kind==='svg'?Bugcard.svg(report,opts):Bugcard.markdown(report,opts);
  const url=URL.createObjectURL(new Blob([body+'\n'],{type:kind==='svg'?'image/svg+xml':'text/markdown'}));
  const a=document.createElement('a');a.href=url;a.download='agent-bugcard.'+kind;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
el('saveSvg').onclick=()=>save('svg');el('saveMd').onclick=()=>save('md');demo('claude');
