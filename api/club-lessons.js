// NOYA CLUB catalog. Read-only and accessible only to active members or admins.
const crypto=require('node:crypto');
const fail=(status,message)=>Object.assign(new Error(message),{status});
function telegramId(raw){
 if(typeof raw!=='string'||raw.length>8192)throw fail(401,'Telegram authorization required');
 const p=new URLSearchParams(raw),hash=p.get('hash'),date=Number(p.get('auth_date'));
 if(!hash||!/^[a-f0-9]{64}$/i.test(hash)||!Number.isFinite(date)||Math.abs(Date.now()/1000-date)>86400)throw fail(401,'Telegram authorization expired');
 p.delete('hash');
 const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const secret=crypto.createHmac('sha256','WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();
 const actual=crypto.createHmac('sha256',secret).update(check).digest();
 if(!crypto.timingSafeEqual(actual,Buffer.from(hash,'hex')))throw fail(401,'Invalid Telegram signature');
 let u;try{u=JSON.parse(p.get('user')||'{}')}catch{throw fail(401,'Invalid user')}
 if(!Number.isSafeInteger(Number(u.id))||Number(u.id)<=0)throw fail(401,'Invalid user');
 return String(u.id);
}
async function db(path){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const response=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/'+path,{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw fail(502,'Database unavailable');
 return response.json();
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'})}
 try{
  if(!process.env.TELEGRAM_BOT_TOKEN||!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw fail(503,'Club service unavailable');
  const id=telegramId(req.headers['x-telegram-init-data']);
  const students=await db('students?select=id&telegram_id=eq.'+encodeURIComponent(id)+'&limit=1');
  if(!students.length)throw fail(403,'Club access required');
  const student=students[0].id;
  const [subscriptions,admins]=await Promise.all([
   db('club_subscriptions?select=status,start_date,end_date&student_id=eq.'+encodeURIComponent(student)+'&status=eq.active&limit=20'),
   db('admins?select=id&telegram_id=eq.'+encodeURIComponent(id)+'&limit=1')
  ]);
  const now=Date.now();
  const active=subscriptions.some(s=>(!s.start_date||Number.isFinite(Date.parse(s.start_date))&&Date.parse(s.start_date)<=now)&&(!s.end_date||Number.isFinite(Date.parse(s.end_date))&&Date.parse(s.end_date)>now));
  if(!active&&!admins.length)throw fail(403,'Active club subscription required');
  const lessons=await db('club_lessons?select=id,slug,title,description,topic,sort_order,duration_seconds&is_published=eq.true&order=topic.asc,sort_order.asc&limit=500');
  return res.status(200).json({ok:true,lessons});
 }catch(e){if(!e.status)console.error('Club lessons error',e.message);return res.status(e.status||500).json({error:e.status?e.message:'Server error'})}
};
