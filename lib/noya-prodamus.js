'use strict';
const crypto = require('node:crypto');
function verifyTelegram(initData, botToken, now=Date.now()) {
  if (!botToken || typeof initData!=='string' || initData.length<10 || initData.length>8192) throw Object.assign(new Error('Telegram login required'),{status:401});
  const params=new URLSearchParams(initData);
  const hash=params.get('hash'),stamp=Number(params.get('auth_date'));
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash) || !Number.isFinite(stamp) || Math.abs(now/1000-stamp)>86400) throw Object.assign(new Error('Telegram session expired'),{status:401});
  params.delete('hash');
  const check=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([a,b])=>a+'='+b).join('\n');
  const secret=crypto.createHmac('sha256','WebAppData').update(botToken).digest();
  const actual=crypto.createHmac('sha256',secret).update(check).digest();
  if(!crypto.timingSafeEqual(actual,Buffer.from(hash,'hex'))) throw Object.assign(new Error('Telegram signature invalid'),{status:401});
  let user;
  try{user=JSON.parse(params.get('user')||'{}');}catch{throw Object.assign(new Error('Telegram profile required'),{status:401});}
  if(!user || typeof user!=='object' || Array.isArray(user) || !Number.isSafeInteger(Number(user.id)) || Number(user.id)<=0) throw Object.assign(new Error('Telegram profile required'),{status:401});
  return {id:String(user.id),first_name:String(user.first_name||'').slice(0,128),last_name:String(user.last_name||'').slice(0,128),username:String(user.username||'').slice(0,64)};
}
function canonical(value){
  if(Array.isArray(value)) return value.map(canonical);
  if(value && typeof value==='object'){
    const o={};
    Object.keys(value).sort().forEach(k=>{
      if(['__proto__','prototype','constructor'].includes(k)) throw Error('Unsafe signature key');
      o[k]=canonical(value[k]);
    });
    return o;
  }
  return value==null?'':String(value);
}
function signedPayload(payload,secret){
  if(!secret)throw Error('Missing Prodamus secret');
  const json=JSON.stringify(canonical(payload)).replace(/\//g,'\\/');
  return crypto.createHmac('sha256',secret).update(json).digest('hex');
}
function checkSignature(payload,signature,secret){
  if(typeof signature!=='string'||!/^[a-f0-9]{64}$/i.test(signature)||!secret)return false;
  return crypto.timingSafeEqual(Buffer.from(signedPayload(payload,secret),'hex'),Buffer.from(signature,'hex'));
}
function parseNestedForm(form){
  if(typeof form==='string') {
    if(form.length>100000)throw Error('Callback too large');
    form=Object.fromEntries(new URLSearchParams(form).entries());
  }
  if(!form || typeof form!=='object' || Array.isArray(form))throw Error('Invalid form');
  const root={};
  const keys=Object.keys(form);
  if(keys.length===0||keys.length>300)throw Error('Invalid form');
  for(const key of keys){
    if(key.length>180 || /(?:__proto__|prototype|constructor)/i.test(key))throw Error('Unsafe form key');
    const pieces=key.match(/^[^\[\]]+|\[[^\[\]]+\]/g);
    if(!pieces || pieces.join('')!==key)throw Error('Invalid form key');
    const path=pieces.map(p=>p.startsWith('[')?p.slice(1,-1):p);
    let obj=root;
    for(let i=0;i<path.length;i++){
      const segment=path[i];
      if(!/^[\w-]{1,80}$/.test(segment))throw Error('Invalid form segment');
      if(i===path.length-1) {
        obj[segment]=String(form[key]??'');
      }else {
        const nextIsIndex=/^\d+$/.test(path[i+1]);
        if(obj[segment]===undefined)obj[segment]=nextIsIndex?[]:{};
        if(!obj[segment] || typeof obj[segment]!=='object')throw Error('Invalid form nesting');
        obj=obj[segment];
      }
    }
  }
  return root;
}
function configuredPayformURL(value){
  if(typeof value!=='string')return null;
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname.endsWith('.payform.ru'))return null;
    return url;
  }catch{return null;}
}
function safePaymentLink(value){
  if(typeof value!=='string')return null;
  try{
    const url=new URL(value.trim());
    return url.protocol==='https:' && !url.username && !url.password && (url.hostname==='payform.ru'||url.hostname.endsWith('.payform.ru'))?url.href:null;
  }catch{return null;}
}
module.exports={verifyTelegram,canonical,signedPayload,checkSignature,parseNestedForm,configuredPayformURL,safePaymentLink};
