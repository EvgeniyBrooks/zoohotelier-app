const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const original={...process.env};
process.env.NOYA_TELEGRAM_BOT_TOKEN='test-noya-club-bot';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-secret';
const lib=require('../lib/noya-prodamus');
const checkout=require('../lib/club-checkout');
const webhook=require('../lib/club-prodamus-webhook');
const student='11111111-1111-4111-8111-111111111111';
function signedInit(){
 const fields=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123456789,first_name:'Тест'})});
 const check=[...fields.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([a,b])=>a+'='+b).join('\n');
 const sec=crypto.createHmac('sha256','WebAppData').update(process.env.NOYA_TELEGRAM_BOT_TOKEN).digest();
 fields.set('hash',crypto.createHmac('sha256',sec).update(check).digest('hex'));
 return fields.toString();
}
function res(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(v){this.statusCode=v;return this},json(v){this.body=v;return this},send(v){this.body=v;return this}};}
function enable(){
 Object.assign(process.env,{
  NOYA_PRODAMUS_ENABLE:'1',NOYA_PRODAMUS_FORM_URL:'https://merchant.payform.ru/',
  NOYA_PRODAMUS_SUBSCRIPTION_ID:'12345',NOYA_PRODAMUS_SECRET:'test-prodamus-signature-secret',
  NOYA_PRODAMUS_SYS:'test_sys',NOYA_PRODAMUS_WEBHOOK_URL:'https://club.example.com/api/club-prodamus-webhook',
  NOYA_CLUB_PRICE_RUB:'2900',NOYA_CLUB_TERMS_URL:'https://example.com/club-terms'
 });
}
function cleanup(){
 for(const k of ['NOYA_PRODAMUS_ENABLE','NOYA_PRODAMUS_FORM_URL','NOYA_PRODAMUS_SUBSCRIPTION_ID','NOYA_PRODAMUS_SECRET','NOYA_PRODAMUS_SYS','NOYA_PRODAMUS_WEBHOOK_URL','NOYA_CLUB_PRICE_RUB','NOYA_CLUB_TERMS_URL','NOYA_PRODAMUS_DEMO_MODE']){
  if(original[k]===undefined)delete process.env[k];else process.env[k]=original[k];
 }
}
test.after(()=>{cleanup();for(const k of ['NOYA_TELEGRAM_BOT_TOKEN','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']){if(original[k]===undefined)delete process.env[k];else process.env[k]=original[k];}});
test('signature canonicalization recursively sorts keys, stringifies and escapes slashes',()=>{
 const payload={z:5,account:{b:2,a:'x/y'}};
 const source='{"account":{"a":"x\\\\/y","b":"2"},"z":"5"}';
 // JSON slash escape in signed payload is a literal backslash-slash.
 const json=JSON.stringify({account:{a:'x/y',b:'2'},z:'5'}).replace(/\//g,'\\/');
 const expected=crypto.createHmac('sha256','secret').update(json).digest('hex');
 assert.equal(lib.signedPayload(payload,'secret'),expected);
 assert.equal(lib.checkSignature(payload,expected,'secret'),true);
 assert.equal(lib.checkSignature({...payload,z:6},expected,'secret'),false);
});
test('nested Prodamus form fields build arrays correctly',()=>{
 const body='products%5B0%5D%5Bname%5D=Club&subscription%5Bid%5D=42&order_id=5';
 assert.deepEqual(lib.parseNestedForm(body),{products:[{name:'Club'}],subscription:{id:'42'},order_id:'5'});
 assert.throws(()=>lib.parseNestedForm('__proto__[x]=1'));
});
test('checkout remains disabled before explicit Prodamus configuration',async()=>{
 cleanup();
 const r=res();await checkout({method:'GET',query:{status:'1'}},r);
 assert.equal(r.statusCode,200);assert.equal(r.body.enabled,false);
 const pay=res();await checkout({method:'POST',body:{initData:signedInit()}},pay);
 assert.equal(pay.statusCode,503);
});
test('checkout requires signed Telegram data; consent happens on the payment provider form',async()=>{
 enable();
 const b=res();await checkout({method:'POST',body:{initData:'bad'}},b);
 assert.equal(b.statusCode,401);
 cleanup();
});
test('club checkout uses its own plan ID, pending intent and signed link',async()=>{
 enable();
 const oldFetch=global.fetch, calls=[];
 global.fetch=async(input,init={})=>{
  const u=new URL(input); calls.push({u,init});
  if(u.pathname.endsWith('/students')&&init.method===undefined)return {ok:true,json:async()=>[{id:student}]};
  if(u.pathname.endsWith('/noya_club_checkout_intents')&&init.method==='POST'){
   const data=JSON.parse(init.body);assert.equal(data.student_id,student);
   assert.match(data.order_num,/^noya-[\da-f-]{36}$/);return {ok:true,json:async()=>[data]};
  }
  if(u.hostname==='merchant.payform.ru'){
   const data=Object.fromEntries(new URLSearchParams(init.body));const sign=data.signature;delete data.signature;
   assert.equal(lib.checkSignature(data,sign,process.env.NOYA_PRODAMUS_SECRET),true);
   assert.equal(data.subscription,'12345');assert.equal(data.callbackType,'json');assert.equal(Object.hasOwn(data,'type'),false);assert.equal(Object.hasOwn(data,'urlNotification'),false);assert.equal(Object.hasOwn(data,'sys'),false);
   return {ok:true,text:async()=> 'https://payform.ru/abc123/'};
  }
  throw Error('Unexpected '+input);
 };
 try{
  const r=res();await checkout({method:'POST',body:{initData:signedInit(),acceptedTerms:true}},r);
  assert.equal(r.statusCode,200);assert.equal(r.body.checkoutUrl,'https://payform.ru/abc123/');
  assert.equal(calls.length,3);
 }finally{global.fetch=oldFetch;cleanup();}
});
const success={date:'2026-11-11T08:00:00+03:00',domain:'merchant.payform.ru',order_id:'1001',order_num:'noya-12341234-1234-4234-8234-123412341234',sum:'2900.00',currency:'rub',payment_status:'success',subscription:{id:'50001',payment_num:'1'}};
async function callback(body,signOverride){
 const r=res(),signature=signOverride||lib.signedPayload(body,process.env.NOYA_PRODAMUS_SECRET);
 await webhook({method:'POST',body,headers:{sign:signature}},r);
 return r;
}
test('webhook rejects tampering and mismatched source domain',async()=>{
 enable();
 let r=await callback(success,'f'.repeat(64));assert.equal(r.statusCode,403);
 r=await callback({...success,domain:'other.payform.ru'});assert.equal(r.statusCode,403);
 cleanup();
});
test('signed successful payment reaches private RPC and returns success',async()=>{
 enable();
 const oldFetch=global.fetch;let called=0;
 global.fetch=async(u,init)=>{
  called++;assert.match(String(u),/noya_club_record_confirmed_payment/);
  const payload=JSON.parse(init.body);assert.equal(payload.p_payment_id,'1001');assert.equal(payload.p_provider_subscription_id,'50001');
  return {ok:true,json:async()=>[{applied:true,member_id:student,paid_payments:1}]};
 };
 try{const r=await callback(success);assert.equal(r.statusCode,200);assert.equal(r.body,'success');assert.equal(called,1);}
 finally{global.fetch=oldFetch;cleanup();}
});
test('verified auto-payment event without status is accepted, failed events are ignored',async()=>{
 enable();
 const oldFetch=global.fetch;let count=0;
 global.fetch=async()=>{count++;return {ok:true,json:async()=>[{applied:true,member_id:student,paid_payments:2}]};};
 try{
  const recurring={...success,order_num:'',order_id:'1002',payment_status:'',subscription:{id:'50001',type:'action',action_code:'auto_payment',autopayment:'1',payment_num:'2'}};
  const a=await callback(recurring);assert.equal(a.statusCode,200);assert.equal(count,1);
  const b=await callback({...success,payment_status:'order_denied'});assert.equal(b.statusCode,200);assert.equal(count,1);
 }finally{global.fetch=oldFetch;cleanup();}
});

test('Prodamus webhook accepts a valid body sign field but never unsigned or altered content',async()=>{
 enable();
 const oldFetch=global.fetch;
 let calls=0;
 global.fetch=async()=>{calls++;return {ok:true,json:async()=>[{applied:true,member_id:student,paid_payments:1}]};};
 try{
  const good={...success,sign:lib.signedPayload(success,process.env.NOYA_PRODAMUS_SECRET)};
  const r=res();await webhook({method:'POST',body:good,headers:{}},r);
  assert.equal(r.statusCode,200);
  assert.equal(calls,1);
  const bad=res();await webhook({method:'POST',body:{...good,sum:'1'},headers:{}},bad);
  assert.equal(bad.statusCode,403);
  assert.equal(calls,1);
 }finally{global.fetch=oldFetch;cleanup();}
});

test('Prodamus webhook validates signed nested submit payloads without leaking to course flows',async()=>{
 enable();const oldFetch=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;return {ok:true,json:async()=>[{applied:true,member_id:student,paid_payments:1}]};};
 try{
  const wrapper={submit:{...success}};
  const r=res();await webhook({method:'POST',body:wrapper,headers:{sign:lib.signedPayload(success,process.env.NOYA_PRODAMUS_SECRET)}},r);
  assert.equal(r.statusCode,200);assert.equal(calls,1);
  const unrelated={...success,subscription:{id:''}};
  const ignored=res();await webhook({method:'POST',body:unrelated,headers:{sign:lib.signedPayload(unrelated,process.env.NOYA_PRODAMUS_SECRET)}},ignored);
  assert.equal(ignored.statusCode,200);assert.equal(calls,1);
 }finally{global.fetch=oldFetch;cleanup();}
});

