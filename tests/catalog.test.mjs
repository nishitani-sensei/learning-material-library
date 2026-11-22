import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {validateMetadata,validRelative,buildCatalog} from '../scripts/catalog.mjs';
import {execFileSync} from 'node:child_process';
const metadata={id:'sample',title:'見本',description:'説明',audience:'student',category:'math',grades:[1],tags:[],kind:'学習アプリ',entry:'index.html',thumbnail:'preview.svg',updated:'2026-11-17',sample:true,instructions:['ひらく']};
test('先生用教材にも教科を指定でき、児童用には仕事の分類を指定できない',()=>{
  assert.doesNotThrow(()=>validateMetadata({...metadata,audience:'teacher',category:'japanese',grades:[]},'sample'));
  assert.throws(()=>validateMetadata({...metadata,category:'lesson'},'sample'));
});
test('紹介情報の重複ID・分類・起動先・学年の誤りを検出',()=>{const seen=new Set();validateMetadata(metadata,'sample',seen);assert.throws(()=>validateMetadata(metadata,'sample',seen));for(const patch of [{category:'unknown'},{entry:'../index.html'},{grades:[0]},{audience:'teacher',category:'lesson',grades:[1]}])assert.throws(()=>validateMetadata({...metadata,...patch},'sample'));for(const p of ['/index.html','a\\b','https://a','a/../b','a//b'])assert.equal(validRelative(p),false);});
test('まとめた素材を元の相対パスで展開し、隠しファイルを拒否する', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'kyozai-bundle-'));
  try {
    const module = path.join(temp, 'modules/sample');
    for (const dir of ['modules/sample/files', 'config', 'shared', 'source/assets']) {
      await mkdir(path.join(temp, dir), {recursive: true});
    }
    await writeFile(path.join(module, 'module.json'), JSON.stringify(metadata));
    await writeFile(path.join(module, 'files/index.html'), '<link rel="stylesheet" href="assets/style.css">');
    await writeFile(path.join(module, 'files/preview.svg'), '<svg/>');
    await writeFile(path.join(temp, 'config/teacher-mode.json'), JSON.stringify({
      algorithm: 'SHA-256', salt: 'a'.repeat(32), digest: 'b'.repeat(64)
    }));
    const archive = path.join(module, 'assets.tar.gz');
    const source = path.join(temp, 'source');
    await writeFile(path.join(source, 'assets/style.css'), 'body{}');
    execFileSync('tar', ['-czf', archive, '-C', source, 'assets']);
    await buildCatalog(temp);
    assert.equal(await readFile(path.join(temp, 'public/tools/sample/assets/style.css'), 'utf8'), 'body{}');
    await assert.rejects(() => readFile(path.join(temp, 'public/tools/sample/assets.tar.gz')), {code: 'ENOENT'});
    await writeFile(path.join(source, 'assets/.env'), 'fixture');
    execFileSync('tar', ['-czf', archive, '-C', source, 'assets']);
    await assert.rejects(() => buildCatalog(temp), /公開できないパス/);
  } finally {
    await rm(temp, {recursive: true, force: true});
  }
});
test('新教材は本体編集なしで一覧へ追加され、取り下げた旧出力は残らない',async()=>{const temp=await mkdtemp(path.join(os.tmpdir(),'kyozai-catalog-'));try{for(const p of ['modules/sample/files/assets','config','shared','public/tools/removed'])await mkdir(path.join(temp,p),{recursive:true});await writeFile(path.join(temp,'modules/sample/module.json'),JSON.stringify({...metadata,privateMemo:'公開しない追加項目'}));await writeFile(path.join(temp,'modules/sample/files/index.html'),'<link rel="stylesheet" href="assets/style.css">');await writeFile(path.join(temp,'modules/sample/files/preview.svg'),'<svg/>');await writeFile(path.join(temp,'modules/sample/files/assets/style.css'),'body{}');await writeFile(path.join(temp,'config/teacher-mode.json'),JSON.stringify({algorithm:'SHA-256',salt:'a'.repeat(32),digest:'b'.repeat(64)}));await writeFile(path.join(temp,'public/tools/removed/index.html'),'old');const result=await buildCatalog(temp);assert.equal(result.student.length,1);assert.equal(result.teacher.length,0);assert.equal(result.student[0].entry,'tools/sample/index.html');assert.equal('privateMemo' in result.student[0],false);assert.equal(await readFile(path.join(temp,'public/tools/sample/assets/style.css'),'utf8'),'body{}');await assert.rejects(()=>readFile(path.join(temp,'public/tools/removed/index.html')));await rm(path.join(temp,'modules/sample/files/preview.svg'));await assert.rejects(()=>buildCatalog(temp));}finally{await rm(temp,{recursive:true,force:true});}});

test('非公開にすると一覧とHTML・素材が次の公開から外れ、元のファイル付きで再公開できる', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'kyozai-publication-'));
  try {
    for (const folder of ['modules/sample/files', 'config', 'shared']) await mkdir(path.join(temp, folder), {recursive:true});
    await writeFile(path.join(temp, 'modules/sample/module.json'), JSON.stringify(metadata));
    await writeFile(path.join(temp, 'modules/sample/files/index.html'), '<h1>見本</h1>');
    await writeFile(path.join(temp, 'modules/sample/files/preview.svg'), '<svg/>');
    await writeFile(path.join(temp, 'config/teacher-mode.json'), JSON.stringify({algorithm:'SHA-256', salt:'a'.repeat(32), digest:'a'.repeat(64)}));
    const settings = path.join(temp, 'config/publication.json');
    const entry = path.join(temp, 'public/tools/sample/index.html');
    assert.equal((await buildCatalog(temp)).student.length, 1);
    await writeFile(settings, JSON.stringify({unpublished:['sample']}));
    assert.deepEqual(await buildCatalog(temp), {student:[], teacher:[]});
    await assert.rejects(() => readFile(entry), {code:'ENOENT'});
    assert.equal(await readFile(path.join(temp, 'modules/sample/files/index.html'), 'utf8'), '<h1>見本</h1>');
    await writeFile(settings, JSON.stringify({unpublished:[]}));
    assert.equal((await buildCatalog(temp)).student.length, 1);
    assert.equal(await readFile(entry, 'utf8'), '<h1>見本</h1>');
    await writeFile(settings, JSON.stringify({unpublished:['unknown']}));
    await assert.rejects(() => buildCatalog(temp), /公開設定/);
  } finally { await rm(temp, {recursive:true, force:true}); }
});
