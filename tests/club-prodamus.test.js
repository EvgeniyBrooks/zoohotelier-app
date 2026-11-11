const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const original={...process.env};
process.env.NOYA_TELEGRAM_BOT_TOKEN='test-noya-club-bot';
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-service-secret';
const lib=require('../api/_lib/noya-prodamus');
const checkout=require('../api/club-checkout');
const webhook=require('../api/club-prodamus-webhook');
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
 for(const k of ['NOYA_PRODAMUS_ENABLE','NOYA_PRODAMUS_FORM_URL','NOYA_PRODAMUS_SUBSCRIPTION_ID','NOYA_PRODAMUS_SECRET','NOYA_PRODAMUS_SYS','NOYA_PRODAMUS_WEBHOOK_URL','NOYA_CLUB_PRICE_RUB','NOYA_CLUB_TERMS_URL']){
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
 const pay=res();await checkout({method:'POST',body:{initData:signedInit(),acceptedTerms:true}},pay);
 assert.equal(pay.statusCode,503);
});
test('checkout requires explicit agreement and signed Telegram data',async()=>{
 enable();
 const a=res();await checkout({method:'POST',body:{initData:signedInit(),acceptedTerms:false}},a);
 assert.equal(a.statusCode,400);
 const b=res();await checkout({method:'POST',body:{initData:'bad',acceptedTerms:true}},b);
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
   assert.equal(data.subscription,'12345');assert.equal(data.urlNotification,process.env.NOYA_PRODAMUS_WEBHOOK_URL);
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
