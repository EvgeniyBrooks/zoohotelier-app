(() => {
'use strict';
const root=document.getElementById('noya-first-step');
if(!root)return;
const status=root.querySelector('[data-next-status]'),title=root.querySelector('[data-next-title]'),
 text=root.querySelector('[data-next-text]'),action=root.querySelector('[data-next-action]'),detail=root.querySelector('[data-next-detail]');
const goal={attention:'внимание и контакт',walks:'спокойные прогулки',home:'правила дома',fear:'помощь в сложных ситуациях',social:'адаптацию к людям и собакам',calm:'отдых и спокойствие'};
let busy=false;
async function load(){
 if(busy)return;busy=true;
 try{
  const initData=window.Telegram?.WebApp?.initData;
  if(!initData)return;
  const r=await fetch('/api/club-journey',{method:'POST',cache:'no-store',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'overview',initData})});
  if(!r.ok)return;
  const d=await r.json();
  const dog=d.journeys?.length?d.dogs?.find(x=>x.id===d.journeys[0].dog_id):null;
  const journey=d.journeys?.[0];
  const entries=(d.diary||[]).filter(x=>x.dog_id===journey?.dog_id);
  const reports=(d.submissions||[]).filter(x=>x.dog_id===journey?.dog_id);
  const recent=reports[0];
  const target='journey.html'+(journey?'?dog='+encodeURIComponent(journey.dog_id):'');
  let head,description,cta,link=target,subtitle='';
  if(!journey){
    head=d.dogs?.length?'Выбери одну цель':'Начни с карточки собаки';
    description=d.dogs?.length?'Твои собаки уже в клубе. Выбери главную задачу на ближайший месяц.':'Добавь кличку собаки и одну задачу, чтобы начать без поиска среди десятков уроков.';
    cta='Начать';link='./journey.html?tab=profile';
  }else if(!entries.length){
    head='Запиши исходную точку';
    description='Одна обычная ситуация, условия и наблюдение. Не провоцируй страх ради отчёта.';
    cta='Открыть дневник';link='./journey.html?tab=diary&dog='+encodeURIComponent(journey.dog_id);
  }else if(recent?.status==='needs_changes'){
    head='Кинолог ответил';
    description='Открой разбор и попробуй посильную корректировку. Ошибка — повод упростить условия, а не повод ругать собаку.';
    cta='Посмотреть ответ';link='./journey.html?tab=report&dog='+encodeURIComponent(journey.dog_id);
  }else if(recent?.status==='approved'){
    head='Задание проверено ✓';
    description='Сравни с исходным наблюдением и выбери одну следующую посильную задачу.';
    cta='Мой дневник';link='./journey.html?tab=diary&dog='+encodeURIComponent(journey.dog_id);
  }else if(recent?.status==='submitted'||recent?.status==='uploading'){
    head='Отчёт принят в работу';
    description='Сохрани следующее наблюдение в дневнике. Время ответа зависит от доступного сопровождения.';
    cta='Посмотреть отчёт';link='./journey.html?tab=report&dog='+encodeURIComponent(journey.dog_id);
  }else{
    head='Продолжи спокойную практику';
    description='Повтори посильное упражнение в похожих условиях и сравни наблюдение с первым днём.';
    cta='Записать результат';link='./journey.html?tab=diary&dog='+encodeURIComponent(journey.dog_id);
  }
  status.textContent='NOYA / ЛИЧНЫЙ ПЛАН';
  title.textContent=head;text.textContent=description;
  detail.textContent=journey?(dog?.name||'Моя собака')+' · '+(goal[journey.primary_goal]||'моя задача')+' · '+entries.length+' записей':'Первый шаг за несколько минут';
  action.textContent=cta+' →';action.href=link;
  root.hidden=false;
  document.body.classList.add('noya-guided-home');
 }catch(e){console.warn('NOYA first-month card unavailable:',e.message);}
 finally{busy=false;}
}
window.addEventListener('pageshow',load);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
load();
})();