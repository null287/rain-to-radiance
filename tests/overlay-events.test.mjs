import test from 'node:test';
import assert from 'node:assert/strict';
import {OverlayEventBus,scriptedDemoEvent} from '../src/overlay-events.js';

test('uniform typed channel dispatches simulation and AR events separately',()=>{
  let current=1000;const bus=new OverlayEventBus({clock:()=>current});
  const got=[];const unsubscribe=bus.subscribe(e=>got.push(e));
  assert.equal(bus.emit({type:'invalid'}),false);
  const sim=bus.emit({type:'chat',name:' demo ',message:' hi ',source:'sim'});
  assert.equal(sim.source,'sim');assert.equal(sim.name,'demo');assert.equal(sim.message,'hi');
  const ar=bus.emit({type:'ar',source:'ar',cue:'collision',message:'impact'});
  assert.equal(ar.source,'ar');assert.equal(ar.cue,'collision');
  assert.deepEqual(got.map(e=>e.type),['chat','ar']);
  unsubscribe();bus.emit({type:'like'});
  assert.equal(got.length,2);
});
test('event payloads are bounded, text is safe to render without HTML',()=>{
  const bus=new OverlayEventBus({maxPerWindow:100});
  const e=bus.emit({type:'gift',name:'test'.repeat(20),message:'hello\n'.repeat(25),count:9999});
  assert.ok(e.name.length<=24);assert.ok(e.message.length<=96);
  assert.equal(e.count,99);assert.ok(!e.message.includes('\n'));
  assert.equal(Object.isFrozen(e),true);
});
test('windowed rate limiter drops floods then resumes later',()=>{
  let now=1000;
  const bus=new OverlayEventBus({clock:()=>now,maxPerWindow:2,windowMs:500});
  assert.ok(bus.emit({type:'like'}));assert.ok(bus.emit({type:'like'}));
  assert.equal(bus.emit({type:'like'}),false);assert.equal(bus.snapshot().dropped,1);
  now+=501;assert.ok(bus.emit({type:'like'}));
});
test('intentional manual preview remains responsive under AR/auto floods, but is still bounded',()=>{
  let now=1000;
  const bus=new OverlayEventBus({
    clock:()=>now,maxPerWindow:2,maxManualPerWindow:3,windowMs:500
  });
  assert.ok(bus.emit({type:'ar',source:'ar',cue:'bloom'}));
  assert.ok(bus.emit({type:'ar',source:'ar',cue:'collision'}));
  assert.equal(bus.emit({type:'chat',source:'sim'}),false);
  const events=['gift','like','chat'].map(type=>bus.emit({type,source:'sim',manual:true}));
  assert.ok(events.every(Boolean));
  assert.deepEqual(events.map(e=>e.type),['gift','like','chat']);
  assert.equal(bus.emit({type:'join',source:'sim',manual:true}),false);
  now+=501;
  assert.ok(bus.emit({type:'join',source:'sim',manual:true}));
  bus.clear();
  assert.equal(bus.snapshot().dropped,0);
  assert.ok(bus.emit({type:'gift',source:'sim',manual:true}));
});
test('history and duplicate IDs remain bounded',()=>{
  const bus=new OverlayEventBus({capacity:3,maxPerWindow:100});
  assert.ok(bus.emit({id:'t1',type:'chat'}));
  assert.equal(bus.emit({id:'t1',type:'chat'}),false);
  for(let i=2;i<=4;i++)assert.ok(bus.emit({id:'t'+i,type:'chat'}));
  assert.equal(bus.snapshot().events,3);
  assert.ok(bus.emit({id:'t1',type:'chat'}));
  assert.equal(bus.snapshot().events,3);
  bus.clear();assert.equal(bus.snapshot().events,0);
});
test('scripted demo supports chat, like, gift, join without accounts',()=>{
  const types=new Set(Array.from({length:9},(_,i)=>scriptedDemoEvent(i).type));
  assert.deepEqual([...types].sort(),['chat','gift','join','like']);
  for(let i=0;i<9;i++){
    const e=scriptedDemoEvent(i);assert.equal(e.source,'sim');
    assert.ok(!e.sessionCookie&&!e.accessToken);
  }
});
