/* Private material downloads: the server verifies Telegram and club access. */
(() => {
 'use strict';
 document.querySelectorAll('[data-material-download]').forEach(button=>{
  const card=button.closest('article'),status=card.querySelector('[data-download-status]'),link=card.querySelector('[data-download-link]');
  let busy=false,expiryTimer=null;
  function clearLink(){clearTimeout(expiryTimer);link.hidden=true;link.removeAttribute('href');}
  // A CSS display rule on .button must not override the HTML hidden attribute.
  link.style.display='none';
  button.addEventListener('click',async()=>{
   if(busy)return;
   const tg=window.Telegram?.WebApp,initData=tg?.initData;
   clearLink();link.style.display='none';
   if(!initData){status.textContent='Открой NOYA CLUB через Telegram, чтобы скачать материал.';return;}
   busy=true;button.disabled=true;button.textContent='Готовим PDF…';status.textContent='';
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
   try{
    const response=await fetch('/api/member-materials',{
     method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal:controller.signal,
     body:JSON.stringify({action:'download',id:button.dataset.materialDownload,initData})
    });
    const data=await response.json();
    if(!response.ok||data?.ok!==true)throw Error(response.status===401?'Сессия закончилась. Открой клуб заново.':response.status===403?'Материалы доступны при активной подписке NOYA CLUB.':'Не удалось скачать PDF. Попробуй ещё раз.');
    const url=new URL(data.url);
    if(url.protocol!=='https:'||url.hostname!=='imvtdholjeclyznonpdc.supabase.co'||url.pathname!=='/storage/v1/object/sign/club-rewards/NOYA_4_principles.pdf'||data.fileName!=='NOYA_4_principles.pdf')throw Error('Не удалось подготовить PDF. Попробуй ещё раз.');
    link.href=url.href;link.download=data.fileName;link.hidden=false;link.style.removeProperty('display');
    expiryTimer=setTimeout(()=>{clearLink();link.style.display='none';status.textContent='Чтобы скачать файл ещё раз, нажми «Скачать PDF».';},Math.max(1,Number(data.expiresIn)||300)*1000);
    status.textContent='PDF готов. Если скачивание не началось, нажми «Открыть PDF».';
    if(typeof tg.downloadFile==='function'&&tg.isVersionAtLeast?.('8.0')){
     try{tg.downloadFile({url:url.href,file_name:data.fileName},accepted=>{status.textContent=accepted?'Скачивание подтверждено. Сохрани PDF на своём устройстве.':'Файл доступен по кнопке «Открыть PDF».';});}
     catch{status.textContent='Файл готов. Нажми «Открыть PDF».';}
    }else if(typeof tg.openLink==='function'){
     try{tg.openLink(url.href);}catch{status.textContent='Файл готов. Нажми «Открыть PDF».';}
    }else link.click();
   }catch(error){status.textContent=error.name==='AbortError'?'Загрузка занимает больше времени. Попробуй ещё раз.':error.message;}
   finally{clearTimeout(timeout);busy=false;button.disabled=false;button.textContent='Скачать PDF ↓';}
  });
 });
})();
