(function(root){
 'use strict';
 function createTracker(){
  let previous=null,previousAt=null,ranges=[];
  return {
   resetPosition(){previous=null;previousAt=null;},
   observe(position,duration,now){
    position=Number(position);duration=Number(duration);now=Number(now);
    if(!Number.isFinite(position)||!Number.isFinite(duration)||duration<=0||!Number.isFinite(now))return 0;
    position=Math.max(0,Math.min(position,duration));
    if(previous!==null){
     const delta=position-previous,elapsed=Math.max(0,(now-previousAt)/1000);
     // Ignore seeks; merge played intervals so repeats cannot inflate completion.
     if(delta>0&&delta<=elapsed*2+.5){
      ranges.push([previous,position]);ranges.sort((a,b)=>a[0]-b[0]);
      const merged=[];
      for(const range of ranges){
       const last=merged[merged.length-1];
       if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);
       else merged.push(range.slice());
      }
      ranges=merged;
     }
    }
    previous=position;previousAt=now;
    return Math.min(duration,ranges.reduce((sum,[start,end])=>sum+end-start,0));
   }
  };
 }
 function bindPlayer(player, status, key, save, active){
  const tracker=createTracker();
  const user=root.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  const storageKey=user?'noya.pending-watch:'+user+':'+key:null;
  let proof=null, phase='playing', attempts=0;
  try{if(storageKey)proof=JSON.parse(root.localStorage.getItem(storageKey));}catch{}
  if(!proof||!Number.isFinite(proof.durationSeconds)||proof.durationSeconds<=0||!Number.isFinite(proof.watchedSeconds)||proof.watchedSeconds<proof.durationSeconds*.9||proof.watchedSeconds>proof.durationSeconds)proof=null;
  function persist(value){
   if(!storageKey)return;
   try{if(value)root.localStorage.setItem(storageKey,JSON.stringify(value));else root.localStorage.removeItem(storageKey);}catch{}
  }
  async function submit(){
   if(!active()||!proof||phase==='saving'||phase==='done')return;
   phase='saving';status.textContent='Сохраняем просмотр…';
   try{
    await save(proof);
    phase='done';persist(null);
    if(active())status.textContent='✓ Просмотрено';
   }catch(error){
    phase='pending';
    if(!active())return;
    status.textContent='Просмотр пока не сохранён. '+error.message+' ';
    const button=root.document.createElement('button');
    button.type='button';button.textContent='Повторить сохранение';button.onclick=submit;status.append(button);
    if(++attempts===1)root.setTimeout(()=>{if(phase==='pending')submit();},5000);
   }
  }
  function update(){
   if(!active()||phase!=='playing')return;
   const duration=Number(player.duration);
   if(!Number.isFinite(duration)||duration<=0)return;
   const watched=tracker.observe(player.currentTime,duration,Date.now());
   if(watched<duration*.9){status.textContent='Просмотрено '+Math.floor(watched*100/duration)+'% · для завершения нужно 90%';return;}
   proof={watchedSeconds:watched,durationSeconds:duration};persist(proof);submit();
  }
  for(const event of ['timeupdate','ended','playing'])player.addEventListener(event,update);
  for(const event of ['seeking','seeked','pause'])player.addEventListener(event,()=>tracker.resetPosition());
  if(proof)submit();
 }
 const api={createTracker,bindPlayer};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.NOYAWatchProgress=api;
})(typeof window==='object'?window:globalThis);
