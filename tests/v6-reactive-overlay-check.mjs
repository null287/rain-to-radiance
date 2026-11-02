import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=dirname(fileURLToPath(import.meta.url));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--disable-sync','--disable-background-networking','--remote-debugging-port=9359',
  '--user-data-dir='+join(root,'browser-profile-v6-reactive'),
  '--window-size=440,920','http://127.0.0.1:8896/'
],{stdio:'ignore',windowsHide:true});
let ws=null;
const evidence={environment:'V6 reactive overlay demo on Edge 390x844; no physical camera or TikTok account',checks:[],screenshots:[],errors:[],pass:false};
try{
  let page=null;
  for(let i=0;i<75;i++){
    try{
      const res=await fetch('http://127.0.0.1:9359/json/list');
      const pages=await res.json();page=pages.find(p=>p.type==='page'&&p.url.includes('8896'));
      if(page)break;
    }catch{}await sleep(120);
  }
  assert.ok(page,'Edge CDP page ready');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  const pending=new Map();let seq=0;
  ws.onmessage=event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.exceptionThrown')evidence.errors.push(message.params?.exceptionDetails?.text||'Runtime exception');
    if(message.method==='Log.entryAdded'&&message.params.entry.level==='error')evidence.errors.push(message.params.entry.text);
    if(message.id&&pending.has(message.id)){
      const request=pending.get(message.id);pending.delete(message.id);
      message.error?request.reject(Error(message.error.message)):request.resolve(message.result);
    }
  };
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=()=>rej(Error('WebSocket failure'));});
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
    setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('CDP timeout '+method));}},16000);
  });
  const evalJS=async code=>{
    const r=await send('Runtime.evaluate',{expression:code,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error('JS evaluation error: '+r.exceptionDetails.text);
    return r.result.value;
  };
  const shot=async name=>{
    const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    const file=join(root,name+'.png');
    writeFileSync(file,Buffer.from(r.data,'base64'));evidence.screenshots.push(file);
  };
  const check=(name,truth,detail=null)=>{
    evidence.checks.push({name,pass:Boolean(truth),detail});
    assert.ok(truth,name);
  };
  await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  let mounted=false;
  for(let i=0;i<30;i++){
    mounted=await evalJS('Boolean(window.livePreviewUI && livePreviewUI.snapshot().layout==="immersive-live-v4")');
    if(mounted)break;
    await sleep(130);
  }
  check('V4 overlay module loaded',mounted);
  check('event simulation controls exist',await evalJS('document.querySelectorAll("[data-live-test]").length===5'));
  check('no arbitrary stream statistics',await evalJS('document.querySelector(".viewer-count").textContent.trim()==="预览"'));
  check('initial state is explicitly offline demo',await evalJS('smileWeather.snapshot().mode==="idle"&&livePreviewUI.snapshot().totalEvents===0'));
  await shot('V6_弹幕_01_直播待机');
  await evalJS('document.getElementById("simulate").click()');
  await sleep(300);
  check('simulation does not fabricate audience arrivals automatically',await evalJS('livePreviewUI.snapshot().joins===0'));
  check('comment placeholder waits for manual audience action',await evalJS('Boolean(document.querySelector("#chatEvents .chat-placeholder"))'));
  await evalJS('document.getElementById("dockComments").click()');
  check('comment layer can be hidden',await evalJS('!livePreviewUI.snapshot().sampleCommentsVisible'));
  await evalJS('document.getElementById("dockComments").click()');
  check('comment layer can be restored',await evalJS('livePreviewUI.snapshot().sampleCommentsVisible'));
  await evalJS('document.getElementById("likeButton").click()');
  await sleep(160);
  check('like event changes counter and floats real DOM hearts',await evalJS('livePreviewUI.snapshot().sampleLikes>=3&&livePreviewUI.snapshot().floatingHearts>0'));
  await shot('V6_弹幕_02_浮动点赞');
  await evalJS('document.getElementById("settingsButton").click()');
  await evalJS('document.querySelector("[data-live-test=gift]").click()');
  await sleep(180);
  check('manual gift event displays animated gift alert',await evalJS('livePreviewUI.snapshot().giftVisible&&livePreviewUI.snapshot().gifts>=1&&getComputedStyle(document.getElementById("giftAlert")).animationName.includes("gift-enter")'));
  check('settings dismisses to show gift',await evalJS('document.getElementById("controlSheet").hidden'));
  await shot('V6_弹幕_03_礼物反馈');
  await evalJS('document.getElementById("dockGuests").click()');
  await sleep(90);
  check('viewer entry animates',await evalJS('livePreviewUI.snapshot().joinVisible&&livePreviewUI.snapshot().joins>=1'));
  await evalJS('document.getElementById("settingsButton").click()');
  await evalJS('document.querySelector("[data-live-test=chat]").click()');
  check('manual comment adds an event to feed',await evalJS('livePreviewUI.snapshot().comments>=1&&livePreviewUI.snapshot().feedRows<=5'));
  // Portraits are decoded asynchronously; wait briefly for the actual images
  // rather than treating a transient incomplete JPEG as a duplicate viewer.
  let portraitState=null;
  for(let attempt=0;attempt<12;attempt++){
    portraitState=await evalJS('(()=>{const rows=[...document.querySelectorAll("#chatEvents .chat-line")];const ids=rows.map(r=>r.querySelector(".chat-label")?.textContent.split("·")[0].trim());const images=rows.map(r=>r.querySelector(".chat-avatar img"));return {count:rows.length,ids,urls:images.map(i=>i?.getAttribute("src")||null),loaded:images.map(i=>!!i&&i.complete&&i.naturalWidth>0)}})()');
    if(portraitState.count===4&&new Set(portraitState.ids).size===4&&
      portraitState.loaded.every(Boolean)&&new Set(portraitState.urls).size===4)break;
    await sleep(85);
  }
  check('simulated viewers have unique photo avatars and distinct fictional IDs',
    portraitState.count===4&&new Set(portraitState.ids).size===4&&
      portraitState.loaded.every(Boolean)&&new Set(portraitState.urls).size===4,
    portraitState);
  await evalJS('document.querySelector("[data-expression=smile]").click()');
  await sleep(650);
  check('real AR smile transition enters event channel',await evalJS('smileWeather.snapshot().state==="smile"&&livePreviewUI.snapshot().arEvents>=1'));
  await sleep(200);
  check('actual smile prompts clearly marked simulated live comment',await evalJS('livePreviewUI.snapshot().reactionCount>=1&&document.getElementById("chatEvents").textContent.includes("模拟")'),null);
  await evalJS('document.querySelector("[data-expression=laugh]").click()');
  await sleep(540);
  check('laugh starts one physical rocket',await evalJS('smileWeather.snapshot().bursts>=1'));
  await sleep(820);
  // V10.3 spreads blooms across the frame. A single 1.36s first-bloom
  // checkpoint no longer guarantees intersection with the synthetic head.
  // Observe a bounded continuous-laughter interval; keep real collision >0.
  let combined=await evalJS('({physics:smileWeather.snapshot(),ui:livePreviewUI.snapshot()})');
  const collisionWait={initial:combined.physics,samples:[]};
  for(let i=0;i<20&&combined.physics.collisions===0;i++){
    await sleep(250);
    combined=await evalJS('({physics:smileWeather.snapshot(),ui:livePreviewUI.snapshot()})');
    collisionWait.samples.push({afterMs:(i+1)*250,bursts:combined.physics.bursts,detonations:combined.physics.detonations,collisions:combined.physics.collisions});
  }
  evidence.v10_3CollisionObservation=collisionWait;
  check('actual fireworks explode and hit head',combined.physics.detonations>=1&&combined.physics.collisions>0,combined.physics);
  check('bloom/collision AR events reach overlay',combined.ui.arEvents>=3,combined.ui);
  check('AR engine cues remain out of spectator comment feed',await evalJS('document.querySelectorAll("#chatEvents .ar-message").length===0'),null);
  check('reactive comment rows stay bounded at four',await evalJS('livePreviewUI.snapshot().feedRows<=4'),null);
  await shot('V6_弹幕_04_烟花评论联动');
  await evalJS('document.getElementById("settingsButton").click()');
  check('automatic demo events are disabled by default',await evalJS('!livePreviewUI.snapshot().autoOverlay'));
  await evalJS('document.getElementById("autoOverlay").click()');
  check('automatic demo events can be enabled',await evalJS('livePreviewUI.snapshot().autoOverlay'));
  await evalJS('document.getElementById("autoOverlay").click()');
  check('automatic demo events can be disabled again',await evalJS('!livePreviewUI.snapshot().autoOverlay'));
  await evalJS('document.getElementById("sheetClose").click()');
  await evalJS('document.getElementById("powerButton").click()');
  await sleep(120);
  check('stop clears overlay timers/states/heart nodes',await evalJS('smileWeather.snapshot().mode==="idle"&&livePreviewUI.snapshot().mode==="idle"&&livePreviewUI.snapshot().floatingHearts===0&&livePreviewUI.snapshot().totalEvents===0'));
  evidence.pass=evidence.checks.every(c=>c.pass)&&evidence.errors.length===0;
}catch(err){evidence.errors.push(String(err.stack||err));}
finally{
  writeFileSync(join(root,'V6_动态弹幕联动验收.json'),JSON.stringify(evidence,null,2),'utf8');
  ws?.close();browser.kill();
  console.log(JSON.stringify({pass:evidence.pass,checks:evidence.checks.map(x=>[x.name,x.pass]),screenshots:evidence.screenshots,errors:evidence.errors},null,2));
  if(!evidence.pass)process.exitCode=1;
}
