import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsEngine} from '../src/physics.js';

const fixed=()=>.37;

test('rain never collides with the face or produces any impact event',()=>{
  const engine=new PhysicsEngine({width:390,height:844,maxParticles:200,random:fixed});
  const head={cx:170,cy:170,rx:90,ry:110,angle:0,vx:0,vy:0,valid:true};
  for(let i=0;i<18;i++)engine.update(.05,head,1);
  assert.ok(engine.particles.some(x=>x.kind==='rain'));
  assert.equal(engine.collisionCount,0);
  assert.deepEqual(engine.lastCollisions,[]);
  assert.ok(engine.particles.filter(x=>x.kind==='rain').every(x=>x.bounces===0));
});

test('sustained rain leaves guaranteed capacity for a laugh-triggered firework',()=>{
  const engine=new PhysicsEngine({width:390,height:844,maxParticles:220,random:fixed});
  for(let i=0;i<140;i++)engine.update(.05,null,1);
  const rainy=engine.particles.filter(x=>x.kind==='rain').length;
  assert.ok(rainy<=132,'40% of capacity remains reserved for sparks');
  const spawned=engine.spawnBurst({x:250,y:120,count:80,speed:240});
  assert.equal(spawned,80);
  assert.ok(engine.particles.length<=engine.maxParticles);
});

test('burst has layered, bounded comet/ember/dust roles and subdued lifetimes',()=>{
 const engine=new PhysicsEngine({width:390,height:844,maxParticles:200,random:fixed});
 engine.spawnBurst({x:250,y:120,count:90,speed:250,colors:['#f4ddac','#a5ddf4']});
 const effects=engine.particles;
 assert.deepEqual([...new Set(effects.map(p=>p.sparkRole))].sort(),['comet','dust','ember']);
 assert.ok(effects.every(p=>p.kind==='spark'&&p.life>0&&p.life<3.1));
 assert.ok(effects.every(p=>Number.isFinite(p.shimmerPhase)&&Number.isFinite(p.shimmerHz)));
 assert.ok(effects.every(p=>['#f4ddac','#a5ddf4'].includes(p.color)));
});
