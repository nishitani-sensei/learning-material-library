import {readFile,readdir,stat} from 'node:fs/promises';import path from 'node:path';import {root} from './catalog.mjs';
const dist=path.join(root,'dist');let checked=0;
async function walk(dir){const output=[];for(const item of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())output.push(...await walk(file));else output.push(file);}return output;}
const files=await walk(dist);
for(const file of files){if(!/\.(html|css)$/.test(file))continue;const text=await readFile(file,'utf8');const refs=file.endsWith('.html')?[...text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]):[...text.matchAll(/url\(["']?([^\s'"\)]+)["']?\)/gi)].map(m=>m[1]);
  for(const ref of refs){if(/^(https?:|data:|mailto:|#)/.test(ref))continue;const clean=decodeURIComponent(ref.split(/[?#]/)[0]);if(!clean)continue;if(clean.startsWith('/'))throw new Error(`絶対パスを相対パスにしてください：${path.relative(dist,file)} → ${ref}`);const target=path.resolve(path.dirname(file),clean);if(target!==dist&&!target.startsWith(dist+path.sep))throw new Error('公開範囲の外を参照しています');await stat(target);checked++;}}
for(const audience of ['student','teacher']){const catalog=JSON.parse(await readFile(path.join(dist,'catalog',audience+'.json'),'utf8'));for(const tool of catalog)for(const key of ['entry','thumbnail']){await stat(path.join(dist,tool[key]));checked++;}}
console.log(`公開ファイル ${files.length}件・参照 ${checked}件：不足なし`);
