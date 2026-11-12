'use strict';
(()=>{
 const tg=window.Telegram?.WebApp;
 try{tg?.ready();tg?.expand();}catch(_){}
 const initData=tg?.initData||'';
 const message=document.getElementById('shop-message');
 const screens={catalog:document.getElementById('shop-catalog'),
  coins:document.getElementById('shop-coins'),
  orders:document.getElementById('shop-orders'),queue:document.getElementById('shop-queue')};
 let isAdmin=false,isReviewer=false;
 const labels={
  awaiting_payment:'Ожидает оплаты',awaiting_video:'Можно отправить видео',
  uploading:'Видео загружается',submitted:'На проверке',in_review:'Специалист смотрит',
  completed:'Разбор готов',canceled:'Отменён'
 };
 const money=value=>new Intl.NumberFormat('ru-RU').format(value)+' ₽';
 const el=(tag,className,txt)=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(txt!==undefined)node.textContent=String(txt);
  return node;
 };
 function setMessage(text){message.textContent=text||'';}
 function button(label,fn,klass='cta'){
  const b=el('button',klass,label);b.type='button';b.addEventListener('click',async()=>{
   b.disabled=true;
   try{await fn(b);}catch(e){setMessage(e.message||'Не удалось выполнить действие');}
   finally{b.disabled=false;}
  });return b;
 }
 async function request(action,body,method='GET'){
  if(!initData)throw Error('Открой магазин из NOYA CLUB в Telegram.');
  const opt=method==='GET'?{
   method:'GET',headers:{'x-telegram-init-data':initData}
  }:{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({action,initData,...body})
  };
  const url=method==='GET'?'/api/club-shop?action='+encodeURIComponent(action)+(body?.id?'&id='+encodeURIComponent(body.id):'')+(body?.kind?'&kind='+encodeURIComponent(body.kind):''):'/api/club-shop';
  const response=await fetch(url,{...opt,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'Ошибка сервиса '+response.status);
  return data;
 }
 function switchTab(name){
  if(!screens[name])name='catalog';
  Object.entries(screens).forEach(([id,section])=>section.hidden=id!==name);
  document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===name)));
  history.replaceState(null,'','#'+name);
  setMessage('');
  if(name==='coins')loadCoins();
  if(name==='orders')loadOrders();
  if(name==='queue')loadQueue();
 }
 document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
 async function loadCoins(){
  const balance=document.getElementById('shop-coins-balance');
  const list=document.getElementById('shop-coin-items');
  const history=document.getElementById('shop-coin-history');
  list.replaceChildren();history.replaceChildren();
  try{
   setMessage('Загружаем кошелёк…');
   const data=await request('coins');
   balance.textContent=new Intl.NumberFormat('ru-RU').format(data.balance);
   const referral=data.referral||{};
   const code=String(referral.code||'');
   const inviteUrl=/^[a-f0-9]{24}$/.test(code)?
    'https://t.me/NoyaClubBrooksBot?startapp=ref_'+code:'';
   document.getElementById('shop-referral-link').value=inviteUrl;
   document.getElementById('shop-referral-pending').textContent=Number(referral.pending)||0;
   document.getElementById('shop-referral-rewarded').textContent=Number(referral.rewarded)||0;
   const owned=data.items.filter(x=>x.owned);
   for(const item of data.items){
    const card=el('article','card'+(item.owned?' highlight':''));
    card.append(el('div','kicker',item.owned?'КУПЛЕНО':'БОНУСНЫЙ МАГАЗИН'),
     el('h3','',item.title),el('p','',item.description),
     el('div','price',new Intl.NumberFormat('ru-RU').format(item.cost)+' 🪙'));
    if(item.owned){
     const details=el('details');
     const summary=el('summary','', 'Открыть купленный материал');
     const content=el('pre');
     content.style.cssText='white-space:pre-wrap;overflow-wrap:break-word;font:13px/1.65 system-ui,sans-serif;color:#e6e6e6;margin-top:14px';
     content.textContent=item.content||'Материал пока недоступен';
     details.append(summary,content);card.append(details);
    }else{
     const buy=button('Купить за '+item.cost+' НОИНКОИНОВ',async()=>{
      if(!window.confirm('Обменять '+item.cost+' НОИНКОИНОВ на «'+item.title+'»?'))return;
      const result=await request('coin_redeem',{itemCode:item.code},'POST');
      setMessage(result.applied?'Бонус куплен! Он появился в кошельке.':'Этот бонус уже куплен.');
      await loadCoins();
     });
     buy.disabled=data.balance<item.cost;
     card.append(buy);
     if(data.balance<item.cost)card.append(el('div','small','Не хватает '+(item.cost-data.balance)+' НОИНКОИНОВ'));
    }
    list.append(card);
   }
   if(!data.items.length)list.append(el('p','small','Бонусы появятся здесь.'));
   const changes=Array.isArray(data.history)?data.history:[];
   if(!changes.length)history.append(el('p','small','Операций пока нет.'));
   changes.forEach(tx=>{
    const row=el('div','card');
    const n=Number(tx.coins)||0;
    row.append(el('div','state',(n>0?'+':'')+n+' 🪙'),
     el('div','',tx.reason),
     el('div','small',new Date(tx.created_at).toLocaleDateString('ru-RU')));
    history.append(row);
   });
   setMessage('');
  }catch(e){setMessage(e.message);}
 }
 function getReferralLink(){
  const value=document.getElementById('shop-referral-link').value;
  if(!/^https:\/\/t\.me\/NoyaClubBrooksBot\?startapp=ref_[a-f0-9]{24}$/.test(value))
   throw Error('Реферальная ссылка пока не готова');
  return value;
 }
 document.getElementById('shop-referral-copy').addEventListener('click',async()=>{
  try{
   const link=getReferralLink();
   if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(link);
   else{
    const input=document.getElementById('shop-referral-link');
    input.focus();input.select();
    if(!document.execCommand('copy'))throw Error('Скопируй ссылку из поля вручную');
   }
   setMessage('Реферальная ссылка скопирована!');
  }catch(e){setMessage(e.message||'Скопируй ссылку вручную');}
 });
 document.getElementById('shop-referral-share').addEventListener('click',()=>{
  try{
   const link=getReferralLink();
   const share='https://t.me/share/url?'+new URLSearchParams({
    url:link,text:'Присоединяйся к NOYA CLUB! 🐕'
   });
   if(typeof tg?.openTelegramLink==='function')tg.openTelegramLink(share);
   else window.location.assign(share);
  }catch(e){setMessage(e.message||'Не удалось открыть приглашение');}
 });
 document.getElementById('shop-coins-reload').addEventListener('click',loadCoins);
 async function loadCatalog(){
  const data=await request('catalog');
  isAdmin=data.adminPreview===true;
  isReviewer=data.reviewer===true;
  document.getElementById('noya-shop-reviewer-tab').hidden=!isReviewer;
  document.getElementById('shop-staff-manager').hidden=!isAdmin;
  const dest=document.getElementById('shop-services');dest.replaceChildren();
  const services=Array.isArray(data.services)?data.services:[];
  for(const service of services){
   const card=el('article','card'+(service.code==='evgeniy'?' highlight':''));
   card.append(el('div','kicker',service.code==='evgeniy'?'ЛИЧНО С ЕВГЕНИЕМ':'ПОМОЩЬ КИНОЛОГА'),
    el('h2','service-name',service.name),el('div','price',money(service.priceRub)));
   const desc=service.code==='evgeniy'?
    'Персональный видеоразбор с Евгением Бруксом: где ошибка, почему она появляется и как двигаться дальше.':
    'Проверка домашнего задания: кинолог разберёт упражнение и подскажет, что исправить.';
   card.append(el('p','',desc));
   const meta=el('div','meta');meta.append(el('span','tag','1 видео до 2 минут'),
    el('span','tag',service.deadline),el('span','tag','Без автопродления'));
   card.append(meta);
   if(service.adminTestEnabled===true){
    card.append(button('Создать тестовый заказ · без оплаты',async()=>{
     const result=await request('test_create',{serviceCode:service.code},'POST');
     setMessage('Тестовый заказ создан. Денежного списания нет.');
     switchTab('orders');await loadOrders();
    }));
   }else{
    const disabled=el('button','cta','Оплата разборов скоро появится');
    disabled.type='button';disabled.disabled=true;card.append(disabled);
   }
   dest.append(card);
  }
 }
 function cardOrder(row,reviewer=false){
  const service=row.serviceCode==='evgeniy'?'Личный разбор с Евгением':'Проверка кинологом';
  const card=el('article','card');
  const top=el('div','kicker',service+' · '+money(row.priceRub));
  card.append(top,el('h3','',row.isTest?'ТЕСТОВЫЙ ЗАКАЗ':'ЗАКАЗ'));
  card.append(el('div','state',labels[row.status]||row.status));
  card.append(el('p','small','№ '+row.id.slice(0,8)+' · '+new Date(row.createdAt).toLocaleDateString('ru-RU')));
  if(row.problemText)card.append(el('p','',row.problemText));
  if(row.status==='completed'&&row.reviewText){
   const result=el('div','notice');
   result.append(el('strong','', 'Ответ специалиста'),el('p','',row.reviewText));
   card.append(result);
  }
  if(!reviewer&&['awaiting_video','uploading'].includes(row.status))insertUploader(card,row,'submission');
  if(reviewer&&['submitted','in_review'].includes(row.status))insertReviewer(card,row);
  if(row.hasSubmission&&reviewer)card.append(button('▶ Смотреть видео участника',()=>showVideo(card,row.id,'submission'),'cta alt'));
  if(row.hasSubmission&&!reviewer)card.append(button('▶ Смотреть своё видео',()=>showVideo(card,row.id,'submission'),'cta alt'));
  if(row.hasReplyVideo)card.append(button('▶ Смотреть видеоразбор',()=>showVideo(card,row.id,'reply'),'cta alt'));
  return card;
 }
 async function showVideo(card,id,kind){
  const data=await request('video',{id,kind});
  const url=new URL(data.playerUrl);
  if(url.protocol!=='https:'||url.hostname!=='customer-9y0wom20nneqpu4g.cloudflarestream.com')throw Error('Неверный адрес видео');
  const frame=el('iframe');
  frame.src=url.href;frame.allow='autoplay; encrypted-media; picture-in-picture';
  frame.allowFullscreen=true;frame.title='Защищённое видео домашнего задания';
  const existing=card.querySelector('.shop-player');if(existing)existing.remove();
  const container=el('div','shop-player');container.append(frame);card.append(container);
 }
 async function uploadFile(row,kind,file,problem,card){
  if(!file)throw Error('Выбери видео для загрузки');
  if(!file.type.startsWith('video/'))throw Error('Можно загрузить только видео');
  if(file.size>190*1024*1024)throw Error('Видео должно быть меньше 190 МБ');
  if(kind==='submission'&&(problem.trim().length<5||problem.trim().length>1500))
   throw Error('Опиши проблему в 5–1500 символах');
  setMessage('Получаем защищённую ссылку загрузки…');
  const signed=await request('upload_start',{orderId:row.id,kind},'POST');
  const url=new URL(signed.uploadUrl);
  if(url.protocol!=='https:'||!['upload.videodelivery.net','upload.cloudflarestream.com'].includes(url.hostname))
   throw Error('Неправильный адрес загрузки');
  const form=new FormData();form.append('file',file);
  setMessage('Загружаем видео в Cloudflare… Не закрывай приложение.');
  const response=await fetch(url.href,{method:'POST',body:form});
  if(!response.ok)throw Error('Не удалось загрузить видео. Повтори попытку.');
  setMessage('Видео получено. Проверяем обработку…');
  const result=await request('upload_finish',{orderId:row.id,kind,problemText:problem},'POST');
  if(result.processing){
   setMessage('Видео обрабатывается. Нажми «Проверить готовность» через некоторое время.');
   const check=button('Проверить готовность видео',async()=>{
    const status=await request('upload_finish',{orderId:row.id,kind,problemText:problem},'POST');
    if(status.processing)setMessage('Видео ещё обрабатывается.');
    else{setMessage('Видео готово и отправлено!');if(kind==='reply')await loadQueue();else await loadOrders();}
   },'cta alt');
   card.append(check);
   return;
  }
  setMessage('Видео отправлено специалисту.');if(kind==='reply')await loadQueue();else await loadOrders();
 }
 function insertUploader(card,row,kind){
  const field=el('label','','Видео с упражнением (до 2 минут)');
  const file=el('input','file');file.type='file';file.accept='video/*';
  const desc=el('label','','Что не получается?');
  const note=el('textarea');note.maxLength=1500;note.placeholder='Например: собака перестаёт обращать внимание, когда видит другую собаку.';
  if(row.problemText)note.value=row.problemText;
  card.append(field,file,desc,note,button('Отправить на проверку',()=>uploadFile(row,kind,file.files[0],note.value,card)));
 }
 function insertReviewer(card,row){
  card.append(button('Взять на разбор',async()=>{
   await request('review_start',{orderId:row.id},'POST');setMessage('Заказ взят в работу.');await loadQueue();
  },'cta alt'));
  const label=el('label','','Рекомендации участнику');
  const text=el('textarea');text.placeholder='Укажи, что получилось, ошибки и следующий шаг…';text.maxLength=4000;
  card.append(label,text);
  const video=el('input','file');video.type='file';video.accept='video/*';
  const vlabel=el('label','','Дополнительный видеоответ (необязательно)');
  card.append(vlabel,video);
  card.append(button('Загрузить видеоответ',async()=>uploadFile(row,'reply',video.files[0],'',card),'cta alt'));
  card.append(button('Завершить разбор и отправить ответ',async()=>{
   await request('review_complete',{orderId:row.id,reviewText:text.value},'POST');
   setMessage('Разбор сохранён и доступен участнику.');await loadQueue();
  }));
 }
 async function loadOrders(){
  const target=document.getElementById('shop-orders-list');target.replaceChildren();
  try{
   const data=await request('orders');
   if(!data.orders.length){target.append(el('p','small','Разборов пока нет. Здесь появятся купленные услуги и тестовые заказы.'));return;}
   data.orders.forEach(row=>target.append(cardOrder(row,false)));
  }catch(e){setMessage(e.message);}
 }
 async function loadQueue(){
  const target=document.getElementById('shop-queue-list');target.replaceChildren();
  try{
   const data=await request('queue');
   if(!data.orders.length)target.append(el('p','small','В очереди пока нет заказов.'));
   data.orders.forEach(row=>target.append(cardOrder(row,true)));
   if(isAdmin)await loadStaff();
  }catch(e){setMessage(e.message);}
 }
 async function loadStaff(){
  const target=document.getElementById('shop-staff-list');target.replaceChildren();
  try{
   const data=await request('staff');
   for(const row of data.staff){
    const item=el('div','card',String(row.telegram_id)+' · '+(row.role==='kinolog'?'Кинолог':'Евгений'));
    item.append(el('div','small',row.enabled?'Доступ включён':'Доступ выключен'));
    item.append(button(row.enabled?'Отключить':'Включить',async()=>{
     await request('staff_set',{telegramId:String(row.telegram_id),role:row.role,enabled:!row.enabled},'POST');
     await loadStaff();
    },'cta alt'));
    target.append(item);
   }
  }catch(e){setMessage(e.message);}
 }
 document.getElementById('shop-staff-save').addEventListener('click',async()=>{
  try{
   const telegramId=document.getElementById('shop-staff-id').value.trim();
   const role=document.getElementById('shop-staff-role').value;
   await request('staff_set',{telegramId,role,enabled:true},'POST');
   setMessage('Доступ специалисту сохранён.');await loadStaff();
  }catch(e){setMessage(e.message);}
 });
 async function start(){
  if(!initData){setMessage('Открой магазин через @NoyaClubBrooksBot в Telegram.');return;}
  try{
   await loadCatalog();setMessage('');
   const tab=location.hash.slice(1);
   if(tab==='orders'||tab==='queue'&&isReviewer)switchTab(tab);
  }catch(e){
   setMessage(e.message);document.getElementById('shop-catalog').hidden=true;
  }
 }
 start();
})();