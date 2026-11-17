(function(root){
 'use strict';
 function createTracker(){
  let previous=null,previousAt=null,ranges=[];
  return {
   observe(position,duration,now){
    position=Number(position);duration=Number(duration);now=Number(now);
    if(!Number.isFinite(position)||!Number.isFinite(duration)||duration<=0||!Number.isFinite(now))return 0;
    position=Math.max(0,Math.min(position,duration));
    if(previous!==null){
     const delta=position-previous,elapsed=Math.max(0,(now-previousAt)/1000);
     // Ignore seeks; merge played intervals so repeats cannot inflate completion.
     if(delta>0&&delta<=Math.min(5,elapsed*2.5+.5)){
      ranges.push([previous,position]);ranges.sort((a,b)=>a[0]-b[0]);
      const merged=[];
      for(const range of ranges){
       const last=merged[merged.length-1];
       if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);
       else merged.push(range.slice());
      }
      ranges=merged;
     }
    }
    previous=position;previousAt=now;
    return Math.min(duration,ranges.reduce((sum,[start,end])=>sum+end-start,0));
   }
  };
 }
 const api={createTracker};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.NOYAWatchProgress=api;
})(typeof window==='object'?window:globalThis);
