'use strict';

// NOYA CLUB: Node.js HTTP adapter for Amvera.
// This preserves the existing Vercel-style (req, res) API handlers and paths.
// No Supabase data, Cloudflare videos, or payment secrets are stored here.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_WEBHOOK_BYTES = 120000;
const PUBLIC_PAGES = new Set([
  'index.html','club.html','club-demo.html','club-admin.html',
  'course-live.html','shop.html','club-terms.html','about.html',
  'community-rules.html','faq.html','policies.html','privacy.html',
  'journey.html','coach.html'
]);

const REWRITES = Object.freeze({
  '/api/club-checkout': ['club-diagnostic', 'noyaBilling', '1'],
  '/api/club-prodamus-webhook': ['club-diagnostic', 'noyaWebhook', '1'],
  '/api/club-reward-pdf': ['club-diagnostic', 'noyaPdf', '1'],
  '/api/admin-cohort-create': ['admin-cohorts', 'noyaLegacyAdmin', 'cohort-create'],
  '/api/admin-cohort-delete': ['admin-cohorts', 'noyaLegacyAdmin', 'cohort-delete'],
  '/api/admin-cohort': ['admin-cohorts', 'noyaLegacyAdmin', 'cohort'],
  '/api/admin-student-update': ['admin-cohorts', 'noyaLegacyAdmin', 'student-update'],
  '/api/admin-students': ['admin-cohorts', 'noyaLegacyAdmin', 'students']
});

const ENDPOINTS = new Set([
  'admin-cohorts','club-diagnostic','club-lessons','club-members',
  'club-progress','club-shop','club-trial','club-video-token',
  'member-materials','stream-token','telegram-auth','club-journey'
]);

const MIME = Object.freeze({
  '.html':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.webp':'image/webp',
  '.gif':'image/gif',
  '.ico':'image/x-icon',
  '.woff':'font/woff',
  '.woff2':'font/woff2'
});

const loaded = new Map();
async function handlerFor(name) {
  if(!ENDPOINTS.has(name))return null;
  if(!loaded.has(name)){
    const filename=path.join(ROOT,'api',name+'.js');
    loaded.set(name,import(pathToFileURL(filename).href).then(m=>{
      const handler=m.default || m;
      if(typeof handler!=='function')throw new Error('Invalid API export: '+name);
      return handler;
    }).catch(err=>{loaded.delete(name);throw err;}));
  }
  return loaded.get(name);
}

function json(res,code,data) {
  if(res.writableEnded)return;
  res.statusCode=code;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(data));
}

function addResponseMethods(res) {
  res.status=function(code){res.statusCode=code;return res;};
  res.json=function(body){json(res,res.statusCode||200,body);return res;};
  res.send=function(body){
    if(res.writableEnded)return res;
    if(body===undefined||body===null){res.end();return res;}
    if(typeof body==='object'&&!Buffer.isBuffer(body))return res.json(body);
    if(!res.hasHeader('Content-Type'))res.setHeader('Content-Type',
      Buffer.isBuffer(body)?'application/octet-stream':'text/plain; charset=utf-8');
    res.end(body);
    return res;
  };
  res.redirect=function(url){
    res.statusCode=302;res.setHeader('Location',String(url));res.end();return res;
  };
}

