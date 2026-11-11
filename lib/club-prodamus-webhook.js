'use strict';
// Independent signed Prodamus callback for NOYA CLUB only.
// Never point an existing course callback at this handler without a routing layer.
const {checkSignature,parseNestedForm,configuredPayformURL}=require('./noya-prodamus');
const SUPABASE=process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY=process.env.SUPABASE_SERVICE_ROLE_KEY;
function text(res,code,message){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/plain; charset=utf-8');
 return res.status(code).send(message);
}
function toObject(body){
 if(typeof body==='string'||(body&&typeof body==='object'&&!Array.isArray(body))){
  if(body&&typeof body==='object'&&Object.values(body).some(v=>v&&typeof v==='object'))
   return body;
  return parseNestedForm(body);
 }
 throw Object.assign(new Error('Invalid payload'),{status:400});
}
function str(v){return v===null||v===undefined?'':String(v).trim();}
module.exports=async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return text(res,405,'Method not allowed');}
 try{
  const form=configuredPayformURL(process.env.NOYA_PRODAMUS_FORM_URL);
  if(process.env.NOYA_PRODAMUS_ENABLE!=='1'||!form||!KEY||!SUPABASE||!process.env.NOYA_PRODAMUS_SECRET)
   return text(res,503,'Club payment handler not configured');
  const body=toObject(req.body);
  const header=req.headers.sign || req.headers.Sign;
  if(!checkSignature(body,header,process.env.NOYA_PRODAMUS_SECRET))
   return text(res,403,'Invalid signature');
  const domain=str(body.domain).toLowerCase();
  if(domain!==form.hostname)return text(res,403,'Unexpected payform domain');
  const subscription=body.subscription&&typeof body.subscription==='object'?body.subscription:null;
  const providerId=str(subscription?.id);
  const orderNumber=str(body.order_num);
  // Only the club's signed checkout orders or previously recorded subscription IDs
  // can be applied by the database transaction. Any unrelated course payment is ignored.
  if(!providerId || !/^[0-9]{1,30}$/.test(providerId))return text(res,200,'success');
  const status=str(body.payment_status).toLowerCase();
  const signedRecurringSuccess=!status && str(subscription?.type)==='action'
    && str(subscription?.action_code)==='auto_payment'
    && str(subscription?.autopayment)==='1'
    && Number(str(subscription?.payment_num))>=2
    && !str(subscription?.error_code);
  if(status!=='success' && !signedRecurringSuccess)return text(res,200,'success');
  const paymentId=str(body.order_id);
  const amount=Number(str(body.sum).replace(',','.'));
  const currency=str(body.currency||subscription.currency||'rub').toLowerCase();
  const paidAt=Date.parse(str(body.date));
  if(!/^[0-9]{1,40}$/.test(paymentId)||!Number.isFinite(amount)||amount<=0||amount>1000000||currency!=='rub'||!Number.isFinite(paidAt))
   return text(res,400,'Invalid payment data');
  // Prodamus often sends date_next_payment without TZ: don't guess time zone.
  let nextPayment=null;
  const rawNext=str(subscription.date_next_payment);
  if(/(?:Z|[+-]\d{2}:\d{2})$/i.test(rawNext)&&Number.isFinite(Date.parse(rawNext)))nextPayment=new Date(rawNext).toISOString();
  const rest=await fetch(SUPABASE+'/rest/v1/rpc/noya_club_record_confirmed_payment',{
   method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},
   body:JSON.stringify({
    p_order_num:orderNumber,p_provider_subscription_id:providerId,p_payment_id:paymentId,
    p_amount:amount,p_paid_at:new Date(paidAt).toISOString(),p_next_payment_at:nextPayment
   }),cache:'no-store',signal:AbortSignal.timeout(12000)
  });
  if(!rest.ok)throw Object.assign(new Error('Failed to record club payment'),{status:502});
  const data=await rest.json().catch(()=>null);
  if(!Array.isArray(data)||!data[0]||typeof data[0].applied!=='boolean')
   throw Object.assign(new Error('Unexpected payment confirmation'),{status:502});
  return text(res,200,'success');
 }catch(error){
  console.error('NOYA Prodamus webhook:',error.status||500,error.message);
  return text(res,error.status||400,'Callback validation failed');
 }
};
