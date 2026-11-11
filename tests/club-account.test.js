// Run: node --test tests/club-account.test.js tests/club-diagnostic.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const originalEnv = {...process.env};
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'account-test-service-key';
process.env.NOYA_TELEGRAM_BOT_TOKEN = 'account-test-bot-token';
const handler = require('../api/club-diagnostic.js');
const studentId = '11111111-1111-4111-8111-111111111111';
const foreignStudentId = '22222222-2222-4222-8222-222222222222';
const defaultNow = '2026-11-11T12:00:00.000Z';
const defaultUser = {id:123456789,first_name:'Евгений',last_name:'Брукс',username:'zoohotelier',photo_url:'https://example.com/avatar.jpg'};

function signedData(user=defaultUser,token=process.env.NOYA_TELEGRAM_BOT_TOKEN){
  const fields = new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify(user)});
  const check = [...fields.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
  const secret = crypto.createHmac('sha256','WebAppData').update(token).digest();
  fields.set('hash',crypto.createHmac('sha256',secret).update(check).digest('hex'));
  return fields.toString();
}
function response(){
  return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(v){this.statusCode=v;return this},json(v){this.body=v;return this}};
}
function subscription(start,end,status='active',extra={}){
  return {id:'33333333-3333-4333-8333-333333333333',status,start_date:start,end_date:end,next_payment_date:null,created_at:'2026-01-01T00:00:00.000Z',...extra};
}
async function account(options={}){
  const oldFetch=global.fetch,oldNow=Date.now,calls=[];
  Date.now=()=>Date.parse(options.now||defaultNow);
  global.fetch=async(url,request)=>{
    const parsed=new URL(url),table=parsed.pathname.split('/').pop();
    calls.push({url:parsed,request});
    if(options.fetchResponse)return options.fetchResponse(parsed,request);
    let data;
    if(table==='students')data=options.students===undefined?[{id:studentId}]:options.students;
    else if(table==='club_subscriptions')data=options.rows||[];
    else throw new Error('Account must not access '+table);
    return {ok:true,status:200,json:async()=>data};
  };
  const res=response();
  try{
    const initData=options.initData===undefined?signedData(options.user||defaultUser):typeof options.initData==='function'?options.initData():options.initData;
    await handler({method:options.method||'GET',headers:{'x-telegram-init-data':initData},query:{account:'1',...options.query},body:{...options.body,initData}},res);
    return {res,calls};
  }finally{global.fetch=oldFetch;Date.now=oldNow}
}
function assertLoyalty(res,unlockedMonths,nextUnlockAt=null){
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body.loyalty,{unlockedMonths,totalMonths:12,nextUnlockAt});
}

test.after(()=>{
  for(const key of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NOYA_TELEGRAM_BOT_TOKEN']){
    if(originalEnv[key]===undefined)delete process.env[key];else process.env[key]=originalEnv[key];
  }
});

test('account rejects missing Telegram authentication before any database read',async()=>{
  const {res,calls}=await account({initData:null,body:{initDataUnsafe:{user:defaultUser}}});
  assert.equal(res.statusCode,401);
  assert.equal(calls.length,0);
});

test('account rejects a changed Telegram user and a signature from another bot before database reads',async()=>{
  for(const initData of [()=>{
    const fields=new URLSearchParams(signedData());
    fields.set('user',JSON.stringify({...defaultUser,id:987654321}));
    return fields.toString();
  },()=>signedData(defaultUser,'a-different-bot-token')]){
    const {res,calls}=await account({initData});
    assert.equal(res.statusCode,401);
    assert.equal(calls.length,0);
  }
});

test('authOnly keeps its original response and takes precedence over account without reading the database',async()=>{
  const {res,calls}=await account({query:{authOnly:'1'}});
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body,{ok:true,authenticated:true});
  assert.equal(calls.length,0);
});

test('signed Telegram profile is returned even when no student exists, without creating anything',async()=>{
  const {res,calls}=await account({students:[]});
  assertLoyalty(res,0);
  assert.deepEqual(res.body.user,{id:'123456789',displayName:'Евгений Брукс',firstName:'Евгений',lastName:'Брукс',username:'zoohotelier',photoUrl:'https://example.com/avatar.jpg'});
  assert.deepEqual(res.body.subscription,{status:'none',startDate:null,endDate:null,nextPaymentDate:null});
  assert.equal(calls.length,1);
  assert.equal(calls[0].request.method,undefined);
  assert.equal(res.headers['Cache-Control'],'no-store');
});

