import './style.css';
import {subjects,workCategories,categoryName,visibleTools,recentUpdates,filterTools,readIds,escapeHtml as e,parseCatalog,type Tool} from './lib.ts';
const app=document.querySelector<HTMLDivElement>('#app')!;
const base=new URL(import.meta.env.BASE_URL,location.href);
const asset=(p:string)=>new URL(p,base).href;
const localDeveloper=!!document.querySelector('meta[name="local-developer"]');
const KEY={favorites:'kyozai:portal:favorites',recent:'kyozai:portal:recent',teacher:'kyozai:portal:teacher',position:'kyozai:portal:return'};
const icons:Record<string,string>={book:'<path d="M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z"/><path d="M12 6v15"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',leaf:'<path d="M20 3C8 2 2 8 5 15s14 5 15-12Z"/><path d="m4 21 11-12"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-1 0-1 1-1 2m0 3h.01"/>'};
const icon=(name:string)=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]??icons.book}</svg>`;
type View='home'|'all'|'favorites'|'recent'|'detail'|'guide'|'developer';
let state={view:'home' as View,query:'',category:'',grade:'',kind:'',tool:''};
let students:Tool[]=[],teachers:Tool[]=[],teacher=false,loading=true,loadError=false,showAllSubjects=false,storageWarning=false;
let favorites=readIds(readStore('local',KEY.favorites)),recent=readIds(readStore('local',KEY.recent));
let requestId=0,announcementTimer:number|undefined;
function developerGuide(){
  const dashboardUrl=localDeveloper?asset('developer/'):'http://127.0.0.1:4188/developer/';
  return `<section class="page-intro" aria-labelledby="developer-guide-title">
    <h1 id="developer-guide-title">開発者モード</h1>
    <p>制作PCでアプリの公開設定や動作確認ができます。</p>
    <div class="guide-notes developer-guide">
      <h2>開発者画面を開く手順</h2>
      <ol class="instruction-list">
        <li>制作PCで「教材ライブラリを開く.bat」を起動します。</li>
        <li>下のボタンを押し、設定した開発者用パスワードを入力します。</li>
      </ol>
      <a class="button-primary" href="${dashboardUrl}" target="_blank" rel="noopener noreferrer">このPCの開発者画面を開く ${icon('arrow')}</a>
    </div>
  </section>`;
}
function readStore(store:'local'|'session',key:string){try{return window[store==='local'?'localStorage':'sessionStorage'].getItem(key);}catch{return null;}}
function writeStore(store:'local'|'session',key:string,value:string){try{window[store==='local'?'localStorage':'sessionStorage'].setItem(key,value);}catch{storageWarning=true;}}
function announce(message:string){const node=document.querySelector('#announcer')!;node.textContent='';clearTimeout(announcementTimer);announcementTimer=window.setTimeout(()=>{node.textContent=message;},30);}
function currentTools(){return visibleTools([...students,...teachers],teacher);}
function updateSection(){
  const updates=recentUpdates(currentTools());
  if(!updates.length)return '';
  return `<section class="library-updates" aria-labelledby="updates-title">
    <h2 id="updates-title">本だなの更新</h2>
    <ol class="update-list">
      ${updates.map(({tool,update})=>`<li class="update-row">
        <div class="update-meta">
          <time datetime="${e(update.date)}">${e(update.date.replaceAll('-','.'))}</time>
          <span class="update-kind ${update.kind==='feature'?'update-feature':''}">${update.kind==='added'?'新規追加':'新機能'}</span>
        </div>
        <div class="update-content">
          <a class="update-link" href="${asset(tool.entry)}" data-launch="${tool.id}">${e(tool.title)} ${icon('arrow')}</a>
          <p>${e(update.summary)}</p>
        </div>
      </li>`).join('')}
    </ol>
  </section>`;
}
function readRoute(){const p=new URLSearchParams(location.search);const view=p.get('view')??'home';state={view:['home','all','favorites','recent','detail','guide','developer'].includes(view)?view as View:'home',query:p.get('q')??'',category:p.get('category')??'',grade:/^[1-6]$/.test(p.get('grade')??'')?p.get('grade')!:'',kind:p.get('kind')??'',tool:p.get('tool')??''};if(!teacher&&workCategories.some(c=>c.id===state.category)){state.category='';}}
function routeUrl(){const p=new URLSearchParams();if(state.view!=='home')p.set('view',state.view);for(const [key,value] of Object.entries({q:state.query,category:state.category,grade:state.grade,kind:state.kind,tool:state.tool}))if(value)p.set(key,value);return base.pathname+(p.size?'?'+p:'');}
function navigate(patch:Partial<typeof state>,scroll=true){state={...state,...patch};if(!teacher&&workCategories.some(c=>c.id===state.category))state.category='';history.pushState(null,'',routeUrl());render();if(scroll){window.scrollTo(0,0);document.querySelector<HTMLElement>('#main')?.focus({preventScroll:true});}}
function mobileNav(){return `<nav class="mobile-nav" aria-label="主なメニュー（タブレット・スマートフォン）">${navButton('home','ホーム','home')}${navButton('all','さがす','search')}${navButton('favorites','お気に入り','heart')}${navButton('recent','最近つかった','clock')}${navButton('guide','使い方','help')}</nav>`;}
function navButton(view:View,label:string,ico:string){return `<button class="nav-item ${state.view===view?'active':''}" data-nav="${view}" ${state.view===view?'aria-current="page"':''}>${icon(ico)}<span>${label}</span>${state.view===view?'<span class="nav-dot"></span>':''}</button>`;}
function header(){return `<header class="site-header"><a class="brand" href="${base.href}" data-home><span class="brand-icon">${icon('book')}</span><span><strong>教材ライブラリ</strong><small>まなびと、しごとの道具箱</small></span></a><div class="header-right"><span class="header-note">学びのそばに、ちょうどいい道具。</span><button class="teacher-button ${teacher?'unlocked':''}" data-action="${teacher?'lock':'unlock'}">${icon(teacher?'leaf':'lock')}<span>${teacher?'先生モードを終了':'先生用をひらく'}</span></button><a class="teacher-button developer-link" href="${localDeveloper?asset('developer/'):asset('?view=developer')}">開発者用</a></div></header>`;}
function sidebar(){return `<aside class="sidebar" aria-label="ライブラリのメニュー"><p class="nav-caption">わたしのライブラリ</p><nav aria-label="主なメニュー">${navButton('home','ホーム','home')}${navButton('all','すべての教材','grid')}${navButton('favorites','お気に入り','heart')}${navButton('recent','最近つかった教材','clock')}</nav><div class="sidebar-line"></div><p class="nav-caption">教科からさがす</p><nav class="subject-nav" aria-label="教科">${subjects.map(s=>`<button data-category="${s.id}" class="subject-nav-item ${state.category===s.id?'selected':''}"><span class="small-subject ${s.color}">${s.icon}</span>${s.name}</button>`).join('')}</nav>${teacher?`<div class="sidebar-line"></div><p class="nav-caption">先生の仕事</p><nav aria-label="先生の仕事">${workCategories.map(c=>`<button class="subject-nav-item ${state.category===c.id?'selected':''}" data-category="${c.id}"><span class="work-symbol">${c.icon}</span>${c.name}</button>`).join('')}</nav>`:''}<div class="sidebar-bottom"><button class="nav-item" data-nav="guide">${icon('help')}使い方のごあんない</button><p>小さな「できた」を、<br>ひとつずつ。</p><span class="mini-leaves" aria-hidden="true">${icon('leaf')}</span></div></aside>`;}
function searchForm(compact=false){return `<form class="search-form ${compact?'compact':''}" id="search-form" role="search"><label class="sr-only" for="search-input">教材をキーワードでさがす</label>${icon('search')}<input id="search-input" type="search" name="q" autocomplete="off" placeholder="なにを学ぼう？ 教材の名前やことばでさがす" value="${e(state.query)}"><button type="submit">さがす${icon('arrow')}</button></form>`;}
function subjectGrid(){const shown=showAllSubjects?subjects:subjects.slice(0,8);return `<section class="subject-section" aria-labelledby="subject-heading"><div class="section-heading"><h2 id="subject-heading">教科からさがす <span class="heading-reading">すきな教科をえらぼう</span></h2><button class="text-button" data-action="subjects" aria-expanded="${showAllSubjects}">${showAllSubjects?'少なく表示':'すべての教科'} <span aria-hidden="true">${showAllSubjects?'−':'＋'}</span></button></div><div class="subject-grid">${shown.map(s=>`<button class="subject-tile ${s.color}" data-category="${s.id}"><span class="subject-symbol" aria-hidden="true">${s.icon}</span><span><small>${s.reading}</small><strong>${s.name}</strong></span><span class="subject-chevron" aria-hidden="true">›</span></button>`).join('')}</div></section>`;}
function card(t:Tool){const marked=favorites.includes(t.id);return `<article class="tool-card"><div class="card-visual"><img src="${asset(t.thumbnail)}" alt="${e(t.title)}の見本" loading="lazy" width="600" height="340"><button class="favorite-button ${marked?'is-favorite':''}" data-favorite="${t.id}" aria-label="${e(t.title)}をお気に入り${marked?'から外す':'に追加'}" aria-pressed="${marked}">${icon('heart')}</button>${t.sample?'<span class="sample-badge">組込み見本</span>':''}</div><div class="card-body"><div class="card-labels"><span class="category-label">${e(categoryName(t.category))}</span><span>${t.audience==='teacher'?'先生用':t.grades.length?t.grades.map(g=>g+'年').join('・'):'学年共通'}</span><span class="kind-label">${e(t.kind)}</span></div><h3>${e(t.title)}</h3><p>${e(t.description)}</p><div class="card-actions"><a class="open-button" href="${asset(t.entry)}" data-launch="${t.id}">ひらく ${icon('arrow')}</a><button class="usage-button" data-detail="${t.id}">使い方</button></div></div></article>`;}
function emptyShelf(type:'favorites'|'recent'){return `<div class="empty-shelf">${icon(type==='favorites'?'heart':'clock')}<div><strong>${type==='favorites'?'すきな教材を、自分の本だなに。':'つかった教材が、ここにならびます。'}</strong><p>${type==='favorites'?'教材の♡を押すと、ここからすぐにひらけます。':'もう一度つかいたいときに、すぐ見つかります。'}</p></div></div>`;}
function miniShelf(type:'favorites'|'recent'){const ids=type==='favorites'?favorites:recent;const items=ids.map(id=>currentTools().find(t=>t.id===id)).filter((t):t is Tool=>!!t).slice(0,3);return `<section class="mini-shelf"><div class="section-heading"><h2>${icon(type==='favorites'?'heart':'clock')}${type==='favorites'?'お気に入り':'最近つかった教材'}</h2>${items.length?`<button class="text-button" data-nav="${type}">すべて見る ›</button>`:''}</div>${items.length?`<div class="mini-items">${items.map(t=>`<a href="${asset(t.entry)}" data-launch="${t.id}" class="mini-item"><img src="${asset(t.thumbnail)}" alt="" width="60" height="45"><span><strong>${e(t.title)}</strong><small>${e(categoryName(t.category))}</small></span>${icon('arrow')}</a>`).join('')}</div>`:emptyShelf(type)}</section>`;}
function home(){
  const updates=updateSection();
  return `<div class="home-layout${updates?' home-layout--with-updates':''}">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow">まなびの道具、ひとつずつ。</p>
        <h1 id="hero-title">さあ、きょうは<br>なにを学ぼう<span class="hero-period">。</span></h1>
        <p class="hero-description">「やってみたい」が見つかる、小さなライブラリ。<br>すきな教科から、学びのとびらをひらこう。</p>
      </div>
      <img class="hero-illustration" src="${asset('images/library.svg')}" alt="" width="420" height="280">
      <div class="hero-search">${searchForm()}</div>
    </section>
    ${updates}
    <div class="home-discovery">
      ${subjectGrid()}
      ${teacher?`<section class="work-section" aria-labelledby="work-heading">
        <div class="section-heading"><h2 id="work-heading">先生の仕事 <span class="teacher-status">先生モード</span></h2></div>
        <div class="work-grid">${workCategories.map(c=>`<button data-category="${c.id}"><span>${c.icon}</span>${c.name}<span aria-hidden="true">›</span></button>`).join('')}</div>
      </section>`:''}
      <div class="shelves-row">${miniShelf('favorites')}${miniShelf('recent')}</div>
    </div>
  </div>
  <section aria-labelledby="new-heading" class="new-section">
    <div class="section-heading">
      <div><p class="eyebrow">NEW ARRIVALS</p><h2 id="new-heading">新しくとどいた教材</h2></div>
      <button class="text-button" data-nav="all">すべての教材を見る ${icon('arrow')}</button>
    </div>
    <div class="tool-grid">${currentTools().slice().sort((a,b)=>b.updated.localeCompare(a.updated)||a.id.localeCompare(b.id)).slice(0,6).map(card).join('')}</div>
  </section>
  <aside class="growing-note">${icon('leaf')}<div><strong>この本だなは、少しずつ育ちます。</strong><p>いまは組込み見本を公開しています。これから、いろいろな教科の教材や道具をふやしていきます。</p></div></aside>`;
}
function filters(){return `<div class="filter-row"><label>教科・分類<select id="filter-category"><option value="">すべて</option><optgroup label="教科">${subjects.map(s=>`<option value="${s.id}" ${state.category===s.id?'selected':''}>${s.name}</option>`).join('')}</optgroup>${teacher?`<optgroup label="先生の仕事">${workCategories.map(c=>`<option value="${c.id}" ${state.category===c.id?'selected':''}>${c.name}</option>`).join('')}</optgroup>`:''}</select></label><label>学年<select id="filter-grade"><option value="">すべての学年</option>${[1,2,3,4,5,6].map(g=>`<option value="${g}" ${state.grade===String(g)?'selected':''}>${g}年生</option>`).join('')}</select></label><label>教材の種類<select id="filter-kind"><option value="">すべての種類</option>${[...new Set(currentTools().map(t=>t.kind))].map(k=>`<option value="${e(k)}" ${state.kind===k?'selected':''}>${e(k)}</option>`).join('')}</select></label><button class="reset-button" data-action="reset">条件をクリア</button></div>`;}
function listing(){let tools=currentTools();const isFav=state.view==='favorites',isRecent=state.view==='recent';if(isFav)tools=favorites.map(id=>tools.find(t=>t.id===id)).filter((t):t is Tool=>!!t);if(isRecent)tools=recent.map(id=>tools.find(t=>t.id===id)).filter((t):t is Tool=>!!t);const selected=filterTools(tools,state);const title=isFav?'お気に入り':isRecent?'最近つかった教材':state.category?categoryName(state.category):'すべての教材';return `<div class="page-intro"><p class="breadcrumb"><button data-nav="home">ホーム</button><span aria-hidden="true"> / </span>${e(title)}</p><p class="eyebrow">あなたの「つかいたい」を、さがそう。</p><h1>${e(title)}</h1>${isFav||isRecent?'<p class="page-description">この端末に保存した本だなです。ほかの端末とは共有されません。</p>':''}</div>${searchForm(true)}${filters()}<div class="results-heading"><p id="result-count" role="status"><strong>${selected.length}</strong> 件の教材${state.query?` <span>「${e(state.query)}」</span>`:''}</p><span>新着・更新順${isRecent?'（最近つかった順）':''}</span></div>${selected.length?`<div class="tool-grid results-grid">${selected.slice(0,page*24).map(card).join('')}</div>${selected.length>page*24?'<div class="load-more"><button class="button-primary" data-action="more">つづきを見る（24件）</button></div>':''}`:`<div class="empty-results">${icon('book')}<h2>${isFav?'まだお気に入りの教材はありません':isRecent?'まだつかった教材はありません':'ぴったりの教材は、まだありません'}</h2><p>${state.query||state.category||state.grade||state.kind?'ことばをかえたり、条件をへらしてさがしてみよう。':'教材をひらいたり、お気に入りに追加してみよう。'}</p><button class="button-primary" data-action="reset">すべての教材を見る</button></div>`}`;}
let page=1;
function detail(){const t=currentTools().find(t=>t.id===state.tool);if(!t)return `<div class="empty-results">${icon('book')}<h1>この教材は表示できません</h1><p>教材が見つからないか、現在の表示モードでは利用できません。</p><button class="button-primary" data-nav="all">教材をさがす</button></div>`;return `<p class="breadcrumb"><button data-action="back-list">← 一覧へ戻る</button></p><div class="detail-layout"><div class="detail-preview"><img src="${asset(t.thumbnail)}" alt="${e(t.title)}の見本" width="600" height="340"><p>${t.sample?'教材を追加する仕組みを確認するための組込み見本です。':'教材の見本です。'}</p></div><article class="detail-content"><p class="eyebrow">${e(categoryName(t.category))} ／ ${e(t.kind)}</p><h1>${e(t.title)}</h1><p class="detail-description">${e(t.description)}</p><dl class="detail-meta"><div><dt>対象</dt><dd>${t.audience==='teacher'?'先生用':t.grades.length?t.grades.map(g=>g+'年生').join('・'):'学年共通'}</dd></div><div><dt>更新日</dt><dd>${e(t.updated.replaceAll('-','/'))}</dd></div></dl><a class="button-primary" href="${asset(t.entry)}" data-launch="${t.id}">教材をひらく ${icon('arrow')}</a><button class="detail-favorite" data-favorite="${t.id}" aria-pressed="${favorites.includes(t.id)}">${icon('heart')}${favorites.includes(t.id)?'お気に入りから外す':'お気に入りに追加'}</button><h2>つかい方</h2><ol class="instruction-list">${t.instructions.map(s=>`<li>${e(s)}</li>`).join('')}</ol><div class="tags">${t.tags.map(tag=>`<span># ${e(tag)}</span>`).join('')}</div></article></div>`;}
function guide(){return `<div class="page-intro"><p class="eyebrow">はじめての方へ</p><h1>使い方のごあんない</h1><p>ひとつ見つけて、ひとつためす。学びの道具を気軽につかってみよう。</p></div><div class="guide-grid">${[['01','さがす','教科のボタンや、キーワード・学年で、つかいたい教材をさがします。'],['02','ひらく','「ひらく」を押すと、教材のページにうつります。「使い方」で説明も読めます。'],['03','またつかう','♡を押すとお気に入りに追加できます。つかった教材は「最近つかった教材」にもならびます。']].map(([n,t,d])=>`<section class="guide-card"><span>${n}</span><h2>${t}</h2><p>${d}</p></section>`).join('')}</div><div class="guide-notes"><h2>先生へ</h2><p>右上の「先生用をひらく」から、先生用パスワードを入力します。同じ本だなに仕事用の道具が加わります。使い終わったら「先生モードを終了」を押してください。</p><h2>保存について</h2><p>お気に入りと最近つかった教材は、この端末のブラウザーに保存されます。保存が使えない場合も教材はひらけます。初期の見本では児童名や成績などの個人情報を入力しません。</p><h2>教材の利用について</h2><p>組込み見本は授業や仕組みの確認に使えます。今後追加する教材は、それぞれに記載する利用条件を確認してください。</p><h2>表示モードについて</h2><p>先生用パスワードは一覧を切り替えるためのものです。教材ファイル自体の公開を制限する仕組みではありません。</p></div>`;}
function dialogs(){return `<dialog id="teacher-dialog" aria-labelledby="teacher-title"><form id="teacher-form"><button type="button" class="dialog-close" data-action="close-dialog" aria-label="閉じる">${icon('close')}</button><div class="dialog-icon">${icon('lock')}</div><p class="eyebrow">先生のための、もうひとつの本だな。</p><h2 id="teacher-title">先生用をひらく</h2><p>先生用パスワードを入力すると、<br>授業や仕事に使える道具が加わります。</p><label class="password-label" for="teacher-password">先生用パスワード</label><div class="password-input"><input id="teacher-password" type="password" autocomplete="off" required autofocus><button type="button" data-action="show-password" aria-pressed="false">表示</button></div><p id="password-error" class="form-error" role="alert"></p><button id="teacher-submit" class="button-primary" type="submit">先生用をひらく ${icon('arrow')}</button><p class="dialog-footnote">このタブだけで先生モードになります。</p></form></dialog>`;}
function render(){const focus=document.activeElement as HTMLInputElement|null;const wasSearch=focus?.id==='search-input';const cursor=wasSearch?focus?.selectionStart:null;const main=loading?'<div class="empty-results" role="status">本だなを準備しています…</div>':loadError?'<div class="empty-results"><h1>教材を読み込めませんでした</h1><p>通信を確認して、もう一度ためしてください。</p><button class="button-primary" data-action="retry">もう一度読み込む</button></div>':state.view==='home'?home():state.view==='detail'?detail():state.view==='guide'?guide():state.view==='developer'?developerGuide():listing();app.innerHTML=`${header()}${mobileNav()}<div class="site-layout">${sidebar()}<div class="content-wrap"><main id="main" tabindex="-1">${main}</main><footer class="site-footer"><span>${icon('book')}教材ライブラリ</span><p>まなぶ時間を、もっと心地よく。</p><small>v1.0.0</small></footer></div></div>${storageWarning?'<p class="storage-note" role="status">この端末では本だなの保存が使えません。教材はそのままひらけます。</p>':''}${dialogs()}`;if(wasSearch){const field=document.querySelector<HTMLInputElement>('#search-input');field?.focus({preventScroll:true});if(cursor!==null&&cursor!==undefined)field?.setSelectionRange(cursor,cursor);}document.title=`${state.view==='detail'?(currentTools().find(t=>t.id===state.tool)?.title??'教材'):state.view==='home'?'学びのそばに、ちょうどいい道具。':state.view==='guide'?'使い方':state.view==='developer'?'開発者モード':state.view==='favorites'?'お気に入り':state.view==='recent'?'最近つかった教材':'教材をさがす'}｜教材ライブラリ`;}
async function fetchJson(p:string){const response=await fetch(asset(p),{cache:'no-cache'});if(!response.ok)throw new Error('FETCH');return response.json();}
async function load(){loading=true;loadError=false;render();try{students=parseCatalog(await fetchJson('catalog/student.json'),'student');const remembered=readStore('session',KEY.teacher);if(remembered){try{const conf=await fetchJson('library.config.json');if(remembered===conf.teacherMode.digest){teachers=parseCatalog(await fetchJson('catalog/teacher.json'),'teacher');teacher=true;}else sessionStorage.removeItem(KEY.teacher);}catch{teacher=false;}}}catch{loadError=true;}loading=false;readRoute();render();restorePosition();}
function savePosition(){writeStore('session',KEY.position,JSON.stringify({url:location.href,y:window.scrollY}));}
function restorePosition(){try{const saved=JSON.parse(readStore('session',KEY.position)||'null');if(saved?.url===location.href&&Number.isFinite(saved.y))requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,saved.y)));}catch{}}
async function unlock(event:SubmitEvent){event.preventDefault();const field=document.querySelector<HTMLInputElement>('#teacher-password')!;const error=document.querySelector<HTMLParagraphElement>('#password-error')!;const button=document.querySelector<HTMLButtonElement>('#teacher-submit')!;button.disabled=true;button.textContent='確認しています…';error.textContent='';try{const config=await fetchJson('library.config.json');const conf=config.teacherMode;if(conf.algorithm!=='SHA-256'||typeof conf.salt!=='string'||typeof conf.digest!=='string')throw new Error('CONFIG');const bytes=new TextEncoder().encode(conf.salt+':'+field.value.trim());const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');if(digest!==conf.digest){error.textContent='パスワードがちがうようです。もう一度入力してください。';field.select();return;}const data=parseCatalog(await fetchJson('catalog/teacher.json'),'teacher');teachers=data;teacher=true;writeStore('session',KEY.teacher,digest);render();announce('先生モードになりました。仕事用の道具が加わりました。');document.querySelector<HTMLButtonElement>('[data-action="lock"]')?.focus();}catch{error.textContent='先生用を読み込めませんでした。通信を確認して、もう一度ためしてください。';}finally{const b=document.querySelector<HTMLButtonElement>('#teacher-submit');if(b){b.disabled=false;b.innerHTML=`先生用をひらく ${icon('arrow')}`;}}}
document.addEventListener('submit',ev=>{const form=ev.target as HTMLFormElement;if(form.id==='search-form'){ev.preventDefault();page=1;navigate({view:'all',tool:''});announce(`${filterTools(currentTools(),state).length}件の教材が見つかりました。`);}if(form.id==='teacher-form')void unlock(ev as SubmitEvent);});
let searchTimer:number|undefined;
document.addEventListener('input',ev=>{const target=ev.target as HTMLInputElement;if(target.id==='search-input'){state.query=target.value;if(state.view!=='home'){clearTimeout(searchTimer);searchTimer=window.setTimeout(()=>{page=1;history.replaceState(null,'',routeUrl());render();},180);}}});
document.addEventListener('change',ev=>{const target=ev.target as HTMLSelectElement;const map:Record<string,'category'|'grade'|'kind'>={'filter-category':'category','filter-grade':'grade','filter-kind':'kind'};if(map[target.id]){page=1;navigate({[map[target.id]]:target.value},false);}});
document.addEventListener('click',ev=>{const origin=ev.target as Element;const target=origin.closest<HTMLElement>('[data-nav],[data-home],[data-category],[data-action],[data-favorite],[data-detail],[data-launch]');if(!target)return;
  if(target.hasAttribute('data-home')){ev.preventDefault();page=1;navigate({view:'home',query:'',category:'',grade:'',kind:'',tool:''});}
  if(target.dataset.nav){page=1;navigate({view:target.dataset.nav as View,query:'',category:'',grade:'',kind:'',tool:''});}
  if(target.dataset.category){page=1;navigate({view:'all',category:target.dataset.category,grade:'',query:'',kind:'',tool:''});}
  if(target.dataset.favorite){const id=target.dataset.favorite;if(!currentTools().some(t=>t.id===id))return;favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[id,...favorites].slice(0,50);writeStore('local',KEY.favorites,JSON.stringify(favorites));const y=scrollY;render();window.scrollTo(0,y);document.querySelector<HTMLButtonElement>(`[data-favorite="${id}"]`)?.focus({preventScroll:true});announce(favorites.includes(id)?'お気に入りに追加しました。':'お気に入りから外しました。');}
  if(target.dataset.detail){writeStore('session','kyozai:portal:list',JSON.stringify({state,y:scrollY}));navigate({view:'detail',tool:target.dataset.detail});}
  if(target.dataset.launch){const t=currentTools().find(t=>t.id===target.dataset.launch);if(!t){ev.preventDefault();return;}savePosition();recent=[t.id,...recent.filter(x=>x!==t.id)].slice(0,50);writeStore('local',KEY.recent,JSON.stringify(recent));}
  switch(target.dataset.action){
    case 'unlock':{const dialog=document.querySelector<HTMLDialogElement>('#teacher-dialog')!;dialog.showModal();document.querySelector<HTMLInputElement>('#teacher-password')?.focus();break;}
    case 'close-dialog':document.querySelector<HTMLDialogElement>('#teacher-dialog')?.close();break;
    case 'show-password':{const input=document.querySelector<HTMLInputElement>('#teacher-password')!;const show=input.type==='password';input.type=show?'text':'password';target.textContent=show?'隠す':'表示';target.setAttribute('aria-pressed',String(show));break;}
    case 'lock':{teacher=false;teachers=[];try{sessionStorage.removeItem(KEY.teacher);}catch{}if(workCategories.some(c=>c.id===state.category)||state.view==='detail'){state={view:'home',category:'',query:'',grade:'',kind:'',tool:''};history.replaceState(null,'',routeUrl());}render();announce('先生モードを終了しました。');document.querySelector<HTMLButtonElement>('[data-action="unlock"]')?.focus({preventScroll:true});break;}
    case 'subjects':showAllSubjects=!showAllSubjects;render();document.querySelector<HTMLButtonElement>('[data-action="subjects"]')?.focus({preventScroll:true});break;
    case 'reset':page=1;navigate({view:'all',query:'',category:'',grade:'',kind:'',tool:''},false);break;
    case 'retry':void load();break;
    case 'more':page++;render();break;
    case 'back-list':try{const list=JSON.parse(readStore('session','kyozai:portal:list')||'null');if(list?.state){navigate(list.state,false);requestAnimationFrame(()=>window.scrollTo(0,list.y||0));}else navigate({view:'all',tool:''});}catch{navigate({view:'all',tool:''});}break;
  }
});
document.addEventListener('close',ev=>{if((ev.target as HTMLElement).id==='teacher-dialog')document.querySelector<HTMLButtonElement>('[data-action="unlock"]')?.focus();},true);
window.addEventListener('popstate',()=>{readRoute();render();restorePosition();});
window.addEventListener('pageshow',ev=>{if(ev.persisted){recent=readIds(readStore('local',KEY.recent));favorites=readIds(readStore('local',KEY.favorites));render();restorePosition();}});
window.addEventListener('storage',ev=>{if(ev.key===KEY.favorites){favorites=readIds(ev.newValue);render();}if(ev.key===KEY.recent){recent=readIds(ev.newValue);render();}});
void load();
