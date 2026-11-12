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
// Prodamus's default initial-payment notification is multipart/form-data, while
// subscription notifications can be JSON or urlencoded. Vercel may leave a
// multipart body raw, so normalize it before checking the provider signature.
async function parseProviderBody(req){
 const type=String(req.headers?.['content-type']||'');
 if(!/^multipart\/form-data/i.test(type))return toObject(req.body);
 const boundaryMatch=/boundary=(?:"([^"\r\n]+)"|([^;\s]+))/i.exec(type);
 const boundary=boundaryMatch?.[1]||boundaryMatch?.[2];
 if(!boundary||boundary.length>80)throw Object.assign(new Error('Invalid multipart boundary'),{status:400});
 let body=req.body;
 if(body===undefined||body===null){
  const chunks=[];let size=0;
  for await(const chunk of req){
   size+=Buffer.byteLength(chunk);
   if(size>120000)throw Object.assign(new Error('Callback too large'),{status:413});
   chunks.push(Buffer.from(chunk));
  }
  body=Buffer.concat(chunks);
 }
 if(body && !Buffer.isBuffer(body) && typeof body==='object')return toObject(body);
 const raw=Buffer.isBuffer(body)?body.toString('utf8'):String(body||'');
 if(Buffer.byteLength(raw)>120000)throw Object.assign(new Error('Callback too large'),{status:413});
 const parts=raw.split('--'+boundary),flat={};
 for(const part of parts){
  if(!part||part==='--\r\n'||part==='--')continue;
  const line=part.startsWith('\r\n')?part.slice(2):part;
  const split=line.indexOf('\r\n\r\n');
  if(split<0)continue;
  const header=line.slice(0,split),match=/content-disposition:\s*form-data;\s*name="([^"]{1,180})"/i.exec(header);
  if(!match||/filename\s*=/i.test(header))throw Object.assign(new Error('Unsupported multipart part'),{status:400});
  let value=line.slice(split+4);
  if(value.endsWith('\r\n'))value=value.slice(0,-2);
  if(Object.prototype.hasOwnProperty.call(flat,match[1]))throw Object.assign(new Error('Duplicated form field'),{status:400});
  flat[match[1]]=value;
 }
 return parseNestedForm(flat);
}
module.exports=async function handler(req,res){
 if(req.method!=='POST'){res.setHeader('Allow','POST');return text(res,405,'Method not allowed');}
 try{
  const form=configuredPayformURL(process.env.NOYA_PRODAMUS_FORM_URL);
  if(process.env.NOYA_PRODAMUS_ENABLE!=='1'||!form||!KEY||!SUPABASE||!process.env.NOYA_PRODAMUS_SECRET)
   return text(res,503,'Club payment handler not configured');
  // Prodamus may provide the HMAC in the Sign header or sign form field.
  // It also wraps some JSON callbacks in a signed "submit" object.
  const posted=await parseProviderBody(req);
  const signature=req.headers.sign||req.headers.Sign||posted.sign;
  const unsigned={...posted};
  delete unsigned.sign;
  const wrapped=unsigned.submit&&typeof unsigned.submit==='object'&&!Array.isArray(unsigned.submit)?unsigned.submit:null;
  const rootValid=checkSignature(unsigned,signature,process.env.NOYA_PRODAMUS_SECRET);
  const nestedValid=wrapped&&checkSignature(wrapped,signature,process.env.NOYA_PRODAMUS_SECRET);
  if(!rootValid&&!nestedValid)return text(res,403,'Invalid signature');
  const body=nestedValid?wrapped:wrapped||unsigned;
  const domain=str(body.domain).toLowerCase();
  if(domain!==form.hostname)return text(res,403,'Unexpected payform domain');
  const subscription=body.subscription&&typeof body.subscription==='object'?body.subscription:null;
  const providerId=str(subscription?.id);
  const orderNumber=str(body.order_num);
  // Only a verified NOYA checkout order or an existing club subscription may
  // be applied by the private database transaction.
  const status=str(body.payment_status).toLowerCase();
  if(/^noya-[0-9a-f-]{36}$/i.test(orderNumber)){
   // Log only non-sensitive shape for diagnosis. No email, phone or Sign.
   console.info('NOYA signed first-payment callback',JSON.stringify({
    hasSubscriptionId:/^[0-9]{1,30}$/.test(providerId),isSuccess:status==='success',
    hasOrderId:!!str(body.order_id),fieldNames:Object.keys(body).filter(
     k=>!/(phone|email|customer|card|token|sign|extra)/i.test(k)).slice(0,30)
   }));
  }
  const signedRecurringSuccess=!status && str(subscription?.type)==='action'
    && str(subscription?.action_code)==='auto_payment'
    && str(subscription?.autopayment)==='1'
    && Number(str(subscription?.payment_num))>=2
    && !str(subscription?.error_code);
  if(status!=='success' && !signedRecurringSuccess)return text(res,200,'success');
  const paymentId=str(body.order_id);
  const amount=Number(str(body.sum).replace(',','.'));
  const currency=str(body.currency||subscription?.currency||'rub').toLowerCase();
  const paidAt=Date.parse(str(body.date));
  if(!/^[0-9]{1,40}$/.test(paymentId)||!Number.isFinite(amount)||amount<=0||amount>1000000||currency!=='rub'||!Number.isFinite(paidAt))
   return text(res,400,'Invalid payment data');
  if(/^noya-demo-[0-9a-f-]{36}$/i.test(orderNumber)){
   // Prodamus test payments must NEVER unlock real membership or count for gifts.
   if(process.env.NOYA_PRODAMUS_TEST_MODE!=='1')return text(res,200,'success');
   const plan=str(process.env.NOYA_PRODAMUS_SUBSCRIPTION_ID);
   const testResult=await fetch(SUPABASE+'/rest/v1/noya_club_checkout_intents?order_num=eq.'+
     encodeURIComponent(orderNumber)+'&is_demo=eq.true&provider_plan_id=eq.'+
     encodeURIComponent(plan)+'&status=eq.pending',{
    method:'PATCH',
    headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json',Prefer:'return=representation'},
    body:JSON.stringify({status:'demo_paid',paid_at:new Date(paidAt).toISOString()}),
    cache:'no-store',signal:AbortSignal.timeout(12000)
   });
   if(!testResult.ok)throw Object.assign(new Error('Failed to store demo receipt'),{status:502});
   const updated=await testResult.json().catch(()=>null);
   if(!Array.isArray(updated))throw Object.assign(new Error('Unexpected demo receipt response'),{status:502});
   if(updated.length)console.info('NOYA Prodamus: verified demo callback, no real club access issued');
   return text(res,200,'success');
  }
  // Don't accept demo-tagged callbacks for a real subscription without an order.
  if(str(body.demo_mode)==='1')return text(res,200,'success');
  if(!providerId || !/^[0-9]{1,30}$/.test(providerId)){
   if(status==='success'&&/^noya-[0-9a-f-]{36}$/i.test(orderNumber))
    return text(res,503,'Awaiting Prodamus subscription identifier');
   return text(res,200,'success');
  }
  // Prodamus often sends date_next_payment without TZ: don't guess time zone.
  let nextPayment=null;
  const rawNext=str(subscription?.date_next_payment);
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