test('account reads only the signed user student and that student subscriptions; client IDs and profile fields are ignored',async()=>{
  const {res,calls}=await account({query:{studentId:foreignStudentId,telegramId:'987654321'},body:{user:{...defaultUser,id:987654321,first_name:'Подмена'},studentId:foreignStudentId}});
  assertLoyalty(res,0);
  assert.equal(res.body.user.id,'123456789');
  assert.equal(res.body.user.firstName,'Евгений');
  assert.equal(res.body.subscription.status,'none');
  assert.equal(calls.length,2);
  assert.equal(calls[0].url.searchParams.get('telegram_id'),'eq.123456789');
  assert.equal(calls[1].url.searchParams.get('student_id'),'eq.'+studentId);
  assert.equal(calls[1].url.searchParams.has('status'),false);
  assert.ok(calls.every(call=>call.request.method===undefined));
  assert.ok(calls.every(call=>!call.url.toString().includes(foreignStudentId)));
});

test('account names are bounded and only safe HTTPS avatar URLs are returned',async()=>{
  const {res}=await account({user:{id:defaultUser.id,first_name:'A'.repeat(300),last_name:'B'.repeat(300),username:'C'.repeat(300),photo_url:'https://user:password@example.com/avatar.jpg'}});
  assert.equal(res.statusCode,200);
  assert.ok(res.body.user.displayName.length<=256);
  assert.ok(res.body.user.firstName.length<=128);
  assert.ok(res.body.user.lastName.length<=128);
  assert.ok(res.body.user.username.length<=64);
  assert.equal(res.body.user.photoUrl,null);
  for(const photo_url of ['http://example.com/a.jpg','javascript:alert(1)','not a URL','https://example.com/'+ 'a'.repeat(2050)]){
    const result=await account({user:{id:defaultUser.id,photo_url}});
    assert.equal(result.res.body.user.photoUrl,null);
    assert.equal(result.res.body.user.displayName,'Участник клуба');
  }
});

test('a prepaid year starts with zero unlocked months and keeps server payment dates',async()=>{
  const {res}=await account({rows:[subscription('2026-11-01T09:30:00.000Z','2027-11-01T09:30:00.000Z','active',{next_payment_date:'2027-11-01T09:30:00.000Z'})]});
  assertLoyalty(res,0,'2026-12-01T09:30:00.000Z');
  assert.deepEqual(res.body.subscription,{status:'active',startDate:'2026-11-01T09:30:00.000Z',endDate:'2027-11-01T09:30:00.000Z',nextPaymentDate:'2027-11-01T09:30:00.000Z'});
});

test('first level stays locked at joining and just before one full month, then unlocks exactly at and after the anniversary',async()=>{
  const rows=[subscription('2026-10-11T12:00:00.000Z','2027-10-11T12:00:00.000Z')];
  const joined=await account({now:'2026-10-11T12:00:00.000Z',rows});
  assertLoyalty(joined.res,0,'2026-11-11T12:00:00.000Z');
  const before=await account({now:'2026-11-11T11:59:59.999Z',rows});
  assertLoyalty(before.res,0,'2026-11-11T12:00:00.000Z');
  const at=await account({now:'2026-11-11T12:00:00.000Z',rows});
  assertLoyalty(at.res,1,'2026-12-11T12:00:00.000Z');
  const after=await account({now:'2026-11-11T12:00:00.001Z',rows});
  assertLoyalty(after.res,1,'2026-12-11T12:00:00.000Z');
});

test('second completed month unlocks exactly on its UTC calendar anniversary',async()=>{
  const rows=[subscription('2026-09-11T12:00:00.000Z','2027-09-11T12:00:00.000Z')];
  const before=await account({now:'2026-11-11T11:59:59.999Z',rows});
  assertLoyalty(before.res,1,'2026-11-11T12:00:00.000Z');
  const at=await account({rows});
  assertLoyalty(at.res,2,'2026-12-11T12:00:00.000Z');
});

test('twelfth level requires twelve complete months and opens exactly at that anniversary',async()=>{
  const rows=[subscription('2025-11-11T12:00:00.000Z',null)];
  const before=await account({now:'2026-11-11T11:59:59.999Z',rows});
  assertLoyalty(before.res,11,'2026-11-11T12:00:00.000Z');
  const at=await account({now:'2026-11-11T12:00:00.000Z',rows});
  assertLoyalty(at.res,12);
  const after=await account({now:'2026-11-11T12:00:00.001Z',rows});
  assertLoyalty(after.res,12);
});

test('loyalty caps at twelve months for long confirmed active membership',async()=>{
  const {res}=await account({rows:[subscription('2024-01-11T12:00:00.000Z',null)]});
  assertLoyalty(res,12);
  assert.equal(res.body.subscription.status,'active');
});

