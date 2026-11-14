'use strict';
// NOYA CLUB: extra one-off video reviews. NO REAL PAYMENTS until a separate
// verified Prodamus one-time-payment integration is enabled.
const {verifyTelegram}=require('../lib/noya-prodamus');
const SERVICES=Object.freeze({
 kinolog:{name:'Проверка домашнего задания кинологом',priceRub:1490,deadline:'До 72 часов'},
 evgeniy:{name:'Личный видеоразбор с Евгением Бруксом',priceRub:5900,deadline:'До 5 рабочих дней'}
});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UID=/^[0-9a-f]{32}$/i;
const DB=()=>process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY=()=>process.env.SUPABASE_SERVICE_ROLE_KEY;
const CF=()=>process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN=()=>process.env.CLOUDFLARE_API_TOKEN;
const payload=(res,status,body)=>{res.setHeader('Cache-Control','private, no-store');return res.status(status).json(body);};
function fail(status,message){return Object.assign(new Error(message),{status});}
function serviceHeaders(){return {apikey:KEY(),Authorization:'Bearer '+KEY(),'Content-Type':'application/json'};}
async function db(path,method='GET',body=null,prefer=null){
 const headers=serviceHeaders();if(prefer)headers.Prefer=prefer;
 const response=await fetch(DB()+'/rest/v1/'+path,{method,headers,
  ...(body!==null?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!response.ok){
  const problem=await response.json().catch(()=>null);
  console.error('NOYA shop DB',response.status,String(problem?.code||'').slice(0,20));
  throw fail(502,'Database unavailable');
 }
 if(response.status===204)return [];
 const raw=await response.text();
 if(!raw.trim())return [];
 try{return JSON.parse(raw);}catch{throw fail(502,'Unexpected database response');}
}
async function cloudflare(path,method='GET',body=null){
 if(!CF()||!TOKEN())throw fail(503,'Video service is not configured');
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(CF())+'/stream/'+path,{
  method,headers:{Authorization:'Bearer '+TOKEN(),'Content-Type':'application/json'},
  ...(body!==null?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data?.success)throw fail(502,'Video service unavailable');
 return data.result;
}
async function identity(req){
 const raw=req.method==='GET'?req.headers?.['x-telegram-init-data']:req.body?.initData;
 const user=verifyTelegram(raw,process.env.NOYA_TELEGRAM_BOT_TOKEN);
 const id=encodeURIComponent(user.id);
 const [students,admins,staff]=await Promise.all([
  db('students?select=id&telegram_id=eq.'+id+'&limit=1'),
  db('admins?select=id&telegram_id=eq.'+id+'&limit=1'),
  db('noya_review_staff?select=role,enabled&telegram_id=eq.'+id+'&limit=1')
 ]);
 const student=students[0]?.id||null;
 const admin=admins.length>0;
 const role=staff[0]?.enabled===true?staff[0].role:null;
 return {user,student,admin,role};
}
async function hasClub(identity){
 if(identity.admin)return true;
 if(!identity.student)return false;
 const sid=encodeURIComponent(identity.student);
 const [subscriptions,trials]=await Promise.all([
  db('club_subscriptions?select=start_date,end_date,status&student_id=eq.'+sid+'&status=eq.active&limit=20'),
  db('noya_club_trials?select=starts_at,ends_at&student_id=eq.'+sid+'&limit=10')
 ]);
 const now=Date.now();
 return subscriptions.some(r=>r.status==='active'&&(!r.start_date||Date.parse(r.start_date)<=now)&&(!r.end_date||Date.parse(r.end_date)>now))
  ||trials.some(r=>Date.parse(r.starts_at)<=now&&Date.parse(r.ends_at)>now);
}
function catalog(auth){
 return Object.entries(SERVICES).map(([code,v])=>({code,...v,
  // Shop orders cannot be sold before one-off Prodamus confirmations work.
  purchaseEnabled:false,adminTestEnabled:auth.admin}));
}
function clean(row,viewer){
 return {id:row.id,serviceCode:row.service_code,priceRub:row.price_rub,status:row.status,
  isTest:row.is_test,problemText:row.problem_text||'',reviewText:row.status==='completed'?row.review_text||'':'',
  hasSubmission:!!row.video_uid,hasReplyVideo:row.status==='completed'&&!!row.review_video_uid,
  createdAt:row.created_at,submittedAt:row.submitted_at,completedAt:row.completed_at,
  ...(viewer.admin||viewer.role?{studentId:row.student_id}: {})};
}
function entitled(auth,row){
 if(auth.admin)return true;
 if(auth.student===row.student_id)return true;
 return Boolean(auth.role&&auth.role===row.service_code);
}
function isReviewer(auth,row){return auth.admin||auth.role===row.service_code;}
async function orderById(id,auth){
 if(typeof id!=='string'||!UUID.test(id))throw fail(400,'Invalid order ID');
 const rows=await db('noya_review_orders?select=*&id=eq.'+encodeURIComponent(id)+'&limit=1');
 if(!rows[0])throw fail(404,'Order not found');
 if(!entitled(auth,rows[0]))throw fail(403,'Order access denied');
 return rows[0];
}
async function patchOrder(row,updates,allowedStatuses){
 const filter=allowedStatuses.map(x=>encodeURIComponent(x)).join(',');
 const updated=await db('noya_review_orders?id=eq.'+row.id+'&status=in.('+filter+')',
  'PATCH',{...updates,updated_at:new Date().toISOString()},'return=representation');
 if(updated.length!==1)throw fail(409,'Order was changed, refresh its status');
 return updated[0];
}
async function event(row,auth,kind){
 // Events are best-effort, never create a paid entitlement.
 await db('noya_review_order_events','POST',{order_id:row.id,actor_telegram_id:Number(auth.user.id),event_type:kind},'return=minimal');
}
async function videoReady(uid){
 const result=await cloudflare(encodeURIComponent(uid));
 return result?.readyToStream===true ||result?.status?.state==='ready';
}
async function ensureReferralStudent(auth){
 if(auth.student)return auth.student;
 const created=await db('students?on_conflict=telegram_id','POST',{
  telegram_id:Number(auth.user.id),first_name:auth.user.first_name,
  last_name:auth.user.last_name,username:auth.user.username||null
 },'resolution=merge-duplicates,return=representation');
 if(!created[0]?.id)throw fail(502,'Could not create invited member');
 auth.student=created[0].id;
 return auth.student;
}
async function coinWallet(auth){
 if(!auth.student)throw fail(403,'Club account required');
 if(!(await hasClub(auth)))throw fail(403,'Active club or trial required');
 const rpc=await db('rpc/noya_coin_sync','POST',{p_student_id:auth.student});
 const wallet=rpc?.[0]||{balance:0,lifetime_earned:0,lifetime_spent:0};
 const [items,redemptions,history,referrals]=await Promise.all([
  db('noya_coin_store_items?select=code,title,description,cost,content,sort_order&enabled=eq.true&order=sort_order.asc&limit=50'),
  db('noya_coin_redemptions?select=item_code,paid_coins,created_at&student_id=eq.'+auth.student+'&limit=100'),
  db('noya_coin_ledger?select=coins,reason,created_at&student_id=eq.'+auth.student+'&order=created_at.desc&limit=20'),
  db('rpc/noya_referral_ensure_code','POST',{p_student_id:auth.student})
 ]);
 const owned=new Set(redemptions.map(x=>x.item_code));
 return {
  balance:Number(wallet.balance)||0,
  earned:Number(wallet.lifetime_earned)||0,
  spent:Number(wallet.lifetime_spent)||0,
  currency:'НОИНКОИНЫ',
  referral:{
   code:referrals[0]?.referral_code||'',
   pending:Number(referrals[0]?.pending_count)||0,
   rewarded:Number(referrals[0]?.rewarded_count)||0,
   coinsPerConfirmedPayment:500
  },
  earningRules:[{event:'Каждая подтверждённая оплата приглашённого друга (2 900 ₽)',coins:500}],
  // Never expose the digital bonus content until its redemption is recorded.
  items:items.map(x=>({code:x.code,title:x.title,description:x.description,cost:x.cost,
   owned:owned.has(x.code),...(owned.has(x.code)?{content:x.content}:{})})),
  history
 };
}
async function redeemCoins(auth,code){
 if(!auth.student||!(await hasClub(auth)))throw fail(403,'Active club required');
 if(typeof code!=='string'||!/^[a-z0-9_]{3,50}$/.test(code))throw fail(400,'Invalid item code');
 // Private SQL RPC debits the wallet and records the unlock in a single transaction.
 const url=DB()+'/rest/v1/rpc/noya_coin_redeem';
 const resp=await fetch(url,{method:'POST',headers:serviceHeaders(),
  body:JSON.stringify({p_student_id:auth.student,p_item_code:code}),
  cache:'no-store',signal:AbortSignal.timeout(12000)});
 if(!resp.ok){
  const problem=await resp.json().catch(()=>null);
  if(resp.status===400&&String(problem?.message||'').includes('Not enough NOINCOINS'))
   throw fail(409,'Недостаточно НОИНКОИНОВ');
  if(resp.status===400&&String(problem?.message||'').includes('Active membership required'))
   throw fail(403,'Активная подписка необходима для покупки');
  if(resp.status===400&&String(problem?.message||'').includes('Item unavailable'))
   throw fail(404,'Бонус сейчас недоступен');
  throw fail(502,'Coin purchase unavailable');
 }
 const data=await resp.json().catch(()=>null);
 if(!Array.isArray(data)||data.length!==1||typeof data[0].applied!=='boolean')
  throw fail(502,'Unexpected coin purchase response');
 return {applied:data[0].applied,wallet:await coinWallet(auth)};
}

async function notifyReviewReady(row){
 // A completed review must remain available even if a Telegram message fails.
 try{
  const recipients=await db('students?select=telegram_id&id=eq.'+encodeURIComponent(row.student_id)+'&limit=1');
  const telegramId=recipients[0]?.telegram_id;
  if(!telegramId)return;
  const token=process.env.NOYA_TELEGRAM_BOT_TOKEN;
  const resp=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({
    chat_id:telegramId,
    text:(row.is_test?'[ТЕСТ] ':'')+'NOYA CLUB: персональный разбор готов! Открой клуб → Магазин → Мои разборы.',
    disable_web_page_preview:true
   }),signal:AbortSignal.timeout(8000)
  });
  if(!resp.ok)console.warn('NOYA shop Telegram notification HTTP',resp.status);
 }catch(error){console.warn('NOYA shop Telegram notification unavailable');}
}
module.exports=async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','POST'].includes(req.method))return payload(res,405,{error:'Method not allowed'});
 try{
  if(!DB()||!KEY()||!process.env.NOYA_TELEGRAM_BOT_TOKEN)throw fail(503,'Shop unavailable');
  const auth=await identity(req);
  const action=String(req.method==='GET'?req.query?.action||'catalog':req.body?.action||'').slice(0,50);
  if(req.method==='GET'){
   if(action==='catalog'){
    if(!(await hasClub(auth))&&!auth.role)throw fail(403,'Club access required');
    return payload(res,200,{ok:true,services:catalog(auth),paymentsEnabled:false,adminPreview:auth.admin,reviewer:auth.admin||!!auth.role});
   }
   if(action==='coins'){
    const wallet=await coinWallet(auth);
    return payload(res,200,{ok:true,...wallet});
   }
   if(action==='orders'){
    if(!auth.student)throw fail(403,'Account not found');
    const rows=await db('noya_review_orders?select=*&student_id=eq.'+auth.student+'&order=created_at.desc&limit=100');
    return payload(res,200,{ok:true,orders:rows.map(x=>clean(x,auth))});
   }
   if(action==='queue'){
    if(!auth.admin&&!auth.role)throw fail(403,'Reviewer access required');
    const filter=auth.admin?'':'&service_code=eq.'+encodeURIComponent(auth.role);
    const rows=await db('noya_review_orders?select=*&status=in.(awaiting_video,uploading,submitted,in_review,completed)&order=created_at.desc&limit=100'+filter);
    return payload(res,200,{ok:true,orders:rows.map(x=>clean(x,auth))});
   }
   if(action==='staff'){
    if(!auth.admin)throw fail(403,'Administrator only');
    const staff=await db('noya_review_staff?select=telegram_id,role,enabled,created_at&order=created_at.desc&limit=100');
    return payload(res,200,{ok:true,staff});
   }
   if(action==='video'){
    const row=await orderById(req.query?.id,auth);
    const kind=req.query?.kind==='reply'?'reply':req.query?.kind==='submission'?'submission':null;
    if(!kind)throw fail(400,'Invalid video kind');
    if(kind==='reply'&&row.status!=='completed'&&!isReviewer(auth,row))throw fail(403,'Review not finished');
    const uid=kind==='reply'?row.review_video_uid:row.video_uid;
    if(!uid||!UID.test(uid))throw fail(404,'Video not found');
    const signed=await cloudflare(encodeURIComponent(uid)+'/token','POST',{exp:Math.floor(Date.now()/1000)+900,downloadable:false});
    if(!signed?.token)throw fail(502,'Video authorization failed');
    return payload(res,200,{ok:true,playerUrl:'https://customer-9y0wom20nneqpu4g.cloudflarestream.com/'+encodeURIComponent(signed.token)+'/iframe'});
   }
   throw fail(400,'Unknown action');
  }
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body))throw fail(400,'Invalid request');
  if(action==='referral_claim'){
   const code=req.body.referralCode;
   if(typeof code!=='string'||!/^[a-f0-9]{24}$/.test(code))throw fail(400,'Invalid referral code');
   // Telegram initData is verified in identity(). The recipient cannot
   // choose whose student account receives referral attribution.
   const studentId=await ensureReferralStudent(auth);
   const results=await db('rpc/noya_referral_claim','POST',{
    p_referred_student_id:studentId,p_code:code
   });
   const claim=results?.[0];
   if(!claim||typeof claim.applied!=='boolean')throw fail(502,'Referral claim unavailable');
   return payload(res,200,{ok:true,applied:claim.applied,reason:claim.reason});
  }
  if(action==='coin_redeem'){
   const result=await redeemCoins(auth,req.body.itemCode);
   return payload(res,200,{ok:true,...result});
  }
  if(action==='test_create'){
   if(!auth.admin||!auth.student)throw fail(403,'Administrator only');
   const service=req.body.serviceCode;
   if(!Object.hasOwn(SERVICES,service))throw fail(400,'Invalid service');
   const rows=await db('noya_review_orders','POST',{
    student_id:auth.student,service_code:service,price_rub:SERVICES[service].priceRub,
    status:'awaiting_video',is_test:true},'return=representation');
   if(!rows[0])throw fail(502,'Could not create test order');
   await event(rows[0],auth,'test_created');
   return payload(res,201,{ok:true,order:clean(rows[0],auth)});
  }
  if(action==='staff_set'){
   if(!auth.admin)throw fail(403,'Administrator only');
   const id=String(req.body.telegramId||'');
   const role=req.body.role;
   if(!/^[1-9]\d{4,15}$/.test(id)||!Object.hasOwn(SERVICES,role))throw fail(400,'Invalid staff member');
   const rows=await db('noya_review_staff?on_conflict=telegram_id','POST',
    {telegram_id:Number(id),role,enabled:req.body.enabled!==false},
    'resolution=merge-duplicates,return=representation');
   if(!rows[0])throw fail(502,'Could not update specialist');
   return payload(res,200,{ok:true,staff:{telegramId:id,role,enabled:rows[0].enabled}});
  }
  if(action==='upload_start'){
   const row=await orderById(req.body.orderId,auth);
   const kind=req.body.kind==='reply'?'reply':req.body.kind==='submission'?'submission':null;
   if(!kind)throw fail(400,'Invalid video kind');
   if(kind==='submission'&&!(row.student_id===auth.student||auth.admin))throw fail(403,'Order owner only');
   if(kind==='reply'&&!isReviewer(auth,row))throw fail(403,'Reviewer only');
   if(kind==='submission'&&!['awaiting_video','uploading'].includes(row.status))throw fail(409,'Video cannot be replaced now');
   if(kind==='reply'&&!['submitted','in_review'].includes(row.status))throw fail(409,'Review is not active');
   const count=await db('noya_review_order_events?select=id&order_id=eq.'+row.id+'&event_type=eq.'+
    (kind==='reply'?'reply_upload_link':'upload_link')+'&created_at=gte.'+
    encodeURIComponent(new Date(Date.now()-86400000).toISOString())+'&limit=5');
   if(count.length>=5)throw fail(429,'Daily upload limit reached');
   const output=await cloudflare('direct_upload','POST',{
    maxDurationSeconds:120,expiry:new Date(Date.now()+30*60000).toISOString(),
    requireSignedURLs:true,creator:'noya-'+row.student_id.slice(0,24),
    meta:{kind:'noya-review-'+kind,orderId:row.id}
   });
   if(!UID.test(output?.uid||'')||typeof output.uploadURL!=='string')throw fail(502,'Invalid upload response');
   const upload=new URL(output.uploadURL);
   if(upload.protocol!=='https:'||upload.username||upload.password||
    !['upload.videodelivery.net','upload.cloudflarestream.com'].includes(upload.hostname))
    throw fail(502,'Invalid upload destination');
   const updates=kind==='reply'?{review_video_uid:output.uid,review_video_upload_started_at:new Date().toISOString()}:
    {video_uid:output.uid,video_upload_started_at:new Date().toISOString(),status:'uploading'};
   await patchOrder(row,updates,kind==='reply'?['submitted','in_review']:['awaiting_video','uploading']);
   await event(row,auth,kind==='reply'?'reply_upload_link':'upload_link');
   return payload(res,200,{ok:true,uploadUrl:upload.href,maxDurationSeconds:120,maxSizeMb:190});
  }
  if(action==='upload_finish'){
   const row=await orderById(req.body.orderId,auth);
   const kind=req.body.kind==='reply'?'reply':req.body.kind==='submission'?'submission':null;
   if(!kind)throw fail(400,'Invalid video kind');
   if(kind==='submission'&&row.student_id!==auth.student&&!auth.admin)throw fail(403,'Order owner only');
   if(kind==='reply'&&!isReviewer(auth,row))throw fail(403,'Reviewer only');
   const uid=kind==='reply'?row.review_video_uid:row.video_uid;
   if(!uid||!UID.test(uid))throw fail(409,'No video uploaded');
   if(!(await videoReady(uid)))return payload(res,202,{ok:true,processing:true});
   if(kind==='submission'){
    if(row.status==='submitted'||row.status==='in_review')return payload(res,200,{ok:true,status:row.status});
    if(row.status!=='uploading')throw fail(409,'Video submission already closed');
    const problem=String(req.body.problemText||'').trim();
    if(problem.length<5||problem.length>1500)throw fail(400,'Describe the issue in 5–1500 characters');
    const saved=await patchOrder(row,{problem_text:problem,status:'submitted',submitted_at:new Date().toISOString()},['uploading']);
    await event(row,auth,'video_submitted');
    return payload(res,200,{ok:true,status:saved.status});
   }
   return payload(res,200,{ok:true,status:row.status,replyVideoReady:true});
  }
  if(action==='review_start'){
   const row=await orderById(req.body.orderId,auth);
   if(!isReviewer(auth,row))throw fail(403,'Reviewer only');
   if(!['submitted','in_review'].includes(row.status))throw fail(409,'Not ready for review');
   const updated=row.status==='submitted'?await patchOrder(row,{status:'in_review'},['submitted']):row;
   if(row.status==='submitted')await event(row,auth,'review_started');
   return payload(res,200,{ok:true,order:clean(updated,auth)});
  }
  if(action==='review_complete'){
   const row=await orderById(req.body.orderId,auth);
   if(!isReviewer(auth,row))throw fail(403,'Reviewer only');
   if(!['submitted','in_review'].includes(row.status))throw fail(409,'Not ready for review');
   const review=String(req.body.reviewText||'').trim();
   if(review.length<20||review.length>4000)throw fail(400,'Review must be 20–4000 characters');
   if(row.review_video_uid && !(await videoReady(row.review_video_uid)))throw fail(409,'Reply video still processing');
   const updated=await patchOrder(row,{
    review_text:review,status:'completed',completed_at:new Date().toISOString(),
    reviewed_by_telegram_id:Number(auth.user.id)
   },['submitted','in_review']);
   await event(row,auth,'review_finished');
   await notifyReviewReady(updated);
   return payload(res,200,{ok:true,order:clean(updated,auth)});
  }
  throw fail(400,'Unknown action');
 }catch(error){
  if(![400,401,403,404,409,429].includes(error.status))
   console.error('NOYA shop',error.status||500,error.message);
  return payload(res,error.status||500,{error:error.status&&error.status<500?error.message:'Shop temporarily unavailable'});
 }
};