import crypto from 'node:crypto';
const types=new Set(['course','live','club']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8a-f][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const fail=(status,message)=>Object.assign(new Error(message),{status});
function auth(raw){
 const bot=process.env.NOYA_TELEGRAM_BOT_TOKEN||process.env.TELEGRAM_BOT_TOKEN;
 if(!bot||typeof raw!=='string'||raw.length>8192)throw fail(401,'Открой NOYA CLUB в Telegram');
 const p=new URLSearchParams(raw),hash=p.get('hash'),date=Number(p.get('auth_date'));
 if(!hash||!/^[a-f0-9]{64}$/i.test(hash)||!Number.isFinite(date)||Math.abs(Date.now()/1000-date)>86400)throw fail(401,'Сессия Telegram истекла — открой приложение заново');
 p.delete('hash');
 const payload=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
 const secret=crypto.createHmac('sha256','WebAppData').update(bot).digest();
 const signed=crypto.createHmac('sha256',secret).update(payload).digest();
 if(!crypto.timingSafeEqual(signed,Buffer.from(hash,'hex')))throw fail(401,'Неверная подпись Telegram');
 let user;try{user=JSON.parse(p.get('user')||'{}')}catch{throw fail(401,'Нет данных пользователя')}
 if(!Number.isSafeInteger(Number(user.id))||Number(user.id)<=0)throw fail(401,'Неверный Telegram ID');
 return String(user.id);
}
async function db(resource,method='GET',payload){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY,base=process.env.NEXT_PUBLIC_SUPABASE_URL;
 if(!key||!base)throw fail(503,'База клуба недоступна');
 const response=await fetch(base+'/rest/v1/'+resource,{method,
  headers:{apikey:key,Authorization:'Bearer '+key,...(payload!==undefined?{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'}:{})},
  body:payload!==undefined?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(12000)});
 if(!response.ok){const reason=await response.json().catch(()=>({}));console.error('Noya material storage',{table:resource.split('?')[0],http:response.status,code:reason.code});throw fail(502,'Не удалось сохранить материалы');}
 if(response.status===204)return [];
 return response.json();
}
const activePeriod=(s,now)=>(!s.start_date||Number.isFinite(Date.parse(s.start_date))&&Date.parse(s.start_date)<=now)&&(!s.end_date||Number.isFinite(Date.parse(s.end_date))&&Date.parse(s.end_date)>now);
const keyFor=(type,id)=>type+':'+id;
async function signedThumbnail(id){
 if(typeof id!=='string'||!/^[a-f0-9]{32}$/i.test(id))return null;
 const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
 if(!account||!token)return null;
 try{
  const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/stream/'+id+'/token',{
   method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({exp:Math.floor(Date.now()/1000)+900,downloadable:false}),
   signal:AbortSignal.timeout(5000)
  });
  if(!res.ok)return null;
  const data=await res.json();
  if(!data?.success||!data?.result?.token)return null;
  return 'https://customer-9y0wom20nneqpu4g.cloudflarestream.com/'+encodeURIComponent(data.result.token)+'/thumbnails/thumbnail.jpg';
 }catch{return null;}
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private,no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Use POST'})}
 try{
  const who=auth(req.body?.initData);
  const students=await db('students?select=id&telegram_id=eq.'+encodeURIComponent(who)+'&limit=1');
  if(!students.length)throw fail(403,'Аккаунт NOYA CLUB не найден');
  const student=students[0].id,now=Date.now();
  const [admins,subscriptions,trials,enrollments,courses]=await Promise.all([
   db('admins?select=id&telegram_id=eq.'+who+'&limit=1'),
   db('club_subscriptions?select=start_date,end_date,status&student_id=eq.'+student+'&status=eq.active&limit=30'),
   db('noya_club_trials?select=starts_at,ends_at&student_id=eq.'+student+'&limit=20'),
   db('enrollments?select=course_id,status,access_start_date,access_end_date&student_id=eq.'+student+'&status=eq.active&limit=50'),
   db('courses?select=id,title&title=eq.'+encodeURIComponent('Управление вниманием')+'&limit=1')
  ]);
  const admin=admins.length>0,clubPaid=subscriptions.some(s=>activePeriod(s,now));
  const trial=trials.some(t=>Date.parse(t.starts_at)<=now&&Date.parse(t.ends_at)>now);
  const courseId=courses[0]?.id;
  const coursePaid=Boolean(courseId)&&enrollments.some(e=>e.course_id===courseId&&activePeriod({start_date:e.access_start_date,end_date:e.access_end_date},now));
  const canCourse=!!courseId&&(admin||clubPaid||coursePaid);
  const canLive=canCourse,canClub=admin||clubPaid||trial;
  const allowed={course:canCourse,live:canLive,club:canClub};
  const action=req.body?.action||'list';
  if(action==='states'){
   const permitted=Object.entries(allowed).filter(([,yes])=>yes).map(([name])=>name);
   if(!permitted.length)return res.status(200).json({ok:true,states:[]});
   const states=await db('noya_material_state?select=material_type,material_id,favorited,completed,last_viewed_at&student_id=eq.'+student+'&material_type=in.('+permitted.join(',')+')&limit=5000');
   return res.status(200).json({ok:true,states:states.map(x=>({type:x.material_type,id:x.material_id,favorited:x.favorited===true,completed:x.completed===true,lastViewedAt:x.last_viewed_at||null}))});
  }
  if(action==='list'){
   const query=[];
   if(canCourse){
    query.push(db('course_blocks?select=id,title&course_id=eq.'+courseId+'&limit=100'));
    query.push(db('lessons?select=id,title,block_id,day_number,video_url&is_published=eq.true&order=day_number.asc&limit=1000'));
   }else query.push(Promise.resolve([]),Promise.resolve([]));
   if(canLive)query.push(db('course_live_streams?select=id,title,cover_url,cloudflare_video_id,sort_order&course_id=eq.'+courseId+'&is_published=eq.true&order=sort_order.asc&limit=1000'));else query.push(Promise.resolve([]));
   if(canClub)query.push(db('club_lessons?select=id,title,topic,sort_order,cloudflare_video_id&is_published=eq.true&order=sort_order.asc&limit=1000'));else query.push(Promise.resolve([]));
   query.push(db('noya_material_state?select=material_type,material_id,favorited,completed,last_viewed_at,updated_at&student_id=eq.'+student+'&limit=5000'));
   const [blocks,lessons,live,club,states]=await Promise.all(query);
   const blockMap=new Map(blocks.map(b=>[b.id,b.title]));
   const materials=[
    ...lessons.filter(l=>blockMap.has(l.block_id)).map(l=>({type:'course',id:l.id,title:l.title,folder:blockMap.get(l.block_id)||'Управление вниманием',cover:null,videoId:l.video_url})),
    ...live.map(l=>({type:'live',id:l.id,title:l.title,folder:'Прямые эфиры',cover:typeof l.cover_url==='string'&&l.cover_url.startsWith('https://')?l.cover_url:null,videoId:l.cloudflare_video_id})),
    ...club.map(l=>({type:'club',id:l.id,title:l.title,folder:'Клубные уроки',cover:null,videoId:l.cloudflare_video_id}))
   ];
   const stateMap=new Map(states.map(s=>[keyFor(s.material_type,s.material_id),s]));
   const items=materials.map(item=>{
    const state=stateMap.get(keyFor(item.type,item.id));
    return {...item,favorited:state?.favorited===true,completed:state?.completed===true,lastViewedAt:state?.last_viewed_at||null,updatedAt:state?.updated_at||null};
   });
   // Resolve signed video thumbnails only for materials the member has used.
   // The full catalog remains fast and no private Cloudflare identifiers are sent to the browser.
   const featured=items.filter(i=>!i.cover&&i.videoId&&(i.lastViewedAt||i.favorited||i.completed))
    .sort((a,b)=>Date.parse(b.lastViewedAt||b.updatedAt||0)-Date.parse(a.lastViewedAt||a.updatedAt||0))
    .slice(0,30);
   await Promise.all(featured.map(async item=>{item.cover=await signedThumbnail(item.videoId);}));
   const safeItems=items.map(({videoId,...item})=>item);
   return res.status(200).json({ok:true,items:safeItems,counts:{history:items.filter(i=>i.lastViewedAt).length,favorites:items.filter(i=>i.favorited).length,completed:items.filter(i=>i.completed).length}});
  }
  if(!['touch','favorite','complete','get'].includes(action))throw fail(400,'Неизвестная команда');
  const type=req.body?.type,id=req.body?.id;
  if(!types.has(type)||typeof id!=='string'||!uuid.test(id))throw fail(400,'Неверный материал');
  if(!allowed[type])throw fail(403,'Нет доступа к материалу');
  if(type==='course'&&action==='complete')throw fail(403,'Урок курса отмечается пройденным автоматически после просмотра 90% видео');
  let found=[];
  if(type==='course'){
   const blockRows=await db('course_blocks?select=id&course_id=eq.'+courseId+'&limit=100');
   const allowedBlocks=new Set(blockRows.map(x=>x.id));
   found=await db('lessons?select=id,block_id&is_published=eq.true&id=eq.'+id+'&limit=1');
   if(!found.some(l=>allowedBlocks.has(l.block_id)))throw fail(404,'Урок не опубликован');
  }else if(type==='live'){
   found=await db('course_live_streams?select=id&course_id=eq.'+courseId+'&is_published=eq.true&id=eq.'+id+'&limit=1');
   if(!found.length)throw fail(404,'Эфир не опубликован');
  }else{
   found=await db('club_lessons?select=id&is_published=eq.true&id=eq.'+id+'&limit=1');
   if(!found.length)throw fail(404,'Урок клуба не опубликован');
  }
  const rows=await db('noya_material_state?select=favorited,completed,last_viewed_at&student_id=eq.'+student+'&material_type=eq.'+type+'&material_id=eq.'+id+'&limit=1');
  const state=rows[0]||{favorited:false,completed:false,last_viewed_at:null};
  if(action==='get')return res.status(200).json({ok:true,state:{favorited:state.favorited===true,completed:state.completed===true,lastViewedAt:state.last_viewed_at||null}});
  if(action==='touch'){
    if(type==='course'){
      const schedule=(await import('../lib/course-drip.cjs')).default;
      const gating=await schedule.buildCourseGate({db,student,courseId,admin,begin:false});
      if(!gating.ensureLesson(id)?.available)throw fail(423,'Сначала просмотри предыдущий урок или дождись открытия следующего дня');
    }
    state.last_viewed_at=new Date().toISOString();
  }
  if(action==='favorite'){
   if(typeof req.body?.value!=='boolean')throw fail(400,'Неверная отметка');
   state.favorited=req.body.value;
  }
  if(action==='complete'){
   if(typeof req.body?.value!=='boolean')throw fail(400,'Неверная отметка');
   state.completed=req.body.value;
   // Keep the original course/live progress stores in sync with the new library.
   if(type==='course'){
    if(state.completed)await db('course_lesson_completions?on_conflict=student_id,lesson_id','POST',{student_id:student,lesson_id:id});
    else await db('course_lesson_completions?student_id=eq.'+student+'&lesson_id=eq.'+id,'DELETE');
   }
   if(type==='live'){
    if(state.completed)await db('course_live_views?on_conflict=student_id,stream_id','POST',{student_id:student,stream_id:id});
    else await db('course_live_views?student_id=eq.'+student+'&stream_id=eq.'+id,'DELETE');
   }
  }
  if(type==='live'&&action==='favorite'){
   if(state.favorited)await db('course_live_favorites?on_conflict=student_id,stream_id','POST',{student_id:student,stream_id:id});
   else await db('course_live_favorites?student_id=eq.'+student+'&stream_id=eq.'+id,'DELETE');
  }
  const result=await db('noya_material_state?on_conflict=student_id,material_type,material_id','POST',{
   student_id:student,material_type:type,material_id:id,
   favorited:state.favorited===true,completed:state.completed===true,
   last_viewed_at:state.last_viewed_at,updated_at:new Date().toISOString()
  });
  return res.status(200).json({ok:true,state:{favorited:result[0]?.favorited===true,completed:result[0]?.completed===true,lastViewedAt:result[0]?.last_viewed_at||null}});
 }catch(e){
  if(!e.status)console.error('NOYA materials error:',e);
  return res.status(e.status||500).json({error:e.status?e.message:'Ошибка материалов клуба'});
 }
}
