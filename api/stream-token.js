
import crypto from 'node:crypto';
import courseDrip from '../lib/course-drip.cjs';
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
  const [enrollments,admins,courses,clubSubscriptions]=await Promise.all([
   db('enrollments?select=course_id,access_start_date,access_end_date&student_id=eq.'+student+'&status=eq.active&limit=20'),
   db('admins?select=id&telegram_id=eq.'+encodeURIComponent(user.id)+'&limit=1'),
   db('courses?select=id&title=eq.'+encodeURIComponent('Управление вниманием')+'&limit=1'),
   db('club_subscriptions?select=status,start_date,end_date&student_id=eq.'+student+'&status=eq.active&limit=20')
  ]);
  if(!courses.length)throw fail(503,'Course unavailable');
  const courseId=courses[0].id,now=Date.now();
  const paidClub=clubSubscriptions.some(s=>s.status==='active'&&
   (!s.start_date||Number.isFinite(Date.parse(s.start_date))&&Date.parse(s.start_date)<=now)&&
   (!s.end_date||Number.isFinite(Date.parse(s.end_date))&&Date.parse(s.end_date)>now));
  if(!admins.length&&!paidClub&&!enrollments.some(e=>e.course_id===courseId&&(!e.access_start_date||Date.parse(e.access_start_date)<=now)&&(!e.access_end_date||Date.parse(e.access_end_date)>now)))throw fail(403,'Course access required');
  const action=req.body.action;
  // Signed video tokens and completions use the same server-side gate.
  let scheduled=null;
  async function gate(){
   if(!scheduled)scheduled=await courseDrip.buildCourseGate({
    db,student,courseId,admin:admins.length>0,begin:true,now:Date.now()
   });
   return scheduled;
  }
  function mustOpen(state){
   if(!state)throw fail(404,'Урок не найден');
   if(!state.available){
    const when=state.unlockAt&&state.lockReason==='time'?' Новый урок откроется '+new Date(state.unlockAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' (МСК).':'';
    const prerequisite=state.lockReason==='previous'?' Сначала досмотри предыдущий урок: '+state.previousTitle+'.':'';
    throw fail(423,'Урок пока закрыт.'+prerequisite+when);
   }
  }
  // Share course/live completion with the unified personal library.
  async function mirrorState(type,id,field,value){
    const filter='noya_material_state?select=favorited,completed,last_viewed_at&student_id=eq.'+student+'&material_type=eq.'+type+'&material_id=eq.'+id+'&limit=1';
    const prior=(await db(filter))[0]||{};
    const row={student_id:student,material_type:type,material_id:id,
      favorited:field==='favorited'?value:prior.favorited===true,
      completed:field==='completed'?value:prior.completed===true,
      last_viewed_at:prior.last_viewed_at||null,updated_at:new Date().toISOString()};
    await db('noya_material_state?on_conflict=student_id,material_type,material_id','POST',row);
  }
  if(action==='course_catalog'){
   const state=await gate();
   return res.status(200).json({ok:true,blocks:state.blocks,lessons:state.lessons.map(l=>({...l,...state.ensureLesson(l.id)})),unlockHourMsk:state.unlockHourMsk,startedAt:state.startedAt});
  }
  if(action==='course_block_lessons'){
   const blockId=req.body.blockId;
   if(typeof blockId!=='string'||!/^[a-f0-9-]{36}$/i.test(blockId))throw fail(400,'Invalid block');
   const state=await gate();
   if(!state.blocks.some(b=>b.id===blockId))throw fail(404,'Block not found');
   const lessons=state.lessons.filter(l=>l.block_id===blockId).map(l=>({...l,...state.ensureLesson(l.id)}));
   return res.status(200).json({ok:true,lessons,unlockHourMsk:state.unlockHourMsk});
  }
  if(action==='course_lesson_details'){
   const lessonId=req.body.lessonId;
   if(typeof lessonId!=='string'||!/^[a-f0-9-]{36}$/i.test(lessonId))throw fail(400,'Invalid lesson');
   const lessons=await db('lessons?select=id,title,description,homework,is_published,video_url,block_id&id=eq.'+encodeURIComponent(lessonId)+'&is_published=eq.true&limit=1');
   if(!lessons.length)throw fail(404,'Lesson unavailable');
   const state=await gate();
   mustOpen(state.ensureLesson(lessonId));
   return res.status(200).json({ok:true,lessons});
  }
  if(action==='course_progress'){
   const state=await gate();
   return res.status(200).json({ok:true,blocks:state.blocks,
    lessons:state.lessons.map(l=>({...l,...state.ensureLesson(l.id)})),
    completed:[...state.completed],unlockHourMsk:state.unlockHourMsk,startedAt:state.startedAt});
  }
  if(action==='course_complete'){
   const lessonId=req.body.lessonId,completed=req.body.completed;
   if(typeof lessonId!=='string'||!/^[a-f0-9-]{36}$/i.test(lessonId)||typeof completed!=='boolean')throw fail(400,'Invalid progress update');
   const state=await gate(),entry=state.ensureLesson(lessonId);
   if(!entry)throw fail(404,'Урок не найден');
   // A completed lesson may always be revisited; a second SDK callback is idempotent.
   if(completed&&entry.completed)return res.status(200).json({ok:true,completed:true});
   mustOpen(entry);
   if(!completed){
    if(!admins.length)throw fail(403,'Пройденный урок нельзя сбросить вручную');
    await db('course_lesson_completions?student_id=eq.'+student+'&lesson_id=eq.'+lessonId,'DELETE');
    await mirrorState('course',lessonId,'completed',false);
    return res.status(200).json({ok:true,completed:false});
   }
   if(!admins.length){
    const watched=Number(req.body.watchedSeconds),duration=Number(req.body.durationSeconds);
    if(!Number.isFinite(watched)||!Number.isFinite(duration)||duration<5||watched<duration*.9||watched>duration*1.05)
     throw fail(403,'Просмотри не менее 90% видео, чтобы открыть следующий урок');
    const receipt=await db('noya_course_watch_sessions?select=opened_at&student_id=eq.'+student+'&lesson_id=eq.'+lessonId+'&limit=1');
    if(!receipt.length)throw fail(403,'Сначала открой видеоурок');
    const elapsed=(Date.now()-Date.parse(receipt[0].opened_at))/1000;
    // Playback-time proof is backed by a signed token session and elapsed wall-clock time.
    if(!Number.isFinite(elapsed)||elapsed+5<watched)
     throw fail(403,'Досмотри урок в плеере перед завершением');
   }
   await db('course_lesson_completions?on_conflict=student_id,lesson_id','POST',{student_id:student,lesson_id:lessonId});
   await mirrorState('course',lessonId,'completed',true);
   return res.status(200).json({ok:true,completed:true});
  }
  if(action==='course_watch'){
   const lessonId=req.body.lessonId;
   if(typeof lessonId!=='string'||!/^[a-f0-9-]{36}$/i.test(lessonId))throw fail(400,'Invalid lesson');
   const lessons=await db('lessons?select=id,block_id,video_url,is_published&id=eq.'+encodeURIComponent(lessonId)+'&is_published=eq.true&limit=1');
   if(!lessons.length||!lessons[0].video_url)throw fail(404,'Lesson video unavailable');
   const state=await gate();
   mustOpen(state.ensureLesson(lessonId));
   const videoId=lessons[0].video_url;
   if(!/^[a-f0-9]{32}$/i.test(videoId))throw fail(503,'Invalid video ID');
   if(!process.env.CLOUDFLARE_ACCOUNT_ID||!process.env.CLOUDFLARE_API_TOKEN)throw fail(503,'Cloudflare preview is not configured');
   const cf=await fetch('https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/stream/'+videoId+'/token',{method:'POST',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({exp:Math.floor(Date.now()/1000)+900,downloadable:false}),signal:AbortSignal.timeout(10000)});
   const data=await cf.json().catch(()=>null);
   if(!cf.ok||!data?.success||!data.result?.token){console.error('Cloudflare course video token failed',{status:cf.status,errors:(data?.errors||[]).map(e=>({code:e.code,message:e.message})),hasAccountId:!!process.env.CLOUDFLARE_ACCOUNT_ID,hasApiToken:!!process.env.CLOUDFLARE_API_TOKEN});throw fail(502,'Cloudflare HTTP '+cf.status+'; code '+String(data?.errors?.[0]?.code??'unknown'));}
   if(!admins.length)await db('rpc/noya_course_watch_begin','POST',{p_student_id:student,p_lesson_id:lessonId});
   return res.status(200).json({ok:true,token:data.result.token});
  }
  if(action==='folder_summary'){
   // Folder counters are derived from currently published entries, never hardcoded.
   const [liveStreams,liveViews,courseBlocks,courseLessons,courseDone]=await Promise.all([
    db('course_live_streams?select=id&course_id=eq.'+courseId+'&is_published=eq.true&limit=1000'),
    db('course_live_views?select=stream_id&student_id=eq.'+student+'&limit=1000'),
    db('course_blocks?select=id&course_id=eq.'+courseId+'&limit=100'),
    db('lessons?select=id,block_id,is_published&is_published=eq.true&limit=1000'),
    db('course_lesson_completions?select=lesson_id&student_id=eq.'+student+'&limit=1000')
   ]);
   const liveIds=new Set(liveStreams.map(s=>s.id));
   const blockIds=new Set(courseBlocks.map(b=>b.id));
   const lessonIds=new Set(courseLessons.filter(l=>blockIds.has(l.block_id)).map(l=>l.id));
   return res.status(200).json({ok:true,folders:{
    live:{total:liveIds.size,watched:new Set(liveViews.map(v=>v.stream_id).filter(id=>liveIds.has(id))).size},
    course:{total:lessonIds.size,watched:new Set(courseDone.map(v=>v.lesson_id).filter(id=>lessonIds.has(id))).size}
   }});
  }
  if(action==='live_list'){
   const [streams,favorites,views]=await Promise.all([
    db('course_live_streams?select=id,title,description,cover_url,cloudflare_video_id,sort_order&course_id=eq.'+courseId+'&is_published=eq.true&order=sort_order.asc&limit=1000'),
    db('course_live_favorites?select=stream_id&student_id=eq.'+student+'&limit=1000'),
    db('course_live_views?select=stream_id&student_id=eq.'+student+'&limit=1000')
   ]);
   const signed=await Promise.all(streams.map(async stream=>{
    let cover=stream.cover_url;
    if(!cover&&process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN){
     try{
      const cf=await fetch('https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/stream/'+stream.cloudflare_video_id+'/token',{method:'POST',headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({exp:Math.floor(Date.now()/1000)+900,downloadable:false}),signal:AbortSignal.timeout(7000)});
      const data=await cf.json();
      if(cf.ok&&data.success&&data.result?.token)cover='https://customer-9y0wom20nneqpu4g.cloudflarestream.com/'+encodeURIComponent(data.result.token)+'/thumbnails/thumbnail.jpg';
     }catch(e){console.warn('Live thumbnail unavailable',e.message)}
    }
    return {id:stream.id,title:stream.title,description:stream.description,cover_url:cover,sort_order:stream.sort_order};
   }));
   return res.status(200).json({ok:true,streams:signed,favorites:favorites.map(f=>f.stream_id),watched:views.map(v=>v.stream_id)});
  }
  const streamId=req.body.streamId;
  if(typeof streamId!=='string'||!/^[a-f0-9-]{36}$/i.test(streamId))throw fail(400,'Invalid stream');
  const streams=await db('course_live_streams?select=cloudflare_video_id&id=eq.'+encodeURIComponent(streamId)+'&course_id=eq.'+courseId+'&is_published=eq.true&limit=1');
  if(!streams.length)throw fail(404,'Stream unavailable');
  if(action==='live_favorite'){
   if(typeof req.body.favorite!=='boolean')throw fail(400,'Invalid favorite');
   if(req.body.favorite)await db('course_live_favorites?on_conflict=student_id,stream_id','POST',{student_id:student,stream_id:streamId});
   else await db('course_live_favorites?student_id=eq.'+student+'&stream_id=eq.'+streamId,'DELETE');
   await mirrorState('live',streamId,'favorited',req.body.favorite);
   return res.status(200).json({ok:true});
  }
  if(action==='live_mark_watched'){
   // Authenticated Telegram user and the published stream were validated above.
   await db('course_live_views?on_conflict=student_id,stream_id','POST',{student_id:student,stream_id:streamId});
   await mirrorState('live',streamId,'completed',true);
   return res.status(200).json({ok:true,watched:true});
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
  if(req.method==='POST'&&/^(live_|course_|folder_)/.test(String(req.body?.action||'')))return live(req,res);
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Allow','POST');
  return res.status(405).json({error:'Use authenticated POST for video playback'});
}
