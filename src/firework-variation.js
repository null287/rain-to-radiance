/**
 * Art-directed fireworks. A weighted, curated shape sequence guarantees
 * visible variation during a short demo; sizes are intensity-conditioned
 * weighted picks with a cooldown on XL. No dependency or network request.
 */
export const FIREWORK_STYLES=Object.freeze([
  'peony','chrysanthemum','willow','ring','strobe','double'
]);
// Each pattern has its own recognisable color signature in both existing
// presentation themes. Colors are indexed from luminous highlight to richer
// secondary pigment. Double blooms deliberately switch colors at the delayed
// inner layer; the viewer must see TWO distinct color stories, not a duplicate.
const colors=(primary,inner,accent)=>Object.freeze({
  primary:Object.freeze(primary),inner:Object.freeze(inner),accent
});
export const FIREWORK_STYLE_PALETTES=Object.freeze({
  peony:Object.freeze({
    gold:colors(['#fff3ce','#ffd274','#ff984f','#ff6a45'],
      ['#fff3ce','#ffd274','#ff984f','#ff6a45'],'#ffd581'),
    mint:colors(['#f1ffff','#9ef3ed','#56bad5','#f0c8a1'],
      ['#f1ffff','#9ef3ed','#56bad5','#f0c8a1'],'#bbfff7')
  }),
  chrysanthemum:Object.freeze({
    gold:colors(['#ffffff','#e6f1ff','#b7ccdb','#ffe5b7'],
      ['#ffffff','#e6f1ff','#b7ccdb','#ffe5b7'],'#e7f1ff'),
    mint:colors(['#ffffff','#daf8ff','#93d1ee','#a6b2ff'],
      ['#ffffff','#daf8ff','#93d1ee','#a6b2ff'],'#d5f6ff')
  }),
  willow:Object.freeze({
    gold:colors(['#ffefb7','#ffce5f','#e99a35','#b76529'],
      ['#ffefb7','#ffce5f','#e99a35','#b76529'],'#ffc66d'),
    mint:colors(['#fff0ce','#a5ecd9','#65bca4','#478a84'],
      ['#fff0ce','#a5ecd9','#65bca4','#478a84'],'#a4eed6')
  }),
  ring:Object.freeze({
    gold:colors(['#e7f2ff','#84c5ff','#477cf5','#a17dff'],
      ['#e7f2ff','#84c5ff','#477cf5','#a17dff'],'#8ebeff'),
    mint:colors(['#e9faff','#7cd8ff','#5099f2','#90afff'],
      ['#e9faff','#7cd8ff','#5099f2','#90afff'],'#8edfff')
  }),
  strobe:Object.freeze({
    gold:colors(['#ffffff','#effcff','#b8faff','#83caff'],
      ['#ffffff','#effcff','#b8faff','#83caff'],'#dcffff'),
    mint:colors(['#ffffff','#e4fff9','#96ffe7','#63c9df'],
      ['#ffffff','#e4fff9','#96ffe7','#63c9df'],'#c4fff2')
  }),
  double:Object.freeze({
    gold:colors(['#fff2df','#ffcc85','#ff9b66','#f47484'],
      ['#fbecff','#f4a9dd','#a5ccff','#70c7ec'],'#ffd4ad'),
    mint:colors(['#fcf4ff','#d9b8ff','#b78cff','#88caff'],
      ['#f4ffff','#aeffec','#68cde0','#86b0ff'],'#e7caff')
  })
});
export function fireworkPaletteFor(pattern,theme='gold'){
  return FIREWORK_STYLE_PALETTES[pattern]?.[theme]||
    FIREWORK_STYLE_PALETTES.peony[theme]||
    FIREWORK_STYLE_PALETTES.peony.gold;
}
export const FIREWORK_SIZE_FACTORS=Object.freeze({
  S:Object.freeze({scale:.78,count:.64,label:'小型'}),
  M:Object.freeze({scale:1,count:.91,label:'中型'}),
  L:Object.freeze({scale:1.23,count:1.13,label:'大型'}),
  XL:Object.freeze({scale:1.43,count:1.22,label:'超大型'})
});
const STYLES=Object.freeze([
  // Order is curated: six visibly different shapes in the first six launches.
  // Repeats favor the two most legible shapes, while the rarer styles punctuate.
  'peony','chrysanthemum','ring','willow','strobe','double',
  'peony','chrysanthemum','willow','peony','ring','chrysanthemum'
]);
const WEIGHTS=Object.freeze([
  Object.freeze([.46,.48,.06,0]),    // ordinary laugh
  Object.freeze([.19,.52,.27,.02]),  // clear laugh
  Object.freeze([.07,.27,.55,.11])   // exaggerated laugh
]);
const SIZES=Object.freeze(['S','M','L','XL']);
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
// Deterministic for a given seed: screenshot comparisons and rollback are
// reproducible without forcing every consecutive burst to look identical.
export function makeFireworkRandom(seed=0x5eeda11){
  let state=(seed>>>0)||1;
  return ()=>{
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    return state/4294967296;
  };
}
export class FireworkVariationPlanner {
  constructor({random=makeFireworkRandom(),sizeWeights=WEIGHTS}={}){
    this.random=typeof random==='function'?random:makeFireworkRandom();
    this.sizeWeights=sizeWeights;
    this.reset();
  }
  reset(){
    this.launches=0;
    this.lastSize=null;
    this.sameSizeRun=0;
    this.lastXL=-100;
  }
  next({intensity=0,quality='full'}={}){
    const n=this.launches;
    const level=clamp(finite(intensity),0,1);
    const band=level<.38?0:level<.72?1:2;
    const weight=this.sizeWeights[band];
    let sample=clamp(finite(this.random()),0,1-Number.EPSILON);
    let size='M';
    for(let i=0;i<SIZES.length;i++){
      sample-=weight[i];
      if(sample<0){size=SIZES[i];break;}
    }
    if(size==='XL'&&(band<2||quality==='lite'||n-this.lastXL<6))size='L';
    if(quality==='lite'&&size==='L')size='M';
    if(this.lastSize===size&&this.sameSizeRun>=2){
      // Visible contrast instead of three indistinguishable firework sizes.
      size=size==='M'?'S':'M';
    }
    if(size==='XL')this.lastXL=n;
    this.sameSizeRun=this.lastSize===size?this.sameSizeRun+1:1;
    this.lastSize=size;
    const pattern=STYLES[n%STYLES.length];
    const factor=FIREWORK_SIZE_FACTORS[size];
    const jitter=.94+clamp(finite(this.random()),0,1)*.12;
    this.launches++;
    return Object.freeze({
      pattern,size,
      scale:factor.scale*jitter,
      countScale:factor.count,
      label:factor.label,
      intensity:level,
      sequence:this.launches
    });
  }
}
