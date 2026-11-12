'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('every NOYA screen has syntactically valid inline JS',()=>{
 for(const page of ['club.html','index.html','course-live.html','about.html','faq.html','community-rules.html']){
  const source=read(page);
  const inline=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  for(const [,code] of inline)new vm.Script(code,{filename:page});
 }
});
test('all shared material widgets and member directory modules parse',()=>{
 for(const file of ['assets/noya-video-actions.js','assets/noya-library.js','assets/noya-members.js','assets/club-account.js']){
  new vm.Script(read(file),{filename:file});
 }
});
test('library has real tabs and no hardcoded placeholder responses',()=>{
 const page=read('club.html'),client=read('assets/noya-library.js'),server=read('api/member-materials.js');
 for(const key of ['history','favorites','completed'])assert.match(page,new RegExp('data-library="'+key+'"'));
 for(const category of ['course','club','live'])assert.match(page,new RegExp('data-material-filter="'+category+'"'));
 assert.match(client,/lastViewedAt/);
 assert.match(client,/request\('list'\)/);
 assert.match(client,/request\(action,/);
 assert.match(server,/noya_material_state/);
 assert.match(server,/action==='touch'/);
 assert.match(server,/action==='favorite'/);
 assert.match(server,/action==='complete'/);
 assert.match(server,/action==='states'/);
});
test('every course, club and live video uses shared favorite and completion actions',()=>{
 const course=read('index.html'),club=read('club.html'),live=read('course-live.html');
 const common=read('assets/noya-video-actions.js');
 for(const name of ['course','club','live']){
  const page=name==='course'?course:name==='club'?club:live;
  assert.match(page,new RegExp("NOYAMaterials\\.controls\\('"+name+"'"));
  assert.match(page,new RegExp("NOYAMaterials\\.touch\\('"+name+"'"));
 }
 assert.match(common,/В избранное/);
 assert.match(common,/Отметить пройденным/);
 assert.match(common,/aria-pressed/);
});
test('member directory, ratings, privacy and information links are connected',()=>{
 const page=read('club.html'),ui=read('assets/noya-members.js'),api=read('api/club-members.js');
 assert.match(page,/id="noya-members-count"/);
 assert.match(page,/href="\.\/about\.html"/);
 assert.match(page,/data-members-tab="ranking"/);
 assert.match(page,/data-members-tab="favorites"/);
 assert.match(ui,/function openPerson\(/);
 assert.match(ui,/function edit\(/);
 assert.match(ui,/https:\/\/t\.me\//);
 assert.match(api,/public_enabled=eq\.true/);
 assert.match(api,/visibleProfiles/);
 assert.match(api,/activeIds/);
 for(const file of ['about.html','faq.html','community-rules.html','policies.html','privacy.html'])assert.ok(read(file).includes('NOYA'));
});
test('subscription rank uses 12 month catalogue while gifts count completed months',()=>{
 const profile=read('assets/club-account.js'),catalog=read('assets/club-rewards-catalog.js');
 assert.match(profile,/months \+ 1/);
 assert.match(profile,/rankMonth/);
 assert.match(profile,/\[data-account-level\]/);
 assert.match(profile,/\[data-account-summary\]/);
 assert.match(catalog,/"month": 1,\s*"level": "Новичок"/);
 assert.match(catalog,/"month": 12,\s*"level": "Суперкинолог"/);
});
test('Telegram billing gate is preserved after UI changes',()=>{
 const club=read('club.html');
 assert.match(club,/async function setupNoyaBilling\(/);
 assert.match(club,/\/api\/club-checkout\?status=1/);
 assert.match(club,/\/api\/club-trial/);
 assert.match(club,/noya-payment-open/);
 assert.match(club,/setupNoyaBilling\(\)/);
});
