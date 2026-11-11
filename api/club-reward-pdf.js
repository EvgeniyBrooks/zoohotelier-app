// Secure NOYA CLUB PDF reward: requires verified Telegram identity, an active club
// subscription and two DISTINCT verified monthly Prodamus club payments.
// This file never exposes the Storage service key or a permanent public file URL.
const crypto = require('crypto');
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOT_TOKEN = process.env.NOYA_TELEGRAM_BOT_TOKEN;
const BUCKET = 'club-rewards';
const FILE = '101TRYK_optimized.pdf.pdf';
const SUCCESS = new Set(['paid','success','succeeded']);
const CLUB_PRODUCTS = new Set(['club','club_subscription','noya_club','noya-club']);

function authorizedTelegram(initData) {
  if (typeof initData !== 'string' || !initData || initData.length > 8192 || !BOT_TOKEN) {
    throw Object.assign(new Error('Telegram authentication required'), {status:401});
  }
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const stamp = Number(params.get('auth_date'));
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash) || !Number.isFinite(stamp)
      || Math.abs(Date.now()/1000-stamp) > 86400) {
    throw Object.assign(new Error('Telegram authorization expired'), {status:401});
  }
  params.delete('hash');
  const check = [...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
  const secret = crypto.createHmac('sha256','WebAppData').update(BOT_TOKEN).digest();
  const digest = crypto.createHmac('sha256',secret).update(check).digest();
  if (!crypto.timingSafeEqual(digest,Buffer.from(hash,'hex'))) {
    throw Object.assign(new Error('Telegram verification failed'),{status:401});
  }
  let user;
  try { user = JSON.parse(params.get('user')||'{}'); }
  catch { throw Object.assign(new Error('Telegram user missing'),{status:401}); }
  if (!user || typeof user !== 'object' || !Number.isSafeInteger(Number(user.id)) || Number(user.id)<=0) {
    throw Object.assign(new Error('Telegram user missing'),{status:401});
  }
  return String(user.id);
}
async function table(path) {
  const response = await fetch(URL_BASE+'/rest/v1/'+path, {
    headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+SERVICE_KEY,'Content-Type':'application/json'},
    cache:'no-store'
  });
  const data = await response.json().catch(()=>null);
  if (!response.ok || !Array.isArray(data)) {
    throw Object.assign(new Error('Database unavailable'),{status:502});
  }
  return data;
}
const validDate = x => typeof x === 'string' && Number.isFinite(Date.parse(x)) ? Date.parse(x) : null;
function paidMonths(rows, startTime) {
  // The provider transaction ID must be present; unsigned client redirects cannot count.
  // Multiple transactions within one UTC billing month count only once.
  const byMonth = new Map();
  const seen = new Set();
  for (const item of rows) {
    const id = item.prodamus_payment_id;
    const time = validDate(item.paid_at);
    if (typeof id!=='string' || !id.trim() || seen.has(id) || time===null ||
        time < startTime - 72*3600*1000 ||
        !SUCCESS.has(String(item.status||'').toLowerCase()) ||
        !CLUB_PRODUCTS.has(String(item.product_type||'').toLowerCase())) continue;
    seen.add(id);
    const dt = new Date(time);
    const index = dt.getUTCFullYear()*12 + dt.getUTCMonth();
    byMonth.set(index,true);
  }
  const months = [...byMonth.keys()].sort((a,b)=>a-b);
  // Each gap in payments starts a new streak. A single annual payment is one period.
  let last = null, streak = 0;
  for (const month of months) { streak = month===last+1 ? streak+1 : 1; last=month; }
  return streak;
}
async function eligibility(telegramId) {
  const students = await table('students?select=id&telegram_id=eq.'+encodeURIComponent(telegramId)+'&limit=1');
  if (!students.length) return {active:false,paidMonths:0,eligible:false};
  const studentId = students[0].id;
  const now = Date.now();
  const subscriptions = await table('club_subscriptions?select=id,status,start_date,end_date&student_id=eq.'+encodeURIComponent(studentId)+'&order=created_at.desc&limit=100');
  const active = subscriptions.filter(item=> {
    const start=validDate(item.start_date),end=validDate(item.end_date);
    return item.status==='active' && start!==null && start<=now && (end===null || end>now);
  }).sort((a,b)=>Date.parse(b.start_date)-Date.parse(a.start_date))[0];
  if (!active) return {active:false,paidMonths:0,eligible:false};
  const payments = [];
  const base = 'payments?select=prodamus_payment_id,product_type,status,paid_at&student_id=eq.'+encodeURIComponent(studentId)+'&order=paid_at.asc';
  for (let offset=0; offset<5000; offset+=1000) {
    const batch=await table(base+'&limit=1000&offset='+offset);
    payments.push(...batch);
    if(batch.length<1000)break;
    if(offset>=4000)throw Object.assign(new Error('Payment history too large'),{status:502});
  }
  const count = paidMonths(payments,Date.parse(active.start_date));
  return {active:true,paidMonths:count,eligible:count>=2};
}
async function signedDownloadUrl() {
  const origin = new URL(URL_BASE);
  const response = await fetch(URL_BASE+'/storage/v1/object/sign/'+BUCKET+'/'+FILE, {
    method:'POST',
    headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+SERVICE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({expiresIn:120,download:'101TRYK.pdf'}),
    cache:'no-store'
  });
  const data = await response.json().catch(()=>null);
  if (!response.ok || typeof (data?.signedURL||data?.signedUrl)!=='string') {
    throw Object.assign(new Error('Reward file unavailable'),{status:502});
  }
  const signedPath=data.signedURL||data.signedUrl;
  const target=new URL(signedPath.startsWith('/storage/v1/') || /^https:\/\//.test(signedPath)
    ? signedPath : '/storage/v1'+signedPath, origin);
  if(target.origin!==origin.origin || !target.pathname.startsWith('/storage/v1/object/sign/'+BUCKET+'/'+FILE)) {
    throw Object.assign(new Error('Invalid download destination'),{status:502});
  }
  target.searchParams.set('download','101TRYK.pdf');
  return target.href;
}
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET') {res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  try {
    const telegramId=authorizedTelegram(req.headers['x-telegram-init-data']);
    if(!URL_BASE||!SERVICE_KEY)throw new Error('Missing Supabase configuration');
    const result=await eligibility(telegramId);
    if(req.query?.check==='1')return res.status(200).json({ok:true,...result});
    if(!result.eligible)return res.status(403).json({error:'Reward locked',code:'REWARD_LOCKED'});
    return res.status(200).json({ok:true,url:await signedDownloadUrl(),expiresIn:120,fileName:'101TRYK.pdf'});
  } catch(error) {
    console.error('NOYA PDF reward',error.status||500,error.message);
    return res.status(error.status||500).json({error:error.status===401?'Telegram authentication required':error.status===502?'Download temporarily unavailable':'Server error'});
  }
};
