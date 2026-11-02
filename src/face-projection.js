/**
 * One projection for MediaPipe's unmirrored, normalized VIDEO landmarks and
 * the browser's object-fit:cover preview. Mirroring is applied exactly once,
 * matching the CSS for a front-facing webcam (not recorded clips).
 *
 * These are measured face points, never inferred hair or body coordinates.
 */
const valid=v=>Number.isFinite(v)&&v>0;
export function faceVideoProjection({
  videoWidth,videoHeight,viewWidth,viewHeight,mirrored=false
}={}){
  if(![videoWidth,videoHeight,viewWidth,viewHeight].every(valid))return null;
  const scale=Math.max(viewWidth/videoWidth,viewHeight/videoHeight);
  const drawWidth=videoWidth*scale,drawHeight=videoHeight*scale;
  return {
    scale,offsetX:(viewWidth-drawWidth)/2,
    offsetY:(viewHeight-drawHeight)/2,
    drawWidth,drawHeight,viewWidth,viewHeight,
    videoWidth,videoHeight,mirrored:Boolean(mirrored)
  };
}
export function projectFaceLandmark(point,projection){
  if(!projection||!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;
  const sourceX=point.x*projection.videoWidth*projection.scale+projection.offsetX;
  return {
    x:projection.mirrored?projection.viewWidth-sourceX:sourceX,
    y:point.y*projection.videoHeight*projection.scale+projection.offsetY
  };
}
export function geometryFromFaceOutline(outline){
  if(!Array.isArray(outline)||outline.length<12||
     outline.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of outline){
    if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;
    if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;
  }
  const rx=(maxX-minX)/2,ry=(maxY-minY)/2;
  if(rx<=8||ry<=10)return null;
  return {cx:(minX+maxX)/2,cy:(minY+maxY)/2,rx,ry};
}
export function isFreshFaceAnchor({mode,head,hasFace,ageMs,maxAgeMs=360}={}){
  if(mode==='simulation')return true;
  if(mode!=='camera'&&mode!=='clip')return false;
  return Boolean(hasFace&&head?.valid&&head.outline?.length>=12&&
    Number.isFinite(ageMs)&&ageMs>=0&&ageMs<maxAgeMs);
}
