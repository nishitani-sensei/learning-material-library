// 新しいHTML教材に任意で読み込む、サイトへ戻るための部品。
const script=document.currentScript;
const base=new URL('../',script.src);
const link=document.createElement('a');
link.href=base.href;link.textContent='← ライブラリへ戻る';
link.style.cssText='display:inline-flex;align-items:center;min-height:44px;padding:0 18px;margin:16px;color:#315b47;background:#fff;border:1px solid #c3cdbf;border-radius:999px;font:600 15px/1.5 sans-serif;text-decoration:none';
link.addEventListener('click',event=>{
  try{const saved=JSON.parse(sessionStorage.getItem('kyozai:portal:return')||'null');
    if(saved&&typeof saved.url==='string'){const u=new URL(saved.url);if(u.origin===base.origin&&u.pathname===base.pathname){event.preventDefault();location.href=u.href;}}
  }catch{ /* 保存を使えない端末でも通常の戻るリンクを使う */ }
});
document.body.prepend(link);
