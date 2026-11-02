import test from 'node:test';
import assert from 'node:assert/strict';
import {FireworkCadence} from '../src/firework-cadence.js';

test('confirmed laugh launches immediately, then continues after the previous comet blooms',()=>{
  const c=new FireworkCadence({intervalsMs:[780,850]});
  assert.equal(c.update({now:1000,confirmedLaugh:true,firstBurst:true}),true);
  assert.equal(c.snapshot().nextAt,1780);
  assert.equal(c.update({now:1720,confirmedLaugh:true}),false);
  assert.equal(c.update({now:1780,confirmedLaugh:true}),true);
  assert.equal(c.update({now:1840,confirmedLaugh:true}),false);
  assert.equal(c.update({now:2630,confirmedLaugh:true}),true);
  assert.equal(c.snapshot().launches,3);
});
test('a single laugh followed by smile launches exactly one firework; no late timer',()=>{
  const c=new FireworkCadence();
  assert.equal(c.update({now:0,confirmedLaugh:true,firstBurst:true}),true);
  assert.equal(c.update({now:300,confirmedLaugh:false}),false);
  assert.equal(c.update({now:10000,confirmedLaugh:false}),false);
  assert.equal(c.snapshot().launches,0);
  assert.equal(c.update({now:10100,confirmedLaugh:true}),false);
  assert.equal(c.update({now:10200,confirmedLaugh:true,firstBurst:true}),true);
});
test('stale camera prediction never launches a new firework',()=>{
 const c=new FireworkCadence({intervalsMs:[750]});
 assert.equal(c.update({now:100,confirmedLaugh:true,firstBurst:true,fresh:false}),false);
 assert.equal(c.update({now:120,confirmedLaugh:true,firstBurst:true,fresh:true}),true);
 assert.equal(c.update({now:1200,confirmedLaugh:true,fresh:false}),false);
 assert.equal(c.snapshot().launches,1);
 assert.equal(c.update({now:1210,confirmedLaugh:true,fresh:true}),true);
});
test('initial confirmed laugh is held until a launch slot becomes free',()=>{
  const c=new FireworkCadence({intervalsMs:[780]});
  assert.equal(c.update({now:100,confirmedLaugh:true,firstBurst:true,canLaunch:false}),false);
  assert.equal(c.snapshot().pendingEntry,true);
  assert.equal(c.update({now:180,confirmedLaugh:true,firstBurst:false,canLaunch:true}),true);
  assert.equal(c.snapshot().launches,1);
  assert.equal(c.update({now:270,confirmedLaugh:false}),false);
  assert.equal(c.snapshot().pendingEntry,false);
});
test('max-flight or particle-capacity pressure defers launch rather than fabricating it',()=>{
 const c=new FireworkCadence({intervalsMs:[800]});
 c.update({now:0,confirmedLaugh:true,firstBurst:true});
 assert.equal(c.update({now:900,confirmedLaugh:true,canLaunch:false}),false);
 assert.equal(c.snapshot().launches,1);
 assert.equal(c.update({now:940,confirmedLaugh:true,canLaunch:true}),true);
 assert.equal(c.snapshot().launches,2);
});
test('long sustained laugh keeps sequence bounded by time, never by video frame rate',()=>{
 const c=new FireworkCadence({intervalsMs:[760,870,720]});
 let total=0;
 for(let now=0;now<=5000;now+=20)total+=Number(c.update({now,confirmedLaugh:true,firstBurst:now===0}));
 assert.ok(total>=6&&total<=8,total);
 assert.equal(c.snapshot().launches,total);
});
test('exaggerated laugh produces more launches than ordinary laugh in the same window',()=>{
 const run=intensity=>{
   const c=new FireworkCadence();
   const arrivals=[];
   for(let now=0;now<=6000;now+=25)
     if(c.update({now,confirmedLaugh:true,fresh:true,firstBurst:now===0,intensity}))
       arrivals.push(now);
   return arrivals;
 };
 const low=run(.22),high=run(.94);
 assert.ok(low.length>=4,{low});
 assert.ok(high.length>=low.length+2,{low,high});
 assert.ok(high.every((time,i)=>i===0||time-high[i-1]>=450),'never launches faster than safe minimum');
});
test('intensifying mid-laugh advances next launch without duplicating it',()=>{
 const c=new FireworkCadence();
 assert.equal(c.update({now:0,confirmedLaugh:true,firstBurst:true,intensity:.1}),true);
 const initialDue=c.snapshot().nextAt;
 for(let now=50;now<=300;now+=50)c.update({now,confirmedLaugh:true,intensity:1});
 const fasterDue=c.snapshot().nextAt;
 assert.ok(fasterDue<initialDue-180,{initialDue,fasterDue});
 const after=Math.ceil(fasterDue/50)*50;
 assert.equal(c.update({now:after,confirmedLaugh:true,intensity:1}),true);
 assert.equal(c.snapshot().launches,2);
 assert.equal(c.update({now:after+50,confirmedLaugh:true,intensity:1}),false);
});
test('stale frame and laugh exit stop adaptive launches immediately',()=>{
 const c=new FireworkCadence();
 assert.ok(c.update({now:0,confirmedLaugh:true,firstBurst:true,intensity:.9}));
 assert.equal(c.update({now:2000,confirmedLaugh:true,fresh:false,intensity:1}),false);
 assert.equal(c.snapshot().launches,1);
 assert.equal(c.update({now:2010,confirmedLaugh:false,intensity:1}),false);
 assert.equal(c.update({now:3500,confirmedLaugh:false,intensity:1}),false);
 assert.equal(c.snapshot().launches,0);
});
test('V9.8 stronger laughter launches noticeably more often without frame-by-frame bursts',()=>{
  const sample=intensity=>{
    const c=new FireworkCadence();
    const launches=[];
    for(let now=0;now<=6000;now+=20){
      if(c.update({now,confirmedLaugh:true,firstBurst:now===0,intensity}))
        launches.push(now);
    }
    return launches;
  };
  const normal=sample(.25),exaggerated=sample(.95);
  assert.ok(normal.length>=6,{normal});
  assert.ok(exaggerated.length>=normal.length+3,{normal,exaggerated});
  assert.ok(exaggerated.length<=15,'bounded high-intensity launch count');
  assert.ok(exaggerated.every((t,i)=>i===0||t-exaggerated[i-1]>=450));
  assert.ok(exaggerated.some((t,i)=>i>0&&t-exaggerated[i-1]<=540));
});
