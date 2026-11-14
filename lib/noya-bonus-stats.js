'use strict';
const {createHash}=require('node:crypto');
function monthStart(now=new Date()){
 const moscow=new Date(now.getTime()+3*3600000);
 return new Date(Date.UTC(moscow.getUTCFullYear(),moscow.getUTCMonth(),1)-3*3600000).toISOString();
}
function ranking(rows,viewer){
 const counts=new Map();
 for(const row of rows)if(row.credited_at)counts.set(row.inviter_student_id,(counts.get(row.inviter_student_id)||0)+1);
 const sorted=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
 let place=0,previous=null;
 const all=sorted.map(([id,count],i)=>{
  if(count!==previous)place=i+1;
  previous=count;
  return {place,count,isMe:id===viewer,label:id===viewer?'Ты':'Участник '+createHash('sha256').update('noya-bonus-rank:'+id).digest('hex').slice(0,6)};
 });
 return {leaders:all.slice(0,20),me:all.find(x=>x.isMe)||null,totalParticipants:all.length};
}
module.exports={monthStart,ranking};

