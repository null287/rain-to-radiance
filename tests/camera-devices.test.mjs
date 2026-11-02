import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraConstraints,cameraChoices} from '../src/camera-devices.js';
test('explicit shared camera stays exact and does not silently fall back to built-in',()=>{
 const constraints=cameraConstraints('samsung-shared-camera');
 assert.deepEqual(constraints.video.deviceId,{exact:'samsung-shared-camera'});
 assert.equal(constraints.video.facingMode,undefined);
 assert.equal(constraints.audio,false);
});
test('default camera remains front-facing with bounded resolution and no microphone',()=>{
 const c=cameraConstraints('');
 assert.equal(c.video.facingMode,'user');
 assert.equal(c.video.width.ideal,960);
 assert.equal(c.video.frameRate.max,30);
 assert.equal(c.audio,false);
});
test('device picker lists cameras only and labels permission-hidden devices safely',()=>{
 assert.deepEqual(cameraChoices([{kind:'audioinput',deviceId:'mic',label:'Microphone'},
  {kind:'videoinput',deviceId:'built-in',label:'Integrated Webcam'},
  {kind:'videoinput',deviceId:'phone',label:'相机分享'},
  {kind:'videoinput',deviceId:'hidden',label:''}]),[
  {id:'built-in',label:'Integrated Webcam'},{id:'phone',label:'相机分享'},
  {id:'hidden',label:'摄像头 3'}]);
});
