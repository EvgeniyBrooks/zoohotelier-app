const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const zlib=require('node:zlib');
const vm=require('node:vm');
const {server}=require('../server.cjs');let origin;
before(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;});
after(async()=>new Promise(r=>server.close(r)));
function get(path,encoding){return new Promise((resolve,reject)=>{http.get(origin+path,{headers:{'Accept-Encoding':encoding}},r=>{const chunks=[];r.on('data',x=>chunks.push(x));r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,body:Buffer.concat(chunks)}));}).on('error',reject);});}
test('HTML gzip preserves full page and materially reduces bytes',async()=>{
 const r=await get('/club.html','gzip');assert.equal(r.status,200);assert.equal(r.headers['content-encoding'],'gzip');
 const original=fs.readFileSync(require('node:path').join(__dirname,'../club.html'));
 assert.deepEqual(zlib.gunzipSync(r.body),original);assert.ok(r.body.length<original.length*.4);
 const plain=await get('/club.html','gzip;q=0');assert.equal(plain.headers['content-encoding'],undefined);assert.deepEqual(plain.body,original);
});
test('SDK and font are local, accessible, cached and use correct MIME',async()=>{
 for(const [path,mime] of [['/assets/telegram-web-app.js?v=20261123','text/javascript'],['/assets/oswald.ttf?v=20261123','font/ttf']]){
  const r=await get(path,'gzip');assert.equal(r.status,200);assert.match(r.headers['content-type'],new RegExp(mime));assert.match(r.headers['cache-control'],/max-age=86400/);
 }
});
test('billing startup JS compiles and no external SDK/font blocks the club shell',()=>{
 const html=fs.readFileSync(require('node:path').join(__dirname,'../club.html'),'utf8');
 assert.ok(!html.includes('src="https://telegram.org/js/telegram-web-app.js"'));assert.ok(!html.includes('fonts.googleapis.com'));
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g))if(!/src=|application\/json/.test(match[1]))new vm.Script(match[2]);
});
