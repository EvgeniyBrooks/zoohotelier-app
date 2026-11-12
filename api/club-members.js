import crypto from 'node:crypto';

const DB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOT = process.env.NOYA_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
function error(status, message) { return Object.assign(new Error(message), {status}); }
function validate(initData) {
  if(typeof initData !== 'string' || !BOT) throw error(401,'Открой NOYA CLUB через Telegram');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const date = Number(params.get('auth_date'));
  if(!hash || !/^[a-f0-9]{64}$/i.test(hash) || !Number.isFinite(date) || Math.abs(Date.now()/1000-date)>86400) throw error(401,'Войди через Telegram заново');
  params.delete('hash');
  const check = [...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
  const secret = crypto.createHmac('sha256','WebAppData').update(BOT).digest();
  const digest = crypto.createHmac('sha256',secret).update(check).digest();
  if(!crypto.timingSafeEqual(digest,Buffer.from(hash,'hex')))throw error(401,'Ошибка проверки Telegram');
  let user;
  try { user=JSON.parse(params.get('user')||'{}'); }catch {throw error(401,'Неверные данные Telegram');}
  if(!Number.isSafeInteger(Number(user.id)) || Number(user.id)<1)throw error(401,'Пользователь Telegram не определён');
  return user;
}
async function db(resource,method='GET',payload){
  if(!DB || !SERVICE)throw error(503,'База клуба недоступна');
  const response=await fetch(DB+'/rest/v1/'+resource,{
    method,
    headers:{apikey:SERVICE,Authorization:'Bearer '+SERVICE,...(payload!==undefined?{'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'}:{})},
    body:payload!==undefined?JSON.stringify(payload):undefined,
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok){
    const detail=await response.json().catch(()=>null);
    console.error('NOYA member db error',{resource:resource.split('?')[0],status:response.status,code:detail?.code});
    throw error(502,'Ошибка данных сообщества');
  }
  return response.status===204?[]:response.json();
}
function validId(id){return typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8a-f][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id);}
function score(p){
  return {
    points:Math.max(0,Number(p?.points)||0),
    lessons:Math.max(0,Number(p?.lessons)||0),
    practices:Math.max(0,Number(p?.practices)||0),
    streams:Math.max(0,Number(p?.streams)||0),
    referrals:Math.max(0,Number(p?.referrals)||0)
  };
}
function publicCard(p,scores,liked){
  const stats=score(scores.get(p.student_id));
  const safeAvatar=typeof p.avatar_url==='string'&&/^https:\/\//i.test(p.avatar_url)?p.avatar_url:null;
  const username=typeof p.contact_username==='string'&&/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(p.contact_username)?p.contact_username:null;
  return {id:p.student_id,name:p.display_name||'Участник NOYA',about:p.about||'',avatar:safeAvatar,
          city:p.city||'',profession:p.profession||'',dogName:p.dog_name||'',dogInfo:p.dog_info||'',dogGoals:p.dog_goals||'',helpWith:p.help_with||'',lookingFor:p.looking_for||'',hobbies:p.hobbies||'',instagram:p.instagram||'',telegramChannel:p.telegram_channel||'',
          canMessage:!!(p.messages_enabled&&username),username:p.messages_enabled?username:null,
          favorite:liked.has(p.student_id),...stats};
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Allow','POST');
  if(req.method!=='POST')return res.status(405).json({error:'Требуется POST'});
  try{
    const user=validate(req.body?.initData);
    const students=await db('students?select=id&telegram_id=eq.'+encodeURIComponent(user.id)+'&limit=1');
    if(!students.length)throw error(403,'Для участия нужно вступить в клуб');
    const me=students[0].id,action=String(req.body?.action||'list');
    const now=Date.now();
    const [admins,subs,trials]=await Promise.all([
      db('admins?select=id&telegram_id=eq.'+encodeURIComponent(user.id)+'&limit=1'),
      db('club_subscriptions?select=status,start_date,end_date&student_id=eq.'+me+'&status=eq.active&limit=30'),
      db('noya_club_trials?select=starts_at,ends_at&student_id=eq.'+me+'&limit=20')
    ]);
    const subscribed=subs.some(r=>(!r.start_date||Number.isFinite(Date.parse(r.start_date))&&Date.parse(r.start_date)<=now)&&(!r.end_date||Number.isFinite(Date.parse(r.end_date))&&Date.parse(r.end_date)>now));
    const trial=trials.some(r=>Date.parse(r.starts_at)<=now&&Date.parse(r.ends_at)>now);
    if(!admins.length&&!subscribed&&!trial)throw error(403,'Профили участников доступны при активной подписке NOYA CLUB');
    const base='noya_member_profiles?select=student_id,display_name,about,avatar_url,public_enabled,messages_enabled,contact_username,city,profession,dog_name,dog_info,dog_goals,help_with,looking_for,hobbies,instagram,telegram_channel';
    if(action==='save'){
      const data=req.body?.profile||{};
      if(typeof data!== 'object'||data===null||Array.isArray(data))throw error(400,'Неверный профиль');
      const about=typeof data.about==='string'?data.about.trim().slice(0,600):'';
      const name=typeof data.displayName==='string'?data.displayName.trim().slice(0,64):'';
      const enabled=data.publicEnabled===true;
      const telegramName=typeof user.username==='string'&&/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(user.username)?user.username:null;
      const messages=enabled&&data.messagesEnabled===true&&!!telegramName;
      const avatar=typeof user.photo_url==='string'&&/^https:\/\//i.test(user.photo_url)&&user.photo_url.length<1500?user.photo_url:null;
      const displayName=name||(typeof user.first_name==='string'?user.first_name.trim().slice(0,64):'')||'Участник NOYA';
      const limits={city:100,profession:120,dogName:80,dogInfo:300,dogGoals:300,helpWith:400,lookingFor:300,hobbies:200,instagram:80,telegramChannel:80};
      const extra={};
      const columns={city:'city',profession:'profession',dogName:'dog_name',dogInfo:'dog_info',dogGoals:'dog_goals',helpWith:'help_with',lookingFor:'looking_for',hobbies:'hobbies',instagram:'instagram',telegramChannel:'telegram_channel'};
      for(const [field,max] of Object.entries(limits))extra[columns[field]]=typeof data[field]==='string'?data[field].trim().slice(0,max):'';
      const written=await db('noya_member_profiles?on_conflict=student_id','POST',{
        student_id:me,display_name:displayName,about,public_enabled:enabled,messages_enabled:messages,
        contact_username:messages?telegramName:null,avatar_url:avatar,...extra,updated_at:new Date().toISOString()
      });
      return res.status(200).json({ok:true,profile:written?.[0]||null});
    }
    if(action==='favorite'){
      const target=req.body?.memberId;
      if(!validId(target)||target===me||typeof req.body?.favorite!=='boolean')throw error(400,'Неверный участник');
      const available=await db(base+'&student_id=eq.'+encodeURIComponent(target)+'&public_enabled=eq.true&limit=1');
      if(!available.length)throw error(404,'Профиль недоступен');
      if(req.body.favorite)await db('noya_member_favorites?on_conflict=student_id,favorite_student_id','POST',{student_id:me,favorite_student_id:target});
      else await db('noya_member_favorites?student_id=eq.'+me+'&favorite_student_id=eq.'+target,'DELETE');
      return res.status(200).json({ok:true,favorite:req.body.favorite});
    }
    if(action!=='list')throw error(400,'Неизвестное действие');
    const [profiles,mine,scores,likes,counts,activeSubscriptions,activeTrials]=await Promise.all([
      db(base+'&public_enabled=eq.true&order=updated_at.desc&limit=500'),
      db(base+'&student_id=eq.'+me+'&limit=1'),
      db('noya_member_scores_v?select=student_id,points,lessons,practices,streams,referrals&limit=2000'),
      db('noya_member_favorites?select=favorite_student_id&student_id=eq.'+me+'&limit=1000'),
      db('noya_member_count_v?select=count&limit=1'),
      db('club_subscriptions?select=student_id,start_date,end_date&status=eq.active&limit=10000'),
      db('noya_club_trials?select=student_id,starts_at,ends_at&limit=10000')
    ]);
    // A public profile is discoverable only while its owner has active club access.
    const activeIds=new Set([
      ...activeSubscriptions.filter(r=>(!r.start_date||Date.parse(r.start_date)<=now)&&(!r.end_date||Date.parse(r.end_date)>now)).map(r=>r.student_id),
      ...activeTrials.filter(r=>Date.parse(r.starts_at)<=now&&Date.parse(r.ends_at)>now).map(r=>r.student_id)
    ]);
    const visibleProfiles=profiles.filter(p=>activeIds.has(p.student_id));
    const scoreById=new Map(scores.map(s=>[s.student_id,s]));
    const liked=new Set(likes.map(f=>f.favorite_student_id));
    const cards=visibleProfiles.map(p=>publicCard(p,scoreById,liked));
    const leaders=[...cards].sort((a,b)=>b.points-a.points||a.name.localeCompare(b.name,'ru')||a.id.localeCompare(b.id)).map((card,i)=>({...card,rank:i+1}));
    const myPublic=visibleProfiles.some(p=>p.student_id===me);
    const myScore=score(scoreById.get(me));
    const myRank=leaders.find(x=>x.id===me)?.rank||null;
    const defaultName=(typeof user.first_name==='string'?user.first_name.trim():'')||'Участник NOYA';
    return res.status(200).json({
      ok:true,users:cards,leaders,memberCount:Math.max(0,Number(counts?.[0]?.count)||0),
      me:{id:me,name:mine[0]?.display_name||defaultName,about:mine[0]?.about||'',
          city:mine[0]?.city||'',profession:mine[0]?.profession||'',dogName:mine[0]?.dog_name||'',dogInfo:mine[0]?.dog_info||'',dogGoals:mine[0]?.dog_goals||'',helpWith:mine[0]?.help_with||'',lookingFor:mine[0]?.looking_for||'',hobbies:mine[0]?.hobbies||'',instagram:mine[0]?.instagram||'',telegramChannel:mine[0]?.telegram_channel||'',
          publicEnabled:myPublic,messagesEnabled:mine[0]?.messages_enabled===true,
          canMessage:!!(typeof user.username==='string'&&/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(user.username)),
          username:typeof user.username==='string'?user.username:null,
          rank:myRank,...myScore}
    });
  }catch(e){
    if(!e.status)console.error('NOYA members',e.message);
    return res.status(e.status||500).json({error:e.status?e.message:'Не удалось открыть участников'});
  }
}
