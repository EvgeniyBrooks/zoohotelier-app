(() => {
'use strict';
const root=document.getElementById('noya-members-list');
const section=document.getElementById('members');
if(!root||!section)return;
const total=document.getElementById('noya-members-count');
const myBox=document.getElementById('noya-my-member-card');
const tabs=[...section.querySelectorAll('[data-members-tab]')];
const query=document.getElementById('noya-members-search');
let view='all',people=[],leaders=[],me=null,busy=false;
const api=async(action,params={})=>{
 const initData=window.Telegram?.WebApp?.initData;
 if(!initData)throw Error('Открой клуб из Telegram');
 const res=await fetch('/api/club-members',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,initData,...params})});
 const body=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(body.error||'Данные участников недоступны');
 return body;
};
const el=(tag,cls,value)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(value!==undefined)x.textContent=String(value);return x;};
function avatar(person){
 const x=el('div','noya-person-avatar');
 if(person.avatar&&/^https:\/\//.test(person.avatar)){
  const img=document.createElement('img');img.src=person.avatar;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();x.append(img);
 }
 x.append(el('span','',Array.from(person.name||'Н')[0].toUpperCase()));
 return x;
}
function card(person){
 const box=el('article','noya-person-card');
 const av=avatar(person);box.append(av);
 const desc=el('div','noya-person-info');const name=el('button','noya-person-name',person.name);
 name.type='button';name.onclick=()=>openPerson(person);
 desc.append(name);
 const meta=el('div','noya-person-meta',(person.rank?'№ '+person.rank+' · ':'')+person.points+' баллов');
 desc.append(meta);
 if(person.about){const about=el('p','noya-person-short',person.about);desc.append(about);}
 box.append(desc);
 const heart=el('button','noya-person-fav',person.favorite?'♥':'♡');
 heart.type='button';heart.setAttribute('aria-label',person.favorite?'Убрать из избранного':'Добавить в избранное');
 heart.setAttribute('aria-pressed',String(person.favorite));
 heart.onclick=async()=>{
  heart.disabled=true;try{await api('favorite',{memberId:person.id,favorite:!person.favorite});person.favorite=!person.favorite;paint();}
  catch(e){alert(e.message);}finally{heart.disabled=false;}
 };
 box.append(heart);return box;
}
function paint(){
 tabs.forEach(tab=>tab.setAttribute('aria-selected',String(tab.dataset.membersTab===view)));
 const rankingInfo=document.getElementById('noya-member-points-info');
 if(rankingInfo)rankingInfo.hidden=view!=='ranking';
 const match=query.value.trim().toLocaleLowerCase('ru');
 const source=view==='ranking'?leaders:people;
 const visible=source.filter(p=>(view!=='favorites'||p.favorite)&&(!match||(p.name+' '+p.about).toLocaleLowerCase('ru').includes(match)));
 root.replaceChildren();
 if(!visible.length)root.append(el('div','noya-member-empty',view==='favorites'?'В избранном пока нет участников.':match?'Ничего не найдено.':'Пока никто не открыл публичный профиль.'));
 else{const fragment=document.createDocumentFragment();visible.forEach(person=>fragment.append(card(person)));root.append(fragment);}
}
function textField(label,initial,max,textarea=false){
 const wrap=el('label','noya-person-field');wrap.append(el('span','',label));
 const ctrl=document.createElement(textarea?'textarea':'input');ctrl.maxLength=max;ctrl.value=initial||'';
 if(textarea)ctrl.rows=5;wrap.append(ctrl);return {wrap,input:ctrl};
}
function createDialog(title){
 const d=el('dialog','noya-member-dialog');const h=el('h2','',title);d.append(h);document.body.append(d);
 d.addEventListener('close',()=>d.remove(),{once:true});return d;
}
function closeButton(dialog){
 const b=el('button','noya-member-secondary','Закрыть');b.type='button';b.onclick=()=>dialog.close();return b;
}
function openPerson(person){
 const d=createDialog(person.name);
 d.append(avatar(person));
 d.append(el('p','noya-person-score','🏆 '+person.points+' баллов'+(person.rank?' · место '+person.rank:'')));
 if(person.about)d.append(el('p','noya-person-about',person.about));
 else d.append(el('p','noya-person-about','Участник пока не заполнил описание.'));
 d.append(el('p','noya-person-stats','Уроки: '+person.lessons+' · Практика: '+person.practices+' · Эфиры: '+person.streams+' · Приглашения: '+person.referrals));
 const foot=el('div','noya-member-actions');
 if(person.canMessage&&person.username){
  const a=el('a','noya-member-primary','Написать в Telegram');
  a.href='https://t.me/'+encodeURIComponent(person.username);a.target='_blank';a.rel='noopener noreferrer';
  foot.append(a);
 }else foot.append(el('p','noya-member-contact-off','Участник не открыл личные сообщения.'));
 foot.append(closeButton(d));d.append(foot);d.showModal();
}
function edit(){
 if(!me)return;
 const d=createDialog('РЕДАКТИРОВАТЬ ПРОФИЛЬ');
 d.append(el('p','noya-person-hint','Другие участники увидят профиль только с твоего разрешения.'));
 const name=textField('Имя для сообщества',me.name,64);
 const about=textField('О себе и моей собаке',me.about,600,true);
 d.append(name.wrap,about.wrap);
 const display=el('label','noya-person-toggle');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=me.publicEnabled;
 display.append(checkbox,el('span','','Показывать мой профиль участникам'));d.append(display);
 const msg=el('label','noya-person-toggle');const contact=document.createElement('input');
 contact.type='checkbox';contact.checked=me.messagesEnabled;contact.disabled=!me.canMessage||!me.publicEnabled;
 msg.append(contact,el('span','',me.canMessage?'Разрешить писать мне в Telegram':'Для сообщений установи @username в Telegram'));
 d.append(msg);
 checkbox.addEventListener('change',()=>{contact.disabled=!me.canMessage||!checkbox.checked;if(contact.disabled)contact.checked=false;});
 const status=el('p','noya-person-status','');d.append(status);
 const actions=el('div','noya-member-actions');const save=el('button','noya-member-primary','Сохранить');save.type='button';
 save.onclick=async()=>{
  save.disabled=true;status.textContent='Сохраняем…';
  try{
   await api('save',{profile:{displayName:name.input.value,about:about.input.value,publicEnabled:checkbox.checked,messagesEnabled:contact.checked}});
   d.close();await refresh();
  }catch(e){status.textContent=e.message;save.disabled=false;}
 };
 actions.append(closeButton(d),save);d.append(actions);d.showModal();
}
function paintMine(){
 myBox.replaceChildren();
 if(!me)return;
 const a=avatar(me);myBox.append(a);
 const body=el('div','noya-my-member-info');
 body.append(el('strong','',me.name));
 body.append(el('span','',me.publicEnabled?'Профиль виден участникам':'Профиль скрыт · изменить'));
 body.append(el('small','',me.points+' баллов'+(me.rank?' · место '+me.rank:'')));
 myBox.append(body);
 const arrow=el('span','noya-my-member-arrow','→');myBox.append(arrow);
 myBox.onclick=edit;myBox.hidden=false;
 section.querySelector('#noya-members-edit').hidden=true;
}
async function refresh(){
 if(busy)return;
 busy=true;
 try{
  const data=await api('list');
  people=data.users||[];leaders=data.leaders||[];
  const ranks=new Map(leaders.map(p=>[p.id,p.rank]));
  people.forEach(p=>p.rank=ranks.get(p.id)||null);
  me=data.me;
  total.textContent=Number.isFinite(Number(data.memberCount))?Number(data.memberCount):people.length;
  paintMine();paint();
 }catch(e){root.replaceChildren(el('div','noya-member-empty',e.message));}
 finally{busy=false;}
}
tabs.forEach(tab=>tab.addEventListener('click',()=>{view=tab.dataset.membersTab;paint();}));
query.addEventListener('input',paint);
section.querySelector('#noya-members-edit').addEventListener('click',edit);
document.querySelectorAll('[data-screen="members"]').forEach(item=>item.addEventListener('click',refresh));
window.addEventListener('pageshow',()=>{if(location.hash==='#members')refresh();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!section.hidden)refresh();});
if(location.hash==='#members')refresh();
window.NOYAMembers={refresh};
})();