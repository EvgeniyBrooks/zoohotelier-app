const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../club.html'),'utf8');
const start=html.indexOf('async function makeNoyaTrialCampaign(){');
const source=html.slice(start,html.indexOf('const noyaAdminNav=',start));
function fixture(clipboard){
 const elements=new Map(),alerts=[],requests=[];
 function element(tag){
  return {tag,style:{},listeners:{},children:[],setAttribute(){},
   addEventListener(name,fn){this.listeners[name]=fn},
   prepend(child){this.children.unshift(child);elements.set(child.id,child)},
   replaceChildren(...children){this.children=children},
   focus(){this.focused=true},select(){this.selected=true},
   setSelectionRange(a,b){this.selection=[a,b]}};
 }
 elements.set('admin',element('section'));
 const context=vm.createContext({
  window:{Telegram:{WebApp:{initData:'test-session'}}},
  navigator:{clipboard},document:{getElementById:id=>elements.get(id),createElement:element},
  prompt:()=> 'Друзья — тест',alert:text=>alerts.push(text),
  fetch:async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({code:'test_campaign_123'})}}
 });
 vm.runInContext(source,context);
 return {context,elements,alerts,requests};
}
test('campaign creation preserves its link when clipboard permission is denied',async()=>{
 let calls=0;
 const f=fixture({writeText:async()=>{calls++;throw new Error('NotAllowedError')}});
 await f.context.makeNoyaTrialCampaign();
 assert.equal(calls,0);
 assert.equal(f.requests.length,1);
 assert.equal(f.requests[0].title,'Друзья — тест');
 const result=f.elements.get('noya-trial-result');
 const input=result.children[1],copy=result.children[2],status=result.children[3];
 assert.equal(input.value,'https://t.me/NoyaClubBrooksBot?startapp=trial_test_campaign_123');
 await copy.listeners.click();
 assert.equal(calls,1);
 assert.equal(f.requests.length,1);
 assert.equal(input.selected,true);
 assert.match(status.textContent,/Зажми/);
 assert.equal(f.alerts.length,0);
});
test('copy works on user click and creation works without clipboard support',async()=>{
 for(const clipboard of [undefined,{writeText:async()=>{}}]){
  const f=fixture(clipboard);
  await f.context.makeNoyaTrialCampaign();
  const result=f.elements.get('noya-trial-result');
  await result.children[2].listeners.click();
  assert.match(result.children[3].textContent,clipboard?/Ссылка скопирована/:/Зажми/);
  assert.equal(f.requests.length,1);
  assert.equal(f.alerts.length,0);
 }
});
