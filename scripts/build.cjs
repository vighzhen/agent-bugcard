'use strict';
const fs=require('node:fs'), path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const write=(f,s)=>fs.writeFileSync(path.join(root,f),s);
const inject=(s,key,v)=>s.replace(key,()=>v);
const core=require('../src/core.cjs');
const demos=Object.fromEntries(['claude','codex'].map(n=>[n,read('examples/'+n+'.synthetic.jsonl')]));
let html=read('src/view.html');
html=inject(html,'/*INSERT_LANGUAGES*/',read('src/locale.cjs'));
html=inject(html,'/*INSERT_CORE*/',read('src/core.cjs'));
html=inject(html,'/*INSERT_DEMOS*/',JSON.stringify(demos).replace(/</g,'\\u003c'));
html=inject(html,'/*INSERT_UI*/',read('src/ui.js'));
write('docs/index.html',html);
const sample=core.parse(demos.claude);
for (const [lang, file] of [['en','sample'],['zh-Hans','sample.zh-Hans'],['zh-Hant','sample.zh-Hant']]) {
  write('docs/'+file+'.svg',core.svg(sample,{lang,exitCodes:true,example:true})+'\n');
}
