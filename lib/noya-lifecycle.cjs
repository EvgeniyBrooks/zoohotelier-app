'use strict';
const crypto=require('node:crypto');
const {signedPayload,configuredPayformURL}=require('./noya-prodamus');
const CHANNEL='-1004454031969';
function lifecycle({db,telegram,allowed,send,env=process.env,fetcher=fetch,now=()=>Date.now()}){
 let running=false;const cancelLocks=new Map();
 const iso=()=>new Date(now()).toISOString();
 async function track(id,status,eventAt=iso()){
  if(!Number.isSafeInteger(Number(id))||Number(id)<=0)throw Error('Invalid member');
  await db('rpc/noya_track_channel_member',{method:'POST',body:{p_user_id:Number(id),p_status:status,p_event_at:eventAt}});
 }
 async function subscriptions(id){
  const students=await db('students?select=id&telegram_id=eq.'+encodeURIComponent(id)+'&limit=1');
  if(!students.length)return [];
  const rows=await db('club_subscriptions?select=id,student_id,status,start_date,end_date,prodamus_subscription_id,autorenew_cancelled_at&student_id=eq.'+encodeURIComponent(students[0].id)+'&order=created_at.desc,id.desc');
  return rows.filter(r=>/^\d{1,30}$/.test(r.prodamus_subscription_id||''));
 }
 function ticket(id,profile,expires=Math.floor(now()/1000)+600){
  const time=expires.toString(36);
  const mac=crypto.createHmac('sha256',env.NOYA_TELEGRAM_BOT_TOKEN).update(id+':'+profile+':'+time).digest('hex').slice(0,16);
  return 'stop:'+profile+':'+time+':'+mac;
 }
 function verifyTicket(id,data){
  const match=/^stop:(\d{1,30}):([a-z0-9]{1,8}):([a-f0-9]{16})$/.exec(data);
  if(!match)return null;
  const expires=parseInt(match[2],36),seconds=Math.floor(now()/1000);
  if(expires<seconds||expires>seconds+600)return null;
  const expected=ticket(id,match[1],expires);
  return data.length===expected.length&&crypto.timingSafeEqual(Buffer.from(data),Buffer.from(expected))?match[1]:null;
 }
 async function cancelPrompt(id){
  const rows=await subscriptions(id);
  const active=rows.filter(r=>r.status==='active'&&(!r.start_date||Date.parse(r.start_date)<=now())&&Date.parse(r.end_date)>now());
  const targets=active.filter(r=>!r.autorenew_cancelled_at);
  return targets.map(r=>({profile:r.prodamus_subscription_id,end:r.end_date,callback:'noya:'+ticket(id,r.prodamus_subscription_id)}));
 }
 async function processCancellation(job){
  if(cancelLocks.has(job.subscription_id))return cancelLocks.get(job.subscription_id);
  const work=(async()=>{
   if(job.state!=='confirmed'){
    const rows=await db('club_subscriptions?select=id,student_id,prodamus_subscription_id&id=eq.'+encodeURIComponent(job.subscription_id)+'&student_id=eq.'+encodeURIComponent(job.student_id)+'&limit=1');
    const row=rows[0],form=configuredPayformURL(env.NOYA_PRODAMUS_FORM_URL),plan=env.NOYA_PRODAMUS_SUBSCRIPTION_ID;
    if(!row||!/^\d{1,30}$/.test(row.prodamus_subscription_id||'')||!form||!/^\d{1,15}$/.test(plan||'')||!env.NOYA_PRODAMUS_SECRET)throw Error('Cancellation configuration unavailable');
    const payload={subscription:String(plan),profile:String(row.prodamus_subscription_id),active_user:'0'};
    const body=new URLSearchParams({...payload,signature:signedPayload(payload,env.NOYA_PRODAMUS_SECRET)});
    const response=await fetcher(new URL('/rest/setActivity/',form).href,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:body.toString(),redirect:'error',signal:AbortSignal.timeout(12000)});
    const result=(await response.text()).trim();
    if(!response.ok||result!=='success')throw Error('Cancellation not confirmed by provider');
    await db('rpc/noya_confirm_club_cancellation',{method:'POST',body:{p_subscription_id:row.id}});
   }
   return true;
  })();
  cancelLocks.set(job.subscription_id,work);try{return await work;}finally{cancelLocks.delete(job.subscription_id);}
 }
 async function confirmCancellation(id,data){
  const profile=verifyTicket(id,data);if(!profile)return {state:'invalid'};
  const rows=await subscriptions(id),row=rows.find(r=>r.prodamus_subscription_id===profile);
  if(!row)return {state:'invalid'};
  if(row.autorenew_cancelled_at)return {state:'confirmed',end:row.end_date};
  await db('noya_club_cancellations?on_conflict=subscription_id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:{subscription_id:row.id,student_id:row.student_id}});
  const jobs=await db('noya_club_cancellations?select=*&subscription_id=eq.'+encodeURIComponent(row.id)+'&limit=1');
  if(!jobs[0]||jobs[0].student_id!==row.student_id)throw Error('Cancellation ownership mismatch');
  // The durable outbox retries provider/network/DB failures independently of Telegram retries.
  try{await processCancellation(jobs[0]);await notifyCancellation(jobs[0]);return {state:'confirmed',end:row.end_date,notified:true};}
  catch{return {state:'pending',end:row.end_date};}
 }
 async function notifyCancellation(job){
  const current=await db('noya_club_cancellations?select=state,notified_at&subscription_id=eq.'+encodeURIComponent(job.subscription_id)+'&limit=1');
  if(current[0]?.state!=='confirmed'||current[0].notified_at)return;
  const users=await db('students?select=telegram_id&id=eq.'+encodeURIComponent(job.student_id)+'&limit=1');
  const rows=await db('club_subscriptions?select=end_date&id=eq.'+encodeURIComponent(job.subscription_id)+'&limit=1');
  const end=rows[0]?.end_date;
  const until=end&&Number.isFinite(Date.parse(end))?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'short'}).format(new Date(end))+' МСК':null;
  if(users[0]?.telegram_id)await send(Number(users[0].telegram_id),{text:'Автопродление NOYA CLUB отключено. Prodamus подтвердил отмену.'+(until?'\nОплаченный доступ сохраняется до '+until+'.':'')+'\nПосле окончания доступа бот исключит вас из закрытого канала. Для возвращения можно оформить новую подписку.'});
  await db('noya_club_cancellations?subscription_id=eq.'+encodeURIComponent(job.subscription_id),{method:'PATCH',body:{notified_at:iso()}});
 }
 async function removeIfExpired(id){
  if(await allowed(id))return false;
  const member=await telegram('getChatMember',{chat_id:CHANNEL,user_id:Number(id)});
  if(['creator','administrator'].includes(member.status))return false;
  if(['left','kicked'].includes(member.status)){
   // Recover from a crash between ban and unban, allowing a future paid re-entry.
   if(member.status==='kicked')await telegram('unbanChatMember',{chat_id:CHANNEL,user_id:Number(id),only_if_banned:true});
   await track(id,'removed');return false;
  }
  // Read again immediately before removal: a renewal can arrive during the sweep.
  if(await allowed(id))return false;
  await track(id,'removing');
  await telegram('banChatMember',{chat_id:CHANNEL,user_id:Number(id)});
  await telegram('unbanChatMember',{chat_id:CHANNEL,user_id:Number(id),only_if_banned:true});
  await track(id,'removed');return true;
 }
 async function memberEvent(event){
  if(String(event.chat?.id)!==CHANNEL)return;
  const member=event.new_chat_member,id=member?.user?.id;
  if(!Number.isSafeInteger(id)||member.user.is_bot)return;
  const status=['left','kicked'].includes(member.status)?'removed':'member';
  await track(id,status,new Date(event.date*1000).toISOString());
  if(status==='member')await removeIfExpired(id);
 }
 async function sweep(){
  if(running)return;running=true;let checked=0,removed=0,errors=0;
  try{
   // Pending cancellations and unsent confirmations survive restarts.
   const jobs=await db('noya_club_cancellations?select=*&or=(state.eq.pending,notified_at.is.null)&order=requested_at.asc&limit=100');
   for(const job of jobs){try{await processCancellation(job);await notifyCancellation(job);}catch{errors++;}}
   let cursor=0;
   for(;;){
    const members=await db('noya_channel_members?select=telegram_id&status=in.(member,removing)&telegram_id=gt.'+cursor+'&order=telegram_id.asc&limit=100');
    for(const member of members){
     cursor=Number(member.telegram_id);checked++;
     try{if(await removeIfExpired(cursor))removed++;}catch{errors++;}
    }
    if(members.length<100)break;
   }
   console.log('NOYA lifecycle sweep:',JSON.stringify({checked,removed,errors}));
  }finally{running=false;}
 }
 function start(){
  sweep().catch(()=>console.error('NOYA lifecycle sweep unavailable'));
  const timer=setInterval(()=>sweep().catch(()=>console.error('NOYA lifecycle sweep unavailable')),60000);timer.unref?.();return timer;
 }
 return {track,subscriptions,ticket,verifyTicket,cancelPrompt,processCancellation,confirmCancellation,removeIfExpired,memberEvent,sweep,start};
}
module.exports={lifecycle,CHANNEL};
