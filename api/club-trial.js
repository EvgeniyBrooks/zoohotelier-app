'use strict';
// NOYA CLUB promotional access. Trial passes are never a paid course entitlement.
// Campaign creation requires a verified administrator; redemptions require Telegram identity.
const crypto=require('node:crypto');
const {verifyTelegram}=require('../lib/noya-prodamus');
const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const reply=(res,status,data)=>{res.setHeader('Cache-Control','private,no-store');return res.status(status).json(data)};
async function db(path,options={}){
 const resp=await fetch(base+'/rest/v1/'+path,{...options,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(10000)});
 if(!resp.ok)throw Object.assign(new Error('Database temporarily unavailable'),{status:502});
 return resp.status===204?[]:resp.json();
}
async function findStudent(user,create=false){
 const rows=await db('students?select=id&telegram_id=eq.'+encodeURIComponent(user.id)+'&limit=1');
 if(rows.length)return rows[0].id;
 if(!create)return null;
 const made=await db('students?on_conflict=telegram_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({telegram_id:Number(user.id),first_name:user.first_name,last_name:user.last_name,username:user.username||null})});
 return made[0]?.id||null;
}
module.exports=async(req,res)=>{
 try{
  if(!['GET','POST'].includes(req.method))return reply(res,405,{error:'Method not allowed'});
  if(!base||!key||!process.env.NOYA_TELEGRAM_BOT_TOKEN)return reply(res,503,{error:'Service unavailable'});
  const raw=req.method==='POST'?req.body?.initData:req.headers['x-telegram-init-data'];
  const user=verifyTelegram(raw,process.env.NOYA_TELEGRAM_BOT_TOKEN);
  const student=await findStudent(user,req.method==='POST'&&req.body?.action==='redeem');
  if(req.method==='GET'){
   if(!student)return reply(res,200,{ok:true,trialActive:false,paidActive:false});
   const [trials,subs]=await Promise.all([
    db('noya_club_trials?select=starts_at,ends_at&student_id=eq.'+student+'&limit=1'),
    db('club_subscriptions?select=status,start_date,end_date&student_id=eq.'+student+'&status=eq.active&limit=20')
   ]);
   const now=Date.now();
   const trialActive=trials.some(t=>Date.parse(t.starts_at)<=now&&Date.parse(t.ends_at)>now);
   const paidActive=subs.some(t=>t.status==='active'&&(!t.start_date||Date.parse(t.start_date)<=now)&&(!t.end_date||Date.parse(t.end_date)>now));
   return reply(res,200,{ok:true,trialActive:trialActive&&!paidActive,paidActive,trialEndsAt:trialActive&&!paidActive?trials[0].ends_at:null,courseEnabled:paidActive});
  }
  if(req.body?.action==='redeem'){
   const code=req.body?.code;
   if(typeof code!=='string'||!/^[A-Za-z0-9_-]{12,70}$/.test(code))return reply(res,400,{error:'Invalid promotion link'});
   if(!student)return reply(res,502,{error:'Account unavailable'});
   const response=await fetch(base+'/rest/v1/rpc/noya_club_redeem_trial',{
    method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({p_student_id:student,p_campaign_code:code}),signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Object.assign(new Error('Trial activation unavailable'),{status:502});
   const rows=await response.json();
   const result=rows?.[0];
   if(!result)return reply(res,502,{error:'Invalid trial response'});
   return reply(res,result.applied?200:409,{ok:result.applied,trialActive:result.applied,endsAt:result.ends_at,reason:result.reason});
  }
  if(req.body?.action==='create'){
   const admin=await db('admins?select=id&telegram_id=eq.'+encodeURIComponent(user.id)+'&limit=1');
   if(!admin.length)return reply(res,403,{error:'Administrator only'});
   const title=String(req.body?.title||'Акция NOYA CLUB').trim().slice(0,120);
   const limit=req.body?.maxUses;
   if(!title||!(limit===null||limit===undefined||Number.isSafeInteger(limit)&&limit>0&&limit<=100000))return reply(res,400,{error:'Invalid campaign'});
   const code=crypto.randomBytes(24).toString('base64url');
   const rows=await db('noya_club_trial_campaigns',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({code,title,enabled:true,max_uses:limit||null})});
   return reply(res,200,{ok:true,code:rows[0].code,title,trialHours:48});
  }
  return reply(res,400,{error:'Unknown action'});
 }catch(e){
  if(!e.status)console.error('NOYA trial endpoint',e.message);
  return reply(res,e.status||500,{error:e.status===401?'Open in Telegram':'Unable to process trial'});
 }
};