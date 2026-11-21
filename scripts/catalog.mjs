import {readFile,readdir,mkdir,cp,writeFile,stat,lstat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const categories={student:['japanese','math','science','social','life','english','music','pe','art','home','moral','integrated','activities'],teacher:['lesson','classroom','school','documents']};
const runTar = promisify(execFile);
export function validRelative(p){return typeof p==='string'&&p.length>0&&!path.isAbsolute(p)&&!p.includes('\\')&&!p.split('/').some(x=>!x||x==='.'||x==='..')&&!/[:?#\u0000-\u0020]/.test(p);}
export function validateMetadata(m,folder,seen=new Set()){
  const fail=msg=>{throw new Error(`${folder}: ${msg}`);};
  if(!m||typeof m!=='object')fail('紹介情報がありません');
  if(m.id!==folder||!/^[a-z0-9][a-z0-9-]*$/.test(m.id)||seen.has(m.id))fail('IDは重複しない半角英数字・ハイフンにしてください');
  if(!['student','teacher'].includes(m.audience))fail('対象をstudentまたはteacherにしてください');
  for(const key of ['title','description','kind'])if(typeof m[key]!=='string'||!m[key].trim())fail(`${key}を入力してください`);
  const allowedCategories=m.audience==='teacher'?[...categories.student,...categories.teacher]:categories.student;
  if(!allowedCategories.includes(m.category))fail('分類を確認してください');
  if(!Array.isArray(m.grades)||!m.grades.every(g=>Number.isInteger(g)&&g>=1&&g<=6))fail('学年は1〜6の配列にしてください');
  if(m.audience==='teacher'&&m.grades.length)fail('先生用の学年は空の配列にしてください');
  for(const key of ['tags','instructions'])if(!Array.isArray(m[key])||!m[key].every(x=>typeof x==='string'&&x.trim()))fail(`${key}を文字の配列にしてください`);
  if(!validRelative(m.entry)||!m.entry.endsWith('.html')||!validRelative(m.thumbnail))fail('起動先・見本画像はフォルダー内の相対パスにしてください');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(m.updated)||Number.isNaN(Date.parse(m.updated)))fail('更新日をYYYY-MM-DDで入力してください');
  if(typeof m.sample!=='boolean')fail('sampleにtrueまたはfalseを指定してください');
  seen.add(m.id);return m;
}
async function inspectFiles(dir,base=dir){
  const list=[];
  for(const e of await readdir(dir,{withFileTypes:true})){
    if(e.isSymbolicLink())throw new Error('教材にシンボリックリンクは含められません');
    const p=path.join(dir,e.name);
    if(e.isDirectory())list.push(...await inspectFiles(p,base));
    else {if(/(^\.|\.(?:env|pem|key|dpapi)$)/i.test(e.name))throw new Error('公開しないファイルが教材に含まれています');list.push(path.relative(base,p).split(path.sep).join('/'));}
  }return list;
}
async function expandAssetBundle(source, destination) {
  const archive = path.join(source, 'assets.tar.gz');
  const info = await lstat(archive).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (!info) return;
  if (!info.isFile()) throw new Error('教材の素材は通常のアーカイブファイルにしてください');
  const listings = await Promise.all([runTar('tar', ['-tf', archive]), runTar('tar', ['-tvf', archive])]);
  const entries = listings[0].stdout.trimEnd().split(/\r?\n/);
  const details = listings[1].stdout.trimEnd().split(/\r?\n/);
  if (entries.length !== details.length || entries.some((entry, index) =>
    !validRelative(entry.replace(/\/$/, '')) || !/^[\w@./-]+$/.test(entry) ||
    entry.split('/').some(part => part.startsWith('.') || /\.(?:env|pem|key|dpapi)$/i.test(part)) ||
    !/^[-d]/.test(details[index]))) {
    throw new Error('教材の素材に公開できないパスまたはファイルが含まれています');
  }
  await runTar('tar', ['-xkf', archive, '-C', destination]);
}
export async function buildCatalog(projectRoot=root){
  const dir=path.join(projectRoot,'modules'),publicDir=path.join(projectRoot,'public');
  const result={student:[],teacher:[]},seen=new Set();
  for(const folder of (await readdir(dir,{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort()){
    const source=path.join(dir,folder),m=validateMetadata(JSON.parse(await readFile(path.join(source,'module.json'),'utf8')),folder,seen);
    const files=path.join(source,'files');await inspectFiles(files);
    for(const item of [m.entry,m.thumbnail])if(!(await stat(path.join(files,item))).isFile())throw new Error(`${folder}: ファイルがありません ${item}`);
    // 明示した紹介項目だけを公開する。設定メモなどの付加情報は取り込まない。
    result[m.audience].push({id:m.id,title:m.title,description:m.description,audience:m.audience,category:m.category,grades:m.grades,
      tags:m.tags,kind:m.kind,entry:`tools/${m.id}/${m.entry}`,thumbnail:`tools/${m.id}/${m.thumbnail}`,updated:m.updated,instructions:m.instructions,sample:m.sample});
  }
  const config=JSON.parse(await readFile(path.join(projectRoot,'config','teacher-mode.json'),'utf8'));
  if(config.algorithm!=='SHA-256'||!/^[0-9a-f]{64}$/.test(config.digest)||!/^[0-9a-f]{32}$/.test(config.salt))throw new Error('先生モードの設定がありません。先にパスワードを設定してください');
  await mkdir(path.join(publicDir,'catalog'),{recursive:true});
  // この生成領域だけを作り直し、取り下げた教材を前の出力から残さない。
  const {rm}=await import('node:fs/promises');
  await rm(path.join(publicDir,'tools'),{recursive:true,force:true});
  for(const audience of ['student','teacher']){
    result[audience].sort((a,b)=>b.updated.localeCompare(a.updated)||a.id.localeCompare(b.id));
    await writeFile(path.join(publicDir,'catalog',`${audience}.json`),JSON.stringify(result[audience],null,2)+'\n');
    for(const item of result[audience]){
      const source=path.join(dir,item.id),destination=path.join(publicDir,'tools',item.id);
      await cp(path.join(source,'files'),destination,{recursive:true});
      await expandAssetBundle(source,destination);
    }
  }
  await cp(path.join(projectRoot,'shared'),path.join(publicDir,'shared'),{recursive:true});
  await writeFile(path.join(publicDir,'library.config.json'),JSON.stringify({teacherMode:config,version:'1.0.0'},null,2)+'\n');
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const data=await buildCatalog();console.log(`教材一覧を生成しました：児童用 ${data.student.length}件／先生用 ${data.teacher.length}件`);
}
