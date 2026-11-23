const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createBot,selectSubscription,subscriptionMessage,menu,SUPPORT}=require('../lib/noya-bot.cjs');
const now=Date.parse('2026-11-23T12:00:00Z');
test('status uses real Moscow next charge date and never invents one',()=>{
 const s=selectSubscription([{status:'active',start_date:'2026-11-01T00:00:00Z',end_date:'2026-12-01T00:00:00Z',next_payment_date:'2026-11-28T22:00:00Z'}],null,now);
 assert.match(subscriptionMessage(s).text,/29.11.2026/);
 assert.match(subscriptionMessage({...s,next:null}).text,/пока не получена/);
 assert.equal(selectSubscription([{status:'active',end_date:'bad'}],null,now).status,'inactive');
 assert.equal(selectSubscription([{status:'active',end_date:'2026-11-01T00:00:00Z'}],null,now).status,'expired');
 assert.equal(selectSubscription([],{starts_at:'2026-11-22T00:00:00Z',ends_at:'2026-11-24T00:00:00Z'},now).status,'trial');
});
test('menu and support have expected destinations',()=>{
 assert.deepEqual(menu().reply_markup.inline_keyboard.map(r=>r[0].text),['Перейти в канал','Личный кабинет','Подписка','Служба заботы']);
 assert.equal(SUPPORT,'https://t.me/m/RC7qGJtgNWVi');
});
function fixture({admin=false,existingWebhook='',expiredAck=false}={}){
 const calls=[],env={NOYA_TELEGRAM_BOT_TOKEN:'test-token',NEXT_PUBLIC_SUPABASE_URL:'https://db.example',SUPABASE_SERVICE_ROLE_KEY:'test-service'};
 const fetcher=async(url,options)=>{
  calls.push({url,body:options.body?JSON.parse(options.body):null});
  if(url.startsWith('https://api.telegram.org/')){
   const method=url.split('/').at(-1);
   if(expiredAck&&method==='answerCallbackQuery')return {ok:false,status:400,json:async()=>({ok:false,error_code:400})};
   return {ok:true,json:async()=>({ok:true,result:method==='getMe'?{username:'NoyaClubBrooksBot'}:method==='getWebhookInfo'?{url:existingWebhook}:method==='createChatInviteLink'?{invite_link:'https://t.me/+test'}:{}})};
  }
  return {ok:true,json:async()=>url.includes('/admins?')?(admin?[{id:'admin'}]:[]):url.includes('/students?')?[{id:'student-42'}]:[]};
 };
 const bot=createBot({env,fetcher,now:()=>now});
 async function request(body,auth=bot.secret()){
  const res={code:200,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await bot.handler({method:'POST',headers:{'x-telegram-bot-api-secret-token':auth},body},res);return res;
 }
 const update=(data='noya:subscription',id=1)=>({update_id:id,callback_query:{id:'callback',from:{id:42},data,message:{chat:{id:42,type:'private'}}}});
 return {calls,bot,request,update};
}
test('webhook rejects forged request before Telegram or DB access',async()=>{
 const f=fixture();assert.equal((await f.request(f.update(),'x'.repeat(64))).code,403);assert.equal(f.calls.length,0);
});
test('status is scoped to sender, callback acknowledged, retries deduplicated',async()=>{
 const f=fixture();assert.equal((await f.request(f.update())).code,200);await f.request(f.update());
 assert.equal(f.calls.filter(c=>c.url.endsWith('/sendMessage')).length,1);
 assert.ok(f.calls.some(c=>c.url.includes('telegram_id=eq.42')));
 assert.ok(f.calls.some(c=>c.url.includes('student_id=eq.student-42')));
 assert.match(f.calls.find(c=>c.url.endsWith('/sendMessage')).body.text,/не оформлена/);
});
test('foreign chat and group cannot expose personal status',async()=>{
 const f=fixture(),u=f.update();u.callback_query.message.chat.id=99;await f.request(u);assert.equal(f.calls.length,0);
 u.update_id=2;u.callback_query.message.chat={id:42,type:'group'};await f.request(u);assert.equal(f.calls.length,0);
});
test('expired callback acknowledgement cannot block webhook retries',async()=>{
 const f=fixture({expiredAck:true});assert.equal((await f.request(f.update('noya:cancel'))).code,200);
 assert.ok(f.calls.some(c=>c.url.endsWith('/sendMessage')));
});
test('channel refuses nonmember and gives admin expiring join-request invite',async()=>{
 let f=fixture();await f.request(f.update('noya:channel'));assert.ok(!f.calls.some(c=>c.url.endsWith('/createChatInviteLink')));
 f=fixture({admin:true});await f.request(f.update('noya:channel'));
 const invite=f.calls.find(c=>c.url.endsWith('/createChatInviteLink')).body;
 assert.equal(invite.creates_join_request,true);assert.equal(invite.expire_date,Math.floor(now/1000)+3600);
});
test('join requests approved only for eligible users in NOYA channel',async()=>{
 const f=fixture({admin:true});await f.request({update_id:1,chat_join_request:{chat:{id:-1004454031969},from:{id:42}}});
 assert.ok(f.calls.some(c=>c.url.endsWith('/approveChatJoinRequest')));
 const n=fixture();await n.request({update_id:1,chat_join_request:{chat:{id:-1004454031969},from:{id:42}}});
 assert.ok(!n.calls.some(c=>c.url.endsWith('/approveChatJoinRequest')));
});
test('cancel without paid subscription does not call payment provider',async()=>{
 const f=fixture();await f.request(f.update('noya:cancel'));
 assert.match(f.calls.find(c=>c.url.endsWith('/sendMessage')).body.text,/Нет активной платной/);
 assert.ok(!f.calls.some(c=>c.url.includes('payform.ru')));
});
test('bootstrap preserves another webhook and configures only empty/owned webhook',async()=>{
 let f=fixture({existingWebhook:'https://another.example/hook'});await f.bot.bootstrap();assert.equal(f.calls.length,2);
 f=fixture();await f.bot.bootstrap();const hook=f.calls.find(c=>c.url.endsWith('/setWebhook')).body;
 assert.equal(hook.secret_token.length,64);assert.equal(hook.drop_pending_updates,undefined);
 assert.ok(f.calls.some(c=>c.url.endsWith('/setChatMenuButton')));
});
