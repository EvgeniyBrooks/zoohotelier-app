// NOYA CLUB per-dog lesson progress. Independent from course submissions.
const crypto=require('node:crypto');
const fail=(status,message)=>Object.assign(new Error(message),{status});
function verify(raw){
 if(typeof raw!=='string'||raw.length>8192)throw fail(401,'Telegram authorization required');
 const p=new URLSearchParams(raw),hash=p.get('hash'),stamp=Number(p.get('auth_date'));
 if(!hash||!/^[a-f0-9]{64}$/i.test(hash)||!Number.isFinite(stamp)||Math.abs(Date.now()/1000-stamp)>86400)throw fail(401,'Telegram authorization expired');
 p.delete('hash');
 const data=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const secret=crypto.createHmac('sha256','WebAppData').update(process.env.NOYA_TELEGRAM_BOT_TOKEN).digest();
 const expected=crypto.createHmac('sha256',secret).update(data).digest();
 if(!crypto.timingSafeEqual(expected,Buffer.from(hash,'hex')))throw fail(401,'Invalid Telegram signature');
 let user;try{user=JSON.parse(p.get('user')||'{}')}catch{throw fail(401,'Invalid user')}
 if(!Number.isSafeInteger(Number(user.id))||Number(user.id)<=0)throw fail(401,'Invalid user');
 return String(user.id);
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
async function db(path,opts={}){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const response=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+'/rest/v1/'+path,{...opts,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...(opts.headers||{})},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw fail(502,'Database unavailable');
 return response.json().catch(()=>null);
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'})}
 try{
  if(!process.env.NOYA_TELEGRAM_BOT_TOKEN||!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw fail(503,'Club service unavailable');
  const id=verify(req.method==='POST'?req.body?.initData:req.headers['x-telegram-init-data']);
  const student=await db('students?select=id&telegram_id=eq.'+encodeURIComponent(id)+'&limit=1');
  if(!student?.length)throw fail(403,'Club access required');
  const studentId=student[0].id;
  const [subs,admins]=await Promise.all([
   db('club_subscriptions?select=start_date,end_date&student_id=eq.'+studentId+'&status=eq.active&limit=20'),
   db('admins?select=id&telegram_id=eq.'+encodeURIComponent(id)+'&limit=1')
  ]);
  const trials=await db('noya_club_trials?select=starts_at,ends_at&student_id=eq.'+studentId+'&limit=1');
  const now=Date.now();
  const trialActive=trials.some(t=>Date.parse(t.starts_at)<=now&&Date.parse(t.ends_at)>now);
  if(!admins.length&&!trialActive&&!subs.some(s=>(!s.start_date||Number.isFinite(Date.parse(s.start_date))&&Date.parse(s.start_date)<=now)&&(!s.end_date||Number.isFinite(Date.parse(s.end_date))&&Date.parse(s.end_date)>now)))throw fail(403,'Active club subscription required');
  const dogId=req.method==='POST'?req.body?.dogId:req.query?.dogId;
  if(typeof dogId!=='string'||!uuid.test(dogId))throw fail(400,'Invalid dog ID');
  const dogs=await db('club_dogs?select=id&id=eq.'+encodeURIComponent(dogId)+'&student_id=eq.'+studentId+'&limit=1');
  if(!dogs.length)throw fail(404,'Dog not found');
  if(req.method==='GET'){
   const rows=await db('club_lesson_progress?select=lesson_id,completed_at,updated_at&dog_id=eq.'+dogId+'&student_id=eq.'+studentId+'&limit=500');
   const feedback=await db('noya_practice_feedback?select=lesson_id,outcome,note,created_at&dog_id=eq.'+dogId+'&student_id=eq.'+studentId+'&order=created_at.desc&limit=100');
   return res.status(200).json({ok:true,progress:rows,feedback});
  }
  const lessonId=req.body?.lessonId,completed=req.body?.completed;
  if(typeof lessonId!=='string'||!uuid.test(lessonId))throw fail(400,'Invalid lesson ID');
  const isFeedback=req.body?.action==='practice_feedback';
  if(!isFeedback&&typeof completed!=='boolean')throw fail(400,'Invalid progress update');
  const lessons=await db('club_lessons?select=id&id=eq.'+encodeURIComponent(lessonId)+'&is_published=eq.true&limit=1');
  if(!lessons.length)throw fail(404,'Published lesson not found');
  if(isFeedback){
   const outcome=req.body?.outcome,note=req.body?.note||'';
   if(!['success','partial','difficulty'].includes(outcome)||typeof note!=='string'||note.length>500)throw fail(400,'Invalid feedback');
   const rows=await db('noya_practice_feedback?select=id,lesson_id,outcome,created_at',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({student_id:studentId,dog_id:dogId,lesson_id:lessonId,outcome,note})});
   return res.status(200).json({ok:true,feedback:rows[0]});
  }
  const rows=await db('club_lesson_progress?on_conflict=dog_id,lesson_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({student_id:studentId,dog_id:dogId,lesson_id:lessonId,completed_at:completed?new Date().toISOString():null,updated_at:new Date().toISOString()})});
  return res.status(200).json({ok:true,progress:rows[0]});
 }catch(e){if(!e.status)console.error('Club progress error',e.message);return res.status(e.status||500).json({error:e.status?e.message:'Server error'})}
};
