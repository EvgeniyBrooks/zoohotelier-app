'use strict';
// NOYA CLUB: onboarding, first-month practice diary and coach review.
// Uses the existing Telegram identity, Supabase and Cloudflare Stream accounts.
// Does not modify, enable, disable or simulate paid subscriptions.
const crypto=require('node:crypto');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const streamId=/^[a-f0-9]{32}$/i;
const GOALS=new Set(['attention','walks','home','fear','social','calm']);
const fail=(status,message)=>Object.assign(new Error(message),{status});
function authenticate(raw) {
 const bot=process.env.NOYA_TELEGRAM_BOT_TOKEN||process.env.TELEGRAM_BOT_TOKEN;
 if(!bot||typeof raw!=='string'||raw.length>8192)throw fail(401,'Открой NOYA CLUB через Telegram');
 const q=new URLSearchParams(raw),hash=q.get('hash'),stamp=Number(q.get('auth_date'));
 if(!hash||!/^[a-f0-9]{64}$/i.test(hash)||!Number.isFinite(stamp)||Math.abs(Date.now()/1000-stamp)>86400)throw fail(401,'Сессия Telegram истекла');
 q.delete('hash');
 const value=[...q.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const secret=crypto.createHmac('sha256','WebAppData').update(bot).digest();
 const expected=crypto.createHmac('sha256',secret).update(value).digest();
 if(!crypto.timingSafeEqual(expected,Buffer.from(hash,'hex')))throw fail(401,'Неверная подпись Telegram');
 let user;try{user=JSON.parse(q.get('user')||'{}')}catch{throw fail(401,'Неверные данные пользователя')}
 if(!Number.isSafeInteger(Number(user.id))||Number(user.id)<1)throw fail(401,'Неизвестный пользователь Telegram');
 return String(user.id);
}
const clean=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
async function db(path,method='GET',record) {
 const endpoint=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!endpoint||!key)throw fail(503,'Данные клуба временно недоступны');
 const headers={apikey:key,Authorization:'Bearer '+key};
 if(record!==undefined){headers['Content-Type']='application/json';headers.Prefer='resolution=merge-duplicates,return=representation';}
 const r=await fetch(endpoint+'/rest/v1/'+path,{method,headers,body:record===undefined?undefined:JSON.stringify(record),signal:AbortSignal.timeout(12000),cache:'no-store'});
 if(!r.ok){
  const err=await r.json().catch(()=>({}));
  console.error('NOYA journey DB error',{table:path.split('?')[0],code:err?.code,method,status:r.status});
  throw fail(502,'Не удалось сохранить данные. Повтори действие.');
 }
 if(r.status===204)return [];
 return r.json();
}
const period=(s,now)=>(!s.start_date||Number.isFinite(Date.parse(s.start_date))&&Date.parse(s.start_date)<=now)&&(!s.end_date||Number.isFinite(Date.parse(s.end_date))&&Date.parse(s.end_date)>now);
async function session(raw) {
 const telegramId=authenticate(raw);
 const students=await db('students?select=id&telegram_id=eq.'+encodeURIComponent(telegramId)+'&limit=1');
 // Assigned coaches may review reports before they create their own learner profile.
 // Their access is verified against the same private staff/admin allowlists.
 if(!students.length){
  const [admins,staff]=await Promise.all([
   db('admins?select=id&telegram_id=eq.'+encodeURIComponent(telegramId)+'&limit=1'),
   db('noya_review_staff?select=role,enabled&telegram_id=eq.'+encodeURIComponent(telegramId)+'&enabled=eq.true&limit=10')
  ]);
  if(!admins.length&&!staff.some(x=>x.enabled===true))throw fail(403,'Сначала войди в NOYA CLUB');
  return {telegramId,studentId:null,admin:admins.length>0,coach:true,clubAccess:false,courseAccess:false,courseId:null};
 }
 const studentId=students[0].id,now=Date.now();
 const [admins,staff,subs,trials,enrollments,courses]=await Promise.all([
  db('admins?select=id&telegram_id=eq.'+encodeURIComponent(telegramId)+'&limit=1'),
  db('noya_review_staff?select=role,enabled&telegram_id=eq.'+encodeURIComponent(telegramId)+'&enabled=eq.true&limit=10'),
  db('club_subscriptions?select=start_date,end_date&student_id=eq.'+studentId+'&status=eq.active&limit=50'),
  db('noya_club_trials?select=starts_at,ends_at&student_id=eq.'+studentId+'&limit=10'),
  db('enrollments?select=course_id,access_start_date,access_end_date&student_id=eq.'+studentId+'&status=eq.active&limit=50'),
  db('courses?select=id&title=eq.'+encodeURIComponent('Управление вниманием')+'&limit=1')
 ]);
 const admin=admins.length>0,coach=admin||staff.some(x=>x.enabled===true);
 const paidClub=subs.some(x=>period(x,now));
 const trial=trials.some(x=>Date.parse(x.starts_at)<=now&&Date.parse(x.ends_at)>now);
 const courseId=courses[0]?.id||null;
 const paidCourse=courseId&&enrollments.some(x=>x.course_id===courseId&&period({start_date:x.access_start_date,end_date:x.access_end_date},now));
 return {telegramId,studentId,admin,coach,clubAccess:!!(admin||paidClub||trial),courseAccess:!!(admin||paidClub||paidCourse),courseId};
}
async function ownedDog(ctx,dogId) {
 if(typeof dogId!=='string'||!uuid.test(dogId))throw fail(400,'Выбери собаку');
 const list=await db('club_dogs?select=id,name&student_id=eq.'+ctx.studentId+'&id=eq.'+dogId+'&limit=1');
 if(!list.length)throw fail(404,'Собака не найдена в твоём профиле');
 return list[0];
}
async function ownedSubmission(ctx,id) {
 if(typeof id!=='string'||!uuid.test(id))throw fail(400,'Неверный отчёт');
 const items=await db('noya_practice_submissions?select=id,student_id,dog_id,lesson_id,status,video_uid,submitted_at,created_at,upload_expires_at&student_id=eq.'+ctx.studentId+'&id=eq.'+id+'&limit=1');
 if(!items.length)throw fail(404,'Отчёт не найден');
 return items[0];
}
async function validCourseLesson(ctx,lessonId) {
 if(typeof lessonId!=='string'||!uuid.test(lessonId)||!ctx.courseId)throw fail(400,'Неверный урок');
 const [blocks,lessons]=await Promise.all([
  db('course_blocks?select=id&course_id=eq.'+ctx.courseId+'&limit=100'),
  db('lessons?select=id,title,block_id,is_published&is_published=eq.true&id=eq.'+lessonId+'&limit=1')
 ]);
 const ids=new Set(blocks.map(b=>b.id));
 if(!lessons.length||!ids.has(lessons[0].block_id))throw fail(404,'Урок не опубликован');
 return lessons[0];
}
async function cloudflare(path,method='GET',body) {
 const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
 if(!account||!token)throw fail(503,'Загрузка видео не настроена');
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/stream/'+path,{
  method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(13000),cache:'no-store'
 });
 const j=await r.json().catch(()=>({}));
 if(!r.ok||!j.success)throw fail(502,'Cloudflare Stream временно недоступен');
 return j.result;
}
async function signedVideo(uid) {
 if(!streamId.test(uid||''))throw fail(400,'Видео отсутствует');
 const t=await cloudflare(uid+'/token','POST',{exp:Math.floor(Date.now()/1000)+600,downloadable:false});
 if(typeof t?.token!=='string')throw fail(502,'Плеер недоступен');
 return 'https://customer-9y0wom20nneqpu4g.cloudflarestream.com/'+encodeURIComponent(t.token)+'/iframe';
}
const reviewEnabled=()=>process.env.NOYA_PRACTICE_REVIEW_ENABLED==='1';
function requireMember(ctx){if(!ctx.clubAccess)throw fail(403,'Дневник доступен участникам NOYA CLUB');}
function requireLearner(ctx){if(!ctx.courseAccess)throw fail(403,'Задания курса доступны после открытия курса');}
function requireReview(ctx){if(!ctx.coach)throw fail(403,'Проверка доступна только назначенным кинологам');}
module.exports=async function handler(req,res) {
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Используй POST'});}
 try {
  const action=req.body?.action||'overview';
  const ctx=await session(req.body?.initData);
  if(action==='overview'){
   requireMember(ctx);
   const [dogs,journeys,diary,submissions]=await Promise.all([
    db('club_dogs?select=id,name,created_at&student_id=eq.'+ctx.studentId+'&order=created_at.desc&limit=50'),
    db('noya_dog_journeys?select=dog_id,entry_mode,primary_goal,breed,age_label,baseline,created_at&student_id=eq.'+ctx.studentId+'&order=updated_at.desc&limit=50'),
    db('noya_progress_diary?select=id,dog_id,lesson_id,conditions,observation,stress_level,created_at&student_id=eq.'+ctx.studentId+'&order=created_at.desc&limit=100'),
    db('noya_practice_submissions?select=id,dog_id,lesson_id,status,conditions,student_note,question,coach_feedback,created_at,submitted_at,reviewed_at&student_id=eq.'+ctx.studentId+'&order=created_at.desc&limit=100')
   ]);
   return res.status(200).json({ok:true,dogs,journeys,diary,submissions,reviewEnabled:reviewEnabled(),courseAccess:ctx.courseAccess});
  }
  if(action==='start'){
   requireMember(ctx);
   const name=clean(req.body?.name,80),goal=req.body?.goal,entryMode=req.body?.entryMode,breed=clean(req.body?.breed,100),age=clean(req.body?.age,60),baseline=clean(req.body?.baseline,1000);
   if(!GOALS.has(goal)||!['starting','after_course'].includes(entryMode))throw fail(400,'Выбери одну цель и тип начала');
   let dog;
   if(req.body?.dogId){
    dog=await ownedDog(ctx,req.body.dogId);
   }else{
    if(!name)throw fail(400,'Напиши кличку собаки');
    const existing=await db('club_dogs?select=id&student_id=eq.'+ctx.studentId+'&limit=30');
    if(existing.length>=15)throw fail(409,'Достигнут лимит карточек собак');
    const added=await db('club_dogs?select=id,name','POST',{student_id:ctx.studentId,name});
    dog=added[0];
   }
   const saved=await db('noya_dog_journeys?on_conflict=dog_id','POST',{
    student_id:ctx.studentId,dog_id:dog.id,entry_mode:entryMode,primary_goal:goal,
    breed,age_label:age,baseline,updated_at:new Date().toISOString()
   });
   return res.status(200).json({ok:true,dog,journey:saved[0]});
  }
  if(action==='diary_add'){
   requireMember(ctx);const dog=await ownedDog(ctx,req.body?.dogId);
   const conditions=clean(req.body?.conditions,600),observation=clean(req.body?.observation,1200),stress=req.body?.stress;
   if(!conditions||!observation||!['calm','uncertain','difficult'].includes(stress))throw fail(400,'Заполни условия, наблюдение и состояние собаки');
   let lessonId=null;
   if(req.body?.lessonId){requireLearner(ctx);await validCourseLesson(ctx,req.body.lessonId);lessonId=req.body.lessonId;}
   const result=await db('noya_progress_diary?select=id,dog_id,conditions,observation,stress_level,created_at','POST',{
    student_id:ctx.studentId,dog_id:dog.id,lesson_id:lessonId,conditions,observation,stress_level:stress
   });
   return res.status(200).json({ok:true,entry:result[0]});
  }
  if(action==='submission_begin'){
   requireLearner(ctx);if(!reviewEnabled())throw fail(403,'Приём видео на проверку пока не открыт');
   const dog=await ownedDog(ctx,req.body?.dogId),lesson=await validCourseLesson(ctx,req.body?.lessonId);
   const bytes=Number(req.body?.bytes),mime=req.body?.mime;
   if(!Number.isSafeInteger(bytes)||bytes<=0||bytes>200*1024*1024||!['video/mp4','video/quicktime','video/webm','video/x-m4v'].includes(mime))throw fail(400,'Выбери видео MP4, MOV или WebM до 200 МБ и 3 минут');
   const recent=await db('noya_practice_submissions?select=id,status&student_id=eq.'+ctx.studentId+'&created_at=gte.'+encodeURIComponent(new Date(Date.now()-86400000).toISOString())+'&limit=30');
   if(recent.length>=3)throw fail(429,'Не больше трёх видеоотчётов за 24 часа');
   const conditions=clean(req.body?.conditions,600),note=clean(req.body?.note,1200),question=clean(req.body?.question,600);
   if(!conditions||!note)throw fail(400,'Опиши условия и наблюдение перед сдачей видео');
   const id=crypto.randomUUID();
   const expiration=new Date(Date.now()+15*60000).toISOString();
   const created=await cloudflare('direct_upload','POST',{
    maxDurationSeconds:180,expiry:expiration,requireSignedURLs:true,creator:ctx.studentId,
    meta:{noyaSubmission:id,noyaLesson:lesson.id}
   });
   if(!streamId.test(created?.uid||'')||!/^https:\/\/upload\.(?:videodelivery\.net|cloudflarestream\.com)\//.test(created?.uploadURL||''))throw fail(502,'Не удалось создать защищённую ссылку загрузки');
   await db('noya_practice_submissions?select=id','POST',{
    id,student_id:ctx.studentId,dog_id:dog.id,lesson_id:lesson.id,status:'uploading',
    video_uid:created.uid,conditions,student_note:note,question,upload_expires_at:expiration
   });
   return res.status(200).json({ok:true,submissionId:id,uploadUrl:created.uploadURL,maxDurationSeconds:180,maxBytes:200*1024*1024});
  }
  if(action==='submission_finalize'){
   requireLearner(ctx);const record=await ownedSubmission(ctx,req.body?.submissionId);
   if(record.status==='submitted'||record.status==='needs_changes'||record.status==='approved')return res.status(200).json({ok:true,status:record.status});
   if(record.status!=='uploading'||!record.video_uid)throw fail(409,'Загрузка неактивна');
   const video=await cloudflare(record.video_uid);
   if(video?.status?.state==='error')throw fail(422,'Обработка видео завершилась с ошибкой. Загрузи другое видео');
   if(video?.readyToStream!==true)return res.status(202).json({ok:true,status:'processing'});
   if(Number(video.duration)>180)throw fail(422,'Видео длиннее 3 минут');
   const saved=await db('noya_practice_submissions?select=id,status&student_id=eq.'+ctx.studentId+'&id=eq.'+record.id,'PATCH',{
    status:'submitted',submitted_at:new Date().toISOString(),updated_at:new Date().toISOString()
   });
   return res.status(200).json({ok:true,status:saved[0]?.status||'submitted'});
  }
  if(action==='submission_text'){
   requireLearner(ctx);if(!reviewEnabled())throw fail(403,'Приём отчётов на проверку пока не открыт');
   await ownedDog(ctx,req.body?.dogId);await validCourseLesson(ctx,req.body?.lessonId);
   const conditions=clean(req.body?.conditions,600),note=clean(req.body?.note,1200),question=clean(req.body?.question,600);
   if(!conditions||!note)throw fail(400,'Опиши условия и результат');
   const recent=await db('noya_practice_submissions?select=id&student_id=eq.'+ctx.studentId+'&created_at=gte.'+encodeURIComponent(new Date(Date.now()-86400000).toISOString())+'&limit=30');
   if(recent.length>=3)throw fail(429,'Не больше трёх отчётов за 24 часа');
   const saved=await db('noya_practice_submissions?select=id,status,created_at','POST',{
    student_id:ctx.studentId,dog_id:req.body.dogId,lesson_id:req.body.lessonId,conditions,student_note:note,question,status:'submitted',submitted_at:new Date().toISOString()
   });
   return res.status(200).json({ok:true,submission:saved[0]});
  }
  if(action==='coach_queue'){
   requireReview(ctx);
   const rows=await db('noya_practice_submissions?select=id,student_id,dog_id,lesson_id,status,conditions,student_note,question,coach_feedback,video_uid,created_at,submitted_at,reviewed_at&status=in.(submitted,needs_changes,approved)&order=submitted_at.asc&limit=100');
   const [dogs,lessons]=await Promise.all([
    db('club_dogs?select=id,name&limit=1000'),
    db('lessons?select=id,title&limit=1000')
   ]);
   const names=new Map(dogs.map(d=>[d.id,d.name])),titles=new Map(lessons.map(l=>[l.id,l.title]));
   return res.status(200).json({ok:true,queue:rows.map(({video_uid,...r})=>({...r,hasVideo:!!video_uid,dogName:names.get(r.dog_id)||'Собака',lessonTitle:titles.get(r.lesson_id)||'Задание'}))});
  }
  if(action==='coach_video'){
   requireReview(ctx);
   const id=req.body?.submissionId;
   if(typeof id!=='string'||!uuid.test(id))throw fail(400,'Неверный отчёт');
   const rows=await db('noya_practice_submissions?select=id,video_uid,status&id=eq.'+id+'&limit=1');
   if(!rows.length||!rows[0].video_uid||rows[0].status==='uploading')throw fail(404,'Видео ещё не готово');
   return res.status(200).json({ok:true,playerUrl:await signedVideo(rows[0].video_uid)});
  }
  if(action==='coach_review'){
   requireReview(ctx);
   const id=req.body?.submissionId,next=req.body?.status,feedback=clean(req.body?.feedback,2000);
   if(typeof id!=='string'||!uuid.test(id)||!['approved','needs_changes'].includes(next)||feedback.length<10)throw fail(400,'Укажи решение и понятную обратную связь (от 10 символов)');
   const rows=await db('noya_practice_submissions?select=id,status&id=eq.'+id+'&limit=1');
   if(!rows.length||!['submitted','needs_changes'].includes(rows[0].status))throw fail(409,'Отчёт уже проверен или недоступен');
   const result=await db('noya_practice_submissions?select=id,status,coach_feedback,reviewed_at&id=eq.'+id+'&status=eq.'+rows[0].status,'PATCH',{
    status:next,coach_feedback:feedback,reviewed_by:Number(ctx.telegramId),reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()
   });
   if(!result.length)throw fail(409,'Отчёт был обновлён другим проверяющим');
   return res.status(200).json({ok:true,review:result[0]});
  }
  throw fail(400,'Неизвестное действие');
 }catch(e){
  if(!e.status)console.error('NOYA journey error',e.message);
  return res.status(e.status||500).json({error:e.status?e.message:'Ошибка клуба. Повтори действие.'});
 }
};
