(() => {
'use strict';
const root=document,api='/api/club-journey';
const byId=id=>root.getElementById(id);
const init=()=>window.Telegram?.WebApp?.initData||'';
const params=new URLSearchParams(location.search);
let data={dogs:[],journeys:[],diary:[],submissions:[],reviewEnabled:false,courseAccess:false},lessonData=[],busy=false;
const goalNames={attention:'Контакт и внимание',walks:'Спокойная прогулка',home:'Правила дома',fear:'Страхи и сложные ситуации',social:'Другие собаки и люди',calm:'Спокойствие и отдых'};
const feedbackNames={submitted:'Ожидает проверки',uploading:'Видео загружается',approved:'Проверено ✓',needs_changes:'Нужна доработка',cancelled:'Отменено'};
function elt(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
function msg(id,value,error=false){const box=byId(id);if(box){box.textContent=value||'';box.dataset.error=String(!!error);}}
async function post(action,body={}){
 if(!init())throw Error('Открой NOYA CLUB через Telegram-бота');
 const r=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,initData:init(),...body})});
 const value=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(value.error||'Не удалось сохранить изменения');
 return value;
}
async function load(){
 const d=await post('overview');data=d;
 buildDogSelectors();renderTimeline();renderReports();updateCurrentDog();
 byId('journey-report-form').hidden=!d.reviewEnabled;
 byId('journey-review-availability').textContent=d.reviewEnabled
  ? 'Можно отправить до трёх коротких отчётов в сутки. Проверка проводится в рамках доступного сопровождения.'
  : 'Личная проверка видео пока не открыта. Веди дневник и отмечай прогресс самостоятельно; обещать ответ кинолога до запуска проверки мы не будем.';
 // Assignment tab is retired; keep existing reports in storage.
 const desired=params.get('tab');
 const noJourney=!d.journeys.length;
 const tab=noJourney?'profile':(['profile','diary'].includes(desired)?desired:'diary');
 showTab(tab);
 msg('journey-status',noJourney?'Добавь собаку или выбери имеющуюся, затем одну главную цель.':'Карточка и дневник сохранены в твоём аккаунте Telegram.');
}
function showTab(name){
 if(!['profile','diary'].includes(name))name='diary';
 for(const section of ['profile','diary','report'])byId('journey-'+section).hidden=section!==name;
 for(const button of root.querySelectorAll('[data-journey-tab]'))button.setAttribute('aria-selected',String(button.dataset.journeyTab===name));
 const newUrl=new URL(location.href);newUrl.searchParams.set('tab',name);history.replaceState(null,'',newUrl.pathname+newUrl.search+newUrl.hash);
}
function buildDogSelectors(){
 const current=params.get('dog');
 for(const id of ['journey-existing','journey-diary-dog','journey-report-dog']){
  const el=byId(id),old=el.value||current||'';
  el.replaceChildren();
  el.add(new Option(id==='journey-existing'?'Добавить новую собаку':'Выбери собаку',''));
  for(const dog of data.dogs||[])el.add(new Option(dog.name,dog.id));
  if(data.dogs?.some(d=>d.id===old))el.value=old;
  else if(id!=='journey-existing'&&data.dogs?.length)el.value=data.dogs[0].id;
 }
}
function updateCurrentDog(){
 const chosen=byId('journey-existing').value,dog=data.dogs.find(x=>x.id===chosen);
 const journey=data.journeys.find(x=>x.dog_id===chosen);
 byId('journey-name-wrap').hidden=!!dog;byId('journey-name').required=!dog;
 byId('journey-breed').value=journey?.breed||'';
 byId('journey-age').value=journey?.age_label||'';
 byId('journey-baseline').value=journey?.baseline||'';
 for(const r of root.querySelectorAll('input[name=entryMode]'))r.checked=(journey?.entry_mode||'starting')===r.value;
 for(const r of root.querySelectorAll('input[name=goal]'))r.checked=journey?.primary_goal===r.value;
 if(chosen){
  byId('journey-diary-dog').value=chosen;byId('journey-report-dog').value=chosen;
 }
 renderTimeline();
}
function renderTimeline(){
 const wrap=byId('journey-timeline');wrap.replaceChildren();
 const id=byId('journey-diary-dog').value;
 const entries=(data.diary||[]).filter(e=>e.dog_id===id).slice(0,40);
 if(!entries.length){wrap.append(elt('p','muted','Пока нет записей. Начни с короткого наблюдения в знакомой обстановке.'));return;}
 for(const entry of entries){
  const card=elt('article','entry');
  card.append(elt('div','date',formatDate(entry.created_at)));
  card.append(elt('h3','',entry.conditions));
  card.append(elt('p','',entry.observation));
  card.append(elt('div','meta',entry.stress_level==='calm'?'Спокойно':entry.stress_level==='uncertain'?'Было немного трудно':'Остановились и упростили'));
  wrap.append(card);
 }
}
function renderReports(){
 const wrap=byId('journey-report-list');wrap.replaceChildren();
 const id=byId('journey-report-dog').value;
 const reports=(data.submissions||[]).filter(x=>x.dog_id===id).slice(0,25);
 if(!reports.length){wrap.append(elt('p','muted','Отчётов ещё нет. Можно начать с дневника.'));return;}
 for(const report of reports){
  const item=elt('article','entry');item.append(elt('div','date',formatDate(report.created_at)));
  item.append(elt('h3','',feedbackNames[report.status]||report.status));
  item.append(elt('p','',report.student_note));
  if(report.coach_feedback){
   const note=elt('p','','Ответ кинолога: '+report.coach_feedback);note.style.color='#f5fa45';item.append(note);
  }
  if(report.status==='uploading'){
   const b=elt('button','btn secondary','Проверить обработку видео');
   b.type='button';b.onclick=async()=>{
    b.disabled=true;
    try{const result=await post('submission_finalize',{submissionId:report.id});
     if(result.status==='submitted'){msg('journey-report-message','Отчёт отправлен в очередь проверки.');await reloadQuiet();}
     else msg('journey-report-message','Cloudflare ещё обрабатывает видео. Проверь чуть позже.');
    }catch(e){msg('journey-report-message',e.message,true);}
    finally{b.disabled=false;}
   };
   item.append(b);
  }
  wrap.append(item);
 }
}
function formatDate(value){
 const dt=new Date(value);
 return Number.isNaN(dt.getTime())?'':dt.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
async function reloadQuiet(){
 const latest=await post('overview');data=latest;
 buildDogSelectors();renderTimeline();renderReports();
}
async function loadLessons(){
 try{
  const r=await fetch('/api/stream-token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'course_catalog',initData:init()})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(j.error||'Каталог курса недоступен');
  lessonData=(j.lessons||[]).filter(l=>l.is_published!==false);
  const blocks=new Map((j.blocks||[]).map(b=>[b.id,b.title]));
  const select=byId('journey-lesson');select.replaceChildren();select.add(new Option('Выбери опубликованный урок',''));
  for(const lesson of lessonData)select.add(new Option((blocks.get(lesson.block_id)||'Курс')+' — '+lesson.title,lesson.id));
  const id=params.get('lesson');
  if(lessonData.some(x=>x.id===id))select.value=id;
 }catch(e){msg('journey-report-message','Уроки не загрузились: '+e.message,true);}
}
function selectedRadio(name){return root.querySelector('input[name="'+name+'"]:checked')?.value||'';}
byId('journey-existing').addEventListener('change',updateCurrentDog);
byId('journey-diary-dog').addEventListener('change',renderTimeline);
byId('journey-report-dog').addEventListener('change',renderReports);
root.querySelectorAll('[data-journey-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.journeyTab)));
byId('journey-profile-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;
 const goal=selectedRadio('goal'),entryMode=selectedRadio('entryMode');
 if(!goal){msg('journey-profile-message','Выбери одну цель на ближайший месяц.',true);return;}
 busy=true;byId('journey-save').disabled=true;
 try{
  const result=await post('start',{dogId:byId('journey-existing').value||undefined,name:byId('journey-name').value,entryMode,goal,
   breed:byId('journey-breed').value,age:byId('journey-age').value,baseline:byId('journey-baseline').value});
  await reloadQuiet();
  for(const id of ['journey-existing','journey-diary-dog','journey-report-dog'])byId(id).value=result.dog.id;
  params.set('dog',result.dog.id);
  msg('journey-profile-message','Карточка сохранена. Теперь запиши первое наблюдение.');
  msg('journey-status','Цель: '+goalNames[goal]+'. Первый шаг — наблюдение в подходящих условиях.');
  showTab('diary');renderTimeline();
 }catch(err){msg('journey-profile-message',err.message,true);}
 finally{busy=false;byId('journey-save').disabled=false;}
});
byId('journey-diary-form').addEventListener('submit',async e=>{
 e.preventDefault();const b=e.currentTarget.querySelector('button[type=submit]');b.disabled=true;
 try{
  await post('diary_add',{dogId:byId('journey-diary-dog').value,conditions:byId('journey-conditions').value,
    observation:byId('journey-observation').value,stress:byId('journey-stress').value});
  byId('journey-observation').value='';msg('journey-diary-message','Запись сохранена ✓');
  await reloadQuiet();
 }catch(err){msg('journey-diary-message',err.message,true);}
 finally{b.disabled=false;}
});
function uploadDirect(url,file){
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  xhr.open('POST',url,true);xhr.timeout=120000;
  xhr.upload.onprogress=event=>{
   if(event.lengthComputable)byId('journey-upload-progress').style.width=Math.round(100*event.loaded/event.total)+'%';
  };
  xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(Error('Cloudflare не принял видео ('+xhr.status+')'));
  xhr.onerror=()=>reject(Error('Ошибка соединения при загрузке видео'));
  xhr.ontimeout=()=>reject(Error('Загрузка заняла слишком много времени'));
  const fd=new FormData();fd.append('file',file,file.name);xhr.send(fd);
 });
}
async function finalize(id){
 for(let i=0;i<6;i++){
  const res=await post('submission_finalize',{submissionId:id});
  if(res.status==='submitted')return true;
  if(i<5)await new Promise(resolve=>setTimeout(resolve,3000));
 }
 return false;
}
byId('journey-report-form').addEventListener('submit',async e=>{
 e.preventDefault();const b=byId('journey-report-submit');if(b.disabled)return;b.disabled=true;
 const base={dogId:byId('journey-report-dog').value,lessonId:byId('journey-lesson').value,
  conditions:byId('journey-report-conditions').value,note:byId('journey-report-note').value,
  question:byId('journey-report-question').value};
 const file=byId('journey-report-video').files?.[0];
 try{
  if(file){
   if(file.size>200*1024*1024||!['video/mp4','video/quicktime','video/webm','video/x-m4v'].includes(file.type))
    throw Error('Выбери видео MP4, MOV или WebM не более 200 МБ');
   msg('journey-report-message','Получаем одноразовую ссылку для загрузки…');
   const ticket=await post('submission_begin',{...base,mime:file.type,bytes:file.size});
   msg('journey-report-message','Загружаем видео напрямую в Cloudflare…');
   await uploadDirect(ticket.uploadUrl,file);
   msg('journey-report-message','Видео получено. Проверяем обработку…');
   const done=await finalize(ticket.submissionId);
   msg('journey-report-message',done?'Отчёт отправлен в очередь кинолога ✓':'Видео обрабатывается. Проверь его в списке отчётов позже.');
  }else{
   await post('submission_text',base);msg('journey-report-message','Текстовый отчёт отправлен в очередь кинолога ✓');
  }
  byId('journey-report-video').value='';byId('journey-upload-progress').style.width='0%';
  await reloadQuiet();
 }catch(err){msg('journey-report-message',err.message,true);}
 finally{b.disabled=false;}
});
try{window.Telegram?.WebApp?.ready?.();window.Telegram?.WebApp?.expand?.();}catch{}
load().catch(err=>{msg('journey-status',err.message,true);byId('journey-profile-form').hidden=true;byId('journey-diary-form').hidden=true;byId('journey-report-form').hidden=true;});
})();