import test from 'node:test';
import assert from 'node:assert/strict';
import {LaughTemporalEvidence} from '../src/laugh-temporal.js';
import {ExpressionController} from '../src/interaction.js';

test('two fresh, separated mouth-open smile frames stabilize a head-lean laugh',()=>{
  const e=new LaughTemporalEvidence();
  assert.equal(e.update({timestamp:100,hasFace:true,smile:.54,jaw:.32,lipGap:.23}).supported,false);
  assert.equal(e.update({timestamp:175,hasFace:true,smile:.41,jaw:.31,lipGap:.22}).supported,false);
  const result=e.update({timestamp:240,hasFace:true,smile:.67,jaw:.44,lipGap:.27});
  assert.equal(result.supported,true);
  assert.equal(result.firstAt,100);
  assert.equal(result.witnessCount,2);
});
test('toothy grin, isolated jaw opening and same-frame duplication are insufficient',()=>{
  const e=new LaughTemporalEvidence();
  for(let time=0;time<=550;time+=50){
    assert.equal(e.update({timestamp:time,hasFace:true,smile:.89,jaw:.24,lipGap:.13}).supported,false);
  }
  for(let time=600;time<=1100;time+=50){
    assert.equal(e.update({timestamp:time,hasFace:true,smile:.10,jaw:.7,lipGap:.40}).supported,false);
  }
  e.reset();
  assert.equal(e.update({timestamp:0,hasFace:true,smile:.67,jaw:.40,lipGap:.26}).supported,false);
  assert.equal(e.update({timestamp:0,hasFace:true,smile:.67,jaw:.40,lipGap:.26}).supported,false);
});
test('missing face clears short-term evidence and cannot manufacture fireworks',()=>{
  const e=new LaughTemporalEvidence();
  e.update({timestamp:0,hasFace:true,smile:.55,jaw:.31,lipGap:.22});
  assert.equal(e.update({timestamp:90,hasFace:false}).supported,false);
  assert.equal(e.update({timestamp:130,hasFace:true,smile:.65,jaw:.38,lipGap:.24}).supported,false);
  assert.equal(e.update({timestamp:280,hasFace:true,smile:.64,jaw:.35,lipGap:.23}).supported,true);
  assert.equal(e.update({timestamp:281,hasFace:false}).supported,false);
});
test('experimental temporal route resolves face-score flicker; original route remains selectable',()=>{
  const run=enabled=>{
    const c=new ExpressionController();c.setTemporalEnabled(enabled);
    for(let t=0;t<=300;t+=50)c.update({timestamp:t,hasFace:true,smile:.28,jaw:.02,lipGap:.01});
    const rows=[
      {t:350,smile:.53,jaw:.32,lipGap:.23},
      {t:425,smile:.40,jaw:.21,lipGap:.21},
      {t:495,smile:.67,jaw:.44,lipGap:.27},
      {t:575,smile:.43,jaw:.18,lipGap:.23}
    ];
    return rows.map(x=>c.update({timestamp:x.t,hasFace:true,smile:x.smile,jaw:x.jaw,lipGap:x.lipGap}));
  };
  const enhanced=run(true),original=run(false);
  assert.equal(enhanced.filter(e=>e.burst).length,1,JSON.stringify(enhanced));
  assert.equal(original.filter(e=>e.burst).length,0,JSON.stringify(original));
  assert.ok(enhanced.some(e=>e.temporalSupported));
  assert.ok(original.every(e=>!e.temporalEnabled));
});
