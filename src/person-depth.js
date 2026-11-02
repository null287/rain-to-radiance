/**
 * Apply the local person mask to a BACKGROUND fireworks canvas.
 * Accurate mode uses the official local MediaPipe selfie segmenter.
 * Fallback is an approximate face/torso proxy, NOT segmentation.
 */
const finite=(v,f)=>Number.isFinite(v)?v:f;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function videoCoverRect(width,height,sourceWidth,sourceHeight){
  const w=Math.max(1,finite(width,390)),h=Math.max(1,finite(height,844));
  const sw=Math.max(1,finite(sourceWidth,w)),sh=Math.max(1,finite(sourceHeight,h));
  const scale=Math.max(w/sw,h/sh);
  return {x:(w-sw*scale)/2,y:(h-sh*scale)/2,
    width:sw*scale,height:sh*scale};
}

// Conservative approximate mask for temporary segmenter unavailability.
// It follows the CURRENT face position. Shoulders are inferred, not measured.
export function approximatePersonSilhouette(ctx,head,{width,height}){
  if(!head||!Number.isFinite(head.cx)||!Number.isFinite(head.cy)||
    head.rx<=0||head.ry<=0)return false;
  const cx=head.cx,cy=head.cy,rx=head.rx,ry=head.ry;
  ctx.beginPath();
  if(head.outline?.length>=12){
    const p=head.outline;
    ctx.moveTo(p[0].x,p[0].y);
    for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x,p[i].y);
    ctx.closePath();
  }else{
    ctx.ellipse(cx,cy,rx*1.13,ry*1.17,head.angle||0,0,Math.PI*2);
  }
  ctx.fill();
  // Approximation only when there is no real portrait mask.
  const neckY=clamp(cy+ry*.77,0,height);
  const shoulderY=clamp(cy+ry*1.28,neckY,height);
  const half=clamp(rx*2.1,width*.16,width*.48);
  ctx.beginPath();
  ctx.moveTo(cx-rx*.69,neckY);
  ctx.quadraticCurveTo(cx-half*.83,shoulderY-.18*ry,cx-half,shoulderY);
  ctx.lineTo(cx-half*1.22,height+5);
  ctx.lineTo(cx+half*1.22,height+5);
  ctx.lineTo(cx+half,shoulderY);
  ctx.quadraticCurveTo(cx+half*.83,shoulderY-.18*ry,cx+rx*.69,neckY);
  ctx.closePath();
  ctx.fill();
  return true;
}

export function eraseBackgroundBehindPerson(ctx,{
  stageWidth,stageHeight,head=null,mask=null,maskTime=0,
  now=0,mirrored=false,sourceWidth=0,sourceHeight=0
}={}){
  const width=Math.max(1,finite(stageWidth,390));
  const height=Math.max(1,finite(stageHeight,844));
  ctx.save();
  ctx.globalCompositeOperation='destination-out';
  if(mask&&now-maskTime<620&&mask.width>0&&mask.height>0){
    const rect=videoCoverRect(width,height,sourceWidth,sourceHeight);
    if(mirrored){
      ctx.translate(width,0);
      ctx.scale(-1,1);
    }
    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(mask,rect.x,rect.y,rect.width,rect.height);
    ctx.restore();
    return 'model';
  }
  if(head){
    ctx.fillStyle='#000';
    const ok=approximatePersonSilhouette(ctx,head,{width,height});
    ctx.restore();
    return ok?'face-proxy':'none';
  }
  ctx.restore();
  return 'none';
}
