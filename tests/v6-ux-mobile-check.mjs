import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=dirname(fileURLToPath(import.meta.url)),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const exe='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port=19355;
const browser=spawn(exe,[
  '--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-sync',
  '--disable-background-networking','--remote-debugging-port='+port,
  '--user-data-dir='+join(root,'browser-profile-v6-ux'),
  '--window-size=460,930','http://127.0.0.1:8896/'
],{stdio:'ignore',windowsHide:true});
const evidence={type:'V6 responsive mobile UX, load/cancel, performance caps and public live UI design guidance, no webcam',checks:[],screenshots:[],errors:[],pass:false};
let ws;
try{
  let page;
  for(let i=0;i<80;i++){
    try{const res=await fetch('http://127.0.0.1:'+port+'/json/list');const data=await res.json();page=data.find(x=>x.type==='page'&&x.url.includes('8896'));if(page)break;}catch{}
    await sleep(120);
  }
  if(!page)throw Error('Edge CDP missing');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  const pending=new Map();let seq=0;
  ws.onmessage=event=>{
    const m=JSON.parse(event.data);
    if(m.method==='Runtime.exceptionThrown')evidence.errors.push(m.params?.exceptionDetails?.text||'JS exception');
    if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')evidence.errors.push(m.params.entry.text);
    if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}
  };
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=()=>reject(Error('WebSocket error'));});
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
    setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('CDP timeout: '+method));}},14000);
  });
  const evalJS=async exp=>{
    const r=await send('Runtime.evaluate',{expression:exp,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error('Runtime JS: '+JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const capture=async filename=>{
    const size=await evalJS('({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight})');
    const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,
      clip:{x:0,y:0,width:Math.min(size.w,390),height:Math.min(size.h,2400),scale:1}});
    const path=join(root,filename+'.png');
    writeFileSync(path,Buffer.from(r.data,'base64'));evidence.screenshots.push(path);
  };
  const check=(name,good,detail)=>{
    evidence.checks.push({name,pass:Boolean(good),detail});
    assert.ok(good,name);
  };
  await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(950);
  const viewport=await evalJS('(()=>{const s=document.getElementById("stage").getBoundingClientRect(),b=document.getElementById("startCamera").getBoundingClientRect();return {innerWidth,scrollWidth:document.documentElement.scrollWidth,stage:{x:s.x,width:s.width,height:s.height},start:{x:b.x,width:b.width,top:b.top},presentation:smileWeather.snapshot().presentation};})()');
  check('responsive viewport fits 390 CSS pixels',viewport.innerWidth===390&&viewport.scrollWidth<=390,viewport);
  check('full-height LIVE viewport replaces the old display card',Math.abs(viewport.stage.height-844)<2&&Math.abs(viewport.stage.width-390)<2,viewport.stage);
  check('V3 live presentation mounted',viewport.presentation==='live-v3',viewport.presentation);
  check('native LIVE layer elements present',await evalJS('Boolean(document.querySelector(".live-head")&&document.querySelector(".chat-feed")&&document.querySelector(".live-dock"))'),null);
  await evalJS('document.getElementById("settingsButton").click()');
  check('LIVE settings sheet opens',await evalJS('!document.getElementById("controlSheet").hidden'),null);
  const settingUi=await evalJS('(()=>{const node=document.getElementById("controlSheet"),r=node.getBoundingClientRect(),s=getComputedStyle(node);return {height:r.height,borderRadius:s.borderTopLeftRadius,bg:s.backgroundColor,primary:getComputedStyle(document.querySelector(".sheet-primary")).backgroundColor}})()');
  check('public Douyin reference: 483px 20px light settings panel',Math.abs(settingUi.height-483)<1&&settingUi.borderRadius==='20px'&&settingUi.bg==='rgb(243, 243, 243)',settingUi);
  check('primary CTA has consistent TikTok-family pink',settingUi.primary==='rgb(254, 44, 85)',settingUi.primary);
  check('advanced settings use progressive disclosure',await evalJS('Array.from(document.querySelectorAll(".advanced-tools")).every(el=>!el.open)'),null);
  await sleep(260);
  await capture('V6_手机_05_官方规范参考设置');
  await evalJS('document.getElementById("sheetClose").click()');
  check('settings can close',await evalJS('document.getElementById("controlSheet").hidden'),null);
  check('stage CTA visible and accessible',viewport.start.width>130&&viewport.start.top<844,viewport.start);
  await capture('V6_手机_01_初始界面');
  await evalJS('document.getElementById("simulate").click()');
  await sleep(260);
  check('onstage CTA starts simulation',await evalJS('smileWeather.snapshot().mode==="simulation"'),null);
  await sleep(190);
  const frameProfile=await evalJS('smileWeather.snapshot()');
  check('rendering capped rather than painting at unlimited refresh',frameProfile.renderFrames>0&&frameProfile.fps<=75,frameProfile.quality);
  check('adaptive profile reports bounded DPR',frameProfile.renderDpr<=2&&['full','balanced','lite'].includes(frameProfile.quality.effectiveQuality),frameProfile.quality);
  await evalJS('document.querySelector("[data-expression=smile]").click()');
  await sleep(860);
  const rain=await evalJS('smileWeather.snapshot()');
  check('mobile smile produces real animated rain',rain.state==='smile'&&rain.rainEnvelope>.18&&rain.particles>0,rain);
  await capture('V6_手机_02_雨幕');
  // Full-page CDP screenshot can suspend RAF beyond face-loss grace; wait for simulation rearm.
  await sleep(360);
  await evalJS('document.querySelector("[data-expression=laugh]").click()');
  await sleep(470);
  const launch=await evalJS('smileWeather.snapshot()');
  check('mobile laugh launches a vertical rocket',launch.rockets===1&&launch.bursts===1,launch);
  await sleep(850);
  const bloom=await evalJS('smileWeather.snapshot()');
  // V10.3 blooms across the entire screen, so a specific isolated flower
  // need not cross the face at all. A no-contact frame is physically correct,
  // not proof the collider is broken (covered by face-outline unit tests).
  check('mobile fireworks bloom across the stage and remain bounded',
    bloom.detonations>=1&&bloom.detonations<=3&&
    bloom.bursts<=4&&bloom.head?.valid&&bloom.particles>0&&
    Number.isFinite(bloom.collisions),bloom);
  await capture('V6_手机_03_烟花碰撞');
  await evalJS('document.querySelector("[data-palette=mint]").click()');
  check('art direction switches without resetting physics',await evalJS('smileWeather.snapshot().palette==="mint"'),null);
  await evalJS('document.getElementById("dockComments").click()');
  check('demo comments can be hidden',await evalJS('!livePreviewUI.snapshot().sampleCommentsVisible'),null);
  await evalJS('document.getElementById("dockComments").click()');
  check('demo comments can be restored',await evalJS('livePreviewUI.snapshot().sampleCommentsVisible'),null);
  await evalJS('document.getElementById("powerButton").click()');
  const stopped=await evalJS('smileWeather.snapshot()');
  check('stop releases simulation',stopped.mode==='idle'&&stopped.particles===0,stopped);
  await sleep(260);
  check('stopped AR stays released while the separate muted landing preview resumes',await evalJS(
    'smileWeather.snapshot().renderFrames===0&&smileWeather.snapshot().mode==="idle"&&'+
    'idlePreview.snapshot().videoMuted&&idlePreview.snapshot().videoReady'),null);
  await send('Emulation.setDeviceMetricsOverride',{width:320,height:740,deviceScaleFactor:1,mobile:true});
  await sleep(280);
  const compact=await evalJS('(()=>{const r=document.getElementById("stage").getBoundingClientRect();return {width:r.width,scrollWidth:document.documentElement.scrollWidth,cta:document.getElementById("startCamera").getBoundingClientRect().width}})()');
  check('320px viewport keeps primary CTA visible',Math.abs(compact.width-320)<2&&compact.scrollWidth<=320&&compact.cta>220,compact);
  await sleep(2650);
  await capture('V6_手机_04_320窄屏');
  // Inject a pending Worker and test loading/cancel without accessing physical cameras.
  await evalJS('window.Worker=class{postMessage(){} terminate(){}}');
  await evalJS('document.getElementById("startCamera").click()');
  await sleep(80);
  check('loading blocks duplicate entry, keeps cancellation available',await evalJS('document.getElementById("startCamera").disabled&&document.getElementById("startClip").disabled&&document.getElementById("startLaughClip").disabled&&!document.getElementById("stop").disabled'),null);
  await evalJS('document.getElementById("stop").click()');
  check('cancelled model load restores normal button state',await evalJS('!document.getElementById("startCamera").disabled&&!document.getElementById("welcome").hidden'),null);
  // Deliberately fail the model worker before any camera request: no physical device touched.
  await evalJS('window.Worker=class{constructor(){throw new Error("Synthetic model init failure")}}');
  await evalJS('document.getElementById("startCamera").click()');
  await sleep(260);
  check('initialization failure is visible and recoverable',await evalJS('(()=>{const w=document.getElementById("welcome"),e=document.getElementById("welcomeError");return !w.hidden&&!e.hidden&&e.textContent.includes("Synthetic model init failure")&&document.getElementById("startCamera").textContent.includes("重新启动")})()'),null);
  await evalJS('document.getElementById("simulate").click()');
  check('simulation remains available after initialization failure',await evalJS('smileWeather.snapshot().mode==="simulation"'),null);
  await evalJS('document.getElementById("powerButton").click()');
  evidence.pass=evidence.checks.every(x=>x.pass)&&evidence.errors.length===0;
}catch(e){evidence.errors.push(String(e.stack||e));}
finally{
  writeFileSync(join(root,'V6_移动端交互规范验收.json'),JSON.stringify(evidence,null,2),'utf8');
  ws?.close();browser.kill();
  console.log(JSON.stringify({pass:evidence.pass,checks:evidence.checks.map(x=>[x.name,x.pass]),screenshots:evidence.screenshots,errors:evidence.errors},null,2));
  if(!evidence.pass)process.exitCode=1;
}