test('checkout test mode is invisible to non-admin visitors and denies their POST before intent creation',async()=>{
 enable();
 process.env.NOYA_PRODAMUS_TEST_MODE='1';
 const oldFetch=global.fetch;let called=[];
 global.fetch=async(u,opts={})=>{
  let uri=new URL(u);called.push(uri.pathname.split('/').pop());
  if(uri.pathname.endsWith('/admins'))return {ok:true,json:async()=>[]};
  throw Error('Unexpected access '+u);
 };
 try{
  const unknown=res();await checkout({method:'GET',query:{status:'1'},headers:{}},unknown);
  assert.equal(unknown.statusCode,200);assert.equal(unknown.body.enabled,false);
  const member=res();await checkout({method:'POST',body:{initData:signedInit(),acceptedTerms:true}},member);
  assert.equal(member.statusCode,403);
  assert.deepEqual(called,['admins']);
 }finally{global.fetch=oldFetch;delete process.env.NOYA_PRODAMUS_TEST_MODE;cleanup();}
});
test('checkout test mode shows pay button only to a signed admin',async()=>{
 enable();process.env.NOYA_PRODAMUS_TEST_MODE='1';
 const oldFetch=global.fetch;
 global.fetch=async(u)=>{
  const uri=new URL(u);if(uri.pathname.endsWith('/admins'))return {ok:true,json:async()=>[{id:student}]};
  throw Error('unexpected '+u);
 };
 try{
  const r=res();await checkout({method:'GET',query:{status:'1'},headers:{'x-telegram-init-data':signedInit()}},r);
  assert.equal(r.statusCode,200);assert.equal(r.body.enabled,true);assert.equal(r.body.priceRub,2900);
 }finally{global.fetch=oldFetch;delete process.env.NOYA_PRODAMUS_TEST_MODE;cleanup();}
});

