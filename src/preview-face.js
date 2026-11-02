import {PREVIEW_FACE_TRACK} from '../assets/preview-face-track.js';
import {faceVideoProjection,projectFaceLandmark,geometryFromFaceOutline} from './face-projection.js';

// Replays measured stock-video geometry; never invents a hair/body contour.
export function previewHeadAt(time,width,height){
  const {frames,videoWidth,videoHeight}=PREVIEW_FACE_TRACK;
  if(!Number.isFinite(time)||!frames.length)return null;
  let low=0,high=frames.length-1;
  while(low+1<high){const mid=(low+high)>>1;if(frames[mid].time<=time)low=mid;else high=mid;}
  const a=frames[low],b=frames[high];
  let points;
  if(a.points&&b.points){
    const ratio=Math.max(0,Math.min(1,(time-a.time)/Math.max(.001,b.time-a.time)));
    points=a.points.map((point,i)=>({x:point[0]+(b.points[i][0]-point[0])*ratio,y:point[1]+(b.points[i][1]-point[1])*ratio}));
  }else{
    const nearest=[a,b].filter(frame=>frame.points&&Math.abs(frame.time-time)<=.065)
      .sort((x,y)=>Math.abs(x.time-time)-Math.abs(y.time-time))[0];
    if(!nearest)return null;
    points=nearest.points.map(point=>({x:point[0],y:point[1]}));
  }
  const projection=faceVideoProjection({videoWidth,videoHeight,viewWidth:width,viewHeight:height,mirrored:false});
  const outline=points.map(point=>projectFaceLandmark(point,projection));
  const geometry=geometryFromFaceOutline(outline);
  return geometry?{...geometry,outline,angle:0,vx:0,vy:0,valid:true}:null;
}
