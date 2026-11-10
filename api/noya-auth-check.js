const crypto=require('node:crypto');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const raw=req.body?.initData,token=process.env.NOYA_TELEGRAM_BOT_TOKEN;
  if(!token)return res.status(503).json({error:'NOYA bot is not configured'});
  if(typeof raw!=='string'||raw.length>8192)return res.status(401).json({error:'Telegram data missing'});
  const p=new URLSearchParams(raw),hash=p.get('hash'),stamp=Number(p.get('auth_date'));
  if(!hash||!/^[a-f0-9]{64}$/i.test(hash)||!Number.isFinite(stamp)||Math.abs(Date.now()/1000-stamp)>86400)return res.status(401).json({error:'Invalid or expired Telegram data'});
  p.delete('hash');
  const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
  const key=crypto.createHmac('sha256','WebAppData').update(token).digest();
  const digest=crypto.createHmac('sha256',key).update(check).digest();
  if(!crypto.timingSafeEqual(digest,Buffer.from(hash,'hex')))return res.status(401).json({error:'Telegram signature invalid'});
  let user;try{user=JSON.parse(p.get('user')||'{}')}catch{return res.status(401).json({error:'Invalid Telegram user'})}
  if(!Number.isSafeInteger(Number(user.id))||Number(user.id)<=0)return res.status(401).json({error:'Invalid Telegram user'});
  return res.status(200).json({ok:true,authenticated:true,firstName:typeof user.first_name==='string'?user.first_name.slice(0,80):''});
 }catch(e){console.error('NOYA auth check error',e.message);return res.status(500).json({error:'Server error'})}
};
