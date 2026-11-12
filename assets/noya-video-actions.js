/* Consistent video actions for all NOYA materials. */
(function(){
'use strict';
const styles=[
'.noya-material-actions{display:flex;flex-wrap:wrap;align-items:center;gap:9px;margin:12px 0 4px;font-family:system-ui,-apple-system,sans-serif}',
'.noya-material-actions button{display:inline-flex;align-items:center;gap:6px;border:1px solid #555;border-radius:22px;background:#1b1b1b;color:#eee;padding:10px 13px;min-height:42px;font-size:12px;font-weight:800;cursor:pointer;line-height:1.2}',
'.noya-material-actions button[aria-pressed="true"]{border-color:#aeb938;background:#2f3219;color:#f5fa45}',
'.noya-material-actions button:disabled{opacity:.65;cursor:wait}',
'.noya-material-actions button:focus-visible{outline:2px solid #f5fa45;outline-offset:2px}',
'.noya-material-actions .noya-action-error{color:#e98e8e;font-size:11px;flex-basis:100%;margin:0}'
].join('\n');
const st=document.createElement('style');st.textContent=styles;document.head.append(st);
async function request(action,type,id,value){
 const initData=window.Telegram?.WebApp?.initData;
 if(!initData)throw Error('Открой NOYA CLUB внутри Telegram');
 const response=await fetch('/api/member-materials',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({action,initData,type,id},value===undefined?{}:{value}))});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||'Не удалось сохранить изменение');
 return data;
}
async function touch(type,id){return request('touch',type,id);}
function controls(type,id,options={}){
 const wrap=document.createElement('div');wrap.className='noya-material-actions';wrap.setAttribute('aria-label','Действия с видео');
 const favorite=document.createElement('button'),complete=document.createElement('button'),error=document.createElement('p');
 favorite.type='button';complete.type='button';error.className='noya-action-error';error.hidden=true;
 favorite.dataset.action='favorite';complete.dataset.action='complete';wrap.append(favorite,complete,error);
 let state={favorited:false,completed:false},busy=false;
 function paint(){
  favorite.textContent=state.favorited?'♥ В избранном':'♡ В избранное';
  complete.textContent=state.completed?'✓ Пройдено':'○ Отметить пройденным';
  favorite.setAttribute('aria-pressed',String(state.favorited));
  complete.setAttribute('aria-pressed',String(state.completed));
  favorite.setAttribute('aria-label',state.favorited?'Убрать из избранного':'Добавить в избранное');
  complete.setAttribute('aria-label',state.completed?'Снять отметку пройдено':'Отметить пройденным');
  favorite.disabled=complete.disabled=busy;
 }
 function report(e){error.textContent=e.message||'Ошибка сохранения';error.hidden=false;}
 async function change(action){
  if(busy)return;
  busy=true;paint();error.hidden=true;
  const desired=!(action==='favorite'?state.favorited:state.completed);
  try{
   const data=await request(action,type,id,desired);
   state=Object.assign({},state,data.state);
   if(typeof options.onChanged==='function')options.onChanged(action,Object.assign({},state),desired);
  }catch(e){report(e);}finally{busy=false;paint();}
 }
 favorite.onclick=()=>change('favorite');complete.onclick=()=>change('complete');
 busy=true;paint();
 request('get',type,id).then(data=>{state=Object.assign({},state,data.state);}).catch(report).finally(()=>{busy=false;paint();});
 return {element:wrap,read:()=>Object.assign({},state),refresh:async()=>{const data=await request('get',type,id);state=Object.assign({},state,data.state);paint();return state;}};
}
window.NOYAMaterials={request,touch,controls};
})();