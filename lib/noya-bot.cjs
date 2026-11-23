'use strict';
const crypto=require('node:crypto');
const {lifecycle}=require('./noya-lifecycle.cjs');
const ORIGIN='https://noya-club-joka13.msk1.amvera.tech';
const CHANNEL='-1004454031969';
const SUPPORT='https://t.me/m/RC7qGJtgNWVi';
const WEBHOOK=ORIGIN+'/api/telegram-bot';
const cb=(text,data)=>({text,callback_data:'noya:'+data});
const app=text=>({text,web_app:{url:ORIGIN+'/club.html'}});
const back=()=>[cb('Вернуться в меню ↩️','menu')];
function menu(){return {text:'Меню участника NOYA CLUB',reply_markup:{inline_keyboard:[
 [cb('Перейти в канал','channel')],[app('Личный кабинет')],
 [cb('Подписка','subscription')],[cb('Служба заботы','support')]
]}};}
function stamp(value){const n=typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(n)?n:null;}
function selectSubscription(rows,trial,now=Date.now()){
 const periods=rows.map(row=>{
  const start=stamp(row.start_date),end=stamp(row.end_date);
  const invalid=(row.start_date!=null&&start===null)||(row.end_date!=null&&end===null)||(start!==null&&end!==null&&end<=start);
  let status='inactive';
  if(['cancelled','canceled'].includes(row.status))status='cancelled';
  else if(row.status==='expired')status='expired';
  else if(row.status==='active'&&!invalid)status=end!==null&&end<=now?'expired':start!==null&&start>now?'scheduled':'active';
  return {row,start,end,status};
 });
 const newest=(a,b)=>(b.start??-Infinity)-(a.start??-Infinity)||(stamp(b.row.created_at)??0)-(stamp(a.row.created_at)??0);
 const current=periods.filter(p=>p.status==='active').sort(newest);
 const scheduled=periods.filter(p=>p.status==='scheduled').sort((a,b)=>a.start-b.start);
 const selected=current[0]||scheduled[0]||periods.sort(newest)[0];
 if(!current.length&&trial&&stamp(trial.starts_at)!==null&&stamp(trial.starts_at)<=now&&stamp(trial.ends_at)>now)return {status:'trial',end:trial.ends_at,next:null};
 return selected?{status:selected.status,end:selected.row.end_date,next:selected.status==='active'&&!selected.row.autorenew_cancelled_at?selected.row.next_payment_date:null,autoRenewCancelled:!!selected.row.autorenew_cancelled_at,freeAccess:!!selected.row.gift_campaign_id}:{status:'none',end:null,next:null};
}
function date(value){return stamp(value)===null?null:new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value));}
function subscriptionMessage(s){
 const states={active:'✅ Активна',trial:'🎁 Пробный доступ',cancelled:'Автопродление отключено',expired:'Срок подписки истёк',scheduled:'Подписка ещё не началась',inactive:'Неактивна',none:'Подписка не оформлена'};
 let text='Статус подписки на NOYA CLUB:\n'+states[s.status];
 if(s.status==='active')text+='\n'+(s.freeAccess?'Бесплатный бессрочный доступ по приглашению.\nЭтот доступ не создаёт платежей или автосписаний.':s.autoRenewCancelled?'Автопродление отключено.\nОплаченный доступ до: '+date(s.end)+' (МСК)':date(s.next)?'Следующее списание: '+date(s.next):'Дата следующего списания пока не получена от платёжного сервиса.');
 if(s.status==='trial'&&date(s.end))text+='\nДоступ до: '+date(s.end)+' (МСК)\nАвтосписаний нет.';
 return {text,reply_markup:{inline_keyboard:[[cb('Перейти в канал','channel')],[cb('Отменить подписку','cancel')],[cb('Продление подписки','renew')],back()]}};
}
function createBot({env=process.env,fetcher=fetch,now=()=>Date.now()}={}){
 const token=env.NOYA_TELEGRAM_BOT_TOKEN;
 const secret=()=>crypto.createHmac('sha256',token||'').update('NOYA CLUB telegram webhook v1').digest('hex');
 const seen=new Map();
 async function telegram(method,body={}){
  const r=await fetcher('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
  const data=await r.json();
  if(!r.ok||!data.ok)throw new Error('Telegram '+method+' failed ('+(data.error_code||r.status)+')');
  return data.result;
 }
 async function db(path,options={}){
  if(!env.NEXT_PUBLIC_SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Membership database not configured');
  const r=await fetcher(env.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/'+path,{...options,body:options.body===undefined?undefined:JSON.stringify(options.body),headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(10000),cache:'no-store'});
  const data=await r.json().catch(()=>null);if(!r.ok||(!options.method&&!Array.isArray(data)))throw new Error('Membership database unavailable');return data||[];
 }
 async function account(id){
  const students=await db('students?select=id&telegram_id=eq.'+encodeURIComponent(id)+'&limit=1');
  if(!students.length)return {status:'none',end:null,next:null};
  const sid=encodeURIComponent(students[0].id),rows=[];
  for(let offset=0;;offset+=1000){
   const page=await db('club_subscriptions?select=status,start_date,end_date,next_payment_date,created_at,autorenew_cancelled_at,gift_campaign_id&student_id=eq.'+sid+'&order=created_at.desc,id.desc&limit=1000&offset='+offset);
   rows.push(...page);if(page.length<1000)break;
  }
  const trials=await db('noya_club_trials?select=starts_at,ends_at&student_id=eq.'+sid+'&limit=1');
  return selectSubscription(rows,trials[0],now());
 }
 async function allowed(id){
  const admins=await db('admins?select=id&telegram_id=eq.'+encodeURIComponent(id)+'&limit=1');
  if(admins.length)return true;
  return ['active','trial'].includes((await account(id)).status);
 }
 const send=(id,payload)=>telegram('sendMessage',{chat_id:id,...payload});
 const operations=lifecycle({db,telegram,allowed,send,env,fetcher,now});
 async function processUpdate(update){
  if(update.chat_member)return operations.memberEvent(update.chat_member);
  if(update.chat_join_request){
   const j=update.chat_join_request;
   if(String(j.chat?.id)===CHANNEL&&Number.isSafeInteger(j.from?.id)){
    if(await allowed(j.from.id)){
     // Record before approval so a restart cannot lose the eventual expiry check.
     await operations.track(j.from.id,'member');
     await telegram('approveChatJoinRequest',{chat_id:CHANNEL,user_id:j.from.id});
    }else await telegram('declineChatJoinRequest',{chat_id:CHANNEL,user_id:j.from.id});
   }
   return;
  }
  const c=update.callback_query,m=c?.message||update.message,user=c?.from||m?.from;
  if(!m||m.chat?.type!=='private'||!Number.isSafeInteger(user?.id)||m.chat.id!==user.id||user.is_bot)return;
  if(c)await telegram('answerCallbackQuery',{callback_query_id:c.id}).catch(error=>{
   // Telegram can retry a delivered update after its callback acknowledgement expires.
   // Expired acknowledgement must not block this update and the webhook queue.
   if(!error.message.endsWith('(400)'))throw error;
  });
  const command=c?.data?.startsWith('noya:')?c.data.slice(5):/^\/(start|menu)(?:@NoyaClubBrooksBot)?(?:\s|$)/i.test(m.text||'')?'menu':null;
  if(!command)return;
  const id=user.id;
  if(command==='menu')return send(id,menu());
  if(command==='subscription')return send(id,subscriptionMessage(await account(id)));
  if(command==='support')return send(id,{text:'Служба заботы NOYA CLUB\n\nЕсли у вас есть вопросы по клубу, доступу или подписке, напишите нам — поможем разобраться.',reply_markup:{inline_keyboard:[[{text:'Написать в службу заботы',url:SUPPORT}],back()]}});
  if(command==='cancel'){
   const targets=await operations.cancelPrompt(id);
   if(!targets.length)return send(id,{text:'Нет активной платной подписки с включённым автопродлением. Пробный доступ не создаёт автосписаний.',reply_markup:{inline_keyboard:[[cb('Статус подписки','subscription')],back()]}});
   return send(id,{text:'Отключить автопродление NOYA CLUB?\n\nНовые списания по выбранной подписке прекратятся после подтверждения Prodamus. Оплаченный доступ сохранится до конца срока. Для возвращения после его окончания потребуется новая подписка.',reply_markup:{inline_keyboard:[...targets.map(t=>[{text:'Отключить автопродление · до '+date(t.end),callback_data:t.callback}]),[cb('Оставить подписку','subscription')],back()]}});
  }
  if(command.startsWith('stop:')){
   const result=await operations.confirmCancellation(id,command);
   if(result.notified)return;
   const text=result.state==='confirmed'?'Автопродление уже отключено. Оплаченный доступ сохраняется до '+date(result.end)+' (МСК).':result.state==='pending'?'Запрос на отключение сохранён. Prodamus пока не подтвердил отмену. Бот повторит запрос автоматически и сообщит результат.':'Подтверждение недействительно или устарело. Откройте «Подписку» и повторите отмену.';
   return send(id,{text,reply_markup:{inline_keyboard:[[cb('Статус подписки','subscription')],back()]}});
  }
  if(command==='renew')return send(id,{text:'Продление подписки NOYA CLUB\n\nОткройте личный кабинет, чтобы проверить условия и оформить доступ. Если подписка активна и автопродление включено у платёжного сервиса, повторно оформлять её не нужно.',reply_markup:{inline_keyboard:[[app('Открыть личный кабинет')],[cb('Статус подписки','subscription')],back()]}});
  if(command==='channel'){
   if(!await allowed(id))return send(id,{text:'Канал доступен участникам с активной подпиской или пробным доступом. Оформите доступ в личном кабинете.',reply_markup:{inline_keyboard:[[app('Личный кабинет')],back()]}});
   await telegram('unbanChatMember',{chat_id:CHANNEL,user_id:id,only_if_banned:true});
   const invite=await telegram('createChatInviteLink',{chat_id:CHANNEL,name:'NOYA '+id,expire_date:Math.floor(now()/1000)+3600,creates_join_request:true});
   return send(id,{text:'Закрытый канал NOYA CLUB\n\nАнонсы, видео и заметки Евгения. Отправьте заявку по кнопке — бот проверит доступ и впустит вас. Ссылка действует 1 час.',reply_markup:{inline_keyboard:[[{text:'Перейти в канал',url:invite.invite_link}],back()]}});
  }
 }
 async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const supplied=req.headers?.['x-telegram-bot-api-secret-token'];
  if(!token||typeof supplied!=='string'||!/^[a-f0-9]{64}$/.test(supplied)||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(secret())))return res.status(403).json({error:'Forbidden'});
  const update=req.body;
  if(!Number.isSafeInteger(update?.update_id))return res.status(400).json({error:'Invalid update'});
  for(const [key,entry] of seen)if(entry.done&&entry.at<now()-86400000)seen.delete(key);
  const previous=seen.get(update.update_id);
  try{
   if(previous)await previous.promise;
   else{
    const entry={at:now(),done:false};
    entry.promise=processUpdate(update).then(()=>{entry.done=true;}).catch(e=>{seen.delete(update.update_id);throw e;});
    seen.set(update.update_id,entry);await entry.promise;
   }
   return res.status(200).json({ok:true});
  }catch(error){console.error('NOYA bot update failed:',error.message.startsWith('Telegram ')?error.message:'Membership request unavailable');return res.status(503).json({error:'Temporarily unavailable'});}
 }
 async function bootstrap(){
  if(!token)return;
  const me=await telegram('getMe');
  if(me.username!=='NoyaClubBrooksBot'){console.error('NOYA bot setup skipped: unexpected bot identity');return;}
  const info=await telegram('getWebhookInfo');
  if(info.url&&info.url!==WEBHOOK){console.error('NOYA bot setup skipped: another webhook is configured');return;}
  await telegram('setWebhook',{url:WEBHOOK,secret_token:secret(),allowed_updates:['message','callback_query','chat_join_request','chat_member'],max_connections:1});
  await telegram('setMyCommands',{commands:[{command:'menu',description:'Меню участника NOYA CLUB'},{command:'start',description:'Открыть NOYA CLUB'}],scope:{type:'all_private_chats'},language_code:'ru'});
  await telegram('setMyCommands',{commands:[{command:'menu',description:'Меню участника NOYA CLUB'},{command:'start',description:'Открыть NOYA CLUB'}],scope:{type:'all_private_chats'}});
  await telegram('setChatMenuButton',{menu_button:{type:'commands'}});
  console.log('NOYA member bot webhook and menu configured');
  const rights=await telegram('getChatMember',{chat_id:CHANNEL,user_id:me.id});
  console.log('NOYA channel automation permissions:',JSON.stringify({admin:rights.status==='administrator',invite:!!rights.can_invite_users,restrict:!!rights.can_restrict_members}));
  operations.start();
  const timer=setTimeout(async()=>{
   try{const state=await telegram('getWebhookInfo');console.log('NOYA webhook delivery:',JSON.stringify({pending:state.pending_update_count,lastErrorDate:state.last_error_date||null,lastError:typeof state.last_error_message==='string'?state.last_error_message.replace(/https?:\/\/\S+/g,'[URL]').slice(0,200):null}));}catch{console.error('NOYA webhook delivery check failed');}
  },30000);
  timer.unref?.();
 }
 return {handler,bootstrap,secret};
}
const bot=createBot();
module.exports={...bot,createBot,selectSubscription,subscriptionMessage,menu,SUPPORT,CHANNEL};