test('club entry immediately gates unpaid guests into Prodamus without an extra form',()=>{
 const fs=require('node:fs');
 const source=fs.readFileSync(require('node:path').join(__dirname,'..','club.html'),'utf8');
 assert.match(source,/window\.location\.replace\(paymentUrl\)/);
 assert.match(source,/setupNoyaBilling\(\);/);
 assert.match(source,/noya-payment-checking/);
 assert.equal(source.includes('Подписка продлевается автоматически по условиям платёжной формы. Первую методичку'),false);
 assert.equal(source.includes('noya-billing-consent'),false);
 assert.equal(source.includes('noya-billing-start'),false);
});

test('checkout accepts a Prodamus HTTPS 302 redirect as a valid link',async()=>{
 enable();
 const prev=global.fetch;
 global.fetch=async(input,init={})=>{
  const u=new URL(input);
  if(u.pathname.endsWith('/students')&&!init.method)return {ok:true,json:async()=>[{id:student}]};
  if(u.pathname.endsWith('/noya_club_checkout_intents')&&init.method==='POST')return {ok:true,json:async()=>[JSON.parse(init.body)]};
  if(u.hostname==='merchant.payform.ru')return {ok:false,status:302,text:async()=>'',headers:{get:(k)=>k==='location'?'https://payform.ru/redirect123/':null}};
  throw Error('Unexpected '+input);
 };
 try{
  const r=res();await checkout({method:'POST',body:{initData:signedInit()}},r);
  assert.equal(r.statusCode,200);assert.equal(r.body.checkoutUrl,'https://payform.ru/redirect123/');
 }finally{global.fetch=prev;cleanup();}
});

