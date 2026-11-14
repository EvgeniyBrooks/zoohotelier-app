'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const student='11111111-1111-4111-8111-111111111111';
const course='22222222-2222-4222-8222-222222222222';
const pre='33333333-3333-4333-8333-333333333333';
const core='44444444-4444-4444-8444-444444444444';
const p1='55555555-5555-4555-8555-555555555551';
const p2='55555555-5555-4555-8555-555555555552';
const w1='55555555-5555-4555-8555-555555555553';
const w2='55555555-5555-4555-8555-555555555554';
const base=Object.assign({},process.env);
Object.assign(process.env,{
 NOYA_TELEGRAM_BOT_TOKEN:'drip-test-bot',
 NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',
 SUPABASE_SERVICE_ROLE_KEY:'fake-secret',
 CLOUDFLARE_ACCOUNT_ID:'fake-account',
 CLOUDFLARE_API_TOKEN:'fake-cloudflare'
});
const lessons=[
 {id:p1,block_id:pre,day_number:1,title:'Предобучение 1',video_url:'a'.repeat(32),is_published:true},
 {id:p2,block_id:pre,day_number:2,title:'Предобучение 2',video_url:'b'.repeat(32),is_published:true},
 {id:w1,block_id:core,day_number:1,title:'День 1',video_url:'c'.repeat(32),is_published:true},
 {id:w2,block_id:core,day_number:2,title:'День 2',video_url:'d'.repeat(32),is_published:true}
];
let handlerPromise;
async function handler(){
 if(!handlerPromise)handlerPromise=import('../api/stream-token.js').then(m=>m.default);
 return handlerPromise;
}
function init(){
 const q=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123456})});
 const signed=[...q.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const key=crypto.createHmac('sha256','WebAppData').update('drip-test-bot').digest();
 q.set('hash',crypto.createHmac('sha256',key).update(signed).digest('hex'));
 return q.toString();
}
async function run(action,lessonId,opts={}){
 const old=global.fetch,visited=[];
 const completed=opts.completed||[];
 global.fetch=async(url,req={})=>{
  const u=new URL(url),resource=u.pathname.split('/').pop(),method=req.method||'GET';
  visited.push({resource,method,host:u.hostname});
  if(u.hostname==='api.cloudflare.com'){
   return new Response(JSON.stringify({success:true,result:method==='GET'
    ? {duration:opts.actualDuration||100}
    : {token:'test-signed-stream-token'}}),{status:200});
  }
  let rows=[];
  if(resource==='students')rows=[{id:student}];
  if(resource==='admins')rows=[];
  if(resource==='courses')rows=[{id:course}];
  if(resource==='enrollments')rows=[{course_id:course,access_start_date:null,access_end_date:null}];
  if(resource==='club_subscriptions')rows=[];
  if(resource==='course_blocks')rows=[
   {id:pre,block_number:0,title:'Предобучение'},
   {id:core,block_number:1,title:'Быт и правила дома'}
  ].filter(b=>!u.searchParams.has('id')||u.searchParams.get('id')==='eq.'+b.id);
  if(resource==='lessons')rows=lessons.filter(l=>!u.searchParams.has('id')||u.searchParams.get('id')==='eq.'+l.id);
  if(resource==='course_lesson_completions')rows=completed.map(lesson_id=>({lesson_id}));
  if(resource==='noya_course_drip_start')rows=new Date().toISOString();
  if(resource==='noya_course_drip_starts')rows=[{started_at:new Date().toISOString()}];
  if(resource==='noya_course_watch_sessions')rows=opts.hasReceipt?[{opened_at:new Date(Date.now()-150000).toISOString()}]:[];
  if(resource==='noya_material_state')rows=method==='POST'?[{favorited:false,completed:true}]:[];
  if(resource==='noya_course_watch_begin')rows=new Date().toISOString();
  return new Response(JSON.stringify(rows),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const res={statusCode:200,setHeader(){return this},status(s){this.statusCode=s;return this},json(v){this.body=v;return this}};
 try{
  await (await handler())({method:'POST',body:{action,initData:init(),lessonId,completed:opts.mark,watchedSeconds:opts.watchedSeconds,durationSeconds:opts.durationSeconds}},res);
  return {code:res.statusCode,body:res.body,visited};
 }finally{global.fetch=old;}
}
test('direct link to day 2 returns locked and never contacts Cloudflare',async()=>{
 const v=await run('course_watch',w2,{completed:[]});
 assert.equal(v.code,423);
 assert.equal(v.visited.some(x=>x.host==='api.cloudflare.com'),false);
});
test('course_lesson_details of a future lesson does not leak video URL',async()=>{
 const v=await run('course_lesson_details',w2);
 assert.equal(v.code,423);
 assert.equal(v.body.lessons,undefined);
});
test('the first pretraining video is playable immediately',async()=>{
 const v=await run('course_watch',p1);
 assert.equal(v.code,200);
 assert.equal(v.body.token,'test-signed-stream-token');
 assert.equal(v.visited.some(x=>x.resource==='noya_course_watch_begin'),true);
});
test('second pretraining and day 1 must wait until earlier lessons are finished',async()=>{
 const second=await run('course_watch',p2,{completed:[]});
 assert.equal(second.code,423);
 const secondReady=await run('course_watch',p2,{completed:[p1]});
 assert.equal(secondReady.code,200);
 const firstCore=await run('course_watch',w1,{completed:[p1]});
 assert.equal(firstCore.code,423);
 const ready=await run('course_watch',w1,{completed:[p1,p2]});
 assert.equal(ready.code,200);
});
test('a participant cannot self-complete unopened or unwatched lessons',async()=>{
 const locked=await run('course_complete',w2,{completed:[],mark:true,watchedSeconds:500,durationSeconds:520});
 assert.equal(locked.code,423);
 const noReceipt=await run('course_complete',p1,{completed:[],mark:true,watchedSeconds:100,durationSeconds:110});
 assert.equal(noReceipt.code,403);
 const falseProgress=await run('course_complete',p1,{completed:[],mark:false});
 assert.equal(falseProgress.code,403);
});
test('Cloudflare actual duration is required before any lesson completion',async()=>{
 const good=await run('course_complete',p1,{
  completed:[],mark:true,watchedSeconds:91,durationSeconds:100,hasReceipt:true,actualDuration:100
 });
 assert.equal(good.code,200);
 assert.equal(good.body.completed,true);
 assert.equal(good.visited.some(x=>x.host==='api.cloudflare.com'&&x.method==='GET'),true);
 const spoofed=await run('course_complete',p1,{
  completed:[],mark:true,watchedSeconds:91,durationSeconds:100,hasReceipt:true,actualDuration:1200
 });
 assert.equal(spoofed.code,403);
 assert.equal(spoofed.visited.some(x=>x.resource==='noya_material_state'&&x.method==='POST'),false);
});
test.after(()=>{for(const k of ['NOYA_TELEGRAM_BOT_TOKEN','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN']){if(Object.hasOwn(base,k))process.env[k]=base[k];else delete process.env[k];}});
