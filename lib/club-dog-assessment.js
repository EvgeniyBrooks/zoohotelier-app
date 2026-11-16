'use strict';
const schema=require('../assets/noya-dog-assessment');
const table='noya_dog_assessments';
const columns='student_id,answers,review,submitted_at,reviewed_at';
const fail=(status,message)=>Object.assign(new Error(message),{status});

function validated(value,fields){
 if(!value||typeof value!=='object'||Array.isArray(value))throw fail(400,'Заполни все обязательные поля.');
 const clean={};
 for(const [key,,optional] of fields){
  const answer=typeof value[key]==='string'?value[key].trim():'';
  if(answer.length>2000||(!optional&&!answer))throw fail(400,'Заполни обязательные поля. Допустимо до 2000 символов в каждом поле.');
  clean[key]=answer;
 }
 return clean;
}

function write(method,data,prefer='return=representation'){
 return {method,headers:{'Content-Type':'application/json',Prefer:prefer},body:JSON.stringify(data)};
}

async function assessment({db,req,action,telegramId,studentId,canSubmit}){
 if(action==='queue'||action==='reply'){
  const [reviewer]=await db('noya_assessment_reviewers?select=display_name&enabled=eq.true&telegram_id=eq.'+encodeURIComponent(telegramId));
  if(!reviewer)throw fail(403,'Панель доступна назначенному кинологу.');
  const own='reviewer_id=eq.'+encodeURIComponent(telegramId);
  if(action==='queue'&&req.method==='GET'){
   const assessments=[];
   for(let offset=0;;offset+=100){
    const rows=await db(table+'?select='+columns+'&'+own+'&order=reviewed_at.desc.nullsfirst,submitted_at.desc,student_id.asc&limit=100&offset='+offset);
    assessments.push(...rows.map(row=>({...row,reviewerName:reviewer.display_name})));
    if(rows.length<100)break;
   }
   return {assessments};
  }
  if(action==='reply'&&req.method==='POST'){
   const id=req.body?.studentId;
   if(typeof id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))throw fail(400,'Анкета не найдена.');
   const review=validated(req.body?.review,schema.review);
   const rows=await db(table+'?'+own+'&student_id=eq.'+encodeURIComponent(id)+'&review=is.null',
    write('PATCH',{review,reviewed_at:new Date().toISOString()}));
   if(!rows.length)throw fail(409,'Анкета недоступна или разбор уже опубликован.');
   return {ok:true};
  }
  throw fail(405,'Недопустимый метод.');
 }

 if(!studentId)throw fail(403,'Открой подарок в своём профиле.');
 const own='student_id=eq.'+encodeURIComponent(studentId);
 const read=async()=>{
  const [row]=await db(table+'?select='+columns+',noya_assessment_reviewers(display_name)&'+own+'&limit=1');
  if(!row)return null;
  return {review:row.review,submitted_at:row.submitted_at,reviewed_at:row.reviewed_at,
   reviewerName:row.noya_assessment_reviewers?.display_name};
 };
 if(action==='mine'&&req.method==='GET'){
  const existing=await read();
  if(!existing&&!await canSubmit())throw fail(403,'Анкета откроется после завершения второго месяца и оплаты третьего.');
  return {assessment:existing};
 }
 if(action==='submit'&&req.method==='POST'){
  const existing=await read();
  if(existing)return {assessment:existing};
  if(!await canSubmit())throw fail(403,'Анкета откроется после завершения второго месяца и оплаты третьего.');
  const answers=validated(req.body?.answers,schema.groups.flatMap(([,fields])=>fields));
  const [reviewer]=await db('noya_assessment_reviewers?select=telegram_id&enabled=eq.true&order=telegram_id.asc&limit=1');
  if(!reviewer)throw fail(503,'Приём анкет временно недоступен.');
  await db(table+'?on_conflict=student_id',write('POST',{student_id:studentId,reviewer_id:reviewer.telegram_id,answers},
   'resolution=ignore-duplicates,return=minimal'));
  const saved=await read();
  if(!saved)throw fail(502,'Не удалось сохранить анкету. Попробуй ещё раз.');
  return {assessment:saved};
 }
 throw fail(405,'Недопустимый метод.');
}

module.exports=assessment;