test('checkout accepts JSON-string Prodamus link response',async()=>{
 enable();
 const prev=global.fetch;
 global.fetch=async(input,init={})=>{
  const u=new URL(input);
  if(u.pathname.endsWith('/students')&&!init.method)return {ok:true,json:async()=>[{id:student}]};
  if(u.pathname.endsWith('/noya_club_checkout_intents')&&init.method==='POST')return {ok:true,json:async()=>[JSON.parse(init.body)]};
  if(u.hostname==='merchant.payform.ru')return {ok:true,status:200,text:async()=>JSON.stringify('https://payform.ru/jsonpath/'),headers:{get:()=> 'application/json'}};
  throw Error('Unexpected '+input);
 };
 try{
  const r=res();await checkout({method:'POST',body:{initData:signedInit()}},r);
  assert.equal(r.statusCode,200);assert.equal(r.body.checkoutUrl,'https://payform.ru/jsonpath/');
 }finally{global.fetch=prev;cleanup();}
});

test('admin test checkout creates a Prodamus DEMO link, not a live charge',async()=>{
 enable();process.env.NOYA_PRODAMUS_TEST_MODE='1';
 const originalFetch=global.fetch;const calls=[];
 global.fetch=async(input,init={})=>{
  const u=new URL(input);calls.push(u.pathname);
  if(u.pathname.endsWith('/admins'))return {ok:true,json:async()=>[{id:student}]};
  if(u.pathname.endsWith('/students')&&!init.method)return {ok:true,json:async()=>[{id:student}]};
  if(u.pathname.endsWith('/noya_club_checkout_intents')&&init.method==='POST'){
   const intent=JSON.parse(init.body);
   assert.equal(intent.is_demo,true);assert.match(intent.order_num,/^noya-demo-[0-9a-f-]{36}$/);
   return {ok:true,json:async()=>[intent]};
  }
  if(u.hostname==='merchant.payform.ru'){
   const params=Object.fromEntries(new URLSearchParams(init.body));
   const sign=params.signature;delete params.signature;
   assert.equal(lib.checkSignature(params,sign,process.env.NOYA_PRODAMUS_SECRET),true);
   assert.equal(params.demo_mode,'1');
   assert.equal(params.subscription,'12345');
   return {ok:true,status:200,text:async()=> 'https://payform.ru/checkout-demo/',headers:{get:()=> 'text/plain'}};
  }
  throw Error('Unexpected '+input);
 };
 try{
  const r=res();await checkout({method:'POST',body:{initData:signedInit()}},r);
  assert.equal(r.statusCode,200);assert.equal(r.body.checkoutUrl,'https://payform.ru/checkout-demo/');
  assert.equal(calls.length,4);
 }finally{global.fetch=originalFetch;delete process.env.NOYA_PRODAMUS_TEST_MODE;cleanup();}
});

test('signed demo payment updates demo receipt only, never grants club access or counts gifts',async()=>{
 enable();process.env.NOYA_PRODAMUS_TEST_MODE='1';
 const originalFetch=global.fetch;let patched=0;
 global.fetch=async(u,init)=>{
  assert.match(String(u),/noya_club_checkout_intents\\?/);
  assert.equal(init.method,'PATCH');
  assert.equal(JSON.parse(init.body).status,'demo_paid');
  assert.equal(String(u).includes('is_demo=eq.true'),true);
  patched++;
  return {ok:true,json:async()=>[{id:'demo-intent'}]};
 };
 try{
  const order='noya-demo-12341234-1234-4234-8234-123412341234';
  const body={...success,order_num:order};
  const r=await callback(body);assert.equal(r.statusCode,200);assert.equal(r.body,'success');
  assert.equal(patched,1);
  const invalid=await callback({...body,sum:'1'},'a'.repeat(64));assert.equal(invalid.statusCode,403);
  assert.equal(patched,1);
 }finally{global.fetch=originalFetch;delete process.env.NOYA_PRODAMUS_TEST_MODE;cleanup();}
});

test('demo callback cannot update club access after test mode is switched off',async()=>{
 enable();delete process.env.NOYA_PRODAMUS_TEST_MODE;
 const originalFetch=global.fetch;let called=false;global.fetch=async()=>{called=true;throw Error('Unexpected');};
 try{
  const r=await callback({...success,order_num:'noya-demo-12341234-1234-4234-8234-123412341234'});
  assert.equal(r.statusCode,200);assert.equal(called,false);
 }finally{global.fetch=originalFetch;cleanup();}
});

