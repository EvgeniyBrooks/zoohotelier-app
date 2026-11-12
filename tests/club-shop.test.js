'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const pre={...process.env};
Object.assign(process.env,{
 NEXT_PUBLIC_SUPABASE_URL:'https://fake.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-secret',
 NOYA_TELEGRAM_BOT_TOKEN:'shop-test-bot',CLOUDFLARE_ACCOUNT_ID:'cf-test-account',CLOUDFLARE_API_TOKEN:'cf-test-token'
});
const handler=require('../api/club-shop');
const STUDENT='11111111-1111-4111-8111-111111111111';
const ORDER='22222222-2222-4222-8222-222222222222';
const USER=123456789;
const VIDEO='a'.repeat(32);
const RESPONSE_VIDEO='b'.repeat(32);
function init(id=USER){
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id,first_name:'Test'})});
 const sorted=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([a,b])=>a+'='+b).join('\n');
 const secret=crypto.createHmac('sha256','WebAppData').update(process.env.NOYA_TELEGRAM_BOT_TOKEN).digest();
 p.set('hash',crypto.createHmac('sha256',secret).update(sorted).digest('hex'));
 return p.toString();
}
function resp(){return {statusCode:200,setHeader(){},status(s){this.statusCode=s;return this},json(v){this.body=v;return this}}}
async function invoke(method,action,extra={},opts={}){
 const res=resp(),req={method,headers:{'x-telegram-init-data':opts.initData===undefined?init():opts.initData},
  query:{action,...(opts.query||{})},
  body:{action,initData:opts.initData===undefined?init():opts.initData,...extra}};
 await handler(req,res);return res;
}
function network(options={}){
 const state={calls:[],orders:[...(options.orders||[])],direct:0};
 const old=global.fetch;
 const orderStatus=options.orderStatus||'awaiting_video';
 global.fetch=async(input,request={})=>{
  const url=new URL(input),p=url.pathname,method=request.method||'GET';
  state.calls.push({host:url.hostname,path:p,method});
  if(url.hostname==='api.telegram.org'){
   assert.equal(method,'POST');
   const notice=JSON.parse(request.body);
   assert.match(notice.text,/Мои разборы/);
   return new Response(JSON.stringify({ok:true,result:{message_id:1}}));
  }
  if(url.hostname==='api.cloudflare.com'){
   const data=p.endsWith('/direct_upload')?
    {uid:VIDEO,uploadURL:'https://upload.videodelivery.net/sample'}:
    p.endsWith('/token')?{token:'header.payload.signature'}:{readyToStream:true,status:{state:'ready'}};
   return new Response(JSON.stringify({success:true,result:data}),{status:200,headers:{'content-type':'application/json'}});
  }
  assert.equal(url.hostname,'fake.supabase.co');
  if(p.endsWith('/students'))return new Response(JSON.stringify(
   url.searchParams.has('id')?[{telegram_id:USER}]:[{id:STUDENT}]
  ));
  if(p.endsWith('/admins'))return new Response(JSON.stringify(options.admin?[{id:STUDENT}]:[]));
  if(p.endsWith('/noya_review_staff')) {
   if(method==='POST')return new Response(JSON.stringify([{telegram_id:111111111,role:'kinolog',enabled:true}]),{status:201});
   return new Response(JSON.stringify(options.staff?[{role:'kinolog',enabled:true}]:[]));
  }
  if(p.endsWith('/club_subscriptions'))return new Response(JSON.stringify(options.member?[{status:'active',start_date:'2020-01-01',end_date:'2030-01-01'}]:[]));
  if(p.endsWith('/noya_club_trials'))return new Response('[]');
  if(p.endsWith('/noya_review_orders')){
   if(method==='POST'){
    const o=JSON.parse(request.body);
    assert.equal(o.is_test,true);
    state.orders.push({id:ORDER,...o,created_at:'2026-11-12T00:00:00Z'});
    return new Response(JSON.stringify([state.orders.at(-1)]),{status:201});
   }
   if(method==='PATCH'){
    const next={...(options.orders||[])[0],id:ORDER,student_id:STUDENT,service_code:'kinolog',
     status:orderStatus,price_rub:1490,is_test:true,created_at:'2026-11-12T00:00:00Z',...JSON.parse(request.body)};
    return new Response(JSON.stringify([next]));
   }
   return new Response(JSON.stringify(state.orders.length?state.orders:[...(options.orders||[])]));
  }
  if(p.endsWith('/noya_review_order_events'))return new Response(null,{status:204});
  if(p.endsWith('/noya_coin_sync'))return new Response(JSON.stringify([{balance:100,lifetime_earned:100,lifetime_spent:0}]));
  if(p.endsWith('/noya_coin_redeem')){
   const payload=JSON.parse(request.body);
   assert.equal(payload.p_item_code,'walk_checklist');
   assert.equal(Object.hasOwn(payload,'coins'),false);
   return new Response(JSON.stringify([{applied:true,balance:20,item_code:'walk_checklist'}]));
  }
  if(p.endsWith('/noya_coin_store_items'))return new Response(JSON.stringify([
   {code:'walk_checklist',title:'Чек-лист: спокойная прогулка',description:'Первый бонус',cost:80,content:'SECRET PURCHASED MATERIAL',sort_order:1},
   {code:'attention_week',title:'7 дней: план на внимание',description:'План',cost:150,content:'UNREDEEMED SECRET',sort_order:2}
  ]));
  if(p.endsWith('/noya_coin_redemptions'))return new Response(JSON.stringify(options.claimed?[{item_code:'walk_checklist',paid_coins:80,created_at:'2026-11-12T00:00:00Z'}]:[]));
  if(p.endsWith('/noya_coin_ledger'))return new Response(JSON.stringify([{coins:100,reason:'Стартовый бонус',created_at:'2026-11-12T00:00:00Z'}]));

  throw Error('Unexpected DB '+p);
 };
 return {state,restore(){global.fetch=old}};
}
test.after(()=>{for(const k of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NOYA_TELEGRAM_BOT_TOKEN','CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN'])if(pre[k]===undefined)delete process.env[k];else process.env[k]=pre[k];});
test('no shop endpoint accepts unsigned Telegram access',async()=>{
 const mock=network({admin:true});
 try{
  const r=await invoke('GET','catalog',{}, {initData:''});
  assert.equal(r.statusCode,401);
  assert.equal(mock.state.calls.length,0);
 }finally{mock.restore();}
});
test('club member can view catalog, but cannot purchase or forge test orders',async()=>{
 const mock=network({member:true});
 try{
  const cat=await invoke('GET','catalog');
  assert.equal(cat.statusCode,200);
  assert.deepEqual(cat.body.services.map(x=>x.priceRub),[1490,5900]);
  assert.equal(cat.body.services[0].purchaseEnabled,false);
  assert.equal(cat.body.services[0].adminTestEnabled,false);
  const fake=await invoke('POST','test_create',{serviceCode:'evgeniy'});
  assert.equal(fake.statusCode,403);
  const bad=await invoke('POST','buy',{serviceCode:'kinolog'});
  assert.equal(bad.statusCode,400);
  assert.equal(mock.state.calls.some(x=>x.path.endsWith('/noya_review_order_events')),false);
 }finally{mock.restore();}
});
test('admin can create only a nonpayable test order for actual catalog products',async()=>{
 const mock=network({admin:true});
 try{
  const r=await invoke('POST','test_create',{serviceCode:'evgeniy'});
  assert.equal(r.statusCode,201);
  assert.equal(r.body.order.priceRub,5900);
  assert.equal(r.body.order.isTest,true);
  assert.equal(r.body.order.status,'awaiting_video');
  assert.equal(mock.state.orders[0].status,'awaiting_video');
  assert.equal(mock.state.orders[0].is_test,true);
 }finally{mock.restore();}
});
test('review video belongs only to owner, assigned reviewer or admin',async()=>{
 const order={id:ORDER,student_id:STUDENT,service_code:'kinolog',status:'submitted',
  price_rub:1490,is_test:true,video_uid:VIDEO,created_at:'2026-11-12T00:00:00Z'};
 const mock=network({orders:[order]});
 try{
  const owner=await invoke('GET','video',{}, {query:{id:ORDER,kind:'submission'}});
  assert.equal(owner.statusCode,200);
  assert.match(owner.body.playerUrl,/customer-9y0wom20nneqpu4g\.cloudflarestream\.com/);
  const denied=await invoke('GET','queue');
  assert.equal(denied.statusCode,403);
 }finally{mock.restore();}
});
test('staff only reviews assigned service, not owner/admin functions',async()=>{
 const order={id:ORDER,student_id:STUDENT,service_code:'evgeniy',status:'submitted',price_rub:5900,
  is_test:true,created_at:'2026-11-12T00:00:00Z',video_uid:VIDEO};
 const mock=network({staff:true,orders:[order]});
 try{
  const denied=await invoke('POST','review_complete',{orderId:ORDER,reviewText:'Correctly explain a training step and next work.'});
  assert.equal(denied.statusCode,403);
  const staff=await invoke('POST','staff_set',{telegramId:'111111111',role:'kinolog'});
  assert.equal(staff.statusCode,403);
 }finally{mock.restore();}
});
test('admin can complete a valid private review without granting real money-based membership',async()=>{
 const order={id:ORDER,student_id:STUDENT,service_code:'kinolog',status:'submitted',
  price_rub:1490,is_test:true,video_uid:VIDEO,created_at:'2026-11-12T00:00:00Z'};
 const mock=network({admin:true,orders:[order],orderStatus:'submitted'});
 try{
  const done=await invoke('POST','review_complete',{orderId:ORDER,reviewText:'Сначала поработай в спокойной обстановке, затем увеличь расстояние до раздражителя.'});
  assert.equal(done.statusCode,200);
  assert.equal(done.body.order.status,'completed');
  assert.equal(done.body.order.reviewText.includes('Сначала'),true);
  assert.equal(mock.state.calls.some(x=>x.path.includes('/payments')),false);
  assert.equal(mock.state.calls.some(x=>x.host==='api.telegram.org'),true);
 }finally{mock.restore();}
});
test('app has a shop navigation and never pretends shop purchases are enabled',()=>{
 const root=path.join(__dirname,'..');
 const html=fs.readFileSync(path.join(root,'club.html'),'utf8');
 const shop=fs.readFileSync(path.join(root,'shop.html'),'utf8');
 const ui=fs.readFileSync(path.join(root,'assets','club-shop.js'),'utf8');
 const api=fs.readFileSync(path.join(root,'api','club-shop.js'),'utf8');
 assert.match(html,/href="\.\/shop\.html"/);
 assert.match(shop,/noya-shop-reviewer-tab/);
 assert.match(shop,/club-shop\.js\?v=1/);
 assert.match(ui,/Оплата разборов скоро появится/);
 assert.match(api,/purchaseEnabled:false/);
 assert.doesNotMatch(api,/action==='purchase'/);
});

test('NOINCOINS wallet verifies user identity and never discloses locked paid bonus content',async()=>{
 const mock=network({member:true});
 try{
  const wallet=await invoke('GET','coins');
  assert.equal(wallet.statusCode,200);
  assert.equal(wallet.body.currency,'НОИНКОИНЫ');
  assert.equal(wallet.body.balance,100);
  assert.equal(wallet.body.items[0].cost,80);
  assert.equal(wallet.body.items[0].owned,false);
  assert.equal(Object.hasOwn(wallet.body.items[0],'content'),false);
  assert.equal(wallet.body.history.length,1);
 }finally{mock.restore();}
});

test('NOINCOINS redemption accepts only server-owned prices, not client-supplied coin amounts',async()=>{
 const mock=network({member:true,claimed:true});
 try{
  const redeem=await invoke('POST','coin_redeem',{itemCode:'walk_checklist',coins:-999999});
  assert.equal(redeem.statusCode,200);
  assert.equal(redeem.body.applied,true);
  assert.equal(redeem.body.wallet.items[0].content,'SECRET PURCHASED MATERIAL');
  assert.equal(Object.hasOwn(redeem.body.wallet.items[1],'content'),false);
  const other=await invoke('POST','coin_redeem',{itemCode:'different-secret'});
  assert.equal(other.statusCode,400); // invalid item codes cannot reach the private RPC
 }finally{mock.restore();}
});

test('without paid or trial club access, NOINCOINS cannot be earned or spent',async()=>{
 const mock=network();
 try{
  const denied=await invoke('GET','coins');
  assert.equal(denied.statusCode,403);
  const spend=await invoke('POST','coin_redeem',{itemCode:'walk_checklist'});
  assert.equal(spend.statusCode,403);
  assert.equal(mock.state.calls.some(x=>x.path.endsWith('/noya_coin_sync')),false);
 }finally{mock.restore();}
});

test('NOINCOINS shop contains wallet and a working earned bonus redemption control',()=>{
 const root=path.join(__dirname,'..');
 const html=fs.readFileSync(path.join(root,'shop.html'),'utf8');
 const ui=fs.readFileSync(path.join(root,'assets','club-shop.js'),'utf8');
 assert.match(html,/data-tab="coins"/);
 assert.match(html,/shop-coins-balance/);
 assert.match(html,/НОИНКОИНЫ/);
 assert.match(ui,/coin_redeem/);
 assert.match(ui,/data\.balance/);
 assert.match(ui,/item\.content/);
});
