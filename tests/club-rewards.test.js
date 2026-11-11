// Run: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const originalEnv = {...process.env};
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'rewards-test-service-key';
process.env.NOYA_TELEGRAM_BOT_TOKEN = 'rewards-test-bot-token';
const handler = require('../api/club-diagnostic.js');
const studentId = '11111111-1111-4111-8111-111111111111';
const foreignStudentId = '22222222-2222-4222-8222-222222222222';
const now = '2026-11-11T12:00:00.000Z';
const user = {id:123456789,first_name:'Тест'};

function signedData(profile=user,token=process.env.NOYA_TELEGRAM_BOT_TOKEN){
  const fields = new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify(profile)});
  const check = [...fields.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
  const secret = crypto.createHmac('sha256','WebAppData').update(token).digest();
  fields.set('hash',crypto.createHmac('sha256',secret).update(check).digest('hex'));
  return fields.toString();
}
function subscription(start='2026-10-11T12:00:00.000Z',end='2027-10-11T12:00:00.000Z',status='active'){
  return {id:'33333333-3333-4333-8333-333333333333',status,start_date:start,end_date:end,next_payment_date:null,created_at:'2026-01-01T00:00:00.000Z'};
}
function response(){
  return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(v){this.statusCode=v;return this},json(v){this.body=v;return this}};
}
async function request(options={}){
  const oldFetch=global.fetch,oldNow=Date.now,calls=[];
  Date.now=()=>Date.parse(options.now||now);
  global.fetch=async(url,init)=>{
    const parsed=new URL(url),table=parsed.pathname.split('/').pop();
    calls.push({url:parsed,init});
    if(options.fetchResponse)return options.fetchResponse(parsed,init);
    let data;
    if(table==='students')data=options.students===undefined?[{id:studentId}]:options.students;
    else if(table==='club_subscriptions')data=options.rows===undefined?[subscription()]:options.rows;
    else throw new Error('Reward must not access '+table);
    return {ok:true,status:200,json:async()=>data};
  };
  const res=response();
  try{
    const initData=options.initData===undefined?signedData():typeof options.initData==='function'?options.initData():options.initData;
    await handler({method:options.method||'GET',headers:{'x-telegram-init-data':initData},query:{reward:'1',...options.query},body:{...options.body,initData}},res);
    return {res,calls};
  }finally{global.fetch=oldFetch;Date.now=oldNow}
}
function assertLocked(res){
  assert.equal(res.statusCode,403);
  assert.deepEqual(res.body,{error:'Reward locked',code:'REWARD_LOCKED'});
  assert.equal(Object.hasOwn(res.body,'reward'),false);
}

test.after(()=>{
  for(const key of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NOYA_TELEGRAM_BOT_TOKEN']){
    if(originalEnv[key]===undefined)delete process.env[key];else process.env[key]=originalEnv[key];
  }
});

test('reward requires valid Telegram authentication before database reads or month validation',async()=>{
  for(const reward of ['1','bad']){
    const {res,calls}=await request({initData:null,query:{reward},body:{initDataUnsafe:{user}}});
    assert.equal(res.statusCode,401);
    assert.equal(calls.length,0);
    assert.equal(Object.hasOwn(res.body,'reward'),false);
  }
});

test('changed signed user data and another bot signature cannot read rewards or the database',async()=>{
  for(const initData of [()=>{
    const fields=new URLSearchParams(signedData());
    fields.set('user',JSON.stringify({...user,id:987654321}));
    return fields.toString();
  },()=>signedData(user,'another-bot-token')]){
    const {res,calls}=await request({initData});
    assert.equal(res.statusCode,401);
    assert.equal(calls.length,0);
    assert.equal(Object.hasOwn(res.body,'reward'),false);
  }
});

test('only a canonical month string from 1 through 12 is accepted after authentication',async()=>{
  for(const reward of ['abc','0','13','1.5','01',['1','2'],['1'],1,null,'','1e0','+1',' 1']){
    const {res,calls}=await request({query:{reward}});
    assert.equal(res.statusCode,400);
    assert.deepEqual(res.body,{error:'Invalid reward month'});
    assert.equal(calls.length,0);
  }
});

test('reward takes precedence over account and authOnly without leaking content or account data when locked',async()=>{
  for(const flags of [{account:'1'},{authOnly:'1'},{account:'1',authOnly:'1'}]){
    const {res}=await request({query:flags,rows:[]});
    assertLocked(res);
  }
  const {res}=await request({query:{account:'1',authOnly:'1'}});
  assert.equal(res.statusCode,200);
  assert.deepEqual(Object.keys(res.body).sort(),['ok','reward']);
  assert.equal(res.body.reward.month,1);
});

test('client supplied student and Telegram IDs cannot borrow another member earned rewards',async()=>{
  const {res,calls}=await request({query:{studentId:foreignStudentId,telegramId:'987654321'},body:{studentId:foreignStudentId,unlockedMonths:12},fetchResponse:async url=>{
    let data;
    if(url.pathname.endsWith('/students')){
      assert.equal(url.searchParams.get('telegram_id'),'eq.123456789');
      data=[{id:studentId}];
    }else if(url.pathname.endsWith('/club_subscriptions')){
      data=url.searchParams.get('student_id')==='eq.'+studentId?[subscription('2026-11-01T00:00:00.000Z',null)]:[subscription('2020-01-01T00:00:00.000Z',null)];
    }else throw new Error('Unexpected reward table');
    return {ok:true,status:200,json:async()=>data};
  }});
  assertLocked(res);
  assert.equal(calls.length,2);
  assert.equal(calls[1].url.searchParams.get('student_id'),'eq.'+studentId);
  assert.ok(calls.every(call=>!call.url.toString().includes(foreignStudentId)));
  assert.ok(calls.every(call=>call.init.method===undefined));
});

