
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');

const studentId='11111111-1111-4111-8111-111111111111';
const botToken='profile-test-token';
process.env.NOYA_TELEGRAM_BOT_TOKEN=botToken;
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY='profile-test-key';

test('a private profile opens and saves even when the ranking cannot read payment history',async()=>{
 const {default:handler}=await import('../api/club-members.js');
 const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:12345,first_name:'Тест'})});
 const secret=crypto.createHmac('sha256','WebAppData').update(botToken).digest();
 params.set('hash',crypto.createHmac('sha256',secret).update([...params].map(([k,v])=>k+'='+v).join('\n')).digest('hex'));
 const nativeFetch=global.fetch;
 let profile={display_name:'Тест',city:'Сочи',public_enabled:false};
 let rankingReads=0;
 global.fetch=async(url,options)=>{
  const resource=new URL(url).pathname.split('/').pop();
  if(resource==='students')return Response.json([{id:studentId}]);
  if(resource==='admins')return Response.json([{id:1}]);
  if(resource==='noya_member_profiles'){
   if(options.method==='POST')profile=JSON.parse(options.body);
   return Response.json([profile]);
  }
  if(resource==='noya_confirmed_club_payments_v'){
   rankingReads++;
   return Response.json({code:'42501'},{status:403});
  }
  return Response.json([]);
 };
 const call=async(action,extra={})=>{
  const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler({method:'POST',body:{action,initData:params.toString(),...extra}},res);
  return res;
 };
 try{
  const opened=await call('profile');
  assert.equal(opened.code,200);
  assert.equal(opened.body.me.city,'Сочи');
  const saved=await call('save',{profile:{displayName:'Тест профиля',city:'Москва'}});
  assert.equal(saved.code,200);
  assert.equal((await call('profile')).body.me.city,'Москва');
  assert.equal(rankingReads,0);
  assert.equal((await call('list')).code,502);
  assert.equal(rankingReads,1);
 }finally{global.fetch=nativeFetch;}
});