test('admin-only LIVE link omits demo_mode and never exposes checkout to non-admin visitors',async()=>{
 enable();process.env.NOYA_PRODAMUS_TEST_MODE='1';process.env.NOYA_PRODAMUS_DEMO_MODE='0';
 const prev=global.fetch;
 let submitted=false;
 global.fetch=async(input,init={})=>{
  const u=new URL(input);
  if(u.pathname.endsWith('/admins'))return {ok:true,json:async()=>[{id:student}]};
  if(u.pathname.endsWith('/students')&&!init.method)return {ok:true,json:async()=>[{id:student}]};
  if(u.pathname.endsWith('/noya_club_checkout_intents')&&init.method==='POST'){
   const intent=JSON.parse(init.body);
   assert.equal(intent.is_demo,false);
   assert.match(intent.order_num,/^noya-[0-9a-f-]{36}$/);
   return {ok:true,json:async()=>[intent]};
  }
  if(u.hostname==='merchant.payform.ru'){
   submitted=true;
   const params=Object.fromEntries(new URLSearchParams(init.body));
   const sign=params.signature;delete params.signature;
   assert.equal(lib.checkSignature(params,sign,process.env.NOYA_PRODAMUS_SECRET),true);
   assert.equal(Object.hasOwn(params,'demo_mode'),false);
   assert.equal(params.subscription,'12345');
   return {ok:true,status:200,text:async()=> 'https://payform.ru/live-check/',headers:{get:()=> 'text/plain'}};
  }
  throw Error('Unexpected '+input);
 };
 try{
  const r=res();await checkout({method:'POST',body:{initData:signedInit()}},r);
  assert.equal(r.statusCode,200);
  assert.equal(r.body.checkoutUrl,'https://payform.ru/live-check/');
  assert.equal(submitted,true);
 }finally{global.fetch=prev;delete process.env.NOYA_PRODAMUS_TEST_MODE;cleanup();}
});

test('Telegram Android has a tapped browser fallback for Prodamus URLs',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const html=fs.readFileSync(path.join(__dirname,'..','club.html'),'utf8');
 assert.match(html,/id="noya-payment-open"/);
 assert.match(html,/paymentButton\.addEventListener\('click'/);
 assert.match(html,/tg\.openLink\(paymentUrl\)/);
 assert.match(html,/paymentButton\.hidden=false/);
 assert.match(html,/window\.location\.replace\(paymentUrl\)/);
 assert.match(html,/window\.setTimeout\(/);
});

test('accepts correctly signed Prodamus multipart/form-data with mixed-case boundary',async()=>{
 enable();
 const prev=global.fetch;let count=0;
 global.fetch=async()=>{count++;return {ok:true,json:async()=>[{applied:true,member_id:student,paid_payments:1}]};};
 const boundary='AaB03xUPPER';
 const flat={
  date:success.date,domain:success.domain,order_id:success.order_id,
  order_num:success.order_num,sum:success.sum,currency:success.currency,
  payment_status:success.payment_status,'subscription[id]':success.subscription.id,
  'subscription[payment_num]':success.subscription.payment_num
 };
 const bytes=Object.entries(flat).map(([k,v])=>
  '--'+boundary+'\\r\\nContent-Disposition: form-data; name="'+k+'"\\r\\n\\r\\n'+v+'\\r\\n'
 ).join('')+'--'+boundary+'--\\r\\n';
 try{
  const r=res();
  await webhook({method:'POST',body:Buffer.from(bytes),headers:{
   sign:lib.signedPayload(success,process.env.NOYA_PRODAMUS_SECRET),
   'content-type':'multipart/form-data; boundary='+boundary
  }},r);
  assert.equal(r.statusCode,200);
  assert.equal(count,1);
 }finally{global.fetch=prev;cleanup();}
});

test('signed initial payment without a unique provider subscription ID is retried not falsely activated',async()=>{
 enable();
 const prev=global.fetch;let called=false;global.fetch=async()=>{called=true;throw Error('Unexpected RPC');};
 try{
  const initial={date:success.date,domain:success.domain,order_id:success.order_id,
   order_num:success.order_num,sum:success.sum,currency:success.currency,payment_status:'success'};
  const r=await callback(initial);
  assert.equal(r.statusCode,503);
  assert.equal(called,false);
  const course=await callback({...initial,order_num:'course-existing-order'});
  assert.equal(course.statusCode,200);
  assert.equal(called,false);
 }finally{global.fetch=prev;cleanup();}
});
