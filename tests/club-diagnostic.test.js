// Run: node --test tests/club-diagnostic.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='mock-key';
process.env.NOYA_TELEGRAM_BOT_TOKEN='mock-bot-token';
const handler = require('../api/club-diagnostic.js');
const OLD_ENV = {...process.env};
const studentId = '11111111-1111-4111-8111-111111111111';
const dogId = '22222222-2222-4222-8222-222222222222';
function signedData(id=123456789){
 const fields = new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Test'})});
 const check=[...fields.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const secret=crypto.createHmac('sha256','WebAppData').update(process.env.NOYA_TELEGRAM_BOT_TOKEN).digest();
 fields.set('hash',crypto.createHmac('sha256',secret).update(check).digest('hex'));
 return fields.toString();
}
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(v){this.statusCode=v;return this},json(v){this.body=v;return this}}}
async function run(method,initData,body={},mock){
 const old=global.fetch;global.fetch=async(url,opts)=>({ok:true,json:async()=>mock(new URL(url).pathname+new URL(url).search,opts)});
 const res=response();
 try{await handler({method,body:{...body,initData},headers:{'x-telegram-init-data':initData}},res);return res}
 finally{global.fetch=old}
}
function dbFixture({active=true,own=true}={}){
 return (path,opts)=>{
  if(path.startsWith('/rest/v1/students?'))return [{id:studentId}];
  if(path.startsWith('/rest/v1/club_subscriptions?'))return active?[{status:'active',start_date:null,end_date:null}]:[];
  if(path.startsWith('/rest/v1/admins?'))return [];
  if(path.startsWith('/rest/v1/club_dogs?')){
   if(opts.method==='POST')return [{id:dogId,name:'Ноя'}];
   return own?[{id:dogId,name:'Ноя'}]:[];
  }
  if(path.startsWith('/rest/v1/club_diagnostics?')){
   if(opts.method==='POST')return [{id:'33333333-3333-4333-8333-333333333333',dog_id:dogId,created_at:new Date().toISOString()}];
   return [];
  }
  throw new Error('Unexpected mocked endpoint: '+path);
 }
}

test.after(()=>{for(const k of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NOYA_TELEGRAM_BOT_TOKEN']){if(OLD_ENV[k]===undefined)delete process.env[k];else process.env[k]=OLD_ENV[k]}});
test('invalid Telegram signature denied',async()=>{const data=signedData().replace(/hash=[^&]+/,'hash='+'a'.repeat(64));const r=await run('GET',data,{},()=>{throw Error('Should not access DB')});assert.equal(r.statusCode,401)});
test('no subscription denied',async()=>{const r=await run('GET',signedData(),{},dbFixture({active:false}));assert.equal(r.statusCode,403)});
test('GET lists owned dog profiles',async()=>{const r=await run('GET',signedData(),{},dbFixture());assert.equal(r.statusCode,200);assert.equal(r.body.dogs[0].name,'Ноя')});
test('POST creates dog and roadmap',async()=>{const r=await run('POST',signedData(),{dogName:'Ноя',answers:[2,2,1,1,1,1,0,1,2,1]},dbFixture());assert.equal(r.statusCode,200);assert.equal(r.body.separationConcern,true);assert.ok(r.body.topics.includes('emotions'))});
test('POST reuses owned dog ID',async()=>{let creates=0;const mock=(path,opts)=>{if(path.startsWith('/rest/v1/club_dogs?')&&opts.method==='POST')creates++;return dbFixture()(path,opts)};const r=await run('POST',signedData(),{dogId,dogName:'Ноя',answers:Array(10).fill(2)},mock);assert.equal(r.statusCode,200);assert.equal(creates,0)});
test('POST cannot attach diagnosis to foreign dog',async()=>{const r=await run('POST',signedData(),{dogId,dogName:'Ноя',answers:Array(10).fill(2)},dbFixture({own:false}));assert.equal(r.statusCode,404)});
test('invalid answers denied',async()=>{const r=await run('POST',signedData(),{dogName:'Ноя',answers:[1]},dbFixture());assert.equal(r.statusCode,400)});
