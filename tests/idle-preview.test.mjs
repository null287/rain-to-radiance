import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IdlePreviewEngine,previewPhaseAt,PREVIEW_SMILE_TO_LAUGH_AT,
  PREVIEW_LAUGH_START_FIREWORK
} from '../src/idle-preview.js';

const frame=(engine,time,options={})=>engine.update({
  time,now:time*1000,dt:.05,width:390,height:844,
  palette:'gold',quality:'balanced',...options
});

test('one prerecorded person has a timed smile→laugh reveal, not fake face inference',()=>{
  assert.equal(previewPhaseAt(0),'smile');
  assert.equal(previewPhaseAt(2),'smile');
  assert.equal(previewPhaseAt(PREVIEW_SMILE_TO_LAUGH_AT-.001),'smile');
  assert.equal(previewPhaseAt(PREVIEW_SMILE_TO_LAUGH_AT),'laugh');
  assert.ok(PREVIEW_LAUGH_START_FIREWORK>PREVIEW_SMILE_TO_LAUGH_AT);
});
test('autoplay visual preview first rains then launches actual fireworks',()=>{
  const engine=new IdlePreviewEngine();
  let rain,late,max=0;
  for(let tick=0;tick<=245;tick++){
    const t=tick*.05;
    const result=frame(engine,t);
    max=Math.max(max,result.particles);
    if(tick===60)rain=result;
    if(tick===220)late=result;
  }
  assert.equal(rain.phase,'smile');
  assert.ok(rain.rainEnvelope>.6&&rain.particles>0,rain);
  assert.equal(rain.bursts,0,'smile segment must never fire a rocket');
  assert.equal(late.phase,'laugh');
  assert.ok(late.bursts>=3&&late.detonations>=2,late);
  assert.ok(late.rainEnvelope<.03,'rain fades as laughter begins');
  assert.ok(max<=215,'autoplay keeps a separate bounded particle budget');
  assert.equal(late.source,'prerecorded-timed-visual-preview-not-face-inference');
});
test('preview cleanly restarts at clip loop and immediately returns to smile/rain',()=>{
  const engine=new IdlePreviewEngine();
  for(let i=0;i<=240;i++)frame(engine,i*.05);
  assert.ok(engine.snapshot().bursts>2);
  const wrapped=frame(engine,.10);
  assert.equal(wrapped.loops,1);
  assert.equal(wrapped.phase,'smile');
  assert.equal(wrapped.bursts,0);
  assert.equal(wrapped.detonations,0);
  for(let i=1;i<=50;i++)frame(engine,.1+i*.05);
  assert.ok(engine.snapshot().rainEnvelope>.5);
});
test('reduced-motion preview can show video and rain without flashing fireworks',()=>{
  const engine=new IdlePreviewEngine();
  for(let i=0;i<=220;i++)frame(engine,i*.05,{reduceMotion:true});
  const result=engine.snapshot();
  assert.equal(result.phase,'laugh');
  assert.equal(result.bursts,0);
  assert.ok(result.particles<=95);
});
test('idle preview is separate from real AR controllers and can reset without leaks',()=>{
  const a=new IdlePreviewEngine();
  frame(a,8.1);frame(a,9.5);
  const b=new IdlePreviewEngine();
  assert.notStrictEqual(a.physics,b.physics);
  a.reset();
  assert.equal(a.snapshot().bursts,0);
  assert.equal(a.snapshot().particles,0);
  assert.equal(a.snapshot().enabled,false);
});

test('landing preview replays measured face geometry and produces real contour collisions',()=>{
  const engine=new IdlePreviewEngine();let hits=0,outlinePoints=0;
  for(let i=0;i<365;i++){
    const t=i/30;
    const view=engine.update({time:t,now:t*1000,dt:1/30,width:390,height:844,palette:'gold',quality:'balanced'});
    hits=Math.max(hits,view.collisions||0);outlinePoints=Math.max(outlinePoints,view.outlinePoints||0);
  }
  assert.equal(outlinePoints,36,'same actual facial contour, not a centered body proxy');
  assert.ok(hits>0,'the automatic sample must visibly interact with the real recorded face');
});
