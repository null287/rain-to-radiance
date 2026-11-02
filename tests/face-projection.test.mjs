import test from 'node:test';
import assert from 'node:assert/strict';
import {
  faceVideoProjection,projectFaceLandmark,geometryFromFaceOutline,
  isFreshFaceAnchor
} from '../src/face-projection.js';
import {clipTailOutsideFace,pointInsideFace} from '../src/face-outline.js';

const near=(a,b,tol=.001)=>assert.ok(Math.abs(a-b)<=tol,{actual:a,expected:b});
const ring=(cx=100,cy=100,r=30)=>Array.from({length:36},(_,i)=>{
  const a=i*2*Math.PI/36;return {x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)};
});

test('recorded portrait object-fit:cover maps its face to the same canvas coordinates',()=>{
  const p=faceVideoProjection({
    videoWidth:540,videoHeight:960,viewWidth:390,viewHeight:844
  });
  near(p.scale,.879166666667);
  near(p.offsetX,(390-540*p.scale)/2);
  near(p.offsetY,0);
  const mid=projectFaceLandmark({x:.5,y:.5},p);
  near(mid.x,195);near(mid.y,422);
});
test('front camera cover-crop uses one and only one CSS mirroring transform',()=>{
  const base={videoWidth:1280,videoHeight:720,viewWidth:390,viewHeight:844};
  const normal=faceVideoProjection({...base,mirrored:false});
  const mirror=faceVideoProjection({...base,mirrored:true});
  for(const x of [.30,.48,.50,.72]){
    const a=projectFaceLandmark({x,y:.65},normal);
    const b=projectFaceLandmark({x,y:.65},mirror);
    near(a.x+b.x,390);
    near(a.y,b.y);
  }
  near(projectFaceLandmark({x:.5,y:.5},mirror).x,195);
});
test('head center and radii always match the SAME filtered polygon',()=>{
  const outline=ring(140,270,48);
  const box=geometryFromFaceOutline(outline);
  near(box.cx,140);near(box.cy,270);near(box.rx,48);near(box.ry,48);
  const moved=outline.map(p=>({x:p.x+112,y:p.y+31}));
  const alpha=.72;
  const filtered=outline.map((p,i)=>({
    x:p.x+(moved[i].x-p.x)*alpha,
    y:p.y+(moved[i].y-p.y)*alpha
  }));
  const synced=geometryFromFaceOutline(filtered);
  near(synced.cx,140+112*alpha);
  near(synced.cy,270+31*alpha);
  assert.equal(geometryFromFaceOutline(null),null);
});
test('a camera cannot launch without a genuinely fresh 36-point face collider',()=>{
  const poly=ring(180,240,45);
  const head={valid:true,outline:poly};
  assert.equal(isFreshFaceAnchor({mode:'camera',head,hasFace:true,ageMs:55}),true);
  assert.equal(isFreshFaceAnchor({mode:'clip',head,hasFace:true,ageMs:240}),true);
  assert.equal(isFreshFaceAnchor({mode:'camera',head:null,hasFace:true,ageMs:3}),false);
  assert.equal(isFreshFaceAnchor({mode:'camera',head,hasFace:false,ageMs:3}),false);
  assert.equal(isFreshFaceAnchor({mode:'camera',head,hasFace:true,ageMs:390}),false);
  assert.equal(isFreshFaceAnchor({mode:'clip',head:{valid:true,outline:[]},hasFace:true,ageMs:3}),false);
  assert.equal(isFreshFaceAnchor({mode:'simulation'}),true);
});
test('post-collision comet tail cannot be drawn backward through the face',()=>{
  const face=ring(100,100,25);
  const trail=clipTailOutsideFace(100,100,100,132,face);
  assert.ok(trail.y>=126&&trail.y<=132,trail);
  assert.equal(pointInsideFace(trail.x,trail.y,face),false);
  const chord=clipTailOutsideFace(50,100,150,100,face);
  assert.ok(chord.x>125&&chord.x<150,chord);
  const clean=clipTailOutsideFace(0,0,0,30,face);
  assert.deepEqual(clean,{x:0,y:0});
  assert.equal(clipTailOutsideFace(80,100,100,100,face),null,
    'a spark that is inside the face must not render through the skin');
});