async function readBody(req,maxBytes=MAX_JSON_BYTES) {
  const chunks=[];let count=0;
  for await (const chunk of req) {
    count+=chunk.length;
    if(count>maxBytes) {
      const err=new Error('Request body too large');err.status=413;throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function prepareBody(req) {
  const type=String(req.headers['content-type']||'').toLowerCase();
  // Prodamus multipart signature verification requires the original stream;
  // lib/club-prodamus-webhook.js already implements bounded raw parsing.
  if(type.startsWith('multipart/form-data')) {
    if(Number(req.headers['content-length']||0)>MAX_WEBHOOK_BYTES) {
      const err=new Error('Callback too large');err.status=413;throw err;
    }
    return;
  }
  const body=await readBody(req);
  if(!body.trim()){req.body={};return;}
  if(type.includes('application/json')||type.includes('+json')) {
    try{req.body=JSON.parse(body);}
    catch{const err=new Error('Invalid JSON');err.status=400;throw err;}
    return;
  }
  if(type.includes('application/x-www-form-urlencoded')) {
    const result=Object.create(null);
    for(const [key,value] of new URLSearchParams(body)) {
      if(Object.hasOwn(result,key)) {
        const err=new Error('Duplicate form field');err.status=400;throw err;
      }
      result[key]=value;
    }
    req.body=result;
    return;
  }
  req.body=body;
}

async function serveApi(req,res,pathname,url) {
  const alias=REWRITES[pathname];
  const endpoint=alias?alias[0]:/^\/api\/([a-z0-9-]+)$/.exec(pathname)?.[1];
  if(!endpoint||!ENDPOINTS.has(endpoint)){
    return json(res,404,{error:'API not found'});
  }
  if(alias)url.searchParams.set(alias[1],alias[2]);
  req.query=Object.fromEntries(url.searchParams);
  req.originalUrl=req.url;
  res.setHeader('Cache-Control','private, no-store');
  if(!['GET','HEAD'].includes(req.method))await prepareBody(req);
  const handler=await handlerFor(endpoint);
  await handler(req,res);
  if(!res.writableEnded)res.end();
}

function assetPath(pathname) {
  if(pathname==='/'||pathname==='')return path.join(ROOT,'index.html');
  let clean;
  try{clean=decodeURIComponent(pathname);}
  catch{return null;}
  if(clean.startsWith('/assets/')) {
    if(clean.includes('\\')||clean.includes('\0'))return null;
    const filename=path.resolve(ROOT,'.'+clean);
    const prefix=path.join(ROOT,'assets')+path.sep;
    if(!filename.startsWith(prefix))return null;
    if(!Object.hasOwn(MIME,path.extname(filename).toLowerCase()))return null;
    return filename;
  }
  if(/^\/[a-z0-9-]+\.html$/i.test(clean)){
    const page=clean.slice(1);
    if(PUBLIC_PAGES.has(page))return path.join(ROOT,page);
  }
  return null;
}
async function serveStatic(req,res,pathname){
  if(req.method!=='GET'&&req.method!=='HEAD'){
    res.setHeader('Allow','GET, HEAD');return json(res,405,{error:'Method not allowed'});
  }
  const filename=assetPath(pathname);
  if(!filename)return json(res,404,{error:'Not found'});
  try{
    const stat=await fs.promises.stat(filename);
    if(!stat.isFile())return json(res,404,{error:'Not found'});
    res.statusCode=200;
    res.setHeader('Content-Type',MIME[path.extname(filename).toLowerCase()]||'text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-cache, must-revalidate');
    res.setHeader('Content-Length',stat.size);
    if(req.method==='HEAD'){res.end();return;}
    fs.createReadStream(filename).on('error',err=>{
      console.error('Static file stream error',err.code);
      if(!res.headersSent)json(res,500,{error:'Static file unavailable'});
      else res.destroy();
    }).pipe(res);
  }catch(err){
    if(err.code==='ENOENT'||err.code==='ENOTDIR')return json(res,404,{error:'Not found'});
    throw err;
  }
}

const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  addResponseMethods(res);
  try{
    const url=new URL(req.url||'/', 'http://localhost');
    const pathname=url.pathname;
    if(pathname==='/healthz')return json(res,200,{ok:true,service:'noya-club'});
    if(pathname.startsWith('/api/'))return await serveApi(req,res,pathname,url);
    return await serveStatic(req,res,pathname);
  }catch(error){
    console.error('NOYA HTTP request error:',error.status||500,error.message);
    if(!res.headersSent)json(res,error.status||500,{error:error.status?error.message:'Server error'});
    else res.destroy();
  }
});
server.requestTimeout=30000;
server.headersTimeout=35000;

if(require.main===module){
  if(!Number.isInteger(PORT)||PORT<1||PORT>65535)throw new Error('Invalid PORT');
  server.listen(PORT,HOST,()=>{
    console.log('NOYA CLUB listening on '+HOST+':'+PORT);
  });
  for(const signal of ['SIGTERM','SIGINT']) {
    process.on(signal,()=>server.close(()=>process.exit(0)));
  }
}

module.exports={server,REWRITES,ENDPOINTS,assetPath};
