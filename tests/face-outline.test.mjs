import test from 'node:test';
import assert from 'node:assert/strict';
import {FACE_OVAL_INDICES,faceOutlineFromLandmarks,pointInsideFace} from '../src/face-outline.js';
import {reflectAgainstHead} from '../src/physics.js';

const circle=(r=20,cx=0,cy=0)=>Array.from({length:36},(_,i)=>({
 x:cx+r*Math.cos(i*Math.PI*2/36),y:cy+r*Math.sin(i*Math.PI*2/36)
}));
const head=(poly,opts={})=>({
 cx:0,cy:0,rx:42,ry:37,angle:0,vx:0,vy:0,valid:true,outline:poly,...opts
});
const particle=(prevX,y,x,vx)=>({
 kind:'spark',prevX,prevY:y,x,y,vx,vy:0,r:1,bounces:0
});

test('face oval extracts 36 actual projected landmarks and rejects missing points',()=>{
 const pts=Array.from({length:478},()=>({x:.5,y:.5}));
 const ring=circle(.18,.5,.5);
 FACE_OVAL_INDICES.forEach((id,i)=>pts[id]=ring[i]);
 const outline=faceOutlineFromLandmarks(pts,p=>({x:p.x*400,y:p.y*400}));
 assert.equal(outline.length,36);
 assert.ok(outline.some(p=>p.x>265));
 assert.equal(faceOutlineFromLandmarks(pts.slice(0,200),p=>p),null);
});

test('tight outline rejects a particle traversing the empty invisible ellipse space',()=>{
 const p=particle(-65,28,65,1300);
 const h=head(circle(20)); // ellipse 42x37 would intersect at y=28
 assert.equal(reflectAgainstHead(p,h,{dt:.1,maxSpeed:1800}),false);
 assert.equal(p.bounces,0);
 assert.equal(p.vx,1300);
 assert.equal(p.lastCollision,null);
});

test('high-speed particle crossing face outline reflects at visible contour',()=>{
 const p=particle(-45,0,45,900);
 assert.equal(reflectAgainstHead(p,head(circle(20)),{dt:.1,maxSpeed:1600}),true);
 assert.equal(p.bounces,1);
 assert.ok(p.vx<0);
 assert.ok(Math.abs(p.lastCollision.x+20)<.5);
 assert.equal(p.lastCollision.collider,'face-outline');
 assert.equal(pointInsideFace(p.x,p.y,circle(20)),false);
});

test('a particle inside the tracked face leaving outward does not create a phantom hit',()=>{
 const p=particle(0,0,34,340);
 assert.equal(reflectAgainstHead(p,head(circle(20)),{dt:.1}),false);
 assert.equal(p.bounces,0);
});

test('moving face can reflect a nearly static particle with relative motion',()=>{
 const h=head(circle(20,10,0),{cx:10,vx:200});
 const p=particle(24,0,24,0);
 assert.equal(reflectAgainstHead(p,h,{dt:.05,maxSpeed:1500}),true);
 assert.ok(p.vx>0);
 assert.ok(Number.isFinite(p.lastCollision.x));
});

test('outward contact not repeated on subsequent frame',()=>{
 const h=head(circle(20));
 const p=particle(-45,0,45,900);
 assert.equal(reflectAgainstHead(p,h,{dt:.1}),true);
 const lastX=p.x,lastY=p.y;
 p.prevX=lastX;p.prevY=lastY;p.x+=p.vx*.016;p.y+=p.vy*.016;
 assert.equal(reflectAgainstHead(p,h,{dt:.016}),false);
 assert.equal(p.bounces,1);
});
