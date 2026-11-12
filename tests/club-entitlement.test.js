'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const TRIAL=read('api/club-trial.js');
const AUTH=read('api/telegram-auth.js');
const TOKEN=read('api/stream-token.js');
const CLUB=read('club.html');
for(const [file,source] of [['api/club-lessons.js',read('api/club-lessons.js')],['api/club-diagnostic.js',read('api/club-diagnostic.js')],['api/club-progress.js',read('api/club-progress.js')],['api/club-video-token.js',read('api/club-video-token.js')]]){
 test('trial club entitlement enforced server-side in '+file,()=>{
  assert.match(source,/noya_club_trials/);
  assert.match(source,/trialActive|activeTrial/);
 });
}
test('paid club enables full course and video tokens, trial not treated as paid',()=>{
 assert.match(AUTH,/paidClubAccess/);assert.match(AUTH,/Boolean\(activeEnrollment\) \|\| paidClubAccess \|\| isAdmin/);
 assert.match(TOKEN,/paidClub/);assert.match(TOKEN,/!admins\.length&&!paidClub&&!enrollments\.some/);
 assert.doesNotMatch(AUTH,/noya_club_trials/);
 assert.doesNotMatch(TOKEN,/noya_club_trials/);
});
test('trial redemptions use signed Telegram, server-side RPC and restricted admins',()=>{
 assert.match(TRIAL,/verifyTelegram\(raw/);
 assert.match(TRIAL,/noya_club_redeem_trial/);
 assert.match(TRIAL,/Administrator only/);
 assert.match(TRIAL,/crypto\.randomBytes\(24\)/);
 assert.match(TRIAL,/trialActive:trialActive&&!paidActive/);
});
test('campaign links activate a trial before paid checkout, and lock course UI',()=>{
 assert.match(CLUB,/new URLSearchParams\(location\.search\)\.get\('trial'\)/);
 assert.match(CLUB,/initDataUnsafe\?\.start_param/);
 assert.match(CLUB,/action:'redeem',initData,code/);
 assert.match(CLUB,/if\(t\.trialActive\)\{lockTrialCourse\(\);hide\(\);return;\}/);
 assert.match(CLUB,/a\[href="\.\/index\.html"\]/);
 assert.match(CLUB,/makeNoyaTrialCampaign/);
});
function signInit(){
 const env=process.env.NOYA_TELEGRAM_BOT_TOKEN;
 process.env.NOYA_TELEGRAM_BOT_TOKEN='test-noya-trial-bot';
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:1234,first_name:'Tester'})});
 const canonical=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([a,b])=>a+'='+b).join('\n');
 const sec=crypto.createHmac('sha256','WebAppData').update('test-noya-trial-bot').digest();
 p.set('hash',crypto.createHmac('sha256',sec).update(canonical).digest('hex'));
 if(env===undefined)delete process.env.NOYA_TELEGRAM_BOT_TOKEN;else process.env.NOYA_TELEGRAM_BOT_TOKEN=env;
 return p.toString();
}
test('anonymous and unsigned promotions cannot activate a trial',async()=>{
 const prev={...process.env};
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'https://fake.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test',NOYA_TELEGRAM_BOT_TOKEN:'test-noya-trial-bot'});
 const endpoint=require('../api/club-trial.js');
 const res=()=>({setHeader(){},status(n){this.code=n;return this},json(v){this.body=v;return this}});
 try{
  const invalid=res();
  await endpoint({method:'POST',body:{action:'redeem',code:'abcdefghijklmnop',initData:'bad'}},invalid);
  assert.equal(invalid.code,401);
 }finally{for(const k of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NOYA_TELEGRAM_BOT_TOKEN'])if(prev[k]===undefined)delete process.env[k];else process.env[k]=prev[k];}
});

test('verified administrator can preview NOYA without a paid club subscription',async()=>{
 const originalEnv={...process.env};
 Object.assign(process.env,{
  NEXT_PUBLIC_SUPABASE_URL:'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'test-service',
  NOYA_TELEGRAM_BOT_TOKEN:'test-noya-trial-bot'
 });
 const endpoint=require('../api/club-trial.js');
 const signed=signInit();
 const previousFetch=global.fetch;
 const seen=[];
 global.fetch=async(url)=>{
  const parsed=new URL(url),t=parsed.pathname.split('/').at(-1);
  seen.push(t);
  let value=[];
  if(t==='students')value=[{id:'11111111-1111-4111-8111-111111111111'}];
  if(t==='admins')value=[{id:'22222222-2222-4222-8222-222222222222'}];
  return {ok:true,status:200,json:async()=>value};
 };
 const response=()=>({setHeader(){},status(n){this.code=n;return this},json(body){this.body=body;return this}});
 try{
  const res=response();
  await endpoint({method:'GET',headers:{'x-telegram-init-data':signed}},res);
  assert.equal(res.code,200);
  assert.equal(res.body.adminPreview,true);
  assert.equal(res.body.paidActive,false);
  assert.equal(res.body.courseEnabled,false);
  assert.deepEqual(seen.sort(),['admins','club_subscriptions','noya_club_trials','students'].sort());
 }finally{
  global.fetch=previousFetch;
  for(const k of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NOYA_TELEGRAM_BOT_TOKEN'])
   if(originalEnv[k]===undefined)delete process.env[k];else process.env[k]=originalEnv[k];
 }
});

test('ordinary user cannot bypass payment through NOYA admin preview',async()=>{
 const originalEnv={...process.env};
 Object.assign(process.env,{
  NEXT_PUBLIC_SUPABASE_URL:'https://fake.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'test-service',
  NOYA_TELEGRAM_BOT_TOKEN:'test-noya-trial-bot'
 });
 const endpoint=require('../api/club-trial.js');
 const previousFetch=global.fetch;
 global.fetch=async(url)=>{
  const t=new URL(url).pathname.split('/').at(-1);
  return {ok:true,status:200,json:async()=>t==='students'?[{id:'11111111-1111-4111-8111-111111111111'}]:[]};
 };
 try{
  const res={setHeader(){},status(n){this.code=n;return this},json(body){this.body=body;return this}};
  await endpoint({method:'GET',headers:{'x-telegram-init-data':signInit()}},res);
  assert.equal(res.code,200);
  assert.equal(res.body.adminPreview,false);
  assert.equal(res.body.paidActive,false);
  assert.equal(res.body.trialActive,false);
 }finally{
  global.fetch=previousFetch;
  for(const k of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NOYA_TELEGRAM_BOT_TOKEN'])
   if(originalEnv[k]===undefined)delete process.env[k];else process.env[k]=originalEnv[k];
 }
});

test('NOYA home hides payment redirect only after server confirms admin preview',()=>{
 const source=read('club.html');
 assert.match(source,/if\(t\.adminPreview===true\)\{hide\(\);return;\}/);
 assert.match(source,/if\(t\.paidActive\)\{hide\(\);return;\}/);
 assert.match(source,/if\(!response\.ok\|\|!data\.checkoutUrl\)/);
 assert.match(TRIAL,/admins\?select=id&telegram_id=eq\./);
});
