/**
 * Filmic VFX pass for Rain to Radiance V9.
 * Separate from expression recognition and physics: no independent collision
 * events, no network dependency, no frame-to-frame particle creation here.
 *
 * Direction: silver-blue photographic rain -> warm rising comet ->
 * champagne peony/embers -> precise, small contour contact glints.
 * Sprite textures are generated once in tiny canvases and reused.
 */
import {pointInsideFace,clipTailOutsideFace} from './face-outline.js';

const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const spriteCache=new Map();

function rgba(hex,alpha=1){
  const h=hex.replace('#','');
  const n=parseInt(h,16);
  return 'rgba('+(n>>16&255)+','+(n>>8&255)+','+(n&255)+','+clamp(alpha,0,1)+')';
}
function sprite(hex){
  if(spriteCache.has(hex))return spriteCache.get(hex);
  const c=document.createElement('canvas');c.width=72;c.height=72;
  const x=c.getContext('2d');
  const g=x.createRadialGradient(36,36,0,36,36,36);
  // Tint the CENTER, not only the outer glow. Previously every star had the
  // same large white core and pattern-specific colors washed out on screen.
  g.addColorStop(0,rgba(hex,1));
  g.addColorStop(.09,rgba(hex,.95));
  g.addColorStop(.23,rgba(hex,.78));
  g.addColorStop(.46,rgba(hex,.29));
  g.addColorStop(.72,rgba(hex,.06));
  g.addColorStop(1,rgba(hex,0));
  x.fillStyle=g;x.fillRect(0,0,72,72);
  spriteCache.set(hex,c);return c;
}
function glow(ctx,x,y,r,hex,alpha=1){
  const a=ctx.globalAlpha;
  ctx.globalAlpha=clamp(a*alpha,0,1);
  ctx.drawImage(sprite(hex),x-r,y-r,r*2,r*2);
  ctx.globalAlpha=a;
}

export function drawAmbient(ctx,{mode,width:w,height:h,now,rainEnvelope,palette}){
  ctx.clearRect(0,0,w,h);
  const rain=clamp(rainEnvelope,0,1);
  // This is atmospheric grading, NOT rain/head physics or a wet-body filter.
  if(mode==='camera'||mode==='clip'){
    if(rain>.015){
      const film=ctx.createLinearGradient(0,0,0,h);
      film.addColorStop(0,'rgba(84,138,186,'+(rain*.055)+')');
      film.addColorStop(.55,'rgba(84,141,179,'+(rain*.018)+')');
      film.addColorStop(1,'rgba(38,72,115,0)');
      ctx.fillStyle=film;ctx.fillRect(0,0,w,h);
    }
    return;
  }
  if(mode==='idle'||mode==='loading')return;
  ctx.save();
  // A restrained midnight-blue studio environment; the subject remains primary.
  const g=ctx.createRadialGradient(w*.43,h*.34,0,w*.5,h*.56,h*.79);
  if(palette==='mint'){
    g.addColorStop(0,'#1e34469c');g.addColorStop(.43,'#0f1d35bb');
  }else{
    g.addColorStop(0,'#25294096');g.addColorStop(.43,'#10182dbd');
  }
  g.addColorStop(1,'#050914e8');
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  if(rain>.01){
    const mist=ctx.createLinearGradient(0,0,0,h);
    mist.addColorStop(0,'rgba(102,158,203,'+(rain*.11)+')');
    mist.addColorStop(.48,'rgba(59,103,144,'+(rain*.035)+')');
    mist.addColorStop(1,'rgba(24,58,106,0)');
    ctx.fillStyle=mist;ctx.fillRect(0,0,w,h);
  }
  // Rare out-of-focus specks, bounded (not an artificial digital grid).
  ctx.fillStyle='#d5e7f8';
  for(let i=0;i<18;i++){
    const x=(.5+.5*Math.sin(i*17.31))*w;
    const y=((i*73.5+now*.004*(1+i%3))%h+h)%h;
    ctx.globalAlpha=.045+.09*(.5+.5*Math.sin(now*.0008+i));
    ctx.beginPath();ctx.arc(x,y,i%7===0?1.15:.55,0,TAU);ctx.fill();
  }
  ctx.restore();
}

