/* One back action for the current screen or the topmost dialog. */
(() => {
'use strict';
const host=document.querySelector('main,.app');
if(!host)return;
let baseBack=()=>location.assign('./club.html#home'),baseVisible=()=>true;
const button=document.createElement('button');
button.type='button';button.className='noya-back';button.setAttribute('aria-label','Назад');
button.innerHTML='<svg viewBox="0 0 24 24" width="21" height="21" fill="none" aria-hidden="true"><path d="m14 6-6 6 6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Назад</span>';
const style=document.createElement('style');
style.textContent=`
.noya-navigation-ready .noya-legacy-return,html.noya-navigation-ready #back.noya-legacy-return{display:none!important}
.noya-back{display:flex;align-items:center;gap:7px;width:max-content;min-height:44px;margin:0 0 14px;padding:6px 0;border:0;background:transparent;color:#b7b7b7;font:14px/1.4 system-ui,-apple-system,sans-serif;cursor:pointer}
.noya-back svg{color:#f5fa45;flex:none}.noya-back:focus-visible{outline:2px solid #f5fa45;outline-offset:4px;border-radius:6px}
.noya-back[hidden]{display:none!important}.account-dialog>.noya-back{margin:8px 20px 0}
`;
document.head.append(style);
let nativeBack=null,nativeVisible=null,previousDialog=null,dialogOrder=[];
const tg=window.Telegram?.WebApp;
if(tg?.initData&&tg.BackButton&&tg.isVersionAtLeast?.('6.1')){
 try{nativeBack=tg.BackButton;nativeBack.onClick(goBack);}catch(_){nativeBack=null;}
}
function topDialog(){
 const open=[...document.querySelectorAll('dialog[open]')];
 dialogOrder=dialogOrder.filter(d=>open.includes(d));
 open.forEach(d=>{if(!dialogOrder.includes(d))dialogOrder.push(d);});
 return dialogOrder[dialogOrder.length-1]||null;
}
function goBack(){
 const dialog=topDialog();
 if(dialog){if(typeof dialog.noyaGoBack==='function')dialog.noyaGoBack();else dialog.close();}
 else if(baseVisible())baseBack();
 sync();
}
function sync(){
 const dialog=topDialog();
 const visible=Boolean(dialog)||Boolean(baseVisible());
 if(nativeBack&&nativeVisible!==visible){
  try{visible?nativeBack.show():nativeBack.hide();nativeVisible=visible;}
  catch(_){try{nativeBack.offClick(goBack);}catch(_){}nativeBack=null;}
 }
 const parent=dialog||host;
 if(button.parentNode!==parent)parent.prepend(button);
 const hidden=!visible||Boolean(nativeBack);
 if(button.hidden!==hidden)button.hidden=hidden;
 if(dialog&&dialog!==previousDialog){
  if(!hidden)button.focus({preventScroll:true});
  else if(document.activeElement?.closest('.noya-legacy-return')){
   const focusable=dialog.querySelector('input:not(:disabled),textarea:not(:disabled),button:not(.noya-legacy-return):not(.noya-back):not(:disabled),summary');
   if(focusable)focusable.focus({preventScroll:true});
   else {dialog.tabIndex=-1;dialog.focus({preventScroll:true});}
  }
 }
 previousDialog=dialog;
}
window.NOYABack={
 set(back,visible=()=>true){baseBack=back;baseVisible=visible;sync();},
 sync,go:goBack
};
button.addEventListener('click',goBack);
document.documentElement.classList.add('noya-navigation-ready');
const observer=new MutationObserver(sync);
observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open','hidden']});
sync();
})();