test('future subscription is scheduled and does not grant any month',async()=>{
  const {res}=await account({rows:[subscription('2026-12-01T00:00:00.000Z','2027-12-01T00:00:00.000Z')]});
  assertLoyalty(res,0);
  assert.equal(res.body.subscription.status,'scheduled');
});

test('expired, cancelled and inactive subscriptions grant no months even when their dates overlap now',async()=>{
  const cases=[
    {row:subscription('2026-01-01T00:00:00.000Z','2026-11-11T12:00:00.000Z'),status:'expired'},
    {row:subscription('2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z','expired'),status:'expired'},
    {row:subscription('2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z','cancelled'),status:'cancelled'},
    {row:subscription('2026-01-01T00:00:00.000Z','2027-01-01T00:00:00.000Z','pending'),status:'inactive'}
  ];
  for(const item of cases){
    const {res}=await account({rows:[item.row]});
    assertLoyalty(res,0);
    assert.equal(res.body.subscription.status,item.status);
  }
});

test('an active record without a start date retains access status but cannot invent loyalty from created_at',async()=>{
  const {res}=await account({rows:[subscription(null,null,'active',{created_at:'2020-01-01T00:00:00.000Z'})]});
  assertLoyalty(res,0);
  assert.equal(res.body.subscription.status,'active');
  assert.equal(res.body.subscription.startDate,null);
});

test('invalid period dates never manufacture active membership or tenure',async()=>{
  for(const row of [subscription('invalid',null),subscription('2026-11-01T00:00:00.000Z','invalid'),subscription('2026-11-02T00:00:00.000Z','2026-11-01T00:00:00.000Z')]){
    const {res}=await account({rows:[row]});
    assertLoyalty(res,0);
    assert.equal(res.body.subscription.status,'inactive');
  }
});

test('touching active renewals count continuous elapsed months, not the number of purchases',async()=>{
  const {res}=await account({rows:[
    subscription('2026-08-01T00:00:00.000Z','2026-09-01T00:00:00.000Z'),
    subscription('2026-09-01T00:00:00.000Z','2026-10-01T00:00:00.000Z'),
    subscription('2026-10-01T00:00:00.000Z','2026-11-01T00:00:00.000Z'),
    subscription('2026-11-01T00:00:00.000Z','2026-12-01T00:00:00.000Z')
  ]});
  assertLoyalty(res,3);
  assert.equal(res.body.subscription.startDate,'2026-11-01T00:00:00.000Z');
});

test('overlapping active records count each elapsed month once',async()=>{
  const {res}=await account({rows:[
    subscription('2026-09-15T00:00:00.000Z','2026-11-15T00:00:00.000Z'),
    subscription('2026-11-01T00:00:00.000Z','2026-12-01T00:00:00.000Z')
  ]});
  assertLoyalty(res,1,'2026-11-15T00:00:00.000Z');
});

test('a gap restarts the current continuous membership rather than adding previous paid months',async()=>{
  const {res}=await account({rows:[
    subscription('2026-01-01T00:00:00.000Z','2026-09-01T00:00:00.000Z'),
    subscription('2026-10-01T00:00:00.000Z','2026-12-01T00:00:00.000Z')
  ]});
  assertLoyalty(res,1);
});

test('inactive history cannot extend current tenure, and a later future purchase cannot accelerate it',async()=>{
  const {res}=await account({rows:[
    subscription('2020-01-01T00:00:00.000Z','2026-11-01T00:00:00.000Z','cancelled'),
    subscription('2026-11-01T00:00:00.000Z','2026-12-01T00:00:00.000Z'),
    subscription('2026-12-01T00:00:00.000Z','2027-12-01T00:00:00.000Z')
  ]});
  assertLoyalty(res,0,'2026-12-01T00:00:00.000Z');
  assert.equal(res.body.subscription.startDate,'2026-11-01T00:00:00.000Z');
});

test('an unconfirmed renewal does not promise a next level at or after the subscription end',async()=>{
  for(const end of ['2026-12-01T00:00:00.000Z','2026-11-30T00:00:00.000Z']){
    const {res}=await account({rows:[subscription('2026-11-01T00:00:00.000Z',end)]});
    assertLoyalty(res,0);
  }
});

test('January 31 anniversary clamps to February 28 and returns to March 31 without drift',async()=>{
  const rows=[subscription('2026-01-31T10:20:30.000Z','2027-01-31T10:20:30.000Z')];
  const before=await account({now:'2026-02-28T10:20:29.999Z',rows});
  assertLoyalty(before.res,0,'2026-02-28T10:20:30.000Z');
  const february=await account({now:'2026-02-28T10:20:30.000Z',rows});
  assertLoyalty(february.res,1,'2026-03-31T10:20:30.000Z');
  const march=await account({now:'2026-03-30T23:59:59.999Z',rows});
  assertLoyalty(march.res,1,'2026-03-31T10:20:30.000Z');
  const marchAnniversary=await account({now:'2026-03-31T10:20:30.000Z',rows});
  assertLoyalty(marchAnniversary.res,2,'2026-04-30T10:20:30.000Z');
});

