// NOYA CLUB only. Never use the legacy course /api/stream-token endpoint here.
const crypto=require('node:crypto');
function fail(status,message){return Object.assign(new Error(message),{status})}
function verifyTelegram(initData){
 if(typeof initData!=='string'||initData.length>8192)throw fail(401,'Telegram authorization required');
 const p=new URLSearchParams(initData);
 const hash=p.get('hash'),date=Number(p.get('auth_date'));
 if(!hash||!/^[a-f0-9]{64}$/i.test(hash)||!Number.isFinite(date)||Math.abs(Date.now()/1000-date)>86400)throw fail(401,'Telegram authorization expired');
 p.delete('hash');
 const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const secret=crypto.createHmac('sha256','WebAppData').update(process.env.NOYA_TELEGRAM_BOT_TOKEN).digest();
 const expected=crypto.createHmac('sha256',secret).update(check).digest();
 if(!crypto.timingSafeEqual(expected,Buffer.from(hash,'hex')))throw fail(401,'Invalid Telegram signature');
 let user;try{user=JSON.parse(p.get('user')||'{}')}catch{throw fail(401,'Invalid Telegram user')}
 if(!Number.isSafeInteger(Number(user.id))||Number(user.id)<=0)throw fail(401,'Telegram user missing');
 return String(user.id);
}
async function database(path){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const resp=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/'+path,{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000)});
 if(!resp.ok)throw fail(502,'Database unavailable');
 return resp.json();
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('Vary','Authorization');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'})}
 try{
  if(!process.env.NOYA_TELEGRAM_BOT_TOKEN||!process.env.SUPABASE_SERVICE_ROLE_KEY||!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.CLOUDFLARE_ACCOUNT_ID||!process.env.CLOUDFLARE_API_TOKEN)throw fail(503,'Video service unavailable');
  const telegramId=verifyTelegram(req.body?.initData);
  const lessonId=req.body?.lessonId;
  if(typeof lessonId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(lessonId))throw fail(400,'Invalid lesson ID');
  const students=await database('students?select=id&telegram_id=eq.'+encodeURIComponent(telegramId)+'&limit=1');
  if(!students.length)throw fail(403,'Club access required');
  const studentId=students[0].id;
  const [subscriptions,admins,lessons]=await Promise.all([
   database('club_subscriptions?select=status,start_date,end_date&student_id=eq.'+encodeURIComponent(studentId)+'&status=eq.active&limit=20'),
   database('admins?select=id&telegram_id=eq.'+encodeURIComponent(telegramId)+'&limit=1'),
   database('club_lessons?select=id,cloudflare_video_id,is_published&id=eq.'+encodeURIComponent(lessonId)+'&is_published=eq.true&limit=1')
  ]);
  const now=Date.now();
  const active=subscriptions.some(s=>(!s.start_date||Number.isFinite(Date.parse(s.start_date))&&Date.parse(s.start_date)<=now)&&(!s.end_date||Number.isFinite(Date.parse(s.end_date))&&Date.parse(s.end_date)>now));
  if(!active&&!admins.length)throw fail(403,'Active club subscription required');
  const lesson=lessons[0];
  if(!lesson||!lesson.cloudflare_video_id)throw fail(404,'Published video lesson not found');
  if(!/^[a-f0-9]{32}$/i.test(lesson.cloudflare_video_id))throw fail(503,'Invalid video configuration');
  const expiry=Math.floor(Date.now()/1000)+15*60;
  const cloudflare=await fetch('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)+'/stream/'+encodeURIComponent(lesson.cloudflare_video_id)+'/token',{
   method:'POST',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},
   body:JSON.stringify({exp:expiry,downloadable:false}),signal:AbortSignal.timeout(10000)
  });
  const result=await cloudflare.json().catch(()=>null);
  if(!cloudflare.ok||!result?.success||typeof result.result?.token!=='string')throw fail(502,'Video playback unavailable');
  return res.status(200).json({token:result.result.token,expiresAt:expiry});
 }catch(e){if(!e.status)console.error('Club video token failed',e.message);return res.status(e.status||500).json({error:e.status?e.message:'Server error'})}
};
