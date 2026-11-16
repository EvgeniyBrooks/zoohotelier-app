'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const assessment=require('../lib/club-dog-assessment');
const schema=require('../assets/noya-dog-assessment');
const studentId='11111111-1111-4111-8111-111111111111';
const answers=Object.fromEntries(schema.groups.flatMap(([,fields])=>fields.map(([key])=>[key,'Ответ'])));
const review={observations:'Наблюдения',plan:'Первый шаг',progress:'Критерий'};

test('a member cannot submit before unlocking gift two',async()=>{
 await assert.rejects(assessment({db:async()=>[],req:{method:'POST',body:{answers}},
  action:'submit',studentId,canSubmit:async()=>false}),{status:403});
});
test('submission tries one insert, scoped to the signed student and configured reviewer',async()=>{
 const calls=[];
 const db=async(path,options)=>{
  calls.push({path,options});
  if(path.startsWith('noya_assessment_reviewers'))return [{telegram_id:456}];
  if(options)return [];
  return calls.length===1?[]:[{review:null,submitted_at:'2026-12-12'}];
 };
 const result=await assessment({db,req:{method:'POST',body:{answers,reviewer_id:999}},
  action:'submit',studentId,canSubmit:async()=>true});
 assert.equal(result.assessment.review,null);
 assert.equal(Object.hasOwn(result.assessment,'answers'),false);
 assert.match(calls[2].options.headers.Prefer,/ignore-duplicates/);
 assert.deepEqual(JSON.parse(calls[2].options.body),{student_id:studentId,reviewer_id:456,answers});
});
test('only an assigned reviewer can read or publish a final reply once',async()=>{
 const req={method:'POST',body:{studentId,review}};
 await assert.rejects(assessment({db:async()=>[],req,action:'reply',telegramId:'123'}),{status:403});
 const db=async(path,options)=>{
  if(!options)return [{display_name:'Специалист'}];
  assert.match(path,/reviewer_id=eq\.456/);
  assert.match(path,/review=is\.null/);
  assert.deepEqual(JSON.parse(options.body).review,review);
  return [];
 };
 await assert.rejects(assessment({db,req,action:'reply',telegramId:'456'}),{status:409});
});
