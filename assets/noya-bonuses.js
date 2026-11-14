'use strict';
(()=>{
 const root=document.getElementById('bonuses');if(!root)return;
 const tg=window.Telegram?.WebApp;
 const $=id=>document.getElementById('bonus-'+id);
 const fmt=n=>new Intl.NumberFormat('ru-RU').format(n);
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 let loaded=false,loading=false,redeeming=false,link='',tab='store',offset=0;
 let invitationsBusy=false,rankingVersion=0;
 const status=text=>{$('status').textContent=text;};
 async function api(action,extra={},post=false){
  const initData=tg?.initData||'';
  if(!initData)throw Error('Открой NOYA CLUB через @NoyaClubBrooksBot в Telegram.');
  const response=await fetch('/api/club-shop'+(post?'':'?'+new URLSearchParams({action,...extra})),{
   method:post?'POST':'GET',headers:post?{'Content-Type':'application/json'}:{'x-telegram-init-data':initData},
   ...(post?{body:JSON.stringify({action,initData,...extra})}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok)throw Error(response.status===401?'Сессия истекла. Открой приложение заново из Telegram.':response.status===403?'Бонусная программа доступна участникам клуба.':data.error||'Не удалось загрузить данные. Попробуй ещё раз.');
  return data;
 }
 function row(title,detail){
  const r=node('div',undefined,'bonus-row');r.append(node('strong',title),node('small',detail));return r;
 }
 function date(value){return new Date(value).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'});}
 function render(data){
  $('balance').textContent=fmt(data.balance);
  const ref=data.referral||{};
  link=/^[a-f0-9]{24}$/.test(ref.code||'')?'https://t.me/NoyaClubBrooksBot?startapp=ref_'+ref.code:'';
  $('link').value=link;$('copy').disabled=!link;$('share').disabled=!link;
  $('pending').textContent=fmt(ref.pending||0);$('paid').textContent=fmt(ref.rewarded||0);
  $('invite-rule').textContent='За каждую подтверждённую оплату приглашённого друга — '+fmt(ref.coinsPerConfirmedPayment||0)+' ноинкоинов.';
  $('rules-list').replaceChildren(...(data.earningRules||[]).map(r=>node('p','+'+fmt(r.coins)+' · '+r.event)));
  const items=Array.isArray(data.items)?data.items:[];
  $('store').replaceChildren();
  for(const item of items){
   const card=node('article',undefined,'card');
   card.append(node('h3',item.title),node('p',item.description),node('div',fmt(item.cost)+' ◈','bonus-price'));
   if(item.owned){
    const details=node('details');details.append(node('summary','Как получить подарок'),node('pre',item.content||'Инструкция по получению пока недоступна'));card.append(details);
   }else{
    const buy=node('button',data.balance<item.cost?'Недостаточно баллов':'Получить за '+fmt(item.cost),'button');
    buy.type='button';buy.disabled=data.balance<item.cost;
    buy.addEventListener('click',async()=>{
     if(redeeming||loading)return;
     if(!window.confirm('Обменять '+item.cost+' ноинкоинов на «'+item.title+'»?'))return;
     redeeming=true;buy.disabled=true;
     try{const result=await api('coin_redeem',{itemCode:item.code},true);render(result.wallet);status(result.applied?'Подарок оформлен! Открой инструкцию по получению.':'Этот подарок уже оформлен.');}
     catch(e){status(e.message);buy.disabled=false;}finally{redeeming=false;}
    });card.append(buy);
   }
   $('store').append(card);
  }
  if(!items.length)$('store').append(node('p','Бонусы скоро появятся здесь.'));
  const history=Array.isArray(data.history)?data.history:[];
  $('history').replaceChildren(...history.map(tx=>row((tx.coins>0?'+':'')+fmt(tx.coins)+' ◈ · '+tx.reason,date(tx.created_at))));
  if(!history.length)$('history').append(node('p','Пока нет операций. Здесь появятся начисления и покупки.'));
 }
 async function load(){
  if(loading||redeeming)return;
  loading=true;$('reload').disabled=true;status('Загружаем бонусы…');
  try{render(await api('coins'));loaded=true;status('');}
  catch(e){status(e.message);link='';$('link').value='';$('balance').textContent='—';$('pending').textContent='—';$('paid').textContent='—';$('copy').disabled=true;$('share').disabled=true;$('store').replaceChildren();$('history').replaceChildren();loaded=false;}
  finally{loading=false;$('reload').disabled=false;}
 }
 async function invitations(reset=true){
  if(invitationsBusy)return;
  invitationsBusy=true;$('invitations-more').disabled=true;
  if(reset){offset=0;$('invitations').replaceChildren();$('invitations-more').hidden=true;}
  try{
   const result=await api('bonus_invitations',{offset});
   result.invitations.forEach((r,i)=>$('invitations').append(row('Приглашение № '+(offset+i+1),
    date(r.createdAt)+' · '+(r.paidAt?'Первая оплата подтверждена '+date(r.paidAt):'Ожидает первой оплаты'))));
   if(reset&&!result.invitations.length)$('invitations').append(node('p','Приглашений пока нет. Поделись своей ссылкой.'));
   offset=result.nextOffset;$('invitations-more').hidden=offset===null;
  }catch(e){status(e.message);}
  finally{invitationsBusy=false;$('invitations-more').disabled=false;}
 }
 async function ranking(){
  const version=++rankingVersion;$('ranking').replaceChildren(node('p','Загружаем рейтинг…'));
  try{
   const data=await api('bonus_ranking',{period:$('period').value});if(version!==rankingVersion)return;
   $('ranking').replaceChildren();
   if(!data.leaders.length)$('ranking').append(node('p','Пока нет подтверждённых приглашений за этот период.'));
   for(const r of data.leaders)$('ranking').append(row(r.place+'. '+r.label,r.count+' друзей с первой оплатой'));
   if(data.me&&!data.leaders.some(r=>r.isMe))$('ranking').append(row('Твоё место: '+data.me.place,data.me.count+' друзей с первой оплатой'));
   if(!data.me&&data.leaders.length)$('ranking').append(node('p','Твоё место появится после первой подтверждённой оплаты друга.'));
  }catch(e){if(version===rankingVersion)$('ranking').replaceChildren(node('p',e.message));}
 }
 const tabs=[...root.querySelectorAll('[data-bonus-tab]')];
 function select(name){
  tab=name;status('');
  tabs.forEach(b=>{const active=b.dataset.bonusTab===name;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;$('panel-'+b.dataset.bonusTab).hidden=!active;});
  if(name==='invitations')invitations();
  if(name==='ranking')ranking();
 }
 tabs.forEach((b,i)=>{
  b.addEventListener('click',()=>select(b.dataset.bonusTab));
  b.addEventListener('keydown',e=>{
   let next;if(e.key==='ArrowRight')next=(i+1)%tabs.length;else if(e.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;
   e.preventDefault();tabs[next].focus();select(tabs[next].dataset.bonusTab);
  });
 });
 $('period').addEventListener('change',ranking);
 $('invitations-more').addEventListener('click',()=>invitations(false));
 $('reload').addEventListener('click',async()=>{await load();if(tab==='ranking')ranking();if(tab==='invitations')invitations();});
 $('copy').addEventListener('click',async()=>{
  if(!link)return;
  try{await navigator.clipboard.writeText(link);status('Ссылка скопирована.');}
  catch{$('link').focus();$('link').select();status('Выделили ссылку — скопируй её вручную.');}
 });
 $('share').addEventListener('click',()=>{
  if(!link)return;
  const url='https://t.me/share/url?'+new URLSearchParams({url:link,text:'Присоединяйся к NOYA CLUB — будем учиться понимать своих собак 🐾'});
  if(typeof tg?.openTelegramLink==='function')tg.openTelegramLink(url);else window.location.assign(url);
 });
 new MutationObserver(()=>{if(!root.hidden&&!loaded)load();}).observe(root,{attributes:true,attributeFilter:['hidden']});
 if(!root.hidden)load();
})();

