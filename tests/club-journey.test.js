'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const env=Object.assign({},process.env);
Object.assign(process.env,{
 NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service-secret',
 NOYA_TELEGRAM_BOT_TOKEN:'journey-bot-test',CLOUDFLARE_ACCOUNT_ID:'account1',CLOUDFLARE_API_TOKEN:'test-cloudflare-token',
 NOYA_PRACTICE_REVIEW_ENABLED:'0'
});
const handler=require('../api/club-journey');
const student='11111111-1111-4111-8111-111111111111';
const dog='22222222-2222-4222-8222-222222222222';
const course='33333333-3333-4333-8333-333333333333';
const block='44444444-4444-4444-8444-444444444444';
const lesson='55555555-5555-4555-8555-555555555555';
const sub='66666666-6666-4666-8666-666666666666';
const uid='a'.repeat(32);
function init(){
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123456789})});
 const canonical=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const key=crypto.createHmac('sha256','WebAppData').update('journey-bot-test').digest();
 p.set('hash',crypto.createHmac('sha256',key).update(canonical).digest('hex'));
 return p.toString();
}
function mock(opts={}){
 const calls=[],old=global.fetch;
 global.fetch=async(input,request={})=>{
  const url=new URL(input),p=url.pathname,method=request.method||'GET';
  calls.push({p,method,body:request.body||null,url:url.href});
  if(url.hostname==='api.cloudflare.com'){
   if(p.endsWith('/direct_upload'))return new Response(JSON.stringify({success:true,result:{
    uploadURL:'https://upload.videodelivery.net/'+uid,uid
   }}),{status:200});
   if(p.endsWith('/token'))return new Response(JSON.stringify({success:true,result:{token:'a.b.c'}}));
   return new Response(JSON.stringify({success:true,result:{readyToStream:true,duration:25,status:{state:'ready'}}}));
  }
  let value=[];
  if(p.endsWith('/students'))value=opts.noStudent?[]:[{id:student}];
  else if(p.endsWith('/admins'))value=opts.admin?[{id:student}]:[];
  else if(p.endsWith('/noya_review_staff'))value=opts.coach?[{role:'coach',enabled:true}]:[];
  else if(p.endsWith('/club_subscriptions'))value=opts.member===false?[]:[{start_date:null,end_date:null}];
  else if(p.endsWith('/noya_club_trials'))value=[];
  else if(p.endsWith('/enrollments'))value=[];
  else if(p.endsWith('/courses'))value=[{id:course}];
  else if(p.endsWith('/course_blocks'))value=[{id:block}];
  else if(p.endsWith('/lessons'))value=[{id:lesson,block_id:block,title:'Урок',is_published:true}];
  else if(p.endsWith('/club_dogs')){
   if(method==='POST')value=[{id:dog,name:'Ноя'}];
   else if(url.searchParams.has('id'))value=opts.foreignDog?[]:[{id:dog,name:'Ноя'}];
   else value=opts.noDogs?[]:[{id:dog,name:'Ноя'}];
  }
  else if(p.endsWith('/noya_dog_journeys'))value=method==='POST'?[{dog_id:dog,primary_goal:'attention'}]:[];
  else if(p.endsWith('/noya_progress_diary'))value=method==='POST'?[{id:sub,created_at:new Date().toISOString()}]:[];
  else if(p.endsWith('/noya_practice_submissions')){
   if(method==='POST')value=[{id:sub,status:'uploading',created_at:new Date().toISOString()}];
   else if(method==='PATCH')value=[{id:sub,status:'approved',coach_feedback:'Хорошее начало',reviewed_at:new Date().toISOString()}];
   else if(url.searchParams.has('id'))value=[{id:sub,student_id:student,dog_id:dog,lesson_id:lesson,status:opts.status||'submitted',video_uid:uid,student_note:'Спокойно'}];
   else if(opts.queue)value=[{id:sub,student_id:student,dog_id:dog,lesson_id:lesson,status:'submitted',video_uid:uid,submitted_at:new Date().toISOString()}];
   else value=[];
  }
  return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
 };
 return {calls,restore(){global.fetch=old}};
}
async function call(action,body={}){
 const res={statusCode:200,setHeader(){return this},status(code){this.statusCode=code;return this},json(value){this.body=value;return this}};
 await handler({method:'POST',body:{action,initData:init(),...body}},res);
 return res;
}
test('new API and new pages parse without changing payment handlers',()=>{
 for(const filename of ['api/club-journey.js','assets/noya-journey.js','assets/noya-coach.js','assets/noya-next-step.js']){
  const source=fs.readFileSync(path.join(__dirname,'..',filename),'utf8');
  new (require('node:vm').Script)(source,{filename});
 }
 const server=fs.readFileSync(path.join(__dirname,'..','server.cjs'),'utf8');
 assert.match(server,/'club-journey'/);
 assert.match(server,/'journey.html','coach.html'/);
 for(const html of ['journey.html','coach.html'])assert.match(fs.readFileSync(path.join(__dirname,'..',html),'utf8'),/NOYA/);
});
test('invalid Telegram auth rejected without any database requests',async()=>{
 const f=mock();
 try{
  const res={statusCode:200,setHeader(){return this},status(i){this.statusCode=i;return this},json(x){this.body=x;return this}};
  await handler({method:'POST',body:{action:'overview',initData:'bad'}},res);
  assert.equal(res.statusCode,401);assert.equal(f.calls.length,0);
 }finally{f.restore();}
});
test('ordinary member loads private journey but unentitled member cannot',async()=>{
 let f=mock();try{const r=await call('overview');assert.equal(r.statusCode,200);assert.deepEqual(r.body.dogs,[{id:dog,name:'Ноя'}]);assert.equal(r.body.reviewEnabled,false);}finally{f.restore();}
 f=mock({member:false});try{const r=await call('overview');assert.equal(r.statusCode,403);}finally{f.restore();}
});
test('goal is stored for an owned dog, not a foreign dog',async()=>{
 let f=mock();try{const r=await call('start',{dogId:dog,name:'Ноя',entryMode:'starting',goal:'attention',breed:'Метис'});assert.equal(r.statusCode,200);assert.equal(r.body.journey.primary_goal,'attention');
 const write=f.calls.find(c=>c.p.endsWith('/noya_dog_journeys')&&c.method==='POST');assert.equal(JSON.parse(write.body).student_id,student);
 }finally{f.restore();}
 f=mock({foreignDog:true});try{const r=await call('start',{dogId:dog,entryMode:'starting',goal:'attention'});assert.equal(r.statusCode,404);assert.equal(f.calls.some(c=>c.p.endsWith('/noya_dog_journeys')&&c.method==='POST'),false);}finally{f.restore();}
});
test('diary records an observation only for an owned dog',async()=>{
 const f=mock();try{const r=await call('diary_add',{dogId:dog,conditions:'Дома',observation:'Посмотрела на меня',stress:'calm'});assert.equal(r.statusCode,200);
 const created=f.calls.find(c=>c.p.endsWith('/noya_progress_diary')&&c.method==='POST');
 assert.equal(JSON.parse(created.body).stress_level,'calm');
 }finally{f.restore();}
});
test('video uploads do not issue paid storage reservations unless reviews are explicitly enabled',async()=>{
 const f=mock();try{const r=await call('submission_begin',{dogId:dog,lessonId:lesson,conditions:'Дома',note:'Спокойное упражнение',mime:'video/mp4',bytes:10000});
 assert.equal(r.statusCode,403);assert.equal(f.calls.some(c=>c.p.includes('/direct_upload')),false);
 }finally{f.restore();}
});
test('coach queue is restricted to assigned staff, even when they are not a subscriber',async()=>{
 let f=mock({member:false});try{const r=await call('coach_queue');assert.equal(r.statusCode,403);}finally{f.restore();}
 f=mock({coach:true,noStudent:true,queue:true});try{const r=await call('coach_queue');assert.equal(r.statusCode,200);assert.equal(r.body.queue.length,1);
 assert.equal(r.body.queue[0].hasVideo,true);assert.equal(r.body.queue[0].video_uid,undefined);
 }finally{f.restore();}
});
test('signed video upload uses max duration and requires signed playback links',async()=>{
 process.env.NOYA_PRACTICE_REVIEW_ENABLED='1';
 const f=mock({noDogs:false});
 try{
  const res=await call('submission_begin',{dogId:dog,lessonId:lesson,conditions:'Тихая комната',note:'Посмотрела при звуке клички',mime:'video/mp4',bytes:10000});
  assert.equal(res.statusCode,200);
  assert.match(res.body.uploadUrl,/^https:\/\/upload\.videodelivery\.net\//);
  const cf=f.calls.find(c=>c.p.endsWith('/direct_upload'));const body=JSON.parse(cf.body);
  assert.equal(body.requireSignedURLs,true);assert.equal(body.maxDurationSeconds,180);
  assert.ok(!JSON.stringify(res.body).includes('test-cloudflare-token'));
 }finally{f.restore();process.env.NOYA_PRACTICE_REVIEW_ENABLED='0';}
});
test('unassigned user cannot approve a report',async()=>{
 const f=mock();try{const r=await call('coach_review',{submissionId:sub,status:'approved',feedback:'Продолжайте спокойно'});
 assert.equal(r.statusCode,403);
 }finally{f.restore();}
});
test.after(()=>{for(const k of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NOYA_TELEGRAM_BOT_TOKEN','CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN','NOYA_PRACTICE_REVIEW_ENABLED']){if(Object.hasOwn(env,k))process.env[k]=env[k];else delete process.env[k];}});
