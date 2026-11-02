/**
 * Visual-only layer, built for this prototype. No peer app code or assets.
 * Physics, expression and camera modules remain independent.
 */
const TAU=Math.PI*2;
const sprites=new Map();
const clamp=(v,low,high)=>Math.max(low,Math.min(high,v));
function colorAlpha(hex,a){
  const h=hex.slice(1);
  if(h.length!==6)return 'rgba(255,255,255,'+a+')';
  const n=parseInt(h,16);
  return 'rgba('+(n>>16&255)+','+(n>>8&255)+','+(n&255)+','+clamp(a,0,1)+')';
}
function sprite(hex){
  if(sprites.has(hex))return sprites.get(hex);
  const c=document.createElement('canvas');c.width=70;c.height=70;
  const x=c.getContext('2d'),g=x.createRadialGradient(35,35,0,35,35,35);
  g.addColorStop(0,'#ffffff');g.addColorStop(.09,'#ffffffe8');
  g.addColorStop(.2,colorAlpha(hex,.92));g.addColorStop(.45,colorAlpha(hex,.31));
  g.addColorStop(1,colorAlpha(hex,0));x.fillStyle=g;x.fillRect(0,0,70,70);
  sprites.set(hex,c);return c;
}
function ellipse(ctx,x,y,rx,ry,angle=0){
  ctx.beginPath();ctx.ellipse(x,y,Math.max(1,rx),Math.max(1,ry),angle,0,TAU);
}
function glow(ctx,x,y,r,hex,a=1){
  const g=ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,colorAlpha(hex,.46*a));
  g.addColorStop(.38,colorAlpha(hex,.14*a));
  g.addColorStop(1,colorAlpha(hex,0));
  ctx.fillStyle=g;ctx.fillRect(x-r,y-r,2*r,2*r);
}
export function drawAmbient(ctx,view){
  const {mode,width:w,height:h,now,rainEnvelope, palette}=view;
  ctx.clearRect(0,0,w,h);if(mode==='camera'||mode==='clip'||mode==='idle'||mode==='loading')return;
  ctx.save();
  const g=ctx.createRadialGradient(w*.43,h*.36,8,w*.52,h*.55,h*.72);
  g.addColorStop(0,palette==='mint'?'#20517d70':'#3546696b');
  g.addColorStop(.49,'#25375e21');g.addColorStop(1,'#07132200');
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  if(rainEnvelope>.01){
    const rain=ctx.createLinearGradient(0,0,0,h*.45);
    rain.addColorStop(0,'rgba(116,190,255,'+rainEnvelope*.14+')');
    rain.addColorStop(1,'rgba(40,90,155,0)');
    ctx.fillStyle=rain;ctx.fillRect(0,0,w,h*.45);
  }
  ctx.strokeStyle='#8ecdeb16';ctx.lineWidth=.75;
  for(let i=0;i<3;i++){
    ctx.beginPath();ctx.ellipse(w*.5,h*.54,w*(.44+i*.18),h*(.25+i*.12),0,-.15+now*.00008+i*.08,2.15+i*.15);
    ctx.stroke();
  }
  for(let i=0;i<35;i++){
    const x=(Math.sin(i*18.37)*.5+.5)*w;
    const y=((i*61.33+now*.009*(1+i%3))%h+h)%h;
    ctx.globalAlpha=.12+.22*(.5+.5*Math.sin(now*.001+i));
    ctx.fillStyle='#b5dbff';ctx.beginPath();ctx.arc(x,y,i%8===0?1.25:.6,0,TAU);ctx.fill();
  }
  ctx.restore();
}
export function drawProxy(ctx,view){
  const {head,mode,palette,debug,landmarks,mapPoint}=view;
  if(!head)return;
  if(mode==='simulation'){
    const {cx,cy,rx,ry}=head;
    const blue=palette==='mint';
    ctx.save();ctx.translate(cx,cy);ctx.rotate(head.angle);
    glow(ctx,0,0,rx*2.4,blue?'#45baf4':'#a993e8',.42);
    // Shadowed bust and shoulders in place of the V1 debugging wireframe.
    ctx.beginPath();ctx.moveTo(-rx*.64,ry*.88);
    ctx.bezierCurveTo(-rx*1.1,ry*1.48,-rx*2.0,ry*.82,-rx*2.38,ry*2.38);
    ctx.lineTo(-rx*2.55,ry*3.35);ctx.lineTo(rx*2.55,ry*3.35);
    ctx.lineTo(rx*2.38,ry*2.38);
    ctx.bezierCurveTo(rx*2.0,ry*.82,rx*1.1,ry*1.48,rx*.64,ry*.88);
    ctx.closePath();const suit=ctx.createLinearGradient(-rx*2,ry,rx*2,ry*3);
    suit.addColorStop(0,'#284361');suit.addColorStop(.5,'#1d2a46');suit.addColorStop(1,'#0b1226');
    ctx.fillStyle=suit;ctx.fill();ctx.lineWidth=1.1;
    ctx.strokeStyle=blue?'#8bd0fc73':'#afaddc75';ctx.stroke();
    ctx.shadowColor='#74cbf7';ctx.shadowBlur=15;
    ctx.strokeStyle='#badff854';
    ctx.beginPath();ctx.moveTo(-rx*1.51,ry*1.55);ctx.quadraticCurveTo(-rx*.83,ry*1.25,-rx*.55,ry*.87);ctx.stroke();
    ctx.beginPath();ctx.moveTo(rx*1.51,ry*1.55);ctx.quadraticCurveTo(rx*.83,ry*1.25,rx*.55,ry*.87);ctx.stroke();
    ctx.shadowBlur=0;
    // Hair silhouette, face and minimal portrait details.
    const hair=ctx.createLinearGradient(-rx,-ry,rx,ry);
    hair.addColorStop(0,'#12192d');hair.addColorStop(.6,'#28314c');hair.addColorStop(1,'#0e1427');
    ctx.fillStyle=hair;ellipse(ctx,0,-ry*.06,rx*1.15,ry*1.17);ctx.fill();
    ctx.strokeStyle='#a2bfeb66';ctx.lineWidth=2;ctx.stroke();
    const skin=ctx.createRadialGradient(-rx*.35,-ry*.54,2,rx*.10,ry*.24,ry*1.22);
    skin.addColorStop(0,'#e8dfeb');skin.addColorStop(.40,'#c7bfd1');
    skin.addColorStop(.77,'#9091b0');skin.addColorStop(1,'#3f5274');
    ctx.fillStyle=skin;ellipse(ctx,0,ry*.03,rx*.83,ry*.92);ctx.fill();
    ctx.strokeStyle='#233251a1';ctx.lineCap='round';ctx.lineWidth=2.5;
    ctx.beginPath();ctx.moveTo(-rx*.85,-ry*.08);
    ctx.bezierCurveTo(-rx*.97,-ry*.97,-rx*.22,-ry*1.20,rx*.21,-ry*1.05);
    ctx.bezierCurveTo(rx*.91,-ry*.94,rx*.96,-ry*.46,rx*.83,-ry*.06);ctx.stroke();
    ctx.strokeStyle='#283e5f94';ctx.lineWidth=1.8;
    for(const sign of [-1,1]){
      ctx.beginPath();ctx.moveTo(sign*rx*.16,-ry*.11);
      ctx.quadraticCurveTo(sign*rx*.37,-ry*.18,sign*rx*.53,-ry*.09);ctx.stroke();
      ctx.beginPath();ctx.moveTo(sign*rx*.18,-ry*.035);
      ctx.quadraticCurveTo(sign*rx*.34,ry*.01,sign*rx*.47,-ry*.035);ctx.stroke();
    }
    ctx.beginPath();ctx.moveTo(-rx*.11,ry*.45);ctx.quadraticCurveTo(0,ry*.52,rx*.12,ry*.45);ctx.stroke();
    ctx.fillStyle='#f3faffad';ellipse(ctx,-rx*.49,-ry*.54,rx*.06,ry*.14,-.2);ctx.fill();
    ctx.restore();
  }
  if(debug){
    ctx.save();ctx.strokeStyle='#6ee9f4';ctx.lineWidth=1.2;ctx.setLineDash([5,4]);
    if(head.outline?.length){
      ctx.beginPath();head.outline.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
      ctx.closePath();ctx.stroke();
    }else{ellipse(ctx,head.cx,head.cy,head.rx,head.ry,head.angle);ctx.stroke();}
    ctx.setLineDash([]);
    if(mode==='camera'||mode==='clip'){
      ctx.fillStyle='#9ff9ff';
      for(const i of [10,152,234,454,33,263,1]){
        if(!landmarks[i])continue;
        const p=mapPoint(landmarks[i]);ctx.fillRect(p.x-1,p.y-1,2,2);
      }
      // The user can inspect the live projected outline, rather than
      // mistaking expression recognition for spatial tracking success.
      if(head.outline?.length>=12){
        ctx.font='600 11px system-ui,sans-serif';
        ctx.textBaseline='bottom';
        ctx.fillStyle='#64f9ed';
        ctx.shadowColor='#000';ctx.shadowBlur=5;
        ctx.fillText('FACE LOCK · 36',Math.max(8,head.cx-head.rx),
          Math.max(24,head.cy-head.ry-9));
        ctx.shadowBlur=0;
      }
    }
    ctx.restore();
  }
}
export function drawParticlesV2(ctx,view){
  const {particles,collisions,impacts,rings,now,dt,head,mode,palette,quality='full'}=view;
  const ion=palette==='mint'?'#a7eaff':'#ffd3a6';
  ctx.save();ctx.lineCap='round';
  // Parallel rain streaks with multiple apparent focal depths.
  for(const p of particles){
    if(p.kind!=='rain')continue;
    const depth=(p.id%7)/6,near=depth>.72;
    const dx=p.vx*.026,dy=Math.min(43,p.vy*(.018+.043*depth));
    let alpha=p.alpha*(.28+depth*.59);
    if(head&&(mode==='camera'||mode==='clip')){
      const xx=(p.x-head.cx)/(head.rx*1.16),yy=(p.y-head.cy)/(head.ry*1.13);
      if(xx*xx+yy*yy<1.03)alpha*=.16;
    }
    if(quality!=='lite'||near){
      ctx.globalAlpha=alpha*.19;ctx.strokeStyle='#8cceff';ctx.lineWidth=near?5:2.3;
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-dx,p.y-dy);ctx.stroke();
    }
    ctx.globalAlpha=alpha;ctx.lineWidth=near?1.65:.78;
    ctx.strokeStyle=near?'#e7f8ff':'#83c4ee';
    ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-dx*.6,p.y-dy*.85);ctx.stroke();
    if(p.id%11===0){
      ctx.globalAlpha=alpha*.75;ctx.fillStyle='#f0fbff';ctx.beginPath();
      ctx.arc(p.x,p.y,near?1.5:.9,0,TAU);ctx.fill();
    }
  }
  ctx.restore();
  // Spark trails and pre-rendered light sprites.
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
  for(const p of particles){
    if(p.kind!=='spark')continue;
    const alpha=clamp(p.alpha,0,1),v=Math.hypot(p.vx,p.vy);
    const dx=v>2?p.vx/v:0,dy=v>2?p.vy/v:1;
    const afterImpact=p.lastImpactAge!==undefined?clamp((p.age-p.lastImpactAge)/.19,0,1):1;
    const trail=Math.min(52,8+v*.17)*(.2+.8*afterImpact);
    if(quality!=='lite'){
      ctx.globalAlpha=alpha*.17;ctx.strokeStyle=p.color;ctx.lineWidth=Math.max(3,p.r*2);
      ctx.beginPath();ctx.moveTo(p.x-dx*trail,p.y-dy*trail);ctx.lineTo(p.x,p.y);ctx.stroke();
    }
    ctx.globalAlpha=alpha*.7;ctx.strokeStyle=ion;ctx.lineWidth=Math.max(.8,p.r*.47);
    ctx.beginPath();ctx.moveTo(p.x-dx*trail*.79,p.y-dy*trail*.79);ctx.lineTo(p.x,p.y);ctx.stroke();
    const size=p.r*8.4+9;ctx.globalAlpha=alpha*.9;
    ctx.drawImage(sprite(p.color),p.x-size/2,p.y-size/2,size,size);
    if(quality==='full'&&p.id%13===0&&alpha>.23){
      const ray=clamp(p.r*3,3,12);ctx.globalAlpha=alpha*.5;ctx.strokeStyle='#ffffff';ctx.lineWidth=.72;
      ctx.beginPath();ctx.moveTo(p.x-ray,p.y);ctx.lineTo(p.x+ray,p.y);
      ctx.moveTo(p.x,p.y-ray);ctx.lineTo(p.x,p.y+ray);ctx.stroke();
    }
  }
  ctx.restore();
  // Visual echoes are emitted only for actual collision records.
  // Small contact glints on the actual contour, not large force-field rings.
  for(const hit of collisions){if(impacts.length<35)impacts.push({x:hit.x,y:hit.y,life:.22,maxLife:.22});}
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const hit of impacts){
    hit.life-=dt;const t=1-hit.life/hit.maxLife;
    if(hit.life<=0)continue;
    const power=Math.pow(1-t,1.5),rad=3+t*11;
    ctx.globalAlpha=power*.65;glow(ctx,hit.x,hit.y,rad*1.14,ion,.7);
    ctx.strokeStyle=ion;ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(hit.x,hit.y,rad,0,TAU);ctx.stroke();
    ctx.globalAlpha=power*.8;ctx.lineWidth=.8;
    for(let i=0;i<5;i++){
      const a=i*TAU/5+hit.x*.01;
      ctx.beginPath();ctx.moveTo(hit.x+Math.cos(a)*rad*.36,hit.y+Math.sin(a)*rad*.36);
      ctx.lineTo(hit.x+Math.cos(a)*rad,hit.y+Math.sin(a)*rad);ctx.stroke();
    }
  }
  for(let i=impacts.length-1;i>=0;i--)if(impacts[i].life<=0)impacts.splice(i,1);
  for(const ring of rings){
    const t=(now-ring.start)/1000;if(t>=1)continue;
    const k=Math.pow(1-t,2.3);
    ctx.globalAlpha=k*.72;glow(ctx,ring.x,ring.y,65+t*35,ion,k);
    ctx.strokeStyle=ion;ctx.lineWidth=Math.max(.5,2.7*(1-t));
    ctx.beginPath();ctx.arc(ring.x,ring.y,5+t*112,0,TAU);ctx.stroke();
    ctx.globalAlpha=k*.46;ctx.strokeStyle='#fff2ec';ctx.lineWidth=.8;
    ctx.beginPath();ctx.arc(ring.x,ring.y,3+t*155,0,TAU);ctx.stroke();
    ctx.globalAlpha=k;ctx.fillStyle='#ffffff';
    ctx.beginPath();ctx.arc(ring.x,ring.y,Math.max(.2,8*(1-t)),0,TAU);ctx.fill();
  }
  for(let i=rings.length-1;i>=0;i--)if(now-rings[i].start>=1000)rings.splice(i,1);
  ctx.restore();
}
export function drawFlightsV2(ctx,view){
  const {flights,palette,now}=view;
  const ion=palette==='mint'?'#9de3ff':'#ffd19d';
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
  for(const f of flights){
    const t=f.elapsed/f.duration,len=36+t*100;
    const grad=ctx.createLinearGradient(f.x,f.y,f.x,f.y+len);
    grad.addColorStop(0,'#ffffff');grad.addColorStop(.15,ion);
    grad.addColorStop(.6,colorAlpha(ion,.25));grad.addColorStop(1,colorAlpha(ion,0));
    for(const [w,a] of [[15,.13],[6,.37],[2,1]]){
      ctx.globalAlpha=a;ctx.strokeStyle=grad;ctx.lineWidth=w;
      ctx.beginPath();ctx.moveTo(f.x,f.y);ctx.lineTo(f.x,f.y+len);ctx.stroke();
    }
    ctx.globalAlpha=.85;glow(ctx,f.x,f.y,27,ion,1);
    ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(f.x,f.y,3.2,0,TAU);ctx.fill();
    for(let i=0;i<17;i++){
      const y=f.y+5+i/17*len;
      const x=f.x+Math.sin(i*16.7+now*.007)*(3+i*.75);
      ctx.globalAlpha=(1-i/17)*.55;
      ctx.fillStyle=i%4===0?'#ffffff':ion;
      ctx.beginPath();ctx.arc(x,y,i%6===0?1.4:.7,0,TAU);ctx.fill();
    }
  }
  ctx.restore();
}
