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
  const user=JSON.parse(p.get("user")||"{}");
  if(!Number.isSafeInteger(Number(user.id))||Number(user.id)<=0)throw Object.assign(new Error("Telegram user missing"),{status:401});
  return String(user.id);
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
    const telegramId=verify(req.method==="POST"?req.body?.initData:req.headers["x-telegram-init-data"]);
    if(req.method==="GET"&&req.query?.authOnly==="1")return res.status(200).json({ok:true,authenticated:true});
    if(!URL_BASE||!KEY)throw new Error("Missing database configuration");
    const students=await db("students?select=id&telegram_id=eq."+encodeURIComponent(telegramId)+"&limit=1");
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
