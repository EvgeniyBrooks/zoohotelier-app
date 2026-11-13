const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const club=read('club.html'),course=read('index.html');
function part(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}
class Element{
 constructor(){this.children=[];this.textContent='';this.hidden=false;this.value='';this.listeners={};this.dataset={};this.classList={remove(){}};}
 append(...v){this.children.push(...v)} replaceChildren(...v){this.children=v;this.textContent=''}
 setAttribute(k,v){this[k]=v} addEventListener(k,v){this.listeners[k]=v}
 querySelector(){return this.child||(this.child=new Element())} querySelectorAll(){return []}
}
function dom(){const els=new Map();return {els,getElementById(id){if(!els.has(id))els.set(id,new Element());return els.get(id)},createElement:()=>new Element(),createDocumentFragment:()=>new Element(),querySelectorAll:()=>[],documentElement:new Element(),addEventListener(){}};}
test('guest receives a Telegram entry action without checkout or database requests',async()=>{
 const document=dom();document.getElementById('noya-telegram-open').hidden=true;let called=0;
 const context=vm.createContext({document,window:{},location:{search:''},URLSearchParams,AbortController,setTimeout,clearTimeout,fetch:()=>{called++;throw Error('Unexpected network')}});
 vm.runInContext(part(club,'async function setupNoyaBilling(){','setupNoyaBilling();'),context);
 await context.setupNoyaBilling();assert.equal(called,0);assert.equal(document.getElementById('noya-telegram-open').hidden,false);assert.match(document.getElementById('noya-payment-state').textContent,/Telegram/);assert.equal(document.getElementById('noya-payment-redirect').hidden,false);
});
test('paid first-time member opens club without checkout, unpaid member reaches payment form',async()=>{
 for(const paid of [true,false]){
  const document=dom(),calls=[],redirects=[];
  const location={search:'',replace:url=>redirects.push(url)};
  const fetch=async url=>{calls.push(url);let data={};if(url.includes('club-trial'))data={paidActive:paid};else if(url.includes('status=1'))data={enabled:true};else if(url.includes('account=1'))data={subscription:null};else data={checkoutUrl:'https://merchant.payform.ru/test'};return {ok:true,json:async()=>data}};
  const context=vm.createContext({document,location,window:{Telegram:{WebApp:{initData:'fixture'}},location,setTimeout(){}},URLSearchParams,AbortController,setTimeout,clearTimeout,fetch});
  vm.runInContext(part(club,'async function setupNoyaBilling(){','setupNoyaBilling();'),context);await context.setupNoyaBilling();
  if(paid){assert.equal(document.getElementById('noya-payment-redirect').hidden,true);assert.equal(calls.length,1);assert.equal(redirects.length,0);}
  else{assert.deepEqual(redirects,['https://merchant.payform.ru/test']);assert.equal(document.getElementById('noya-payment-open').hidden,false);}
 }
});
test('new dog owner and diagnosed dog with no published route get useful next steps',()=>{
 const document=dom(),cards=[];
 const context=vm.createContext({document,clubDiagnostics:[],clubDogs:[],clubLessonCache:[],routeTopicLabels:{attention:'Внимание'},routeProgress:new Map(),updateRouteCard:(...v)=>cards.push(v)});
 vm.runInContext(part(club,'function renderRoute(){','async function submitPracticeFeedback'),context);
 context.renderRoute();assert.match(document.getElementById('route-status').textContent,/Добавь собаку/);
 document.getElementById('route-dog').value='dog';context.clubDogs.push({id:'dog',name:'Ноя'});context.clubDiagnostics.push({dog_id:'dog',recommended_topics:['attention']});
 context.renderRoute();assert.doesNotMatch(document.getElementById('route-status').textContent,/0 из 0/);assert.match(document.getElementById('route-status').textContent,/первое упражнение/);assert.equal(document.getElementById('route-topics').children[0].textContent,'Выбрать упражнение с НОЕЙ');
});
test('course deep links open a lesson without flashing the course overview',async()=>{
 for(const first of [true,false]){
  const id='11111111-1111-4111-8111-111111111111',opened=[],overview=[];
  const location={search:first?'':'?lesson='+id,hash:first?'#first-video':''};
  const context=vm.createContext({URLSearchParams,location,window:{location},console:{log(){}},authenticateTelegram:async()=>({access:{hasAccess:true}}),loadCourseState:async()=>{},courseProgress:{blocks:[{id:'block',block_number:0,title:'Предобучение'}],lessons:[{id,block_id:'block',day_number:1,is_published:true}]},loadCourse:async()=>overview.push(true),loadLesson:async(...v)=>opened.push(v)});
  vm.runInContext(part(course,'async function startApp() {','// START').replace(/\/\/ =+\s*$/,''),context);await context.startApp();
  assert.equal(overview.length,0);assert.equal(opened[0][0],id);
 }
});
test('catalog survives unavailable progress storage',async()=>{
 const context=vm.createContext({courseProgress:null,courseProgressRequest:async action=>{if(action==='course_progress')throw Error('offline');return {blocks:[{id:'block'}],lessons:[{id:'lesson'}]}}});
 vm.runInContext(part(course,'async function loadCourseState() {','async function loadCourse('),context);await context.loadCourseState();assert.equal(context.courseProgress.lessons.length,1);assert.equal(context.courseProgress.error,'offline');
});
test('switching dogs clears the previous conversation and invalidates pending answers',()=>{
 const document=dom(),history=[{role:'user',content:'Старая собака'}];document.querySelector=()=>new Element();
 const context=vm.createContext({document,aiHistory:history,aiConversationVersion:0,showAiNextStep(){}});
 vm.runInContext(part(club,'function resetAiConversation(){',"document.getElementById('ai-dog').addEventListener('change'"),context);
 context.resetAiConversation();assert.equal(history.length,0);assert.equal(context.aiConversationVersion,1);assert.equal(document.getElementById('ai-messages').children.length,1);
});
test('library network error survives tab changes and can be retried',async()=>{
 const document=dom(),tabs=[new Element(),new Element()];tabs[0].dataset.library='history';tabs[1].dataset.library='favorites';
 document.querySelectorAll=selector=>selector==='[data-library]'?tabs:[];
 let failed=true;const window={Telegram:{WebApp:{initData:'fixture'}},addEventListener(){}};
 const context=vm.createContext({document,window,location:{hash:''},fetch:async()=>{if(failed)throw Error('Связь потеряна');return {ok:true,json:async()=>({items:[]})}}});
 vm.runInContext(read('assets/noya-library.js'),context);await window.NOYALibrary.refresh();
 tabs[1].listeners.click();const box=document.getElementById('library-content').children[0];assert.equal(box.children[0].textContent,'Связь потеряна');assert.equal(box.children[1].textContent,'Попробовать ещё раз');
 failed=false;await box.children[1].onclick();assert.equal(document.getElementById('library-content').children[0].children[1].textContent,'Избранное пусто');
});
