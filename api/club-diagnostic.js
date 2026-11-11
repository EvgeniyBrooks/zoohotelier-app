// Club diagnostic API draft. Requires reviewed club_profiles_draft.sql migration.
// Authenticates Telegram initData on every request; service role is server-side only.
const crypto = require("crypto");
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = () => ({apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"});
function verify(initData){
  if(typeof initData!=="string"||initData.length>8192)throw Object.assign(new Error("Invalid Telegram data"),{status:401});
  const p=new URLSearchParams(initData),hash=p.get("hash"),stamp=Number(p.get("auth_date"));
  if(!hash||!/^[a-f0-9]{64}$/i.test(hash)||!Number.isFinite(stamp)||Math.abs(Date.now()/1000-stamp)>86400)throw Object.assign(new Error("Telegram authorization expired"),{status:401});
  p.delete("hash");
  const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+"="+v).join("\n");
  const secret=crypto.createHmac("sha256","WebAppData").update(process.env.NOYA_TELEGRAM_BOT_TOKEN).digest();
  const digest=crypto.createHmac("sha256",secret).update(check).digest();
  if(!crypto.timingSafeEqual(digest,Buffer.from(hash,"hex")))throw Object.assign(new Error("Telegram verification failed"),{status:401});
  let user;
  try{user=JSON.parse(p.get("user")||"{}")}catch{throw Object.assign(new Error("Telegram user missing"),{status:401})}
  if(!user||typeof user!=="object"||Array.isArray(user)||!Number.isSafeInteger(Number(user.id))||Number(user.id)<=0)throw Object.assign(new Error("Telegram user missing"),{status:401});
  return user;
}
async function db(path,options={}){
  const response=await fetch(URL_BASE+"/rest/v1/"+path,{...options,headers:{...headers(),...(options.headers||{})}});
  const data=await response.json().catch(()=>null);
  if(!response.ok){
    const table=String(path).split("?")[0];
    const safeCode=typeof data?.code==="string"?data.code.slice(0,32):"unknown";
    console.error("Club DB request failed",JSON.stringify({table,httpStatus:response.status,code:safeCode}));
    throw Object.assign(new Error("Database operation failed"),{status:502});
  }
  return data;
}
function telegramAccount(user){
  const text=(value,max)=>typeof value==="string"?value.replace(/[\u0000-\u001f\u007f-\u009f]/g,"").trim().slice(0,max):"";
  const firstName=text(user.first_name,128),lastName=text(user.last_name,128),username=text(user.username,64)||null;
  let photoUrl=null;
  if(typeof user.photo_url==="string"&&user.photo_url.length<=2048){
    try{
      const url=new URL(user.photo_url);
      if(url.protocol==="https:"&&!url.username&&!url.password&&url.href.length<=2048)photoUrl=url.href;
    }catch{}
  }
  return {displayName:([firstName,lastName].filter(Boolean).join(" ")||(username?"@"+username:"Участник клуба")).slice(0,256),firstName,lastName,username,photoUrl};
}
function dateValue(value){
  if(typeof value!=="string"||!value)return null;
  const timestamp=Date.parse(value);
  return Number.isFinite(timestamp)?timestamp:null;
}
function subscriptionPeriod(row,now){
  const start=dateValue(row.start_date),end=dateValue(row.end_date);
  const invalid=(row.start_date!=null&&start===null)||(row.end_date!=null&&end===null)||(start!==null&&end!==null&&end<=start);
  let status="inactive";
  if(row.status==="cancelled"||row.status==="canceled")status="cancelled";
  else if(row.status==="expired")status="expired";
  else if(row.status==="active"&&!invalid){
    if(end!==null&&end<=now)status="expired";
    else if(start!==null&&start>now)status="scheduled";
    else status="active";
  }
  return {row,start,end,invalid,status};
}
// Calculate each anniversary from the original UTC date, so Jan 31 -> Feb 28 -> Mar 31.
function monthAnniversary(timestamp,months){
  const date=new Date(timestamp),day=date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth()+months);
  const monthEnd=new Date(date);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth()+1,0);
  date.setUTCDate(Math.min(day,monthEnd.getUTCDate()));
  return date.getTime();
}
function accountSubscription(rows,now){
  const periods=rows.map(row=>subscriptionPeriod(row,now));
  const newest=(a,b)=>(b.start??-Infinity)-(a.start??-Infinity)||(dateValue(b.row.created_at)??0)-(dateValue(a.row.created_at)??0);
  const current=periods.filter(period=>period.status==="active").sort(newest);
  const scheduled=periods.filter(period=>period.status==="scheduled").sort((a,b)=>a.start-b.start);
  const selected=current[0]||scheduled[0]||periods.sort(newest)[0];
  const iso=timestamp=>timestamp===null?null:new Date(timestamp).toISOString();
  const subscription=selected?{
    status:selected.status,
    startDate:iso(selected.start),
    endDate:iso(selected.end),
    nextPaymentDate:iso(dateValue(selected.row.next_payment_date))
  }:{status:"none",startDate:null,endDate:null,nextPaymentDate:null};
  const loyalty={unlockedMonths:0,totalMonths:12,nextUnlockAt:null};
  if(!current.length)return {subscription,loyalty};
  // Only dated active records establish tenure. created_at is never a membership start.
  const intervals=periods.filter(period=>period.row.status==="active"&&!period.invalid&&period.start!==null)
    .map(period=>({start:period.start,end:period.end??Infinity})).sort((a,b)=>a.start-b.start);
  const continuous=[];
  for(const interval of intervals){
    const previous=continuous[continuous.length-1];
    if(previous&&interval.start<=previous.end)previous.end=Math.max(previous.end,interval.end);
    else continuous.push({...interval});
  }
  const membership=continuous.find(period=>period.start<=now&&period.end>now);
  if(!membership)return {subscription,loyalty};
  // A level is earned only after a complete calendar month; joining starts at zero.
  while(loyalty.unlockedMonths<12&&monthAnniversary(membership.start,loyalty.unlockedMonths+1)<=now)loyalty.unlockedMonths++;
  if(loyalty.unlockedMonths<12){
    const next=monthAnniversary(membership.start,loyalty.unlockedMonths+1);
    // A renewal not yet recorded must not be presented as an earned future level.
    if(next<membership.end)loyalty.nextUnlockAt=iso(next);
  }
  return {subscription,loyalty};
}
async function accountSubscriptions(studentId){
  const records=[],pageSize=1000;
  for(let offset=0;;offset+=pageSize){
    const page=await db("club_subscriptions?select=id,status,start_date,end_date,next_payment_date,created_at&student_id=eq."+encodeURIComponent(studentId)+"&order=created_at.desc,id.desc&limit="+pageSize+"&offset="+offset);
    if(!Array.isArray(page))throw Object.assign(new Error("Database operation failed"),{status:502});
    records.push(...page);
    if(page.length<pageSize)return records;
  }
}
function recommend(a){
  const s={understanding:0,attention:0,social:0,walks:0,home:0,emotions:0,advanced:0};
  const add=(k,n)=>s[k]+=n;
  if(a[0]===0){add("attention",3);add("home",1)}if(a[0]===1)add("emotions",3);if(a[0]===2)add("social",4);if(a[0]===3)add("advanced",3);
  if(a[1]===0||a[1]===1)add("home",3);if(a[1]===2)add("home",1);
  if(a[2]===0)add("walks",4);if(a[2]===1){add("walks",3);add("social",2)}if(a[2]===2)add("attention",2);
  if(a[3]===0||a[3]===1)add("social",4);if(a[3]===2)add("social",1);
  if(a[4]===0||a[4]===1)add("social",3);if(a[4]===2)add("social",1);
  if(a[5]===0)add("attention",5);if(a[5]===1)add("attention",4);if(a[5]===2)add("attention",2);
  if(a[6]===0)add("emotions",8);if(a[6]===1)add("emotions",4);
  if(a[7]===0)add("understanding",5);if(a[7]===1)add("understanding",3);if(a[7]===2)add("understanding",1);
  if(a[8]===0)add("attention",2);if(a[8]===1)add("emotions",2);if(a[8]===2){add("understanding",2);add("attention",1)}if(a[8]===3)add("advanced",1);
  if(a[9]===0){add("understanding",2);add("attention",1)}if(a[9]===1)add("understanding",1);if(a[9]===3)add("advanced",2);
  return Object.entries(s).sort((x,y)=>y[1]-x[1]).filter(x=>x[1]>0).slice(0,3).map(x=>x[0]);
}
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(!["GET","POST","DELETE"].includes(req.method)){res.setHeader("Allow","GET, POST, DELETE");return res.status(405).json({error:"Method not allowed"})}
  try{
    if(!process.env.NOYA_TELEGRAM_BOT_TOKEN)throw new Error("Missing NOYA bot configuration");
    const telegramUser=verify(req.method==="GET"?req.headers["x-telegram-init-data"]:req.body?.initData);
    const telegramId=String(telegramUser.id);
    if(req.method==="GET"&&req.query?.authOnly==="1")return res.status(200).json({ok:true,authenticated:true});
    if(!URL_BASE||!KEY)throw new Error("Missing database configuration");
    const students=await db("students?select=id&telegram_id=eq."+encodeURIComponent(telegramId)+"&limit=1");
    if(req.method==="GET"&&req.query?.account==="1"){
      if(!Array.isArray(students))throw Object.assign(new Error("Database operation failed"),{status:502});
      const subscriptions=students.length?await accountSubscriptions(students[0].id):[];
      return res.status(200).json({ok:true,user:telegramAccount(telegramUser),...accountSubscription(subscriptions,Date.now())});
    }
    if(!students?.length)return res.status(403).json({error:"Student profile not found"});
    const studentId=students[0].id;
    // Club and course have separate access rules.
    const [subscriptions,admins]=await Promise.all([
      db("club_subscriptions?select=id,status,start_date,end_date&student_id=eq."+studentId+"&status=eq.active&limit=20"),
      db("admins?select=id&telegram_id=eq."+encodeURIComponent(telegramId)+"&limit=1")
    ]);
    const now=Date.now();
    const activeClub=subscriptions.some(s=>(!s.start_date||Date.parse(s.start_date)<=now)&&(!s.end_date||Date.parse(s.end_date)>now));
    if(!activeClub&&!admins.length)return res.status(403).json({error:"Active club subscription required"});
    if(req.method==="DELETE"){
      const dogId=req.body?.dogId;
      if(typeof dogId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(dogId))return res.status(400).json({error:"Invalid dog ID"});
      const owned=await db("club_dogs?select=id,name&id=eq."+encodeURIComponent(dogId)+"&student_id=eq."+studentId+"&limit=1");
      if(!owned?.length)return res.status(404).json({error:"Dog not found"});
      await db("club_dogs?id=eq."+encodeURIComponent(dogId)+"&student_id=eq."+studentId,{method:"DELETE",headers:{Prefer:"return=minimal"}});
      return res.status(200).json({ok:true,deletedDogId:dogId});
    }
    if(req.method==="GET"){
      const dogs=await db("club_dogs?select=id,name,created_at&student_id=eq."+studentId+"&order=created_at.desc");
      const diagnostics=await db("club_diagnostics?select=id,dog_id,answers,recommended_topics,created_at&student_id=eq."+studentId+"&order=created_at.desc&limit=100");
      return res.status(200).json({ok:true,dogs,diagnostics});
    }
    const name=req.body?.dogName,answers=req.body?.answers;
    if(typeof name!=="string"||name.trim().length<1||name.trim().length>80||!Array.isArray(answers)||answers.length!==10||!answers.every(n=>Number.isInteger(n)&&n>=0&&n<=3))return res.status(400).json({error:"Invalid dog name or answers"});
    let dog;
    if(req.body?.dogId){
      if(typeof req.body.dogId!=="string"||!/^[a-f0-9-]{36}$/i.test(req.body.dogId))return res.status(400).json({error:"Invalid dog ID"});
      const owned=await db("club_dogs?select=id,name&id=eq."+encodeURIComponent(req.body.dogId)+"&student_id=eq."+studentId+"&limit=1");
      if(!owned?.length)return res.status(404).json({error:"Dog not found"});
      dog=owned[0];
    }else{
      const created=await db("club_dogs?select=id,name",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({student_id:studentId,name:name.trim()})});
      dog=created[0];
    }
    const topics=recommend(answers);
    const saved=await db("club_diagnostics?select=id,dog_id,created_at",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({dog_id:dog.id,student_id:studentId,answers,recommended_topics:topics})});
    return res.status(200).json({ok:true,dog,diagnostic:saved[0],topics,separationConcern:answers[6]===0});
  }catch(err){console.error("Club diagnostic error",err.message);return res.status(err.status||500).json({error:err.status?err.message:"Server error"})}
};

