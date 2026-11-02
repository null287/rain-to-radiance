import { spawn } from 'node:child_process';
import { mkdirSync,writeFileSync } from 'node:fs';
import { join,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const tests=dirname(fileURLToPath(import.meta.url)),root=join(tests,'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const exe='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port=19341;
const browser=spawn(exe,[
  '--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-sync',
  '--disable-background-networking','--remote-debugging-port='+port,
  '--user-data-dir='+join(tests,'browser-profile'),
  '--window-size=1320,960','http://127.0.0.1:8896/'
],{stdio:'ignore',windowsHide:true});
const evidence={environment:'Headless Edge isolated profile; simulation only; webcam never opened',checks:[],screenshots:[],errors:[]};
let socket=null;
try{
  let page;
  for(let i=0;i<80;i++){
    try{const res=await fetch('http://127.0.0.1:'+port+'/json/list');const pages=await res.json();page=pages.find(x=>x.type==='page'&&x.url.includes('8896'));if(page)break;}catch{}
    await sleep(150);
  }
  if(!page)throw Error('Edge CDP did not expose local page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  socket=ws;
  const pending=new Map();let id=0;
  ws.onmessage=event=>{
    const m=JSON.parse(event.data);if(m.method==='Runtime.exceptionThrown')evidence.errors.push(m.params?.exceptionDetails?.text||'Page exception');
    if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')evidence.errors.push(m.params.entry.text);
    if(m.id&&pending.has(m.id)){const item=pending.get(m.id);pending.delete(m.id);if(m.error)item.reject(Error(m.error.message));else item.resolve(m.result);}
  };
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=()=>reject(Error('CDP failed'));});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const k=++id;pending.set(k,{resolve,reject});ws.send(JSON.stringify({id:k,method,params}));setTimeout(()=>{if(pending.has(k)){pending.delete(k);reject(Error('CDP timeout '+method));}},24000);});
  const evaluate=async expression=>{
    const response=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(response.exceptionDetails)throw Error('JS: '+response.exceptionDetails.text);
    return response.result.value;
  };
  const shot=async name=>{
    const a=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    const file=join(tests,name+'.png');writeFileSync(file,Buffer.from(a.data,'base64'));
    evidence.screenshots.push(file);
  };
  await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
  await sleep(800);
  const loaded=await evaluate('Boolean(document.getElementById("simulate") && window.smileWeather)');
  assert.ok(loaded,'Demo loaded');
  evidence.checks.push({test:'local HTML and modules loaded',pass:true});
  await evaluate('document.getElementById("simulate").click();');
  await sleep(230);
  assert.equal((await evaluate('smileWeather.snapshot()')).mode,'simulation');
  await shot('01_模拟待机');
  await evaluate('document.querySelector("[data-expression=smile]").click()');
  await sleep(850);
  const rain=await evaluate('smileWeather.snapshot()');
  evidence.checks.push({test:'smile -> measurable rain',pass:rain.state==='smile'&&rain.rainEnvelope>0&&rain.particles>0,snapshot:rain});
  assert.ok(rain.state==='smile'&&rain.rainEnvelope>0&&rain.particles>0,'rain event');
  await shot('02_微笑雨幕');
  await evaluate('document.querySelector("[data-expression=laugh]").click()');
  await sleep(460);
  const rise=await evaluate('smileWeather.snapshot()');
  evidence.checks.push({test:'laugh -> vertical rising rocket',pass:rise.bursts===1&&rise.rockets===1,snapshot:rise});
  assert.ok(rise.bursts===1 && rise.rockets===1,'rocket launched');
  await shot('03_大笑垂直升空');
  await sleep(900);
  const fire=await evaluate('smileWeather.snapshot()');
  // Sustained laughter now produces a series of independent fireworks.
  // Requiring exactly one bloom would reject the intended V9.4 behavior.
  const boundedBloom=fire.detonations>=1&&fire.detonations<=3&&
    fire.bursts>=1&&fire.bursts<=4&&fire.particles>0;
  evidence.checks.push({test:'rocket detonates into bounded consecutive particles',pass:boundedBloom,snapshot:fire});
  assert.ok(boundedBloom,'first firework blooms and chain stays bounded');
  // V10.3 no longer aims every bloom at the center. Keep the collision
  // assertion, but observe a bounded continuous-laughter interval.
  let collisionFrame=fire;
  const collisionObservation=[];
  for(let i=0;i<20&&collisionFrame.collisions===0;i++){
    await sleep(250);
    collisionFrame=await evaluate('smileWeather.snapshot()');
    collisionObservation.push({afterMs:(i+1)*250,detonations:collisionFrame.detonations,collisions:collisionFrame.collisions});
  }
  assert.ok(collisionFrame.collisions>0,'head/particle collision needs to actually occur');
  evidence.checks.push({test:'spark particles physically collide with head proxy',pass:collisionFrame.collisions>0,collisions:collisionFrame.collisions,collisionObservation});
  await shot('04_烟花绽放');
  const rect=await evaluate('(()=>{const r=document.getElementById("stage").getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};})()');
  const oldHeadX=fire.head.cx;
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.left+rect.width*.68,y:rect.top+rect.height*.57});
  await sleep(280);
  const moved=await evaluate('smileWeather.snapshot()');
  evidence.checks.push({test:'pointer movement shifts head collider',pass:Math.abs(moved.head.cx-oldHeadX)>20,before:oldHeadX,after:moved.head.cx});
  assert.ok(Math.abs(moved.head.cx-oldHeadX)>20,'head follows user motion');
  await evaluate('document.querySelector("[data-expression=smile]").click()');
  await sleep(650);
  const back=await evaluate('smileWeather.snapshot()');
  evidence.checks.push({test:'return to smile -> rain resumes',pass:back.state==='smile'&&back.rainEnvelope>0,snapshot:back});
  assert.ok(back.state==='smile'&&back.rainEnvelope>0,'rain resumes');
  await evaluate('document.querySelector("[data-expression=laugh]").click()');
  await sleep(450);
  const again=await evaluate('smileWeather.snapshot()');
  evidence.checks.push({test:'smile to laugh again -> new firework',pass:again.bursts>=2,snapshot:again});
  assert.ok(again.bursts>=2,'second valid laugh');
  await evaluate('document.getElementById("stop").click()');
  await sleep(250);
  const stopped=await evaluate('smileWeather.snapshot()');
  assert.ok(stopped.mode==='idle'&&stopped.rockets===0&&stopped.particles===0);
  evidence.checks.push({test:'stop clears current simulation/particles',pass:true});
  // Initialize the REAL MediaPipe Worker and model in the independent copied folder,
  // without ever requesting a physical camera or sending image frames.
  const workerResult=await evaluate(`new Promise(resolve=>{
    const worker=new Worker(new URL('./src/worker.js',location.href),{type:'module'});
    const deadline=setTimeout(()=>{worker.terminate();resolve({ready:false,error:'model timeout'});},17000);
    worker.onmessage=e=>{
      if(e.data.type==='ready'){clearTimeout(deadline);worker.postMessage({type:'close'});resolve({ready:true,delegate:e.data.delegate});}
      if(e.data.type==='error'){clearTimeout(deadline);worker.terminate();resolve({ready:false,error:e.data.message});}
    };
    worker.onerror=e=>{clearTimeout(deadline);worker.terminate();resolve({ready:false,error:e.message});};
    worker.postMessage({type:'init',delegate:'CPU'});
  })`);
  evidence.checks.push({test:'real MediaPipe worker and model initialize without camera',pass:workerResult.ready,model:workerResult});
  assert.ok(workerResult.ready,'FaceLandmarker must actually load');
  evidence.pass=evidence.checks.every(x=>x.pass)&&evidence.errors.length===0;
}catch(error){evidence.pass=false;evidence.errors.push(String(error.stack||error));}
finally{
  writeFileSync(join(tests,'浏览器模拟验收.json'),JSON.stringify(evidence,null,2),'utf8');
  socket?.close();
  browser.kill();
  console.log(JSON.stringify({pass:evidence.pass,checks:evidence.checks.map(x=>[x.test,x.pass]),screenshots:evidence.screenshots,errors:evidence.errors},null,2));
  if(!evidence.pass)process.exitCode=1;
}
