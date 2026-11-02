import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIREWORK_STYLES,FIREWORK_SIZE_FACTORS,
  FIREWORK_STYLE_PALETTES,fireworkPaletteFor,
  FireworkVariationPlanner,makeFireworkRandom
} from '../src/firework-variation.js';
import {PhysicsEngine} from '../src/physics.js';
import {FireworkFlight} from '../src/firework.js';

const produce=(pattern,size='M',seed=123,count=100)=>{
  const physics=new PhysicsEngine({
    width:390,height:844,maxParticles:420,random:makeFireworkRandom(seed)
  });
  const scale=FIREWORK_SIZE_FACTORS[size].scale;
  const spawned=physics.spawnBurst({
    x:230,y:170,count,speed:265,colors:['#ffe7ae','#a8eaff'],
    variation:{pattern,size,scale}
  });
  assert.equal(spawned,count);
  return physics;
};

test('six separate launch styles appear within first six fireworks, deterministically',()=>{
  const a=new FireworkVariationPlanner();
  const b=new FireworkVariationPlanner();
  const one=Array.from({length:12},()=>a.next({intensity:.8}));
  const two=Array.from({length:12},()=>b.next({intensity:.8}));
  assert.deepEqual(one,two,'seeded sequence is reproducible');
  assert.equal(new Set(one.slice(0,6).map(x=>x.pattern)).size,6);
  assert.ok(one.every(x=>FIREWORK_STYLES.includes(x.pattern)));
  assert.ok(one.every(x=>Object.hasOwn(FIREWORK_SIZE_FACTORS,x.size)));
  assert.ok(one.every(x=>x.scale>=.70&&x.scale<=1.56));
});
test('strong laugh favors larger fireworks; extraordinary bursts remain sparse',()=>{
  const tally=intensity=>{
    const planner=new FireworkVariationPlanner({random:makeFireworkRandom(6789)});
    return Array.from({length:400},()=>planner.next({intensity}).size);
  };
  const low=tally(.15),high=tally(.98);
  const big=sizes=>sizes.filter(x=>x==='L'||x==='XL').length;
  assert.ok(big(high)>big(low)+65,{low:big(low),high:big(high)});
  assert.ok(low.every(x=>x!=='XL'),'ordinary laugh never spawns XL');
  assert.ok(high.filter(x=>x==='XL').length>=3,'rare XL must be possible');
  let lastXL=-100;
  for(const [i,size] of high.entries())if(size==='XL'){
    assert.ok(i-lastXL>=6,'XL bursts need a six-launch cooldown');
    lastXL=i;
  }
});
test('lite mode suppresses L/XL and never permits unrestricted particle growth',()=>{
  const planner=new FireworkVariationPlanner({random:()=>.998});
  const picks=Array.from({length:25},()=>planner.next({intensity:1,quality:'lite'}));
  assert.ok(picks.every(x=>x.size==='M'||x.size==='S'));
  const physics=new PhysicsEngine({maxParticles:180,random:makeFireworkRandom(42)});
  for(const pattern of FIREWORK_STYLES)
    physics.spawnBurst({count:130,variation:{pattern,size:'M',scale:.9}});
  assert.ok(physics.particles.length<=180);
});
test('all six patterns change physically meaningful spark geometry',()=>{
  const rows=Object.fromEntries(FIREWORK_STYLES.map(pattern=>[
    pattern,produce(pattern,'M',101,140).particles
  ]));
  const speeds=pattern=>rows[pattern].map(p=>Math.hypot(p.vx,p.vy));
  const variability=values=>Math.max(...values)-Math.min(...values);
  const ringSpeeds=speeds('ring'),peonySpeeds=speeds('peony');
  assert.ok(variability(ringSpeeds)<variability(peonySpeeds)*.57,
    'ring trajectories should occupy a thin annular band');
  assert.ok(rows.chrysanthemum.filter(p=>p.sparkRole==='dust').length===0);
  assert.ok(rows.willow.every(p=>p.trailScale>=1.7&&p.gravityScale>=1.45));
  assert.ok(rows.strobe.every(p=>p.trailScale<=.56&&p.shimmerHz>=18));
  assert.ok(rows.double.some(p=>p.burstLayer==='outer'&&p.age===0));
  assert.ok(rows.double.some(p=>p.burstLayer==='inner'&&p.age<0));
  const distinct=FIREWORK_STYLES.map(p=>
    rows[p].slice(0,30).map(v=>[v.vx.toFixed(1),v.vy.toFixed(1)]).join('|'));
  assert.equal(new Set(distinct).size,6,'patterns must not share the same velocity path');
});
test('circular blooms emit balanced opposed pairs across a FULL 360 degrees',()=>{
  for(const pattern of ['peony','chrysanthemum','ring','double']){
    const physics=produce(pattern,'L',779,144);
    const groups=pattern==='double'?['outer','inner']:['main'];
    for(const layer of groups){
      const sparks=physics.particles.filter(p=>p.burstLayer===layer);
      assert.ok(sparks.length>=55,{pattern,layer,actual:sparks.length});
      const sectors=Array(8).fill(0);
      for(const p of sparks){
        const angle=(Math.atan2(p.vy,p.vx)+Math.PI*2)%(Math.PI*2);
        sectors[Math.floor(angle/(Math.PI/4))]++;
      }
      assert.ok(sectors.every(n=>n>=4),{pattern,layer,sectors});
      const pairMap=new Map();
      for(const p of sparks){
        if(!pairMap.has(p.pairIndex))pairMap.set(p.pairIndex,[]);
        pairMap.get(p.pairIndex).push(p);
      }
      let pairs=0;
      for(const group of pairMap.values()){
        if(group.length<2)continue;
        pairs++;
        const [a,b]=group;
        assert.equal(a.color,b.color,'opposite halves share the same color design');
        assert.ok(Math.hypot(a.vx+b.vx,a.vy+b.vy)<1e-6,
          'opposite sparks must balance: '+pattern+' / '+layer);
        assert.ok(Math.abs(a.r-b.r)/((a.r+b.r)/2)<.04);
      }
      assert.ok(pairs>=Math.floor(sparks.length/2)-1,{pattern,layer,pairs});
    }
  }
});
test('both double-bloom shells are complete circular layers, never complementary half-discs',()=>{
  const e=produce('double','M',31,140);
  const layers=['outer','inner'].map(layer=>e.particles.filter(p=>p.burstLayer===layer));
  const meanHorizontal=stars=>stars.reduce((x,p)=>x+p.vx,0)/stars.length;
  for(const stars of layers){
    const scale=stars.reduce((x,p)=>x+Math.abs(p.vx),0)/stars.length;
    assert.ok(Math.abs(meanHorizontal(stars))<Math.max(1,scale*.03),
      'each full circle must have its own balanced horizontal momentum');
  }
  const allColors=layers.map(stars=>new Set(stars.map(p=>p.color)));
  assert.notDeepEqual([...allColors[0]].sort(),[...allColors[1]].sort(),
    'two layers retain their own colors without being assigned to half a circle');
});
test('S and XL sizes create clearly different physical spread without infinite speeds',()=>{
  const small=produce('peony','S',14);
  const large=produce('peony','XL',14);
  const speedMean=engine=>engine.particles.reduce((v,p)=>v+Math.hypot(p.vx,p.vy),0)/engine.particles.length;
  assert.ok(speedMean(large)>speedMean(small)*1.7);
  for(const engine of [small,large]){
    for(let i=0;i<34;i++)engine.update(.016,null,0);
    assert.ok(engine.particles.length<=420);
    assert.ok(engine.particles.every(p=>
      Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.vx)&&Number.isFinite(p.vy)));
  }
});
test('double-shell inner wave stays invisible and collision-inactive until its own onset',()=>{
  const engine=produce('double','L',92,120);
  const inner=engine.particles.filter(p=>p.burstLayer==='inner');
  const old=inner.map(p=>({x:p.x,y:p.y}));
  assert.ok(inner.length>30);
  engine.update(.05,{cx:230,cy:170,rx:65,ry:70,valid:true,vx:0,vy:0},0);
  assert.ok(inner.every((p,i)=>p.age<0&&p.alpha===0&&p.x===old[i].x&&p.y===old[i].y));
  for(let i=0;i<21;i++)engine.update(.016,null,0);
  assert.ok(inner.some(p=>p.age>0),'secondary bloom should appear in the next 0.35s');
});
test('resource-limited double burst keeps both its outer and delayed inner layer',()=>{
  const e=new PhysicsEngine({width:390,height:844,maxParticles:100,
    random:makeFireworkRandom(47)});
  for(let i=0;i<52;i++)assert.ok(e.addParticle({kind:'spark',x:0,y:0,age:0,life:2}));
  const before=e.particles.length;
  const made=e.spawnBurst({x:190,y:180,count:95,
    variation:{pattern:'double',size:'L',scale:1.23}});
  const newParts=e.particles.slice(before);
  assert.equal(made,48);
  assert.ok(newParts.some(p=>p.burstLayer==='outer'));
  assert.ok(newParts.some(p=>p.burstLayer==='inner'&&p.age<0));
  assert.ok(e.particles.length<=e.maxParticles);
});
test('launch carries size and shape to the real physics burst and visual bloom metadata',()=>{
  const variation={pattern:'willow',size:'L',scale:1.08,countScale:1,sequence:1};
  const flights=new FireworkFlight({duration:.3});
  const physics=new PhysicsEngine({width:390,height:844,random:makeFireworkRandom(4)});
  assert.ok(flights.launch({
    x:290,startY:860,endY:120,count:60,speed:250,variation
  }));
  assert.equal(flights.update(.1,physics).length,0);
  assert.equal(flights.update(.1,physics).length,0);
  const blooms=flights.update(.1,physics);
  assert.equal(blooms.length,1);
  assert.equal(blooms[0].pattern,'willow');
  assert.equal(blooms[0].size,'L');
  assert.equal(blooms[0].count,60);
  assert.ok(physics.particles.every(p=>p.pattern==='willow'&&p.burstSize==='L'));
  assert.equal(flights.update(.1,physics).length,0);
});
test('six fireworks own different color signatures in both selectable visual themes',()=>{
  for(const theme of ['gold','mint']){
    const palettes=FIREWORK_STYLES.map(style=>fireworkPaletteFor(style,theme));
    assert.equal(palettes.length,6);
    assert.equal(new Set(palettes.map(x=>x.primary.join(','))).size,6);
    for(const scheme of palettes){
      assert.equal(scheme.primary.length,4);
      assert.equal(scheme.inner.length,4);
      assert.match(scheme.accent,/^#[0-9a-f]{6}$/i);
      assert.ok(scheme.primary.every(color=>/^#[0-9a-f]{6}$/i.test(color)));
    }
  }
  assert.notDeepEqual(FIREWORK_STYLE_PALETTES.double.gold.primary,
    FIREWORK_STYLE_PALETTES.double.gold.inner,
    'a double bloom must have an obvious second color layer');
});
test('individual blooms have large, medium and tiny stars with different brightness and lifetimes',()=>{
  for(const pattern of FIREWORK_STYLES){
    const physics=produce(pattern,'M',231,132);
    const stars=physics.particles;
    const hero=stars.filter(p=>p.sparkTier==='hero');
    const body=stars.filter(p=>p.sparkTier==='body');
    const fine=stars.filter(p=>p.sparkTier==='fine');
    assert.ok(hero.length>=15&&hero.length<=20,{pattern,hero:hero.length});
    assert.ok(body.length>=65&&body.length<=89,{pattern,body:body.length});
    assert.ok(fine.length>=28&&fine.length<=42,{pattern,fine:fine.length});
    assert.ok(Math.min(...hero.map(p=>p.r))>Math.max(...fine.map(p=>p.r))*2);
    assert.ok(hero.every(p=>p.brightness>body[0].brightness));
    assert.ok(fine.every(p=>p.brightness<body[0].brightness));
    assert.ok(new Set(stars.map(p=>p.r.toFixed(2))).size>60);
    assert.ok(new Set(stars.map(p=>p.life.toFixed(2))).size>45);
    const palette=fireworkPaletteFor(pattern,'gold');
    assert.ok(stars.every(p=>[...palette.primary,...palette.inner].includes(p.color)));
  }
});
test('each pattern palette is enforced, inner double shell switches to a contrasting palette',()=>{
  const chrys=produce('chrysanthemum','M',87,120);
  const ring=produce('ring','M',87,120);
  assert.ok(chrys.particles.every(p=>fireworkPaletteFor('chrysanthemum').primary.includes(p.color)));
  assert.ok(ring.particles.every(p=>fireworkPaletteFor('ring').primary.includes(p.color)));
  assert.equal(new Set(chrys.particles.map(p=>p.color)).size,4);
  assert.equal(new Set(ring.particles.map(p=>p.color)).size,4);
  assert.equal(chrys.particles.some(p=>ring.particles.some(q=>p.color===q.color)),false);
  const double=produce('double','L',87,120);
  const outer=double.particles.filter(p=>p.burstLayer==='outer');
  const inner=double.particles.filter(p=>p.burstLayer==='inner');
  const theme=fireworkPaletteFor('double','gold');
  assert.ok(outer.every(p=>theme.primary.includes(p.color)));
  assert.ok(inner.every(p=>theme.inner.includes(p.color)));
  assert.ok(inner.every(p=>p.age<0));
  assert.equal(new Set(outer.map(p=>p.color)).size,4);
  assert.equal(new Set(inner.map(p=>p.color)).size,4);
});
test('V9.8 all four scale and count factors are larger than the prior art direction',()=>{
  const previous={
    S:{scale:.68,count:.56},M:{scale:.87,count:.78},
    L:{scale:1.08,count:1},XL:{scale:1.28,count:1.08}
  };
  for(const size of ['S','M','L','XL']){
    const now=FIREWORK_SIZE_FACTORS[size],old=previous[size];
    assert.ok(now.scale>=old.scale*1.11,{size,now,old});
    assert.ok(now.count>old.count,{size,now,old});
  }
  assert.ok(FIREWORK_SIZE_FACTORS.XL.scale<=1.5,'oversized shell must be bounded');
});
