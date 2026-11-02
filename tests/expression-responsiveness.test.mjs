import test from 'node:test';
import assert from 'node:assert/strict';
import {ExpressionController} from '../src/interaction.js';
import {FrameBudget} from '../src/frame-budget.js';

const feed=(c,start,end,smile,jaw,step=50)=>{
 const out=[];for(let t=start;t<=end;t+=step)out.push({t,...c.update({timestamp:t,hasFace:true,smile,jaw})});
 return out;
};

test('exposed-teeth grin stays a smile; clear open-mouth laugh triggers promptly',()=>{
 const c=new ExpressionController();
 feed(c,0,300,.45,.055);
 const grin=feed(c,350,850,.87,.218);
 assert.ok(grin.every(x=>x.state==='smile'),'visible teeth alone must not ignite a firework');
 assert.equal(grin.filter(x=>x.burst).length,0);
 const laughing=feed(c,900,1400,.87,.34);
 const at=laughing.find(x=>x.state==='laugh');
 assert.ok(at,'strong smile plus clearly open mouth should register laughter');
 assert.ok(at.t-900<=250,'laughter after score change should enter within 250 ms at 20Hz');
 assert.equal(laughing.filter(x=>x.burst).length,1);
});
test('moderate smile plus wide open joyful jaw can trigger, but plain open mouth cannot',()=>{
 const c=new ExpressionController();
 feed(c,0,250,.12,.03);
 const talking=feed(c,300,1250,.12,.92);
 assert.equal(talking.filter(x=>x.burst).length,0);
 assert.ok(talking.every(x=>x.state!=='laugh'));
 const excited=feed(c,1300,1850,.50,.45);
 assert.equal(excited.filter(x=>x.burst).length,1);
});
test('brief 50-100ms laughing noise does not trigger a burst',()=>{
 const c=new ExpressionController();
 feed(c,0,200,.10,.01);
 const spike=feed(c,250,300,.94,.55);
 const recover=feed(c,350,900,.1,.02);
 assert.equal([...spike,...recover].filter(x=>x.burst).length,0);
});
test('sustained laugh cannot spam, rearm requires genuine laugh exit',()=>{
 const c=new ExpressionController();
 const long=feed(c,0,2200,.9,.42);
 assert.equal(long.filter(x=>x.burst).length,1);
 feed(c,2250,2700,.4,.05);
 const again=feed(c,2750,3300,.9,.42);
 assert.equal(again.filter(x=>x.burst).length,1);
});
test('adaptive capture rates reduce perceived response latency without unbounded queues',()=>{
 const budget=new FrameBudget();
 assert.ok(budget.settings().captureInterval<=50);
 assert.ok(budget.settings().maxFps<=60);
 assert.ok(budget.settings(true).captureInterval>=90);
});
test('open-mouth recorded-laugh pattern triggers before old jaw-only threshold',()=>{
  const c=new ExpressionController();
  for(let t=0;t<=320;t+=40){
    c.update({timestamp:t,hasFace:true,smile:.76,jaw:.09,lipGap:.09});
  }
  const grin=[];
  for(let t=360;t<=840;t+=40){
    grin.push(c.update({timestamp:t,hasFace:true,smile:.88,jaw:.235,lipGap:.135}));
  }
  assert.ok(grin.every(x=>x.state==='smile'&&!x.burst),'teeth/grin alone stays rain');
  const laugh=[];
  for(let t=880;t<=1240;t+=40){
    laugh.push({t,...c.update({timestamp:t,hasFace:true,smile:.84,jaw:.235,lipGap:.23})});
  }
  const first=laugh.find(x=>x.burst);
  assert.ok(first,'open-mouth visual laughter should trigger despite jawOpen<.28');
  assert.ok(first.t<=1120,'late threshold recognition should not recur');
  assert.ok(first.visualIntensity>0);
  assert.equal(laugh.filter(x=>x.burst).length,1);
});
test('wide lip opening without a smile cannot launch a firework',()=>{
  const c=new ExpressionController();
  const events=[];
  for(let t=0;t<=1500;t+=50)
    events.push(c.update({timestamp:t,hasFace:true,smile:.17,jaw:.75,lipGap:.42}));
  assert.ok(events.every(e=>e.state!=='laugh'&&!e.burst));
});
test('clear lips-open laughter beats the jaw-only gate; mild toothy opening does not',()=>{
  const c=new ExpressionController();
  feed(c,0,300,.40,.02);
  const toothy=[];
  for(let t=350;t<=750;t+=50){
    toothy.push(c.update({timestamp:t,hasFace:true,smile:.89,jaw:.24,lipGap:.165}));
  }
  assert.ok(toothy.every(e=>e.state==='smile'&&!e.burst));
  const clearLaugh=[];
  for(let t=800;t<=1100;t+=50){
    clearLaugh.push(c.update({timestamp:t,hasFace:true,smile:.82,jaw:.188,lipGap:.25}));
  }
  assert.equal(clearLaugh.filter(x=>x.burst).length,1);
});
test('visual laugh intensity follows facial exaggeration, not any audio input',()=>{
  const c=new ExpressionController();
  const ordinary=feed(c,0,400,.72,.31);
  assert.ok(ordinary.some(x=>x.state==='laugh'));
  const low=c.snapshot().visualIntensity;
  const strong=feed(c,450,950,.94,.66);
  const high=strong.at(-1).visualIntensity;
  assert.ok(high>low+.3,{low,high});
  assert.ok(high<=1&&low>=0);
  const eased=feed(c,1000,1550,.74,.32);
  assert.ok(eased.at(-1).visualIntensity<high);
});
