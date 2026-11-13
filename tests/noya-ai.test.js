const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
Object.assign(process.env,{NOYA_TELEGRAM_BOT_TOKEN:'mock-noya-token',NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'mock-key',NOYA_AI_ENABLED:'false'});
const handler=require('../api/club-lessons.js');
function auth(){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:12345})});const sorted=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');const secret=crypto.createHmac('sha256','WebAppData').update('mock-noya-token').digest();p.set('hash',crypto.createHmac('sha256',secret).update(sorted).digest('hex'));return p.toString()}
function res(){return {statusCode:200,setHeader(){return this},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
test('rejects invalid Telegram auth before database',async()=>{const old=global.fetch;global.fetch=async()=>{throw Error('No DB access expected')};try{const r=res();await handler({method:'POST',body:{initData:'invalid',action:'noya_chat',messages:[{role:'user',content:'Привет'}]}},r);assert.equal(r.statusCode,401)}finally{global.fetch=old}});
test('does not call AI when feature disabled',async()=>{const old=global.fetch;let aiCalled=false;global.fetch=async(url)=>{if(url.includes('openai.com')){aiCalled=true;throw Error('AI must be disabled')}let data=[];if(url.includes('/students?'))data=[{id:'11111111-1111-4111-8111-111111111111'}];if(url.includes('/admins?'))data=[{id:'22222222-2222-4222-8222-222222222222'}];return {ok:true,json:async()=>data}};try{const r=res();await handler({method:'POST',body:{initData:auth(),action:'noya_chat',messages:[{role:'user',content:'Как научить собаку?' }]}},r);assert.equal(r.statusCode,503);assert.equal(aiCalled,false)}finally{global.fetch=old}});

async function withAi(run){
 const old=global.fetch,oldKey=process.env.OPENAI_API_KEY;let calls=0;
 process.env.NOYA_AI_ENABLED='true';process.env.OPENAI_API_KEY='mock-openai-key';
 global.fetch=async(url,options={})=>{
  let data=[];
  if(url.includes('/students?'))data=[{id:'11111111-1111-4111-8111-111111111111'}];
  if(url.includes('/club_subscriptions?'))data=[{status:'active',start_date:null,end_date:null}];
  if(url.includes('/club_dogs?'))data=[{id:'22222222-2222-4222-8222-222222222222',name:'Тест'}];
  if(url.includes('/noya_practice_feedback?'))data=[{lesson_id:'lesson',outcome:'partial',note:null}];
  if(url.includes('/rpc/noya_ai_reserve_request'))data=true;
  if(url.includes('api.openai.com')){calls++;data={choices:[{message:{content:'Ответ '.repeat(600)}}]};}
  return {ok:true,json:async()=>data};
 };
 const ask=async(messages,extra={})=>{const r=res();await handler({method:'POST',body:{initData:auth(),action:'noya_chat',messages,...extra}},r);return r;};
 try{await run(ask,()=>calls);}finally{global.fetch=old;process.env.NOYA_AI_ENABLED='false';if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
}
test('member can ask a follow-up after a long NOYA answer',()=>withAi(async(ask,calls)=>{
 const first=await ask([{role:'user',content:'Что делать?'}]);assert.equal(first.statusCode,200);assert.ok(first.body.answer.length>1200);
 const next=await ask([{role:'user',content:'Что делать?'},{role:'assistant',content:first.body.answer},{role:'user',content:'А если не получилось?'}]);
 assert.equal(next.statusCode,200);assert.equal(calls(),2);
}));
test('chat limits reject oversized user and assistant input before spending AI quota',()=>withAi(async(ask,calls)=>{
 for(const messages of [[{role:'user',content:'x'.repeat(1201)}],[{role:'assistant',content:'x'.repeat(4001)},{role:'user',content:'Вопрос'}]])assert.equal((await ask(messages)).statusCode,400);
 assert.equal(calls(),0);
}));
test('dog feedback without a note does not break NOYA',()=>withAi(async(ask)=>{
 assert.equal((await ask([{role:'user',content:'Как упростить упражнение?'}],{dogId:'22222222-2222-4222-8222-222222222222'})).statusCode,200);
}));

