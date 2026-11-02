import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {DEMO_PERSONAS,demoPersonaFor,demoHandleAt} from '../src/demo-personas.js';
import {scriptedDemoEvent} from '../src/overlay-events.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
test('ten different fictional IDs map one-to-one to different real portrait files',()=>{
 assert.ok(DEMO_PERSONAS.length>=10);
 assert.equal(new Set(DEMO_PERSONAS.map(p=>p.handle)).size,DEMO_PERSONAS.length);
 assert.equal(new Set(DEMO_PERSONAS.map(p=>p.avatar)).size,DEMO_PERSONAS.length);
 for(const p of DEMO_PERSONAS){
   assert.match(p.handle,/^[a-z0-9._]+$/);
   assert.ok(p.avatar.startsWith('./assets/audience-avatars/'));
   const file=resolve(root,p.avatar);
   assert.ok(existsSync(file),file+' missing');
   const bytes=readFileSync(file);
   assert.ok(bytes.length>2500&&bytes[0]===0xff&&bytes[1]===0xd8,file+' not JPEG');
   assert.equal(demoPersonaFor(p.handle)?.avatar,p.avatar);
 }
});
test('ten successive simulated viewer IDs are different and remain clearly fake',()=>{
 const events=Array.from({length:DEMO_PERSONAS.length},(_,i)=>scriptedDemoEvent(i));
 assert.equal(new Set(events.map(e=>e.name)).size,DEMO_PERSONAS.length);
 assert.ok(events.every(e=>e.source==='sim'));
 assert.equal(demoHandleAt(0),demoHandleAt(DEMO_PERSONAS.length));
});
