'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const drip=require('../lib/course-drip.cjs');
const student='11111111-1111-4111-8111-111111111111',course='22222222-2222-4222-8222-222222222222';
const blocks=[
 {id:'pre',block_number:0,title:'Предобучение'},
 {id:'week1',block_number:1,title:'Быт и правила дома'},
 {id:'week2',block_number:2,title:'Социализация'}
];
const lessons=[
 {id:'pre1',block_id:'pre',day_number:1,title:'Предобучение 1',is_published:true},
 {id:'pre2',block_id:'pre',day_number:2,title:'Предобучение 2',is_published:true},
 {id:'day1',block_id:'week1',day_number:1,title:'Неделя 1 — День 1',is_published:true},
 {id:'day2',block_id:'week1',day_number:2,title:'Неделя 1 — День 2',is_published:true},
 {id:'day3',block_id:'week1',day_number:3,title:'Неделя 1 — День 3',is_published:true},
 {id:'day4',block_id:'week2',day_number:1,title:'Неделя 2 — День 1',is_published:true}
];
function fixture({done=[],started='2026-11-14T14:15:00Z',now='2026-11-14T14:15:00Z',admin=false,begin=true}={}){
 const calls=[];let start=started;
 const db=async(path,method,body)=>{
  calls.push({path,method,body});
  if(path.startsWith('course_blocks?'))return blocks;
  if(path.startsWith('lessons?'))return lessons;
  if(path.startsWith('course_lesson_completions?'))return done.map(lesson_id=>({lesson_id}));
  if(path==='rpc/noya_course_drip_start')return start;
  if(path.startsWith('noya_course_drip_starts?'))return [{started_at:start}];
  throw Error('Unexpected '+path);
 };
 return drip.buildCourseGate({db,student,courseId:course,admin,begin,now:Date.parse(now)}).then(result=>({result,calls}));
}
test('two pretraining lessons and first core lesson show immediately, subsequent days scheduled',async()=>{
 const {result}=await fixture();
 assert.equal(result.lessons.length,6);
 assert.equal(result.ensureLesson('pre1').available,true);
 assert.equal(result.ensureLesson('pre2').isPretraining,true);
 assert.equal(result.ensureLesson('pre2').lockReason,'previous');
 assert.equal(result.ensureLesson('day1').unlockAt,'2026-11-14T14:15:00Z');
 assert.equal(result.ensureLesson('day1').lockReason,'previous');
 assert.equal(result.ensureLesson('day2').unlockAt,'2026-11-15T07:00:00.000Z');
 assert.equal(result.ensureLesson('day3').unlockAt,'2026-11-16T07:00:00.000Z');
 assert.equal(result.ensureLesson('day4').unlockAt,'2026-11-17T07:00:00.000Z');
});
test('first pretraining must be watched before second and next before first week',async()=>{
 const first=(await fixture({done:['pre1']})).result;
 assert.equal(first.ensureLesson('pre2').available,true);
 assert.equal(first.ensureLesson('day1').lockReason,'previous');
 const second=(await fixture({done:['pre1','pre2']})).result;
 assert.equal(second.ensureLesson('day1').available,true);
 assert.equal(second.ensureLesson('day2').lockReason,'previous');
});
test('next day at ten Moscow unlocks only after predecessor is completed',async()=>{
 const complete=['pre1','pre2','day1'];
 const early=(await fixture({done:complete,now:'2026-11-15T06:59:59Z'})).result;
 assert.equal(early.ensureLesson('day2').available,false);
 assert.equal(early.ensureLesson('day2').lockReason,'time');
 const exact=(await fixture({done:complete,now:'2026-11-15T07:00:00Z'})).result;
 assert.equal(exact.ensureLesson('day2').available,true);
 const later=(await fixture({done:[...complete,'day2'],now:'2026-11-16T07:01:00Z'})).result;
 assert.equal(later.ensureLesson('day3').available,true);
 assert.equal(later.ensureLesson('day4').available,false);
});
test('drip schedule is anchored in the course open date, not recalculated per request',async()=>{
 const first=(await fixture({now:'2026-11-20T17:00:00Z'})).result;
 assert.equal(first.ensureLesson('day2').unlockAt,'2026-11-15T07:00:00.000Z');
 assert.equal(first.unlockHourMsk,10);
});
test('all blocks require previous lessons even after calendar days have elapsed',async()=>{
 const {result}=await fixture({done:['pre1','pre2','day1','day3'],now:'2027-01-01T10:00:00Z'});
 assert.equal(result.ensureLesson('day2').available,true);
 assert.equal(result.ensureLesson('day4').lockReason,'previous');
 assert.equal(result.ensureLesson('day4').previousTitle,'Неделя 1 — День 3');
});
test('admins can inspect or repair course without blocking learners',async()=>{
 const {result,calls}=await fixture({admin:true,begin:true});
 assert.ok(result.status.every(x=>x.available));
 assert.ok(!calls.some(x=>x.path==='rpc/noya_course_drip_start'));
});
test('daily clock time uses Moscow calendar days across year boundary',()=>{
 assert.equal(drip.releaseDate('2026-12-31T20:00:00Z',1),'2027-01-01T07:00:00.000Z');
 assert.equal(drip.releaseDate('2026-12-31T20:00:00Z',2),'2027-01-02T07:00:00.000Z');
});
test('server protects lesson details, Cloudflare token and completion against locked lessons',()=>{
 const s=fs.readFileSync(path.join(__dirname,'../api/stream-token.js'),'utf8');
 const library=fs.readFileSync(path.join(__dirname,'../api/member-materials.js'),'utf8');
 assert.match(s,/mustOpen\(state\.ensureLesson\(lessonId\)\)/);
 assert.match(s,/noya_course_watch_sessions/);
 assert.match(s,/watchedSeconds/);
 assert.match(s,/rpc\/noya_course_watch_begin/);
 assert.match(library,/type==='course'&&action==='complete'/);
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(html,/course-locked/);
 assert.match(html,/courseLockText/);
 assert.match(html,/watchedSeconds:Math\.min/);
 assert.doesNotMatch(html,/id="course-manual-complete"/);
});
