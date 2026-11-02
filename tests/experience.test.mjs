import test from 'node:test';
import assert from 'node:assert/strict';
import { ExpressionController } from '../src/interaction.js';
import { FireworkFlight } from '../src/firework.js';
import { PhysicsEngine } from '../src/physics.js';
import { advanceRain } from '../src/transition.js';

function stepExpression(c,start,end,smile,jaw){
  const out=[];
  for(let t=start;t<=end;t+=20)out.push(c.update({hasFace:true,smile,jaw,timestamp:t}));
  return out;
}

test('one vertical rocket flies upward to apex, then bursts once',()=>{
  const fire=new FireworkFlight({duration:.8});
  const physics=new PhysicsEngine({width:600,height:500,random:()=>.2});
  assert.equal(fire.launch({x:340,startY:520,endY:110,count:60,colors:['#ffdfab']}),true);
  let lastY=520;
  for(let i=0;i<7;i++){
    assert.equal(fire.update(.1,physics).length,0);
    assert.equal(fire.flights[0].x,340);
    assert.ok(fire.flights[0].y<lastY);
    lastY=fire.flights[0].y;
  }
  const blooms=fire.update(.1,physics);
  assert.equal(blooms.length,1);
  assert.equal(blooms[0].x,340);
  assert.equal(blooms[0].y,110);
  assert.equal(fire.flights.length,0);
  assert.equal(fire.detonations,1);
  assert.ok(physics.particles.length>0);
  assert.equal(fire.update(.1,physics).length,0);
  assert.equal(fire.detonations,1);
});

test('rocket does not vanish when expression target changes',()=>{
  const fire=new FireworkFlight({duration:.7});
  const physics=new PhysicsEngine({width:450,height:480});
  fire.launch({x:120,startY:480,endY:80,count:18});
  fire.update(.1,physics);
  const before=fire.flights[0].y;
  // No API for changing facial-expression state in flight: rocket is an independent event.
  fire.update(.1,physics);
  assert.ok(fire.flights[0].y<before);
  for(let i=0;i<4;i++)assert.equal(fire.update(.1,physics).length,0);
  assert.equal(fire.update(.1,physics).length,1);
});

test('returning to smile can rearm, without demanding a neutral face',()=>{
  const c=new ExpressionController({smoothingMs:0});
  stepExpression(c,0,280,.5,.04);
  const first=stepExpression(c,300,600,.9,.55);
  assert.equal(first.filter(r=>r.burst).length,1);
  const smile=stepExpression(c,620,1120,.5,.04);
  assert.equal(smile.at(-1).state,'smile');
  assert.equal(smile.at(-1).armed,true);
  assert.ok(smile.at(-1).rainLevel>0);
  const early=stepExpression(c,1140,1520,.9,.55);
  assert.ok(early.every(r=>!r.burst),'cooldown must not replay pending bursts');
  stepExpression(c,1540,2040,.5,.04);
  const later=stepExpression(c,2060,2440,.9,.55);
  assert.equal(later.filter(r=>r.burst).length,1);
});

test('rapid noisy laugh-smile oscillation cannot fire repeated rockets',()=>{
  const c=new ExpressionController({smoothingMs:0});
  const first=stepExpression(c,0,380,.9,.6);
  assert.equal(first.filter(x=>x.burst).length,1);
  let events=0;
  for(let t=400;t<1280;t+=40){
    const x=c.update({timestamp:t,hasFace:true,smile:t%80===0?.5:.9,jaw:t%80===0?.05:.5});
    events+=Number(x.burst);
  }
  assert.equal(events,0);
});

test('rain smoothly reverses mid-transition instead of snapping or starting over',()=>{
  let rain=0;
  for(let i=0;i<8;i++) rain=advanceRain(rain,1,.016);
  assert.ok(rain>.3 && rain<1);
  const growing=rain;
  rain=advanceRain(rain,0,.016);
  assert.ok(rain>0 && rain<growing);
  const falling=rain;
  rain=advanceRain(rain,1,.016);
  assert.ok(rain>falling && rain<1);
  assert.equal(advanceRain(.6,0,0),.6);
});

test('fireworks are bounded, invalid launches do not create state',()=>{
  const fire=new FireworkFlight({duration:.7,maxFlights:2});
  assert.equal(fire.launch({x:100,startY:450,endY:200}),true);
  assert.equal(fire.launch({x:200,startY:450,endY:140}),true);
  assert.equal(fire.launch({x:300,startY:450,endY:130}),false);
  assert.equal(fire.launch({x:NaN,startY:450,endY:130}),false);
  assert.equal(fire.flights.length,2);
  fire.reset();
  assert.equal(fire.flights.length,0);
});
