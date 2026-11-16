(function (schema) {
 if (typeof module==='object' && module.exports) {module.exports=schema;return;}
 const initData=()=>window.Telegram?.WebApp?.initData;
 const element=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
 async function request(action,values) {
  const options={cache:'no-store',headers:{'x-telegram-init-data':initData()}};
  if(values){
   options.method='POST';options.headers['Content-Type']='application/json';
   options.body=JSON.stringify({initData:initData(),...values});
  }
  const res=await fetch('/api/club-diagnostic?assessment='+action,options);
  const data=await res.json();
  if(!res.ok)throw Error(data.error||'Не удалось загрузить анкету');
  return data;
 }
 function fields(form,entries){
  for(const [key,label,optional] of entries){
   const wrapper=element('label',label);
   const input=element('textarea');
   input.name=key;input.required=!optional;input.maxLength=2000;
   input.className='route-select';input.rows=2;wrapper.append(input);form.append(wrapper);
  }
 }
 function submit(form,label,action){
  const button=element('button',label);button.className='button secondary cta alt';
  button.type='submit';form.append(button);
  const notice=element('p');notice.setAttribute('role','status');form.append(notice);
  form.addEventListener('submit',async event=>{
   event.preventDefault();button.disabled=true;
   try{await action(Object.fromEntries(new FormData(form)));}catch(error){notice.textContent=error.message;}
   finally{button.disabled=false;}
  });
 }
 function showReview(target,row){
  target.append(element('h3','Разбор готов'),element('p',row.reviewerName||'Кинолог'));
  for(const [key,label] of schema.review){
   const paragraph=element('p',row.review[key]);paragraph.style.whiteSpace='pre-wrap';
   target.append(element('h4',label),paragraph);
  }
 }
 function member(target,row){
  target.replaceChildren();
  if(row?.review){showReview(target,row);return;}
  if(row){target.append(element('p','Анкета отправлена. Готовый разбор появится здесь.'));return;}
  const form=element('form');
  form.append(element('p','Заполни анкету и отправь Дарье. После отправки ты получишь один итоговый разбор.'));
  for(const [title,entries] of schema.groups){form.append(element('h3',title));fields(form,entries);}
  submit(form,'Отправить анкету',async answers=>{const data=await request('submit',{answers});member(target,data.assessment);});
  target.append(form);
 }
 window.NoyaDogAssessment={async open(target){
  target.textContent='Загружаем анкету…';
  member(target,(await request('mine')).assessment);
 }};
 const panel=document.getElementById('shop-assessment-panel');
 if(!panel)return;
 const list=panel.querySelector('[data-assessment-queue]');
 async function queue(){
  const data=await request('queue');
  panel.hidden=false;list.replaceChildren();
  if(!data.assessments.length)list.append(element('p','Анкет пока нет.'));
  for(const row of data.assessments){
   const card=element('details');
   card.className='card';
   card.append(element('summary',row.answers.name+' · '+(row.review?'Разбор готов':'Новая анкета')));
   for(const [title,entries] of schema.groups){
    card.append(element('h4',title));
    for(const [key,label] of entries){
     if(row.answers[key])card.append(element('strong',label),element('p',row.answers[key]));
    }
   }
   if(row.review)showReview(card,row);
   else {
    const form=element('form');fields(form,schema.review);
    submit(form,'Опубликовать разбор',async review=>{await request('reply',{studentId:row.student_id,review});await queue();});
    card.append(form);
   }
   list.append(card);
  }
 }
 panel.querySelector('button').addEventListener('click',()=>queue().catch(error=>{list.textContent=error.message;}));
 if(initData())queue().catch(()=>{});
})({
 groups:[
  ['Общая информация о собаке',[
   ['name','Кличка'],['breed','Порода'],['age','Возраст'],['with_you','Сколько времени собака живёт с вами?']
  ]],
  ['Поведение дома',[
   ['home','Есть ли проблемы дома (лай, порча вещей, тревожность, агрессия)?'],
   ['alone','Остаётся ли одна спокойно?'],['follows','Ходит ли за вами по пятам?'],['guests','Как реагирует на гостей?']
  ]],
  ['Поведение на улице',[
   ['leash','Тянет ли поводок?'],['dogs','Как реагирует на собак?'],['people','Как реагирует на людей?'],
   ['fears','Есть ли страхи (звуки, транспорт и т. д.)?']
  ]],
  ['Команды и послушание',[
   ['commands','Какие команды знает?'],['outside_commands','Выполняет ли их на улице?'],
   ['name_response','Откликается ли на кличку?'],['contact','Есть ли контакт с хозяином?']
  ]],
  ['Агрессия (если есть)',[
   ['target','На кого направлена?',true],['situations','В каких ситуациях проявляется?',true],['bites','Были ли укусы?',true]
  ]],
  ['Ваши цели',[
   ['change','Что вы хотите изменить?'],['desired','Каким вы хотите видеть поведение собаки?'],
   ['time','За какой срок хотите получить результат?']
  ]]
 ],
 review:[['observations','Что видно по анкете'],['plan','С чего начать работу'],['progress','Как оценить прогресс']]
});
