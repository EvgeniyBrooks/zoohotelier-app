const {test}=require('node:test');
const assert=require('node:assert/strict');
const {lifecycle,CHANNEL}=require('../lib/noya-lifecycle.cjs');
const {signedPayload}=require('../lib/noya-prodamus');
const now=Date.parse('2026-11-23T07:00:00Z');
function setup({provider='success',access=false,memberStatus='member',dbFails=false,renewDuringCheck=false}={}){
 const row={id:'subscription',student_id:'student',status:'active',start_date:'2026-11-01T00:00:00Z',end_date:'2026-12-01T00:00:00Z',prodamus_subscription_id:'12345',autorenew_cancelled_at:null};
 let job,accessCalls=0;const calls=[],messages=[];
 const env={NOYA_TELEGRAM_BOT_TOKEN:'test-token',NOYA_PRODAMUS_FORM_URL:'https://merchant.payform.ru/',NOYA_PRODAMUS_SUBSCRIPTION_ID:'3141429',NOYA_PRODAMUS_SECRET:'test-secret'};
 const db=async(path,opts={})=>{
  calls.push({path,...opts});if(dbFails)throw Error('DB unavailable');
  if(path.startsWith('students?'))return [{id:'student',telegram_id:42}];
  if(path.startsWith('club_subscriptions?'))return [row];
  if(path.startsWith('noya_club_cancellations?')){
   if(opts.method==='POST'){job ||= {...opts.body,state:'pending',notified_at:null};return [job];}
   if(opts.method==='PATCH'){Object.assign(job,opts.body);return [];}
   return job?[job]:[];
  }
  if(path==='rpc/noya_confirm_club_cancellation'){job.state='confirmed';row.autorenew_cancelled_at=new Date(now).toISOString();return [];}
  if(path.startsWith('noya_channel_members?'))return [];
  return [];
 };
 const telegram=async(method,body)=>{calls.push({method,body});return method==='getChatMember'?{status:memberStatus}:true;};
 const fetcher=async(url,opts)=>{calls.push({url,...opts});return {ok:true,text:async()=>provider};};
 const allowed=async()=>{accessCalls++;if(dbFails)throw Error('DB unavailable');return renewDuringCheck&&accessCalls>1?true:access;};
 const ops=lifecycle({db,telegram,allowed,send:async(id,payload)=>messages.push({id,...payload}),env,fetcher,now:()=>now});
 return {ops,row,calls,messages,env,get job(){return job;}};
}
test('cancellation requires signed expiring confirmation bound to exact Telegram user',async()=>{
 const f=setup(),targets=await f.ops.cancelPrompt(42);
 const data=targets[0].callback.slice(5);assert.ok(Buffer.byteLength(targets[0].callback)<=64);
 assert.equal(f.ops.verifyTicket(42,data),'12345');assert.equal(f.ops.verifyTicket(43,data),null);
 assert.equal(f.ops.verifyTicket(42,f.ops.ticket(42,'12345',Math.floor(now/1000)-1)),null);
 assert.equal((await f.ops.confirmCancellation(43,data)).state,'invalid');
 assert.ok(!f.calls.some(c=>c.url));
});
test('provider receives signed user cancellation for configured plan and owned profile only',async()=>{
 const f=setup();const before=f.row.end_date;
 const result=await f.ops.confirmCancellation(42,f.ops.ticket(42,'12345'));
 assert.equal(result.state,'confirmed');const call=f.calls.find(c=>c.url);
 assert.equal(call.url,'https://merchant.payform.ru/rest/setActivity/');
 const p=Object.fromEntries(new URLSearchParams(call.body));const signature=p.signature;delete p.signature;
 assert.deepEqual(p,{subscription:'3141429',profile:'12345',active_user:'0'});
 assert.equal(signature,signedPayload(p,f.env.NOYA_PRODAMUS_SECRET));
 assert.equal(f.row.status,'active');assert.equal(f.row.end_date,before);assert.ok(f.row.autorenew_cancelled_at);
 assert.equal(f.messages.length,1);assert.match(f.messages[0].text,/Prodamus подтвердил/);
 await f.ops.confirmCancellation(42,f.ops.ticket(42,'12345'));assert.equal(f.calls.filter(c=>c.url).length,1);
});
test('provider HTML/error never confirms cancellation and durable pending job remains',async()=>{
 const f=setup({provider:'<html>login</html>'});const r=await f.ops.confirmCancellation(42,f.ops.ticket(42,'12345'));
 assert.equal(r.state,'pending');assert.equal(f.job.state,'pending');assert.equal(f.row.autorenew_cancelled_at,null);assert.equal(f.messages.length,0);
});
test('retrying the outbox completes cancellation after temporary failure',async()=>{
 const f=setup();await f.ops.confirmCancellation(42,f.ops.ticket(42,'12345'));
 await f.ops.processCancellation(f.job);assert.equal(f.calls.filter(c=>c.url).length,1);
});
test('expired member removed, unbanned for future paid reentry, persisted removed',async()=>{
 const f=setup();assert.equal(await f.ops.removeIfExpired(42),true);
 assert.deepEqual(f.calls.filter(c=>c.method&&c.method!=='POST').map(c=>c.method),['getChatMember','banChatMember','unbanChatMember']);
 assert.ok(f.calls.some(c=>c.path==='rpc/noya_track_channel_member'&&c.body.p_status==='removed'));
 assert.ok(f.calls.some(c=>c.method==='unbanChatMember'&&c.body.only_if_banned===true));
});
test('active/trial entitlement, admins, renewal during scan and DB errors cannot trigger removal',async()=>{
 for(const opts of [{access:true},{memberStatus:'administrator'},{memberStatus:'creator'},{renewDuringCheck:true},{dbFails:true}]){
  const f=setup(opts);await f.ops.removeIfExpired(42).catch(()=>{});assert.ok(!f.calls.some(c=>c.method==='banChatMember'));
 }
});
test('joining through direct/manual invite is checked; other channels ignored',async()=>{
 const f=setup();await f.ops.memberEvent({chat:{id:Number(CHANNEL)},date:now/1000,new_chat_member:{status:'member',user:{id:42}}});
 assert.ok(f.calls.some(c=>c.method==='banChatMember'));
 const other=setup();await other.ops.memberEvent({chat:{id:-1001},date:now/1000,new_chat_member:{status:'member',user:{id:42}}});assert.equal(other.calls.length,0);
});
test('crash after banning is recovered by unban and persisted removal',async()=>{
 const f=setup({memberStatus:'kicked'});await f.ops.removeIfExpired(42);
 assert.ok(f.calls.some(c=>c.method==='unbanChatMember'));assert.ok(!f.calls.some(c=>c.method==='banChatMember'));
});
