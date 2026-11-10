const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'mock-key',NOYA_TELEGRAM_BOT_TOKEN:'mock-bot',CLOUDFLARE_ACCOUNT_ID:'mock-account',CLOUDFLARE_API_TOKEN:'mock-cloudflare'});
const handler=require('../api/club-video-token.js');
const lessonId='11111111-1111-4111-8111-111111111111';
function initData(){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:12345})});const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');const key=crypto.createHmac('sha256','WebAppData').update('mock-bot').digest();p.set('hash',crypto.createHmac('sha256',key).update(check).digest('hex'));return p.toString()}
async function call({signed=true,subscribed=true,published=true}={}){
 let cloudflareCalls=0;
 const previous=global.fetch;
 global.fetch=async(url,options)=>{
  if(url.startsWith('https://api.cloudflare.com/')){cloudflareCalls++;return {ok:true,json:async()=>({success:true,result:{token:'mock-signed-token'}})}}
  let data=[];
  if(url.includes('/students?'))data=[{id:'22222222-2222-4222-8222-222222222222'}];
  if(url.includes('/club_subscriptions?'))data=subscribed?[{status:'active',start_date:null,end_date:null}]:[];
  if(url.includes('/club_lessons?'))data=published?[{id:lessonId,is_published:true,cloudflare_video_id:'a'.repeat(32)}]:[];
  return {ok:true,json:async()=>data};
 };
 const res={statusCode:200,setHeader(){return this},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};
 try{await handler({method:'POST',body:{initData:signed?initData():'bad',lessonId}},res);return {status:res.statusCode,body:res.body,cloudflareCalls}}
 finally{global.fetch=previous}
}
test('rejects missing Telegram authentication',async()=>{const r=await call({signed:false});assert.equal(r.status,401);assert.equal(r.cloudflareCalls,0)});
test('rejects user without subscription',async()=>{const r=await call({subscribed:false});assert.equal(r.status,403);assert.equal(r.cloudflareCalls,0)});
test('rejects unpublished lesson',async()=>{const r=await call({published:false});assert.equal(r.status,404);assert.equal(r.cloudflareCalls,0)});
test('issues token for subscribed user and published lesson',async()=>{const r=await call();assert.equal(r.status,200);assert.equal(r.body.token,'mock-signed-token');assert.equal(r.cloudflareCalls,1)});
