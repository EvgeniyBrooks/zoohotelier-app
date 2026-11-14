'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {before,after}=require('node:test');
const {server,ENDPOINTS,REWRITES}=require('../server.cjs');
let origin;

before(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise(resolve=>server.close(resolve));});

test('Amvera serves the existing course, club and libraries unchanged',async()=>{
  for(const [uri,type] of [
    ['/','text/html'],['/club.html','text/html'],
    ['/index.html','text/html'],['/course-live.html','text/html'],
    ['/assets/noya-library.js','text/javascript'],
    ['/assets/noya-members.js','text/javascript']
  ]){
    const res=await fetch(origin+uri);
    assert.equal(res.status,200,uri);
    assert.match(res.headers.get('content-type')||'',new RegExp(type),uri);
    assert.ok((await res.text()).length>100,uri);
  }
});

test('Health endpoint does not reveal secrets or configuration',async()=>{
 const res=await fetch(origin+'/healthz');
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{ok:true,service:'noya-club'});
});

test('Private files are not exposed by static web serving',async()=>{
 for(const uri of ['/server.cjs','/package.json','/.env','/vercel.json',
   '/lib/club-checkout.js','/api/club-diagnostic.js',
   '/supabase/migrations/club_profiles_draft.sql',
   '/assets/%2e%2e%2fserver.cjs']){
  const res=await fetch(origin+uri);
  assert.equal(res.status,404,uri);
 }
});

test('Static HEAD and method restrictions are respected',async()=>{
 const head=await fetch(origin+'/club.html',{method:'HEAD'});
 assert.equal(head.status,200);assert.equal((await head.text()).length,0);
 const post=await fetch(origin+'/club.html',{method:'POST'});
 assert.equal(post.status,405);
});

test('11 API endpoints remain and every legacy rewrite has a destination',()=>{
 assert.equal(ENDPOINTS.size,12);
 for(const [old,[target]] of Object.entries(REWRITES)){
  assert.ok(old.startsWith('/api/'));
  assert.ok(ENDPOINTS.has(target));
 }
 assert.equal(Object.keys(REWRITES).length,8);
});

test('Malformed JSON is rejected before authentication',async()=>{
 const res=await fetch(origin+'/api/member-materials',{
  method:'POST',headers:{'content-type':'application/json'},body:'{bad json'
 });
 assert.equal(res.status,400);
 assert.match((await res.json()).error,/Invalid JSON/);
});

test('API handlers require real Telegram authentication',async()=>{
 const res=await fetch(origin+'/api/member-materials',{
  method:'POST',headers:{'content-type':'application/json'},body:'{}'
 });
 assert.equal(res.status,401);
});

test('Legacy admin and payment URLs still reach their handlers',async()=>{
 const legacy=await fetch(origin+'/api/admin-students',{method:'GET'});
 assert.equal(legacy.status,405);
 const status=await fetch(origin+'/api/club-checkout?status=1');
 assert.equal(status.status,200);
 const info=await status.json();
 assert.equal(info.ok,true);
 assert.equal(info.enabled,false);
});

test('Prodamus callbacks reach the correct handler and are never accepted without configuration',async()=>{
 const response=await fetch(origin+'/api/club-prodamus-webhook',{
  method:'POST',headers:{'content-type':'application/json'},body:'{}'
 });
 assert.equal(response.status,503);
 assert.match(await response.text(),/not configured/i);
});
