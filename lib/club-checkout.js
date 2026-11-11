'use strict';
// NOYA CLUB recurring subscription checkout. Entirely separate from course payments.
// Disabled unless operator explicitly configures and enables the Prodamus club product.
const crypto=require('node:crypto');
const {verifyTelegram,signedPayload,configuredPayformURL,safePaymentLink}=require('./noya-prodamus');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
function config(){
 const form=configuredPayformURL(process.env.NOYA_PRODAMUS_FORM_URL);
 const product=process.env.NOYA_PRODAMUS_SUBSCRIPTION_ID;
 // Subscription-specific notifications are configured directly in the Prodamus
 // "Подписки" settings, without overriding the existing course notification URL.
 let safeTerms=false;
 try{const terms=new URL(process.env.NOYA_CLUB_TERMS_URL);safeTerms=terms.protocol==='https:'&&!terms.username&&!terms.password;}catch{}
 return {form,product,
  enabled:process.env.NOYA_PRODAMUS_ENABLE==='1'&&!!form&&/^\d{1,15}$/.test(product||'')&&!!process.env.NOYA_PRODAMUS_SECRET&&safeTerms&&/^\d{1,6}$/.test(process.env.NOYA_CLUB_PRICE_RUB||'')};
}
function response(res,status,data){res.setHeader('Cache-Control','private, no-store, max-age=0');return res.status(status).json(data);}
function headers(){return {apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'};}
async function rows(path,options={}){
 const r=await fetch(url+'/rest/v1/'+path,{...options,headers:{...headers(),...(options.headers||{})},cache:'no-store'});
 const json=await r.json().catch(()=>null);
 if(!r.ok||!Array.isArray(json))throw Object.assign(new Error('Database unavailable'),{status:502});
 return json;
}
async function studentFromTelegram(user){
 const current=await rows('students?select=id&telegram_id=eq.'+encodeURIComponent(user.id)+'&limit=1');
 if(current.length)return current[0].id;
 const created=await rows('students?on_conflict=telegram_id',{
  method:'POST',
  headers:{Prefer:'resolution=merge-duplicates,return=representation'},
  body:JSON.stringify({telegram_id:Number(user.id),first_name:user.first_name,last_name:user.last_name,username:user.username||null})
 });
 if(!created[0]?.id)throw Object.assign(new Error('Student creation failed'),{status:502});
 return created[0].id;
}
module.exports=async function handler(req,res){
 const cfg=config();
 if(req.method==='GET'&&req.query?.status==='1'){
  return response(res,200,{ok:true,enabled:cfg.enabled,priceRub:cfg.enabled?Number(process.env.NOYA_CLUB_PRICE_RUB):null,termsUrl:cfg.enabled?process.env.NOYA_CLUB_TERMS_URL:null});
 }
 if(req.method!=='POST'){res.setHeader('Allow','POST,GET');return response(res,405,{error:'Method not allowed'});}
 try{
  if(!cfg.enabled)return response(res,503,{error:'Club payments are not configured yet'});
  if(req.body?.acceptedTerms!==true)return response(res,400,{error:'Explicit agreement required'});
  if(!url||!service)throw Object.assign(new Error('Database unavailable'),{status:503});
  const user=verifyTelegram(req.body?.initData,process.env.NOYA_TELEGRAM_BOT_TOKEN);
  const studentId=await studentFromTelegram(user);
  const id=crypto.randomUUID();
  const order='noya-'+id;
  const intent=await rows('noya_club_checkout_intents',{
   method:'POST',headers:{Prefer:'return=representation'},
   body:JSON.stringify({id,student_id:studentId,order_num:order,provider_plan_id:cfg.product,status:'pending'})
  });
  if(intent[0]?.order_num!==order)throw Object.assign(new Error('Order creation failed'),{status:502});
  const data={
   do:'link', type:'json', subscription:cfg.product, order_id:order,currency:'rub'
  };
  const returnUrl=process.env.NOYA_CLUB_RETURN_URL;
  if(returnUrl){
   const u=new URL(returnUrl);
   if(u.protocol!=='https:')throw Error('Invalid return URL');
   data.urlReturn=u.href;
   data.urlSuccess=u.href;
  }
  data.signature=signedPayload(data,process.env.NOYA_PRODAMUS_SECRET);
  const upstream=await fetch(cfg.form.href,{method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams(data).toString(),
   redirect:'manual',
   signal:AbortSignal.timeout(12000)
  });
  const raw=(await upstream.text()).trim();
  let link=raw;
  try{const parsed=JSON.parse(raw);link=parsed.url||parsed.link||parsed.payment_url||raw;}catch{}
  const safe=safePaymentLink(link);
  if(!upstream.ok||!safe)throw Object.assign(new Error('Checkout link unavailable'),{status:502});
  return response(res,200,{ok:true,checkoutUrl:safe});
 }catch(err){
  console.error('NOYA checkout:',err.status||500,err.message);
  return response(res,err.status||502,{error:err.status===401?'Open club through Telegram':'Unable to start payment'});
 }
};
