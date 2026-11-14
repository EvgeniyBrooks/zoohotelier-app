(() => {
'use strict';
const by=id=>document.getElementById(id),app=by('coach-app'),list=by('coach-list'),dialog=by('coach-player');
let records=[],filter='submitted',loading=false;
const init=()=>window.Telegram?.WebApp?.initData||'';
const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
function status(text,error=false){by('coach-status').textContent=text;by('coach-status').style.borderColor=error?'#e56e6e':'#f5fa45';}
async function api(action,extra={}){
 if(!init())throw Error('Открой кабинет кинолога через Telegram');
 const r=await fetch('/api/club-journey',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action,initData:init(),...extra})});
 const v=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(v.error||'Не удалось загрузить очередь');
 return v;
}
const stamp=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});};
function render(){
 const subset=records.filter(x=>x.status===filter);
 by('coach-count').textContent=records.filter(x=>x.status==='submitted').length;
 document.querySelectorAll('[data-coach-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.coachFilter===filter)));
 list.replaceChildren();
 if(!subset.length){list.append(node('div','notice',filter==='submitted'?'Новых отчётов пока нет.':'В этом разделе пока нет отчётов.'));return;}
 for(const r of subset){
  const card=node('article','card');
  card.append(node('div','meta',stamp(r.submitted_at||r.created_at)));
  card.append(node('h2','',r.lessonTitle||'Практика'));
  card.append(node('div','meta','Собака: '+r.dogName+' · '+(r.hasVideo?'с видео':'текстовый отчёт')));
  card.append(node('p','','Условия: '+(r.conditions||'Не указаны')));
  card.append(node('p','','Наблюдение: '+(r.student_note||'—')));
  if(r.question)card.append(node('p','','Вопрос: '+r.question));
  if(r.coach_feedback)card.append(node('p','','Предыдущий ответ: '+r.coach_feedback));
  const actions=node('div','actions');
  if(r.hasVideo){
   const view=node('button','secondary','▶ Смотреть видео');view.type='button';
   view.onclick=async()=>{
    view.disabled=true;
    try{
     const result=await api('coach_video',{submissionId:r.id});
     const url=new URL(result.playerUrl);
     if(url.protocol!=='https:'||!url.hostname.endsWith('.cloudflarestream.com'))throw Error('Неверный адрес видео');
     const frame=document.createElement('iframe');frame.src=url.href;
     frame.title='Видеоотчёт: '+r.dogName;frame.allow='autoplay;encrypted-media;picture-in-picture';frame.allowFullscreen=true;
     by('coach-player-content').replaceChildren(frame);dialog.showModal();
    }catch(e){status(e.message,true);}finally{view.disabled=false;}
   };
   actions.append(view);
  }
  card.append(actions);
  if(['submitted','needs_changes'].includes(r.status)){
   const field=node('label','field','Ответ владельцу');
   const input=document.createElement('textarea');input.maxLength=2000;input.placeholder='Что получилось, что облегчить и какой один следующий шаг?';input.value=r.coach_feedback||'';field.append(input);card.append(field);
   const buttons=node('div','actions');
   for(const [decision,label] of [['approved','✓ Принять'],['needs_changes','↺ Попросить доработку']]){
    const b=node('button',decision==='approved'?'':'secondary',label);
    b.type='button';
    b.onclick=async()=>{
     if(input.value.trim().length<10){card.querySelector('.status')?.remove();card.append(node('p','status','Напиши обратную связь минимум из десяти символов.'));return;}
     for(const x of buttons.querySelectorAll('button'))x.disabled=true;
     try{
      await api('coach_review',{submissionId:r.id,status:decision,feedback:input.value});
      await load();
     }catch(e){status(e.message,true);for(const x of buttons.querySelectorAll('button'))x.disabled=false;}
    };
    buttons.append(b);
   }
   card.append(buttons);
  }
  list.append(card);
 }
}
async function load(){
 if(loading)return;loading=true;
 try{
  const d=await api('coach_queue');records=d.queue||[];
  app.hidden=false;
  status('Очередь доступна. Новых заданий: '+records.filter(x=>x.status==='submitted').length+'.');
  render();
 }catch(e){app.hidden=true;status(e.message,true);}
 finally{loading=false;}
}
document.querySelectorAll('[data-coach-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.coachFilter;render();}));
by('coach-reload').addEventListener('click',load);
by('coach-player-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>{const el=by('coach-player-content');for(const f of el.querySelectorAll('iframe'))f.src='about:blank';el.replaceChildren();});
try{window.Telegram?.WebApp?.ready?.();window.Telegram?.WebApp?.expand?.();}catch{}
load();
})();