test('leap-year February uses February 29 at the original UTC time',async()=>{
  const rows=[subscription('2024-01-31T22:00:00.000Z','2025-01-31T22:00:00.000Z')];
  const before=await account({now:'2024-02-28T22:00:00.000Z',rows});
  assertLoyalty(before.res,0,'2024-02-29T22:00:00.000Z');
  const at=await account({now:'2024-02-29T22:00:00.000Z',rows});
  assertLoyalty(at.res,1,'2024-03-31T22:00:00.000Z');
});

test('database failures remain errors instead of becoming a no-subscription account',async()=>{
  for(const table of ['students','club_subscriptions']){
    const {res}=await account({fetchResponse:async url=>{
      if(url.pathname.endsWith('/'+table))return {ok:false,status:503,json:async()=>({code:'XX000',message:'private backend diagnostic'})};
      return {ok:true,status:200,json:async()=>[{id:studentId}]};
    }});
    assert.equal(res.statusCode,502);
    assert.deepEqual(res.body,{error:'Database operation failed'});
  }
});

test('a malformed successful database response is not reported as an empty account',async()=>{
  for(const table of ['students','club_subscriptions']){
    const {res}=await account({fetchResponse:async url=>({ok:true,status:200,json:async()=>url.pathname.endsWith('/'+table)?null:[{id:studentId}]})});
    assert.equal(res.statusCode,502);
    assert.deepEqual(res.body,{error:'Database operation failed'});
  }
});

test('subscription pagination preserves older connected history and retains the owner filter on every page',async()=>{
  const filler=Array.from({length:999},(_,i)=>subscription('2026-10-01T00:00:00.000Z','2026-10-02T00:00:00.000Z','cancelled',{id:String(i)}));
  const {res,calls}=await account({fetchResponse:async url=>{
    let data;
    if(url.pathname.endsWith('/students'))data=[{id:studentId}];
    else{
      assert.equal(url.searchParams.get('student_id'),'eq.'+studentId);
      data=url.searchParams.get('offset')==='0'?[subscription('2026-11-01T00:00:00.000Z','2027-01-01T00:00:00.000Z'),...filler]:[subscription('2026-01-01T00:00:00.000Z','2026-11-01T00:00:00.000Z')];
    }
    return {ok:true,status:200,json:async()=>data};
  }});
  assertLoyalty(res,10,'2026-12-01T00:00:00.000Z');
  assert.equal(calls.length,3);
  assert.equal(calls[2].url.searchParams.get('offset'),'1000');
});

test('the account query flag cannot bypass subscription checks for POST or DELETE',async()=>{
  for(const method of ['POST','DELETE']){
    const {res,calls}=await account({method,fetchResponse:async url=>{
      const table=url.pathname.split('/').pop();
      assert.ok(['students','club_subscriptions','admins'].includes(table));
      return {ok:true,status:200,json:async()=>table==='students'?[{id:studentId}]:[]};
    }});
    assert.equal(res.statusCode,403);
    assert.deepEqual(res.body,{error:'Active club subscription required'});
    assert.equal(calls.length,3);
  }
});

test('DELETE still scopes ownership and deletion to the authenticated student with account=1 present',async()=>{
  const dogId='44444444-4444-4444-8444-444444444444';
  for(const own of [true,false]){
    const {res,calls}=await account({method:'DELETE',body:{dogId},fetchResponse:async(url,request)=>{
      const table=url.pathname.split('/').pop();
      let data;
      if(table==='students')data=[{id:studentId}];
      else if(table==='club_subscriptions')data=[subscription(null,null)];
      else if(table==='admins')data=[];
      else if(table==='club_dogs'){
        assert.equal(url.searchParams.get('student_id'),'eq.'+studentId);
        assert.equal(url.searchParams.get('id'),'eq.'+dogId);
        data=request.method==='DELETE'?null:own?[{id:dogId,name:'Тест'}]:[];
      }else throw new Error('Unexpected delete table '+table);
      return {ok:true,status:request.method==='DELETE'?204:200,json:async()=>data};
    }});
    assert.equal(res.statusCode,own?200:404);
    assert.equal(calls.filter(call=>call.request.method==='DELETE').length,own?1:0);
    assert.deepEqual(res.body,own?{ok:true,deletedDogId:dogId}:{error:'Dog not found'});
  }
});