export function drawParticlesV2(ctx,{particles,collisions,impacts,rings,now,dt,head,mode,palette,rainEnvelope=1,quality='full',effectLayer='front'}){
  // Layer 1: crisp rain strokes with a restrained photographic halo.
  // V9's narrow, pre-blurred sprite lost contrast when scaled and dimmed;
  // direct strokes restore V8's clear rain silhouette without neon bars.
  // This is atmosphere only: rain never collides with the face.
  ctx.save();ctx.globalCompositeOperation='source-over';ctx.lineCap='round';
  const face=head?.outline && (mode==='camera'||mode==='clip')?head.outline:null;
  // The emission rate already follows rainEnvelope. Avoid dimming every
  // existing drop a second time while rain grows or subsides.
  const rainVisibility=.72+.28*clamp(rainEnvelope,0,1);
  for(const p of particles){
    if(effectLayer==='back'||p.kind!=='rain')continue;
    const tier=p.id%9;
    const layer=tier<3?0:tier<6?1:2;
    if(quality==='lite'&&layer===0&&p.id%2===0)continue;
    const falling=clamp(p.vy/550,.72,1.25);
    const length=[18,30,42][layer]*falling;
    const slant=clamp(p.vx*.12,-2.5,2.5);
    const faceOccluded=face&&pointInsideFace(p.x,p.y,face);
    const occlusion=faceOccluded?[.22,.3,.48][layer]:1;
    const alpha=clamp(p.alpha*[.39,.58,.76][layer]*occlusion*rainVisibility,0,.95);
    if(alpha<.015)continue;
    const startX=p.x-slant,startY=p.y-length;
    const tipX=p.x-slant*.35,tipY=p.y-length*.37;
    // A faint halo only on mid/near drops; it never replaces the sharp core.
    if(quality==='full'&&layer>0){
      ctx.globalAlpha=alpha*(layer===2?.13:.09);
      ctx.strokeStyle='#94d1f2';ctx.lineWidth=layer===2?3.1:2.2;
      ctx.beginPath();ctx.moveTo(startX,startY);ctx.lineTo(p.x,p.y);ctx.stroke();
    }
    // Dimmer upper taper and brighter lower water streak.
    ctx.globalAlpha=alpha*(layer===0?.44:.52);
    ctx.strokeStyle=['#83b9d8','#acd8f1','#d9f2ff'][layer];
    ctx.lineWidth=[.7,.96,1.28][layer];
    ctx.beginPath();ctx.moveTo(startX,startY);ctx.lineTo(tipX,tipY);ctx.stroke();
    ctx.globalAlpha=alpha;
    ctx.strokeStyle=['#a0d1ea','#d4efff','#f0fbff'][layer];
    ctx.beginPath();ctx.moveTo(tipX,tipY);ctx.lineTo(p.x,p.y);ctx.stroke();
    if(layer===2&&p.id%13===0&&quality!=='lite'){
      ctx.globalAlpha=alpha*.68;ctx.fillStyle='#f1fbff';
      ctx.beginPath();ctx.arc(p.x,p.y,.75,0,TAU);ctx.fill();
    }
  }
  ctx.restore();

  // Layer 2: differentiated peony embers with hairline comet trails.
  const ion=palette==='mint'?'#a6e8fa':'#ffe0a9';
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
  for(const p of particles){
    if(p.kind!=='spark'||p.age<0||(p.depth||'front')!==effectLayer)continue;
    const shape=p.pattern||'peony';
    const age=p.age/Math.max(.001,p.life);
    const fade=Math.pow(1-clamp((age-.13)/.87,0,1),.76);
    // Prevent 100+ fresh sparks stacking into a featureless white blob.
    const ignition=clamp(p.age/.075,0,1);
    const phase=Number.isFinite(p.shimmerPhase)?p.shimmerPhase:p.id*2.37;
    // Strobes twinkle in crisp pulses, while willow stays calmly luminous.
    const shimmer=shape==='strobe'
      ?.34+.66*Math.pow(Math.max(0,Math.sin((p.shimmerHz||19)*p.age+phase)),3)
      :shape==='willow'?.91+.09*Math.sin(4*p.age+phase)
      :.81+.19*Math.sin((p.shimmerHz||8.5)*p.age+phase);
    const tier=p.sparkTier||'body';
    const alpha=clamp(p.alpha*fade*shimmer*ignition*(p.brightness||1),0,.98);
    if(alpha<.01)continue;
    const role=p.sparkRole||'ember';
    const v=Math.hypot(p.vx,p.vy),ux=v>1?p.vx/v:0,uy=v>1?p.vy/v:1;
    const contactFade=p.lastImpactAge===undefined?1:clamp(.16+(p.age-p.lastImpactAge)/.18, .16,1);
    const tierTrail=tier==='fine'?.56:tier==='hero'?1.24:1.08;
    const tailMultiplier=(p.trailScale||1)*tierTrail;
    let trail=Math.min(
      (role==='comet'?51:role==='ember'?33:20)*tailMultiplier,
      (5+v*(role==='comet'?.095:role==='ember'?.065:.038))*
        tailMultiplier)*contactFade;
    // The physical spark can reflect correctly while a long backward-drawn
    // glow still cuts THROUGH the face. Clip that glow against the SAME
    // MediaPipe contour as the physics. No invented large skull collider.
    if(face&&head&&
       p.x+trail>=head.cx-head.rx-3&&p.x-trail<=head.cx+head.rx+3&&
       p.y+trail>=head.cy-head.ry-3&&p.y-trail<=head.cy+head.ry+3){
      if(pointInsideFace(p.x,p.y,face))continue;
      const start=clipTailOutsideFace(
        p.x-ux*trail,p.y-uy*trail,p.x,p.y,face);
      if(!start)continue;
      trail=Math.min(trail,Math.hypot(p.x-start.x,p.y-start.y));
    }
    if(quality!=='lite'&&role!=='dust'){
      ctx.globalAlpha=alpha*(tier==='hero'?.26:role==='comet'?.20:.13);
      ctx.lineWidth=role==='comet'?Math.max(1.8,p.r*1.45):Math.max(1.1,p.r*1.18);
      ctx.strokeStyle=p.color;ctx.beginPath();
      ctx.moveTo(p.x-ux*trail,p.y-uy*trail);ctx.lineTo(p.x,p.y);ctx.stroke();
    }
    ctx.globalAlpha=alpha*(tier==='hero'?.98:role==='comet'?.88:.77);
    ctx.lineWidth=tier==='hero'?1.15:role==='comet'?.87:.65;
    ctx.strokeStyle=p.color;
    ctx.beginPath();ctx.moveTo(p.x-ux*trail*.84,p.y-uy*trail*.84);
    ctx.lineTo(p.x,p.y);ctx.stroke();
    const size=p.r*(tier==='hero'?10.2:tier==='fine'?5.7:7.6)+
      (tier==='hero'?7:tier==='fine'?2.5:5.3);
    ctx.globalAlpha=alpha*(tier==='fine'?.78:.95);
    ctx.drawImage(sprite(p.color),p.x-size*.5,p.y-size*.5,size,size);
    // Only rare hero particles receive a tiny white pin-point. Most stars
    // retain their distinctive colored centers and visibly different sizes.
    if(tier==='hero'&&alpha>.23){
      ctx.globalAlpha=alpha*.92;ctx.fillStyle='#fffef5';
      ctx.beginPath();ctx.arc(p.x,p.y,Math.max(.65,p.r*.33),0,TAU);ctx.fill();
    }
    if(quality==='full'&&tier==='hero'&&role==='comet'&&alpha>.35){
      const k=2.8+1.45*Math.sin(now*.004+phase);
      ctx.globalAlpha=alpha*.35;ctx.lineWidth=.62;ctx.strokeStyle='#fffaf0';
      ctx.beginPath();ctx.moveTo(p.x-k,p.y);ctx.lineTo(p.x+k,p.y);
      ctx.moveTo(p.x,p.y-k);ctx.lineTo(p.x,p.y+k);ctx.stroke();
    }
  }
  ctx.restore();

  // Layer 3: compact, contact-specific glints (never an invisible forcefield).
  for(const hit of effectLayer==='front'?collisions:[]){
    if(impacts.length<30){
      impacts.push({x:hit.x,y:hit.y,nx:hit.normalX||0,ny:hit.normalY||-1,life:.24,maxLife:.24});
    }
  }
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const hit of effectLayer==='front'?impacts:[]){
    hit.life-=dt;if(hit.life<=0)continue;
    const t=1-hit.life/hit.maxLife,a=Math.pow(1-t,1.7);
    ctx.globalAlpha=a*.66;glow(ctx,hit.x,hit.y,12+t*5,ion,.8);
    ctx.strokeStyle='#fff3dc';ctx.lineWidth=.95;ctx.globalAlpha=a*.77;
    for(let j=-1;j<=1;j++){
      const nx=(hit.nx||0),ny=(hit.ny||-1),tx=-ny,ty=nx;
      const u=6+t*(9+2*j),spread=j*4*t;
      ctx.beginPath();ctx.moveTo(hit.x+nx*1.2,hit.y+ny*1.2);
      ctx.lineTo(hit.x+nx*u+tx*spread,hit.y+ny*u+ty*spread);
      ctx.stroke();
    }
  }
  if(effectLayer==='front')
    for(let i=impacts.length-1;i>=0;i--)if(impacts[i].life<=0)impacts.splice(i,1);

  // A brief champagne ignition at the apex. No giant expanding rings.
  for(const ring of rings){
    if((ring.depth||'front')!==effectLayer)continue;
    const seconds=(now-ring.start)/1000;
    const pattern=ring.pattern||'peony';
    const accent=ring.accent||ion;
    const scale=clamp(ring.scale||1,.62,1.56);
    const phase=clamp(seconds/(pattern==='double'?.64:.48),0,1);
    if(phase>=1)continue;
    const bright=Math.pow(1-phase,2.1);
    ctx.globalAlpha=bright*.76;
    glow(ctx,ring.x,ring.y,(28+phase*35)*scale,accent,.94);
    ctx.lineWidth=.80;ctx.strokeStyle=accent;
    if(pattern==='ring'){
      // A complete CIRCLE, matching the opposed radial particle pairs.
      ctx.globalAlpha=bright*.46;
      ctx.beginPath();ctx.arc(ring.x,ring.y,(11+phase*37)*scale,0,TAU);ctx.stroke();
    }else if(pattern==='double'&&seconds>.16){
      const secondary=clamp((seconds-.16)/.4,0,1);
      ctx.globalAlpha=Math.pow(1-secondary,2)*.36;
      ctx.beginPath();ctx.arc(ring.x,ring.y,(7+secondary*24)*scale,0,TAU);ctx.stroke();
    }else{
      const spokes=pattern==='chrysanthemum'?20:
        pattern==='strobe'?8:pattern==='willow'?9:12;
      for(let k=0;k<spokes;k++){
        const a=k*TAU/spokes+.11;
        const inside=(5+phase*18)*scale;
        const outside=(11+phase*(pattern==='willow'?38:47))*scale;
        ctx.globalAlpha=bright*(k%3===0?.50:.21);
        ctx.beginPath();
        ctx.moveTo(ring.x+Math.cos(a)*inside,ring.y+Math.sin(a)*inside);
        ctx.lineTo(ring.x+Math.cos(a)*outside,ring.y+Math.sin(a)*outside);
        ctx.stroke();
      }
    }
  }
  if(effectLayer==='front')
    for(let i=rings.length-1;i>=0;i--)
      if(now-rings[i].start>=(rings[i].pattern==='double'?640:480))
        rings.splice(i,1);
  ctx.restore();
}

