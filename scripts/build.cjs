'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const write = (file,body) => fs.writeFileSync(path.join(root,file),body);
const core = require('../src/core.cjs');
const locales = require('../src/locale.cjs');
const demos = Object.fromEntries(['claude','codex'].map(name=>[name,read('examples/'+name+'.synthetic.jsonl')]));
const scriptJSON = value => JSON.stringify(value).replace(/</g,'\\u003c');
const escapeHTML = value => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const layout = read('src/view.html').replace(/(data-t="([\w]+)"[^>]*>)(<\/)/g,
  (_,opening,key,closing)=>opening+escapeHTML(locales.text('en',key))+closing);
const program = [read('src/locale.cjs'),read('src/core.cjs'),'const DEMOS='+scriptJSON(demos)+';',read('src/ui.js')].join('\n');
const html = layout.replace(/\/\*INSERT_(LAYOUT|SCRIPT)\*\//g, (_,part) => part === 'LAYOUT' ? scriptJSON(layout) : program);
write('docs/index.html',html);
const sample = core.parse(demos.claude);
for (const [lang,name] of [['en','sample'],['zh-Hans','sample.zh-Hans'],['zh-Hant','sample.zh-Hant']]) {
  write('docs/'+name+'.svg',core.svg(sample,{lang,exitCodes:true,example:true})+'\n');
}
