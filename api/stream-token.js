
import crypto from 'node:crypto';
async function live(req,res){
 res.setHeader('Cache-Control','private, no-store');
 const fail=(s,m)=>Object.assign(new Error(m),{status:s});
 try{
  const raw=req.body?.initData;
  if(typeof raw!=='string'||!(process.env.NOYA_TELEGRAM_BOT_TOKEN||process.env.TELEGRAM_BOT_TOKEN))throw fail(401,'Telegram login required');
  const p=new URLSearchParams(raw),hash=p.get('hash'),ts=Number(p.get('auth_date'));
  if(!hash||!/^[a-f0-9]{64}$/i.test(hash)||Math.abs(Date.now()/1000-ts)>86400)throw fail(401,'Invalid Telegram login');
  p.delete('hash');
  const data=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
  const secret=crypto.createHmac('sha256','WebAppData').update(process.env.NOYA_TELEGRAM_BOT_TOKEN||process.env.TELEGRAM_BOT_TOKEN).digest();
  const actual=crypto.createHmac('sha256',secret).update(data).digest();
  if(!crypto.timingSafeEqual(actual,Buffer.from(hash,'hex')))throw fail(401,'Invalid Telegram signature');
  const user=JSON.parse(p.get('user')||'{}');
  if(!Number.isSafeInteger(Number(user.id)))throw fail(401,'Invalid Telegram user');
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY,base=process.env.NEXT_PUBLIC_SUPABASE_URL;
  if(!key||!base)throw fail(503,'Course database unavailable');
  async function db(path,method='GET',body){
   const response=await fetch(base+'/rest/v1/'+path,{method,headers:{apikey:key,Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
   if(!response.ok){const detail=await response.json().catch(()=>({}));console.error('Course database failure',{resource:path.split('?')[0],status:response.status,code:detail.code,message:detail.message});throw fail(502,'Database '+path.split('?')[0]+' HTTP '+response.status+' code '+String(detail.code||'unknown'));}
   return response.status===204?[]:response.json();
  }
  const students=await db('students?select=id&telegram_id=eq.'+encodeURIComponent(user.id)+'&limit=1');
  if(!students.length)throw fail(403,'Course access required');
  const student=students[0].id;
  const [enrollments,admins,courses]=await Promise.all([
   db('enrollments?select=course_id,access_start_date,access_end_date&student_id=eq.'+student+'&status=eq.active&limit=20'),
   db('admins?select=id&telegram_id=eq.'+encodeURIComponent(user.id)+'&limit=1'),
   db('courses?select=id&title=eq.'+encodeURIComponent('Управление вниманием')+'&limit=1')
  ]);
  if(!courses.length)throw fail(503,'Course unavailable');
  const courseId=courses[0].id,now=Date.now();
  if(!admins.length&&!enrollments.some(e=>e.course_id===courseId&&(!e.access_start_date||Date.parse(e.access_start_date)<=now)&&(!e.access_end_date||Date.parse(e.access_end_date)>now)))throw fail(403,'Course access required');
  const action=req.body.action;
  if(action==='course_progress'){
   const [blocks,lessons,completed]=await Promise.all([
    db('course_blocks?select=id,block_number,title&course_id=eq.'+courseId+'&order=block_number.asc&limit=20'),
    db('lessons?select=id,block_id,day_number,title,is_published&order=day_number.asc&limit=300'),
    db('course_lesson_completions?select=lesson_id&student_id=eq.'+student+'&limit=300')
   ]);
   const ids=new Set(blocks.map(b=>b.id));
   return res.status(200).json({ok:true,blocks,lessons:lessons.filter(l=>ids.has(l.block_id)),completed:completed.map(x=>x.lesson_id)});
  }
  if(action==='course_complete'){
   const lessonId=req.body.lessonId,completed=req.body.completed;
   if(typeof lessonId!=='string'||!/^[a-f0-9-]{36}$/i.test(lessonId)||typeof completed!=='boolean')throw fail(400,'Invalid progress update');
   const lessons=await db('lessons?select=id,block_id,is_published&id=eq.'+encodeURIComponent(lessonId)+'&is_published=eq.true&limit=1');
   if(!lessons.length)throw fail(404,'Lesson unavailable');
   const blocks=await db('course_blocks?select=id&course_id=eq.'+courseId+'&id=eq.'+encodeURIComponent(lessons[0].block_id)+'&limit=1');
   if(!blocks.length)throw fail(404,'Lesson unavailable');
   if(completed)await db('course_lesson_completions?on_conflict=student_id,lesson_id','POST',{student_id:student,lesson_id:lessonId});
   else await db('course_lesson_completions?student_id=eq.'+student+'&lesson_id=eq.'+lessonId,'DELETE');
   return res.status(200).json({ok:true,completed});
  }
  if(action==='course_watch'){
   const lessonId=req.body.lessonId;
   if(typeof lessonId!=='string'||!/^[a-f0-9-]{36}$/i.test(lessonId))throw fail(400,'Invalid lesson');
   const lessons=await db('lessons?select=id,block_id,video_url,is_published&id=eq.'+encodeURIComponent(lessonId)+'&is_published=eq.true&limit=1');
   if(!lessons.length||!lessons[0].video_url)throw fail(404,'Lesson video unavailable');
   const blocks=await db('course_blocks?select=id&course_id=eq.'+courseId+'&id=eq.'+encodeURIComponent(lessons[0].block_id)+'&limit=1');
   if(!blocks.length)throw fail(404,'Lesson unavailable');
   const videoId=lessons[0].video_url;
   if(!/^[a-f0-9]{32}$/i.test(videoId))throw fail(503,'Invalid video ID');
   if(!process.env.CLOUDFLARE_ACCOUNT_ID||!process.env.CLOUDFLARE_API_TOKEN)throw fail(503,'Cloudflare preview is not configured');
   const cf=await fetch('https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/stream/'+videoId+'/token',{method:'POST',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({exp:Math.floor(Date.now()/1000)+900,downloadable:false}),signal:AbortSignal.timeout(10000)});
   const data=await cf.json().catch(()=>null);
   if(!cf.ok||!data?.success||!data.result?.token){console.error('Cloudflare course video token failed',{status:cf.status,errors:(data?.errors||[]).map(e=>({code:e.code,message:e.message})),hasAccountId:!!process.env.CLOUDFLARE_ACCOUNT_ID,hasApiToken:!!process.env.CLOUDFLARE_API_TOKEN});throw fail(502,'Cloudflare HTTP '+cf.status+'; code '+String(data?.errors?.[0]?.code??'unknown'));}
   return res.status(200).json({ok:true,token:data.result.token});
  }
  if(action==='live_list'){
   const [streams,favorites]=await Promise.all([
    db('course_live_streams?select=id,title,description,cover_url,sort_order&course_id=eq.'+courseId+'&is_published=eq.true&order=sort_order.asc&limit=200'),
    db('course_live_favorites?select=stream_id&student_id=eq.'+student+'&limit=500')
   ]);
   return res.status(200).json({ok:true,streams,favorites:favorites.map(f=>f.stream_id)});
  }
  const streamId=req.body.streamId;
  if(typeof streamId!=='string'||!/^[a-f0-9-]{36}$/i.test(streamId))throw fail(400,'Invalid stream');
  const streams=await db('course_live_streams?select=cloudflare_video_id&id=eq.'+encodeURIComponent(streamId)+'&course_id=eq.'+courseId+'&is_published=eq.true&limit=1');
  if(!streams.length)throw fail(404,'Stream unavailable');
  if(action==='live_favorite'){
   if(typeof req.body.favorite!=='boolean')throw fail(400,'Invalid favorite');
   if(req.body.favorite)await db('course_live_favorites?on_conflict=student_id,stream_id','POST',{student_id:student,stream_id:streamId});
   else await db('course_live_favorites?student_id=eq.'+student+'&stream_id=eq.'+streamId,'DELETE');
   return res.status(200).json({ok:true});
  }
  if(action==='live_watch'){
   if(!process.env.CLOUDFLARE_ACCOUNT_ID||!process.env.CLOUDFLARE_API_TOKEN)throw fail(503,'Video service unavailable');
   const cf=await fetch('https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/stream/'+streams[0].cloudflare_video_id+'/token',{method:'POST',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({exp:Math.floor(Date.now()/1000)+900,downloadable:false}),signal:AbortSignal.timeout(10000)});
   const data=await cf.json().catch(()=>null);
   if(!cf.ok||!data?.success||!data.result?.token)throw fail(502,'Video unavailable');
   return res.status(200).json({ok:true,token:data.result.token});
  }
  throw fail(400,'Unknown action');
 }catch(e){if(!e.status)console.error('Course live error',e.message);return res.status(e.status||500).json({error:e.status?e.message:'Server error'})}
}
export default async function handler(req, res) {
  if(req.method==='POST'&&/^(live_|course_)/.test(String(req.body?.action||'')))return live(req,res);
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Allow','POST');
  return res.status(405).json({error:'Use authenticated POST for video playback'});
}
