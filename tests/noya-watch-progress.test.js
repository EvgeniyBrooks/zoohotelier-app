const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTracker}=require('../assets/noya-watch-progress.js');
test('video completion measures played intervals and ignores a jump to the end',()=>{
 const tracker=createTracker();
 assert.equal(tracker.observe(0,100,0),0);
 for(let i=1;i<=50;i++)assert.equal(tracker.observe(i,100,i*1000),i);
 assert.equal(tracker.observe(99,100,51000),50);
 assert.equal(tracker.observe(100,100,52000),51);
});
test('replaying the same section cannot increase the unique watched count',()=>{
 const tracker=createTracker();
 tracker.observe(0,100,0);
 for(let i=1;i<=50;i++)tracker.observe(i,100,i*1000);
 tracker.observe(0,100,51000);
 for(let i=1;i<=50;i++)assert.equal(tracker.observe(i,100,(51+i)*1000),50);
 for(let i=51;i<=100;i++)tracker.observe(i,100,(51+i)*1000);
 assert.equal(tracker.observe(100,100,152000),100);
});
test('normal double-speed playback counts and invalid samples do not complete a video',()=>{
 const tracker=createTracker();tracker.observe(0,100,0);
 for(let i=2;i<=100;i+=2)assert.equal(tracker.observe(i,100,i*500),i);
 assert.equal(createTracker().observe(NaN,100,0),0);
 assert.equal(createTracker().observe(100,Infinity,0),0);
});
