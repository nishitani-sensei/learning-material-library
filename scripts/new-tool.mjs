import {mkdir,writeFile,access} from 'node:fs/promises';import path from 'node:path';import {root} from './catalog.mjs';
const [id,audience='student']=process.argv.slice(2);
if(!id||!/^[a-z0-9][a-z0-9-]*$/.test(id)||!['student','teacher'].includes(audience))throw new Error('使い方：pnpm new:tool 教材ID student（またはteacher）');
const dir=path.join(root,'modules',id);try{await access(dir);throw new Error('同じIDの教材があります。別のIDを指定してください。');}catch(err){if(err.code!=='ENOENT')throw err;}
await mkdir(path.join(dir,'files'),{recursive:true});
await writeFile(path.join(dir,'module.json'),JSON.stringify({id,title:'新しい教材',description:'どんなことに使える教材かを記入します。',audience,category:audience==='student'?'math':'lesson',grades:[],tags:[],kind:audience==='student'?'学習アプリ':'仕事の道具',entry:'index.html',thumbnail:'preview.svg',updated:new Date().toISOString().slice(0,10),sample:false,instructions:['つかい方を記入します。']},null,2)+'\n');
await writeFile(path.join(dir,'files','index.html'),'<!doctype html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>新しい教材</title></head><body><script src="../../shared/return.js"></script><main><h1>新しい教材</h1><p>ここに教材を組み込みます。</p></main></body></html>');
await writeFile(path.join(dir,'files','preview.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="340" viewBox="0 0 600 340"><rect width="600" height="340" fill="#edf1e3"/><path d="M180 100c45-10 75 0 120 25 45-25 75-35 120-25v140c-45-10-75 0-120 25-45-25-75-35-120-25Z" fill="#fffdf5" stroke="#789465" stroke-width="5"/><path d="M300 125v140" stroke="#789465" stroke-width="4"/></svg>');
console.log(`modules/${id} にひな形を作りました。紹介情報とHTMLを編集してから pnpm build を実行してください。`);
