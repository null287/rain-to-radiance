import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameBudget} from '../src/frame-budget.js';

const feed=(b,raf,work,count,nowStart=0)=>{
  let changed=false;
  for(let i=0;i<count;i++)changed=b.record({rafMs:raf,workMs:work,now:nowStart+i*raf})||changed;
  return changed;
};
test('normal 60Hz drawing remains full quality without downscaling',()=>{
  const b=new FrameBudget({windowSize:10});
  feed(b,16.67,5,100);
  assert.equal(b.settings().quality,'full');
  assert.equal(b.settings().maxFps,60);
});
test('sustained expensive frames gradually downgrade and bound resources',()=>{
  const b=new FrameBudget({windowSize:10,cooldownMs:250,slowWindows:2});
  feed(b,29,18,22);
  assert.equal(b.quality,'balanced');
  feed(b,30,19,25,700);
  assert.equal(b.quality,'lite');
  assert.equal(b.settings().maxParticles,180);
  assert.equal(b.settings().captureWidth,320);
});
test('slow mode only recovers on sustained good frames and cooldown',()=>{
  const b=new FrameBudget({windowSize:10,slowWindows:1,goodWindows:2,cooldownMs:200});
  feed(b,29,21,10,500);
  assert.equal(b.quality,'balanced');
  feed(b,16.7,6,10,650);
  assert.equal(b.quality,'balanced');
  feed(b,16.7,6,25,900);
  assert.equal(b.quality,'full');
});
test('forced lite mode is reversible and does not overwrite auto quality',()=>{
  const b=new FrameBudget();
  assert.equal(b.settings(true).quality,'lite');
  assert.equal(b.settings().quality,'full');
  assert.equal(b.snapshot(true).autoQuality,'full');
});
test('invalid samples do not perturb quality and reset does not invent transitions',()=>{
  const b=new FrameBudget({windowSize:3});
  assert.equal(b.record({rafMs:NaN,workMs:-1,now:0}),false);
  assert.equal(b.samples.length,0);
  feed(b,30,20,2);
  b.reset();
  assert.equal(b.samples.length,0);
  assert.equal(b.transitions,0);
});
