import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planAscent,pointOnAscent,ascentForLaunch,ASCENT_MIX,
  burstPositionForLaunch
} from '../src/launch-path.js';
import {videoCoverRect,eraseBackgroundBehindPerson} from '../src/person-depth.js';
import {FireworkFlight} from '../src/firework.js';
import {PhysicsEngine} from '../src/physics.js';

test('the launch mix is EXACTLY seven straight and three subtle S-curves per ten',()=>{
  assert.equal(ASCENT_MIX.length,10);
  for(const offset of [0,10,20,100]){
    const observed=Array.from({length:10},(_,i)=>ascentForLaunch(offset+i));
    assert.equal(observed.filter(x=>x==='straight').length,7,observed);
    assert.equal(observed.filter(x=>x==='s-curve').length,3,observed);
    assert.ok(observed.every(x=>x==='straight'||x==='s-curve'));
  }
});
test('any bloom pattern may be straight or S; a normal rocket rises vertically',()=>{
  const styles=['peony','chrysanthemum','willow','ring','strobe','double'];
  for(const pattern of styles){
    const straight=planAscent({pattern,launchIndex:0,width:390,height:844});
    const curved=planAscent({pattern,launchIndex:2,width:390,height:844});
    assert.equal(straight.type,'straight');
    assert.equal(curved.type,'s-curve');
    assert.equal(straight.startX,straight.endX);
    assert.equal(straight.startY,886);
    for(const t of [.1,.25,.5,.75,.9]){
      assert.ok(Math.abs(pointOnAscent(straight,t).x-straight.endX)<.00001);
    }
    assert.ok(Math.abs(pointOnAscent(straight,1).y-straight.endY)<1e-6);
  }
});
test('S-curve is a restrained sideways flourish, not a snake path',()=>{
  const s=planAscent({pattern:'willow',launchIndex:2,width:390,height:844});
  const center=s.endX;
  const first=pointOnAscent(s,.25).x-center;
  const second=pointOnAscent(s,.75).x-center;
  assert.ok(first*second<0,'S must bend in opposite directions');
  assert.ok(Math.abs(first)<=8.5&&Math.abs(second)<=8.5);
  assert.ok(s.amplitude<=8.5&&s.amplitude>=4);
  const small=planAscent({launchIndex:2,width:320,height:740});
  assert.ok(small.amplitude<=8.5&&small.amplitude>=4);
});
test('independent bloom locations span LEFT CENTER RIGHT, no forced face anchor',()=>{
  const points=Array.from({length:30},(_,i)=>burstPositionForLaunch({
    launchIndex:i,width:390,height:844,
    size:i%3===0?'S':i%3===1?'M':'L',
    scale:i%3===0?.78:i%3===1?1:1.23
  }));
  assert.ok(points.every(x=>x.normalizedX>=.075&&x.normalizedX<=.925));
  assert.ok(points.some(x=>x.normalizedX<.24),points);
  assert.ok(points.some(x=>x.normalizedX>.77),points);
  assert.ok(points.some(x=>Math.abs(x.normalizedX-.5)<.065),points);
  assert.equal(new Set(points.map(p=>p.x.toFixed(1))).size,30);
});
test('bloom centers are upper-screen, with additional safe space for large shells',()=>{
  for(const i of [0,1,2,8,22]){
    const s=burstPositionForLaunch({launchIndex:i,width:390,height:844,size:'S'});
    const xl=burstPositionForLaunch({launchIndex:i,width:390,height:844,size:'XL'});
    assert.ok(s.normalizedY>=.17&&s.normalizedY<=.30);
    assert.ok(xl.normalizedY>=.17&&xl.normalizedY<=.30);
    assert.ok(xl.y>s.y+50,'larger blooms need more room above the center');
    const route=planAscent({launchIndex:i,width:390,height:844,size:'XL'});
    assert.ok(route.endY>=844*.16&&route.endY<=844*.30);
  }
});
test('rocket trajectory and bloom match their actual scattered end point',()=>{
  const route=planAscent({launchIndex:2,width:390,height:844,size:'M'});
  const flights=new FireworkFlight({duration:.65});
  const physics=new PhysicsEngine({maxParticles:300});
  assert.ok(flights.launch({x:route.startX,startY:route.startY,
    endY:route.endY,route,count:60,speed:220,
    variation:{pattern:'peony',size:'M',scale:1,depth:'front'}}));
  assert.equal(flights.flights[0].y,886);
  const blooms=[];
  for(let i=0;i<14;i++)blooms.push(...flights.update(.05,physics));
  assert.equal(blooms.length,1);
  assert.ok(Math.abs(blooms[0].x-route.endX)<.001);
  assert.ok(Math.abs(blooms[0].y-route.endY)<.001);
  assert.ok(physics.particles.every(p=>p.depth==='front'));
});
test('an obsolete rear request cannot reintroduce background fireworks',()=>{
  const physics=new PhysicsEngine({width:390,height:844,maxParticles:200,
    random:()=>.4});
  physics.spawnBurst({x:195,y:250,count:86,speed:230,
    variation:{pattern:'strobe',size:'M',scale:1,depth:'back'}});
  physics.update(.05,null,0);
  assert.ok(physics.particles.length>0);
  assert.ok(physics.particles.every(p=>p.depth==='front'));
});
test('previous portrait-mask library remains mathematically isolated',()=>{
  const crop=videoCoverRect(390,844,540,960);
  assert.equal(Math.round(crop.height),844);
  const calls=[];
  const ctx={
    save(){calls.push('save')},restore(){calls.push('restore')},
    translate(x,y){calls.push(['translate',x,y])},
    scale(x,y){calls.push(['scale',x,y])},
    drawImage(...args){calls.push(['drawImage',...args])},
    set globalCompositeOperation(v){calls.push(['composite',v])},
    set imageSmoothingEnabled(v){calls.push(['smooth',v])}
  };
  const mask={width:128,height:128};
  const layer=eraseBackgroundBehindPerson(ctx,{stageWidth:390,stageHeight:844,
    sourceWidth:540,sourceHeight:960,mask,maskTime:100,now:200,mirrored:true});
  assert.equal(layer,'model');
  assert.ok(calls.some(x=>Array.isArray(x)&&x[0]==='scale'&&x[1]===-1));
  // This legacy utility is not used by the active front-only renderer.
});
