'use strict';
// One shared, server-authoritative schedule for Attention Management.
// All video token and lesson-completion endpoints must use this module.
// Pretraining is displayed immediately; video playback remains sequential.
const DAY=86400000,HOUR=3600000,MOSCOW_OFFSET=3*HOUR;
function hour(){
 const value=process.env.NOYA_COURSE_UNLOCK_HOUR_MSK;
 const n=value===undefined||value===''?10:Number(value);
 return Number.isInteger(n)&&n>=0&&n<=23?n:10;
}
function releaseDate(started,dayIndex){
 const start=Date.parse(started);
 if(!Number.isFinite(start)||dayIndex<0)return null;
 // New core lesson on the NEXT Moscow calendar day at the same clock hour.
 // Moscow is UTC+03 with no daylight-saving changes.
 const moscowDayStart=Math.floor((start+MOSCOW_OFFSET)/DAY)*DAY-MOSCOW_OFFSET;
 return new Date(moscowDayStart+dayIndex*DAY+hour()*HOUR).toISOString();
}
function describeGate(lesson,previous,done,startedAt,now,admin=false,firstIncomplete=null){
 const completed=done.has(lesson.id);
 const idx=lesson.dripIndex;
 const unlockAt=idx===null?null:idx===0?startedAt:releaseDate(startedAt,idx);
 const timeReady=idx===null||idx===0||(unlockAt&&Date.parse(unlockAt)<=now);
 const previousDone=!firstIncomplete&&(!previous||done.has(previous.id));
 const available=admin||Boolean(timeReady&&previousDone);
 return {
  available,completed,unlockAt,
  lockReason:available?null:!previousDone?'previous':'time',
  previousTitle:previousDone?null:firstIncomplete?.title||previous?.title||null,
  isPretraining:lesson.blockNumber===0
 };
}
async function buildCourseGate({db,student,courseId,admin=false,begin=false,now=Date.now()}){
 const [blocks,allLessons,completions]=await Promise.all([
  db('course_blocks?select=id,block_number,title&course_id=eq.'+courseId+'&order=block_number.asc&limit=100'),
  db('lessons?select=id,block_id,day_number,title,is_published&is_published=eq.true&order=day_number.asc&limit=500'),
  db('course_lesson_completions?select=lesson_id&student_id=eq.'+student+'&limit=500')
 ]);
 const ids=new Set(blocks.map(b=>b.id)),numbers=new Map(blocks.map(b=>[b.id,b.block_number]));
 const lessons=allLessons.filter(l=>ids.has(l.block_id)).sort((a,b)=>
  (numbers.get(a.block_id)-numbers.get(b.block_id))||(a.day_number-b.day_number)||(a.id.localeCompare(b.id))
 );
 const complete=new Set(completions.map(c=>c.lesson_id));
 const startRows=begin&&!admin
  ? await db('rpc/noya_course_drip_start','POST',{p_student_id:student,p_course_id:courseId})
  : await db('noya_course_drip_starts?select=started_at&student_id=eq.'+student+'&course_id=eq.'+courseId+'&limit=1');
 const savedStart=Array.isArray(startRows)?startRows[0]?.started_at:startRows;
 const startedAt=typeof savedStart==='string'&&Number.isFinite(Date.parse(savedStart))?savedStart:new Date(now).toISOString();
 let coreIndex=0;
 const ordered=lessons.map(l=>({...l,blockNumber:numbers.get(l.block_id),dripIndex:numbers.get(l.block_id)===0?null:coreIndex++}));
 const state=new Map(),status=[];
 let firstIncomplete=null;
 for(let i=0;i<ordered.length;i++){
  const lesson=ordered[i],prior=ordered[i-1]||null;
  // A completed later lesson from an old record must never permit skipping gaps.
  const eligibility=describeGate(lesson,prior,complete,startedAt,now,admin,firstIncomplete);
  const entry={id:lesson.id,...eligibility};
  state.set(lesson.id,entry);status.push(entry);
  if(!complete.has(lesson.id)&&!firstIncomplete)firstIncomplete=lesson;
 }
 return {blocks,lessons:ordered,state,status,startedAt:admin?null:startedAt,begin:!!savedStart||admin,unlockHourMsk:hour(),completed:complete,
   ensureLesson(id){return state.get(id)||null;}
 };
}
module.exports={buildCourseGate,describeGate,releaseDate,hour};
