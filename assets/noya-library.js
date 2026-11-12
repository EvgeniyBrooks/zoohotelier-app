(() => {
'use strict';
const root=document.getElementById('library-content');
if(!root)return;
const tabs=[...document.querySelectorAll('[data-library]')];
const filters=document.getElementById('noya-library-filters');
const labels={history:'История',favorites:'Избранное',completed:'Пройденное'};
const types={course:'Управление вниманием',live:'Прямые эфиры',club:'Клубные уроки'};
let items=[],mode='history',filter='all',pending=false;
const init=()=>window.Telegram?.WebApp?.initData||'';
async function request(action,more={}){
 if(!init())throw Error('Открой NOYA CLUB в Telegram');
 const response=await fetch('/api/member-materials',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,initData:init(),...more})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(data.error||'Не удалось открыть библиотеку');
 return data;
}
function node(tag,cls,content){
 const el=document.createElement(tag);if(cls)el.className=cls;if(content!==undefined)el.textContent=content;return el;
}
function row(item){
 const box=node('article','noya-library-row');
 const thumb=node('div','noya-library-thumb');
 if(item.cover&&item.cover.startsWith('https://')){const img=document.createElement('img');img.src=item.cover;img.alt='';img.loading='lazy';thumb.append(img);}
 else thumb.append(node('span','noya-library-thumb-placeholder',item.type==='live'?'▶':item.type==='course'?'УРОК':'NOYA'));
 const content=node('div','noya-library-row-content');
 const category=node('div','noya-library-category',item.folder||types[item.type]);content.append(category);
 const title=node('button','noya-library-title',item.title);title.type='button';title.onclick=()=>openMaterial(item);content.append(title);
 const stamp=mode==='history'&&item.lastViewedAt?item.lastViewedAt:mode==='completed'?item.updatedAt:null;
 if(stamp){
  const date=new Date(stamp);
  if(!Number.isNaN(date.getTime()))content.append(node('div','noya-library-date',date.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'})+' · '+date.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})));
 }
 const controls=node('div','noya-library-row-controls');
 const favorite=node('button','noya-library-heart',item.favorited?'♥':'♡');
 favorite.type='button';favorite.title=item.favorited?'Убрать из избранного':'Добавить в избранное';
 favorite.setAttribute('aria-label',favorite.title);favorite.setAttribute('aria-pressed',String(item.favorited));
 favorite.onclick=()=>change(item,'favorite',!item.favorited);
 const done=node('button','noya-library-completed',item.completed?'✓ Пройдено':'✓ Отметить пройденным');
 done.type='button';done.setAttribute('aria-pressed',String(item.completed));
 done.onclick=()=>change(item,'complete',!item.completed);
 controls.append(favorite,done);content.append(controls);
 box.append(thumb,content);return box;
}
function render(){
 const counts={history:items.filter(x=>x.lastViewedAt).length,favorites:items.filter(x=>x.favorited).length,completed:items.filter(x=>x.completed).length};
 for(const tab of tabs){
  tab.setAttribute('aria-selected',String(tab.dataset.library===mode));
  const count=tab.querySelector('.noya-library-tab-count');
  if(count)count.textContent=counts[tab.dataset.library]||0;
 }
 for(const b of filters.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.materialFilter===filter));
 const visible=items.filter(x=>(filter==='all'||x.type===filter)&&(mode==='history'?!!x.lastViewedAt:mode==='favorites'?x.favorited:x.completed));
 visible.sort((a,b)=>new Date(mode==='history'?b.lastViewedAt:b.updatedAt||0)-new Date(mode==='history'?a.lastViewedAt:a.updatedAt||0));
 root.replaceChildren();root.className='noya-library-content';
 if(!visible.length){
  const empty=node('div','noya-library-empty');
  empty.append(node('div','noya-library-empty-icon','▤'));
  empty.append(node('strong','',mode==='history'?'Ты ещё не открывал материалы':mode==='favorites'?'В избранном пока ничего нет':'Нет пройденных материалов'));
  empty.append(node('p','',mode==='history'?'Открой урок или эфир — он появится здесь.':mode==='favorites'?'Нажми на ♡ у любого видео, чтобы сохранить его.':'Отмечай просмотренные уроки и эфиры — они появятся здесь.'));
  root.append(empty);return;
 }
 const fragment=document.createDocumentFragment();
 for(const item of visible)fragment.append(row(item));
 root.append(fragment);
}
async function refresh(){
 if(pending)return;
 pending=true;
 try{const data=await request('list');items=data.items||[];render();}
 catch(error){root.className='noya-library-empty';root.textContent=error.message;}
 finally{pending=false;}
}
async function change(item,action,value){
 try{
  const data=await request(action,{type:item.type,id:item.id,value});
  if(action==='favorite')item.favorited=data.state.favorited;
  if(action==='complete')item.completed=data.state.completed;
  item.updatedAt=new Date().toISOString();
  render();
  if(typeof window.loadAttentionCourseProgress==='function')window.loadAttentionCourseProgress();
 }catch(error){alert(error.message);}
}
function openMaterial(item){
 if(item.type==='course'){location.href='./index.html?lesson='+encodeURIComponent(item.id);return;}
 if(item.type==='live'){location.href='./course-live.html?open='+encodeURIComponent(item.id);return;}
 if(item.type==='club'&&typeof window.openClubLesson==='function')window.openClubLesson(item.id,item.title);
}
tabs.forEach(tab=>tab.addEventListener('click',()=>{mode=tab.dataset.library;render();}));
filters?.addEventListener('click',ev=>{const btn=ev.target.closest('[data-material-filter]');if(btn){filter=btn.dataset.materialFilter;render();}});
document.querySelectorAll('[data-screen="library"]').forEach(el=>el.addEventListener('click',refresh));
window.addEventListener('pageshow',()=>{if(location.hash==='#library')refresh();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!document.getElementById('library').hidden)refresh();});
window.NOYALibrary={refresh,change,request};
if(location.hash==='#library')refresh();
})();