const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const bot='test-only-token';
function initData(){
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:12345})});
 const secret=crypto.createHmac('sha256','WebAppData').update(bot).digest();
 const payload=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 p.set('hash',crypto.createHmac('sha256',secret).update(payload).digest('hex'));
 return p.toString();
}
test('private PDF downloads enforce club access and sign only the allowed file',async t=>{
 const handler=(await import(pathToFileURL(path.join(__dirname,'../api/member-materials.js')))).default;
 const previous={fetch:global.fetch,bot:process.env.NOYA_TELEGRAM_BOT_TOKEN,url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY};
 process.env.NOYA_TELEGRAM_BOT_TOKEN=bot;
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://imvtdholjeclyznonpdc.supabase.co';
 process.env.SUPABASE_SERVICE_ROLE_KEY='test-only-key';
 t.after(()=>{
  global.fetch=previous.fetch;
  for(const [env,key] of [['NOYA_TELEGRAM_BOT_TOKEN','bot'],['NEXT_PUBLIC_SUPABASE_URL','url'],['SUPABASE_SERVICE_ROLE_KEY','key']]){
   if(previous[key]===undefined)delete process.env[env];else process.env[env]=previous[key];
  }
 });
 async function request(options={}){
  const calls=[];
  global.fetch=async(url,config={})=>{
   calls.push({url:String(url),config});
   const route=new URL(url).pathname;
   if(route.startsWith('/storage/'))return Response.json(options.signed||{signedURL:'/object/sign/club-rewards/NOYA_4_principles.pdf?token=fixture-token'},{status:options.storageStatus||200});
   const table=route.split('/').pop();
   const tables={students:[{id:'student-fixture'}],admins:options.admin?[{id:'admin'}]:[],club_subscriptions:options.paid?[{end_date:new Date(Date.now()+60000).toISOString()}]:[],noya_club_trials:options.trial?[{starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+60000).toISOString()}]:[],enrollments:options.course?[{course_id:'course-fixture'}]:[],courses:[{id:'course-fixture'}]};
   assert.ok(Object.hasOwn(tables,table),'unexpected query: '+table);
   return Response.json(tables[table]);
  };
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(v){this.statusCode=v;return this},json(v){this.body=v;return this}};
  await handler({method:'POST',body:{action:'download',id:options.id??'four-principles',initData:options.invalid?'invalid':initData()}},res);
  return {res,calls,signCalls:calls.filter(c=>c.url.includes('/storage/'))};
 }
 await t.test('invalid Telegram session never queries storage',async()=>{const r=await request({invalid:true,paid:true});assert.equal(r.res.statusCode,401);assert.equal(r.calls.length,0)});
 for(const access of ['paid','trial','admin'])await t.test(access+' receives a short-lived attachment link',async()=>{
  const r=await request({[access]:true});assert.equal(r.res.statusCode,200);assert.equal(r.signCalls.length,1);
  assert.equal(r.res.headers['Cache-Control'],'private,no-store');
  assert.equal(r.res.body.fileName,'NOYA_4_principles.pdf');assert.equal(r.res.body.expiresIn,300);
  const url=new URL(r.res.body.url);assert.equal(url.hostname,'imvtdholjeclyznonpdc.supabase.co');assert.equal(url.searchParams.get('download'),'NOYA_4_principles.pdf');
  assert.deepEqual(JSON.parse(r.signCalls[0].config.body),{expiresIn:300,download:'NOYA_4_principles.pdf'});
 });
 for(const access of [{},{course:true}])await t.test('inactive club membership cannot download '+JSON.stringify(access),async()=>{const r=await request(access);assert.equal(r.res.statusCode,403);assert.equal(r.signCalls.length,0)});
 await t.test('arbitrary files cannot be signed',async()=>{const r=await request({paid:true,id:'../101TRYK_optimized.pdf.pdf'});assert.equal(r.res.statusCode,404);assert.equal(r.signCalls.length,0)});
 await t.test('rejects storage links for other origins',async()=>{const r=await request({paid:true,signed:{signedURL:'https://example.org/storage/v1/object/sign/club-rewards/NOYA_4_principles.pdf?token=x'}});assert.equal(r.res.statusCode,502);assert.equal(r.res.body.url,undefined)});
 await t.test('storage failures do not leak service errors',async()=>{const r=await request({paid:true,storageStatus:400,signed:{message:'private diagnostic'}});assert.equal(r.res.statusCode,502);assert.ok(!JSON.stringify(r.res.body).includes('private diagnostic'))});
});
