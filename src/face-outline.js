/**
 * Camera/clip collision contour: actual MediaPipe face-oval landmarks, rather
 * than an inflated ellipse. This is a 2D FACE outline, not hair segmentation.
 * All coordinates in canvas CSS pixels; the same video cover transform is used
 * for rendering, tracking and collisions.
 */
export const FACE_OVAL_INDICES=Object.freeze([
  10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,
  152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109
]);
const finite=n=>Number.isFinite(n);
const cross=(x,y,u,v)=>x*v-y*u;
const dot=(x,y,u,v)=>x*u+y*v;
const clamp=(x,min,max)=>Math.min(max,Math.max(min,x));
function area2(poly){
  let sum=0;for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];sum+=cross(a.x,a.y,b.x,b.y);
  }
  return sum;
}
export function faceOutlineFromLandmarks(points,project){
  if(!Array.isArray(points)||typeof project!=='function')return null;
  const outline=[];
  for(const id of FACE_OVAL_INDICES){
    const value=points[id];
    if(!value||!finite(value.x)||!finite(value.y))return null;
    const p=project(value);
    if(!p||!finite(p.x)||!finite(p.y))return null;
    outline.push({x:p.x,y:p.y});
  }
  return Math.abs(area2(outline))>250?outline:null;
}
export function pointInsideFace(x,y,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];
    if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
/**
 * Draw only the visible suffix of a comet tail after it reflects OUTSIDE the
 * face. The previous renderer drew tails backwards from the new velocity,
 * unintentionally painting long streaks straight through the face after a
 * correct physical collision. The actual particle endpoint is unchanged.
 */
export function clipTailOutsideFace(x0,y0,x1,y1,poly){
  if(!Array.isArray(poly)||poly.length<12||
     ![x0,y0,x1,y1].every(Number.isFinite))return {x:x0,y:y0};
  if(pointInsideFace(x1,y1,poly))return null;
  const dx=x1-x0,dy=y1-y0,travel=Math.hypot(dx,dy);
  if(travel<1e-5)return {x:x0,y:y0};
  let lastExit=-1;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length];
    const ex=b.x-a.x,ey=b.y-a.y;
    const det=cross(dx,dy,ex,ey);
    if(Math.abs(det)<1e-9)continue;
    const px=a.x-x0,py=a.y-y0;
    const t=cross(px,py,ex,ey)/det;
    const u=cross(px,py,dx,dy)/det;
    if(t>=0&&t<=1&&u>=0&&u<=1)lastExit=Math.max(lastExit,t);
  }
  if(lastExit>=0){
    // A 1.5 CSS-pixel margin keeps the bright trail from bleeding into the
    // face due to antialiasing; the contact glint still marks the exact edge.
    const t=Math.min(1,lastExit+1.5/travel);
    return {x:x0+dx*t,y:y0+dy*t};
  }
  if(pointInsideFace(x0,y0,poly))return {x:x1,y:y1};
  return {x:x0,y:y0};
}
function closestBoundary(x,y,poly,winding){
  let best=null;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],ex=b.x-a.x,ey=b.y-a.y;
    const len2=ex*ex+ey*ey;if(len2<1e-7)continue;
    const t=clamp(dot(x-a.x,y-a.y,ex,ey)/len2,0,1);
    const px=a.x+t*ex,py=a.y+t*ey,d2=(x-px)**2+(y-py)**2;
    if(!best||d2<best.d2){
      const length=Math.sqrt(len2);
      best={x:px,y:py,nx:winding*ey/length,ny:-winding*ex/length,d2};
    }
  }
  return best;
}
/**
 * Continuous segment-vs-moving-polygon collision with a single bounce.
 * Outward-moving particles originating inside are pushed out WITHOUT a hit.
 * We only emit collision events if the particle's relative velocity enters
 * a visible face-oval segment; no distant/inflated invisible field.
 */
export function reflectAgainstFaceOutline(particle,head,{dt=0,restitution=.62,maxSpeed=1100}={}){
  particle.lastCollision=null;
  const poly=head?.outline;
  if(!Array.isArray(poly)||poly.length<12||poly.some(p=>!p||!finite(p.x)||!finite(p.y)))return false;
  const signed=area2(poly);if(Math.abs(signed)<250)return false;
  const winding=signed>0?1:-1;
  const tStep=Math.max(0,finite(dt)?dt:0);
  const hvx=finite(head.vx)?head.vx:0,hvy=finite(head.vy)?head.vy:0;
  const vx=finite(particle.vx)?particle.vx:0,vy=finite(particle.vy)?particle.vy:0;
  const relx=vx-hvx,rely=vy-hvy;
  const sx=(finite(particle.prevX)?particle.prevX:particle.x)+hvx*tStep;
  const sy=(finite(particle.prevY)?particle.prevY:particle.y)+hvy*tStep;
  const ex=particle.x,ey=particle.y,dx=ex-sx,dy=ey-sy;
  let best=null;
  if(dx*dx+dy*dy>1e-10){
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],ux=b.x-a.x,uy=b.y-a.y;
      const det=cross(dx,dy,ux,uy),edgeLength=Math.hypot(ux,uy);
      if(Math.abs(det)<1e-8||edgeLength<1e-6)continue;
      const qx=a.x-sx,qy=a.y-sy;
      const at=cross(qx,qy,ux,uy)/det;
      const along=cross(qx,qy,dx,dy)/det;
      if(at<0||at>1||along<0||along>1)continue;
      const nx=winding*uy/edgeLength,ny=-winding*ux/edgeLength;
      if(dot(relx,rely,nx,ny)>=-1e-5)continue;
      if(!best||at<best.t)best={t:at,nx,ny,x:sx+at*dx,y:sy+at*dy};
    }
  }
  if(best&&!pointInsideFace(sx,sy,poly)){
    const normalSpeed=dot(relx,rely,best.nx,best.ny);
    particle.vx=relx-(1+clamp(restitution,0,1))*normalSpeed*best.nx+hvx;
    particle.vy=rely-(1+clamp(restitution,0,1))*normalSpeed*best.ny+hvy;
    const speed=Math.hypot(particle.vx,particle.vy),limit=Math.max(1,maxSpeed);
    if(speed>limit){particle.vx*=limit/speed;particle.vy*=limit/speed;}
    const moved=1-best.t,rad=Math.max(0,finite(particle.r)?particle.r:0);
    particle.x=best.x-hvx*tStep*moved+best.nx*(rad+.75)+particle.vx*tStep*moved;
    particle.y=best.y-hvy*tStep*moved+best.ny*(rad+.75)+particle.vy*tStep*moved;
    particle.bounces=(finite(particle.bounces)?particle.bounces:0)+1;
    // Show impact at the CURRENT tracked contour, not at an offset bounding oval.
    particle.lastCollision={x:best.x,y:best.y,normalX:best.nx,normalY:best.ny,kind:particle.kind,collider:'face-outline'};
    if(pointInsideFace(particle.x,particle.y,poly)){
      const near=closestBoundary(particle.x,particle.y,poly,winding);
      if(near){particle.x=near.x+near.nx*(rad+.75);particle.y=near.y+near.ny*(rad+.75);}
    }
    return true;
  }
  if(pointInsideFace(particle.x,particle.y,poly)){
    const near=closestBoundary(particle.x,particle.y,poly,winding);
    if(near){
      const rad=Math.max(0,finite(particle.r)?particle.r:0);
      particle.x=near.x+near.nx*(rad+.75);
      particle.y=near.y+near.ny*(rad+.75);
    }
  }
  return false;
}
