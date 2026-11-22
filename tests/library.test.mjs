import {test} from 'node:test';import assert from 'node:assert/strict';
import {visibleTools,recentUpdates,filterTools,readIds,parseCatalog,escapeHtml,safeAsset} from '../src/lib.ts';
const student={id:'demo-a',title:'たし算カード',description:'計算をくりかえす',audience:'student',category:'math',grades:[1,2],tags:['たし算','ABC'],kind:'学習アプリ',entry:'tools/demo-a/index.html',thumbnail:'tools/demo-a/preview.svg',instructions:['考える'],updated:'2026-11-17',sample:true};
const teacher={...student,id:'demo-b',title:'授業準備チェック',audience:'teacher',category:'lesson',grades:[],entry:'tools/demo-b/index.html',thumbnail:'tools/demo-b/preview.svg'};
test('教科に属する先生用教材は先生モードの教科・学年の絞り込みに出る',()=>{
  const japaneseTool={...teacher,id:'demo-c',title:'漢字小テストメーカー',category:'japanese'};
  const tools=[student,teacher,japaneseTool];
  const filters={query:'漢字',category:'japanese',grade:'6',kind:''};
  assert.deepEqual(filterTools(visibleTools(tools,false),filters),[]);
  assert.deepEqual(filterTools(visibleTools(tools,true),filters),[japaneseTool]);
});
test('児童モードは先生用を含めない。先生モードでは両方が使える',()=>{assert.deepEqual(visibleTools([student,teacher],false),[student]);assert.equal(visibleTools([student,teacher],true).length,2);});
test('更新履歴は見える教材だけを新しい順に並べる', () => {
  const added = {date:'2026-11-17',kind:'added',summary:'教材を追加'};
  const feature = {date:'2026-11-22',kind:'feature',summary:'練習を追加'};
  const teacherFeature = {...feature,date:'2026-11-21',summary:'先生用の機能を追加'};
  const published = [{...student, updates:[added,feature]},{...teacher, updates:[teacherFeature]}];
  assert.deepEqual(recentUpdates(visibleTools(published,false)).map(item=>item.update), [feature,added]);
  assert.deepEqual(recentUpdates(visibleTools(published,true)).map(item=>item.update), [feature,teacherFeature,added]);
  assert.throws(() => parseCatalog([{...student, updates:[null]}], 'student'));
});
test('分類・学年・種類・複数キーワードを組み合わせる',()=>{assert.deepEqual(filterTools([student,teacher],{query:'たし算 ＡＢＣ',category:'math',grade:'1',kind:'学習アプリ'}),[student]);assert.equal(filterTools([student,teacher],{query:'',category:'',grade:'3',kind:''}).length,0);assert.deepEqual(filterTools([student,teacher],{query:'準備',category:'lesson',grade:'',kind:''}),[teacher]);});
test('お気に入りの破損・重複・異なる型が通常表示を壊さない',()=>{assert.deepEqual(readIds('invalid'),[]);assert.deepEqual(readIds('["a","a",1,null,"b"]'),['a','b']);assert.deepEqual(readIds('{}'),[]);});
test('公開一覧は指定対象と安全な起動先だけを受け付ける',()=>{assert.deepEqual(parseCatalog([student],'student'),[student]);for(const bad of [{...student,audience:'teacher'},{...student,entry:'../private.html'},{...student,entry:'https://example.com'},{...student,grades:[7]}])assert.throws(()=>parseCatalog([bad],'student'));assert.throws(()=>parseCatalog([student,student],'student'));});
test('紹介情報の文字を実行用HTMLとして扱わない',()=>{assert.equal(escapeHtml('<img src=x onerror="bad">'),'&lt;img src=x onerror=&quot;bad&quot;&gt;');assert.equal(safeAsset('a/../b'),false);assert.equal(safeAsset('tools/demo-a/index.html'),true);});
