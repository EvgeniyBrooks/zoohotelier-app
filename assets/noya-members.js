(() => {
'use strict';
const root=document.getElementById('noya-members-list');
const section=document.getElementById('members');
if(!root||!section)return;
const total=document.getElementById('noya-members-count');
const myBox=document.getElementById('noya-my-member-card');
const tabs=[...section.querySelectorAll('[data-members-tab]')];
const query=document.getElementById('noya-members-search');
const city=document.getElementById('noya-members-city');
const searchToggle=document.getElementById('noya-member-search-toggle');
const filterToggle=document.getElementById('noya-member-filter-toggle');
function togglePanel(button,panel,input){
 button.addEventListener('click',()=>{
  const open=button.getAttribute('aria-expanded')!=='true';
  button.setAttribute('aria-expanded',String(open));panel.hidden=!open;
  if(open)input?.focus();
 });
}
if(searchToggle)togglePanel(searchToggle,document.getElementById('noya-member-search-panel'),query);
if(filterToggle)togglePanel(filterToggle,document.getElementById('noya-member-filter-panel'),city);
document.getElementById('noya-member-filter-reset')?.addEventListener('click',()=>{city.value='';paint();});
const normalize=value=>String(value||'').trim().toLocaleLowerCase('ru');
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
 const brief=[person.city,person.dogName?'🐾 '+person.dogName:'',person.profession].filter(Boolean).join(' · ');
 if(brief)desc.append(el('div','noya-person-brief',brief));
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
 if(searchToggle)searchToggle.dataset.active=String(Boolean(query.value.trim()));
 if(filterToggle)filterToggle.dataset.active=String(Boolean(city?.value));
 tabs.forEach(tab=>tab.setAttribute('aria-selected',String(tab.dataset.membersTab===view)));
 const rankingInfo=document.getElementById('noya-member-points-info');
 if(rankingInfo)rankingInfo.hidden=view!=='ranking';
 const match=query.value.trim().toLocaleLowerCase('ru');
 const source=view==='ranking'?leaders:people;
 if(city){
  const selected=city.value;
  const cities=new Map([...people,...leaders].filter(p=>normalize(p.city)).map(p=>[normalize(p.city),p.city.trim()]));
  city.replaceChildren(new Option('Все города',''),...[...cities].sort((a,b)=>a[1].localeCompare(b[1],'ru')).map(([key,label])=>new Option(label,key)));
  if(cities.has(selected))city.value=selected;
 }
 const visible=source.filter(person=>
  (view!=='favorites'||person.favorite)&&(!city?.value||normalize(person.city)===city.value)&&
  (!match||normalize([person.name,person.about,person.city,person.dogName,person.profession,person.hobbies].filter(Boolean).join(' ')).includes(match)));

 root.replaceChildren();
 if(!visible.length)root.append(el('div','noya-member-empty',(match||city?.value)?'Ничего не найдено.':view==='favorites'?'В избранном пока никого нет.':'Открытых профилей пока нет.'));
 else{const fragment=document.createDocumentFragment();visible.forEach(person=>fragment.append(card(person)));root.append(fragment);}
}
function textField(label,initial,max,textarea=false){
 const wrap=el('label','noya-person-field');wrap.append(el('span','',label));
 const ctrl=document.createElement(textarea?'textarea':'input');ctrl.maxLength=max;ctrl.value=initial||'';
 if(textarea)ctrl.rows=5;wrap.append(ctrl);return {wrap,input:ctrl};
}
let dialogSequence=0;
function createDialog(title){
 const d=el('dialog','noya-member-dialog');const h=el('h2','',title);h.id='noya-member-title-'+(++dialogSequence);d.setAttribute('aria-labelledby',h.id);d.append(h);document.body.append(d);
 d.addEventListener('close',()=>d.remove(),{once:true});return d;
}
function closeButton(dialog){
 const b=el('button','noya-member-secondary noya-legacy-return','Закрыть');b.type='button';b.onclick=()=>dialog.close();return b;
}
function safeSocial(kind,value){
 const v=String(value||'').trim();
 if(!v)return null;
 const raw=v.replace(/^@/,'');
 if(kind==='instagram'){
  const found=raw.match(/^(?:https:\/\/(?:www\.)?instagram\.com\/)?([a-zA-Z0-9._]{1,30})\/?$/i);
  return found?'https://www.instagram.com/'+encodeURIComponent(found[1])+'/':null;
 }
 const found=raw.match(/^(?:https:\/\/t\.me\/)?([a-zA-Z][a-zA-Z0-9_]{4,31})\/?$/i);
 return found?'https://t.me/'+encodeURIComponent(found[1]):null;
}
function detail(d,title,value){
 if(!value)return;
 const section=el('section','noya-person-detail');
 section.append(el('h3','',title));
 section.append(el('p','',value));
 d.append(section);
}
function openPerson(person){
 const d=createDialog(person.name);
 d.append(avatar(person));
 d.append(el('p','noya-person-score','🏆 '+person.points+' баллов'+(person.rank?' · место '+person.rank:'')));
 if(person.city)d.append(el('p','noya-person-city','⌖ '+person.city));
 if(person.about)d.append(el('p','noya-person-about',person.about));
 const info=[person.dogName,person.dogInfo].filter(Boolean).join(' · ');
 detail(d,'МОЯ СОБАКА',info);
 detail(d,'ЧЕМ ЗАНИМАЮСЬ',person.profession);
 detail(d,'ЧЕМУ ХОЧУ НАУЧИТЬ СОБАКУ',person.dogGoals);
 detail(d,'С ЧЕМ МОГУ ПОМОЧЬ',person.helpWith);
 detail(d,'ЧТО ИЩУ',person.lookingFor);
 detail(d,'ИНТЕРЕСЫ',person.hobbies);
 d.append(el('p','noya-person-stats','Уроки: '+person.lessons+' · Практика: '+person.practices+' · Эфиры: '+person.streams+' · Приглашения: '+person.referrals));
 const links=el('div','noya-member-social-links');
 for(const [kind,value,label] of [['instagram',person.instagram,'Instagram'],['telegram',person.telegramChannel,'Telegram-канал']]){
  const url=safeSocial(kind,value);
  if(!url)continue;
  const a=el('a','noya-member-social-link',label+' ↗');a.href=url;a.target='_blank';a.rel='noopener noreferrer';links.append(a);
 }
 if(links.childElementCount){d.append(el('h3','noya-person-links-title','ССЫЛКИ'));d.append(links);}
 const foot=el('div','noya-member-actions');
 if(person.canMessage&&person.username){
  const a=el('a','noya-member-primary','Написать в Telegram');
  a.href='https://t.me/'+encodeURIComponent(person.username);a.target='_blank';a.rel='noopener noreferrer';
  foot.append(a);
 }
 foot.append(closeButton(d));d.append(foot);d.showModal();
}
async function edit(){
 if(!me){try{me=(await api('list')).me;}catch(error){alert(error.message);return;}}
 if(!me)return;
 const d=createDialog('РЕДАКТИРОВАТЬ ПРОФИЛЬ');
 const identity=el('div','noya-member-self');identity.append(avatar(me));
 const identityCopy=el('div');identityCopy.append(el('strong','',me.name));
 if(me.username)identityCopy.append(el('small','','@'+me.username));
 identity.append(identityCopy);d.append(identity);
 const fields={};
 function group(title,entries){
  const container=title==='ОСНОВНОЕ'?d:el('details','noya-member-form-group');
  if(container===d)container.append(el('h3','noya-person-form-section',title));
  else {container.append(el('summary','',title));d.append(container);}
  for(const [key,label,max,textarea] of entries){
   const v=textField(label,me[key],max,!!textarea);
   if(key==='name'){v.input.required=true;v.input.autocomplete='name';}
   if(key==='city')v.input.autocomplete='address-level2';
   fields[key]=v.input;container.append(v.wrap);
  }
 }
 group('ОСНОВНОЕ',[
  ['name','Имя и фамилия',64,false],
  ['city','Город',100,false],
  ['about','О себе',600,true],
  ['profession','Чем занимаюсь',120,false]
 ]);
 group('МОЯ СОБАКА',[
  ['dogName','Кличка собаки',80,false],
  ['dogInfo','Порода, возраст, особенности',300,true],
  ['dogGoals','Чему хочу научить собаку',300,true]
 ]);
 group('ЗНАКОМСТВА',[
  ['helpWith','Чем могу быть полезен другим',400,true],
  ['lookingFor','Что ищу в сообществе',300,true],
  ['hobbies','Интересы и хобби',200,true]
 ]);
 group('ССЫЛКИ',[
  ['instagram','Instagram — @username',80,false],
  ['telegramChannel','Telegram-канал — @username',80,false]
 ]);
 d.append(el('h3','noya-person-form-section','ВИДИМОСТЬ'));
 const display=el('label','noya-person-toggle');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=me.publicEnabled;
 display.append(checkbox,el('span','','Показывать мой профиль участникам'));d.append(display);
 const msg=el('label','noya-person-toggle');const contact=document.createElement('input');
 contact.type='checkbox';contact.checked=me.messagesEnabled;contact.disabled=!me.username||!me.publicEnabled;
 msg.append(contact,el('span','',me.username?'Разрешить другим написать мне в Telegram':'Для сообщений установи @username в Telegram'));
 d.append(msg);
 checkbox.addEventListener('change',()=>{contact.disabled=!me.username||!checkbox.checked;if(contact.disabled)contact.checked=false;});
 const status=el('p','noya-person-status','');status.setAttribute('role','status');d.append(status);
 const actions=el('div','noya-member-actions noya-member-edit-actions');const save=el('button','noya-member-primary','Сохранить');save.type='button';
 save.onclick=async()=>{
  if(!fields.name.value.trim()){status.textContent='Укажи имя';fields.name.focus();return;}
  save.disabled=true;status.textContent='Сохраняем…';
  const profile={};
  for(const [name,input] of Object.entries(fields)){
   profile[name==='name'?'displayName':name]=input.value;
  }
  profile.publicEnabled=checkbox.checked;profile.messagesEnabled=contact.checked;
  try{await api('save',{profile});document.dispatchEvent(new CustomEvent('noya-profile-updated',{detail:{name:profile.displayName.trim()}}));d.close();await refresh();}
  catch(e){status.textContent=e.message;save.disabled=false;}
 };
 actions.append(closeButton(d),save);d.append(actions);d.showModal();
}
function paintMine(){
 myBox.replaceChildren();
 if(!me)return;
 const a=avatar(me);myBox.append(a);
 const body=el('div','noya-my-member-info');
 body.append(el('strong','',me.name));
 body.append(el('span','','Редактировать профиль'));
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
city?.addEventListener('change',paint);
section.querySelector('#noya-members-edit').addEventListener('click',edit);
document.querySelectorAll('[data-screen="members"]').forEach(item=>item.addEventListener('click',refresh));
window.addEventListener('pageshow',()=>{if(location.hash==='#members')refresh();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!section.hidden)refresh();});
if(location.hash==='#members')refresh();
window.NOYAMembers={refresh,edit};
})();