test('first reward is locked just before one complete month and opens exactly at and after the anniversary',async()=>{
  const before=await request({now:'2026-11-11T11:59:59.999Z'});
  assertLocked(before.res);
  const at=await request({now:'2026-11-11T12:00:00.000Z'});
  assert.equal(at.res.statusCode,200);
  assert.equal(at.res.body.ok,true);
  assert.equal(at.res.body.reward.month,1);
  assert.equal(at.res.body.reward.level,'Новичок');
  const after=await request({now:'2026-11-11T12:00:00.001Z'});
  assert.deepEqual(after.res.body,at.res.body);
  assert.equal(at.res.headers['Cache-Control'],'no-store');
});

test('paying for a year does not unlock reward 1 on joining or reward 12 before twelve completed months',async()=>{
  const rows=[subscription('2026-11-01T00:00:00.000Z','2027-11-01T00:00:00.000Z')];
  for(const reward of ['1','12']){
    const {res}=await request({query:{reward},rows});
    assertLocked(res);
  }
  const first=await request({now:'2026-12-01T00:00:00.000Z',rows});
  assert.equal(first.res.statusCode,200);
  assert.equal(first.res.body.reward.month,1);
  const second=await request({now:'2026-12-01T00:00:00.000Z',query:{reward:'2'},rows});
  assertLocked(second.res);
});

test('each earned month returns its own complete private reward and no other reward bodies',async()=>{
  const rows=[subscription('2025-11-11T12:00:00.000Z',null)];
  const levels=['Новичок','Ученик','Стажёр','Практик','Знаток собак','Тренер','Наставник','Кинолог','Опытный кинолог','Мастер','Эксперт','Суперкинолог'];
  for(let month=1;month<=12;month++){
    const {res}=await request({query:{reward:String(month)},rows});
    assert.equal(res.statusCode,200);
    assert.deepEqual(Object.keys(res.body).sort(),['ok','reward']);
    assert.equal(res.body.reward.month,month);
    assert.equal(res.body.reward.level,levels[month-1]);
    assert.equal(typeof res.body.reward.title,'string');
    assert.ok(res.body.reward.title.length>0);
    assert.ok(Array.isArray(res.body.reward.sections)&&res.body.reward.sections.length>0);
    assert.ok(Array.isArray(res.body.reward.worksheet.fields)&&res.body.reward.worksheet.fields.length>0);
    assert.equal(res.body.reward.image,'/assets/rewards/'+String(month).padStart(2,'0')+'.webp');
  }
});

test('reward remains locked without a student or a currently active dated subscription',async()=>{
  const missing=await request({students:[]});
  assertLocked(missing.res);
  assert.equal(missing.calls.length,1);
  for(const rows of [
    [],
    [subscription('2020-01-01T00:00:00.000Z','2026-11-11T12:00:00.000Z')],
    [subscription('2020-01-01T00:00:00.000Z',null,'cancelled')],
    [subscription('2020-01-01T00:00:00.000Z',null,'expired')],
    [subscription('2020-01-01T00:00:00.000Z',null,'pending')],
    [subscription('2026-12-01T00:00:00.000Z',null)],
    [subscription(null,null)]
  ]){
    const {res}=await request({rows});
    assertLocked(res);
  }
});

test('admin records cannot bypass the reward subscription and full-month gate',async()=>{
  const {res,calls}=await request({fetchResponse:async url=>{
    const table=url.pathname.split('/').pop();
    const data=table==='students'?[{id:studentId}]:table==='admins'?[{id:'admin'}]:[];
    return {ok:true,status:200,json:async()=>data};
  }});
  assertLocked(res);
  assert.equal(calls.some(call=>call.url.pathname.endsWith('/admins')),false);
});

test('database failures remain errors and never return private reward content',async()=>{
  for(const table of ['students','club_subscriptions']){
    const {res}=await request({fetchResponse:async url=>{
      if(url.pathname.endsWith('/'+table))return {ok:false,status:503,json:async()=>({code:'XX000',message:'private database detail'})};
      return {ok:true,status:200,json:async()=>[{id:studentId}]};
    }});
    assert.equal(res.statusCode,502);
    assert.deepEqual(res.body,{error:'Database operation failed'});
  }
});

test('malformed successful database responses cannot be mistaken for reward access',async()=>{
  for(const table of ['students','club_subscriptions']){
    const {res}=await request({fetchResponse:async url=>({ok:true,status:200,json:async()=>url.pathname.endsWith('/'+table)?null:[{id:studentId}]})});
    assert.equal(res.statusCode,502);
    assert.deepEqual(res.body,{error:'Database operation failed'});
  }
});

test('reward flags do not bypass POST or DELETE subscription checks or normal body validation',async()=>{
  for(const method of ['POST','DELETE']){
    for(const active of [false,true]){
      const {res,calls}=await request({method,query:{account:'1',authOnly:'1'},fetchResponse:async url=>{
        const table=url.pathname.split('/').pop();
        let data;
        if(table==='students')data=[{id:studentId}];
        else if(table==='club_subscriptions')data=active?[subscription('2020-01-01T00:00:00.000Z',null)]:[];
        else if(table==='admins')data=[];
        else throw new Error('Invalid body must not mutate '+table);
        return {ok:true,status:200,json:async()=>data};
      }});
      assert.equal(res.statusCode,active?400:403);
      assert.equal(Object.hasOwn(res.body,'reward'),false);
      assert.equal(Object.hasOwn(res.body,'code'),false);
      assert.equal(calls.length,3);
      assert.ok(calls.every(call=>call.init.method===undefined));
    }
  }
});