export function drawFlightsV2(ctx,{flights,palette,now,quality='full',effectLayer='front'}){
  const ion=palette==='mint'?'#a8e9fc':'#f6d2a1';
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
  for(const f of flights){
    if((f.depth||'front')!==effectLayer)continue;
    const scale=clamp(f.variation?.scale||1,.62,1.56);
    const progress=clamp(f.elapsed/f.duration,0,1);
    const trail=f.trail||[];
    // Streaks follow the ACTUAL rocket route (including S-curves). The old
    // always-vertical synthetic tail made ascents seem to pop in mid-frame.
    for(let i=1;i<trail.length;i++){
      const a=trail[i-1],b=trail[i];
      const phase=i/Math.max(1,trail.length-1);
      for(const [stroke,opacity] of [[8,.11],[2.6,.43],[1.05,.94]]){
        ctx.globalAlpha=opacity*Math.pow(phase,1.5);
        ctx.lineWidth=stroke*(.8+.2*scale);
        ctx.strokeStyle=(i%7===0)?'#fff6df':ion;
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
      }
    }
    const dx=f.x-f.prevX,dy=f.y-f.prevY,len=Math.hypot(dx,dy)||1;
    const ux=dx/len,uy=dy/len;
    ctx.globalAlpha=.97;glow(ctx,f.x,f.y,20*scale,ion,.92);
    ctx.fillStyle='#fff9ed';ctx.beginPath();ctx.arc(f.x,f.y,2.2,0,TAU);ctx.fill();
    const count=quality==='lite'?5:10;
    for(let i=0;i<count;i++){
      const shift=i/count;
      const extent=10+shift*(53+22*(1-progress));
      const jitter=Math.sin(i*16.3+now*.006)*(1.2+shift*4.5);
      const x=f.x-ux*extent+uy*jitter;
      const y=f.y-uy*extent-ux*jitter;
      ctx.globalAlpha=(1-shift)*.35;
      ctx.fillStyle=i%3===0?'#fef5e0':ion;
      ctx.beginPath();ctx.arc(x,y,i%4===0?1:.65,0,TAU);ctx.fill();
    }
  }
  ctx.restore();
}
