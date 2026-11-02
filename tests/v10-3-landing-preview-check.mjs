/**
 * End-to-end muted landing preview acceptance on isolated Edge.
 * Opens NO physical camera; video is a local prerecorded human and visual
 * effects are deliberately marked as timeline-demo (not live inference).
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const port=19483;
const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless=new','--no-first-run','--no-default-browser-check',
  '--disable-sync','--disable-extensions','--disable-background-networking',
  '--remote-debugging-port='+port,'--user-data-dir='+join(dir,'browser-profile-v10-3-landing'),
  '--window-size=480,930','http://127.0.0.1:8896/'
],{stdio:'ignore',windowsHide:true});
const result={checks:[],errors:[],screenshots:[],pass:false,
  environment:'Edge 390×844 / 320×740; muted LOCAL video only, no physical camera'};
let ws;
try{
  let page=null;
  for(let i=0;i<100;i++){
    try{
      const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
      page=tabs.find(t=>t.type==='page'&&t.url.includes('8896'));
      if(page)break;
    }catch{}
    await sleep(130);
  }
  assert.ok(page,'localhost app tab');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  const jobs=new Map();let id=0;
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.method==='Runtime.exceptionThrown')
      result.errors.push(m.params?.exceptionDetails?.text||'Uncaught page exception');
    if(m.method==='Log.entryAdded'&&m.params.entry.level==='error'&&
      !String(m.params.entry.text).includes('XNNPACK'))
      result.errors.push(m.params.entry.text);
    if(m.id&&jobs.has(m.id)){
      const item=jobs.get(m.id);jobs.delete(m.id);
      m.error?item.reject(Error(m.error.message)):item.resolve(m.result);
    }
  };
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const k=++id;jobs.set(k,{resolve,reject});
    ws.send(JSON.stringify({id:k,method,params}));
    setTimeout(()=>{if(jobs.has(k)){jobs.delete(k);reject(Error('CDP timeout '+method));}},20000);
  });
  const evalJS=async expression=>{
    const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error('JS '+r.exceptionDetails.text);
    return r.result.value;
  };
  const check=(name,okay,detail=null)=>{
    result.checks.push({name,pass:Boolean(okay),detail});
    assert.ok(okay,name+' '+JSON.stringify(detail).slice(0,500));
  };
  const shot=async name=>{
    const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    const path=join(dir,name+'.png');
    writeFileSync(path,Buffer.from(r.data,'base64'));result.screenshots.push(path);
  };
  const waitFor=async (predicate,limit=85,delay=150)=>{
    let latest=null;
    for(let i=0;i<limit;i++){
      latest=await evalJS(predicate);
      if(latest)break;
      await sleep(delay);
    }
    return latest;
  };
  await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride',{
    width:390,height:844,deviceScaleFactor:1,mobile:true
  });
  check('app and preview engines mount',await waitFor(
    'Boolean(window.smileWeather&&window.idlePreview&&window.livePreviewUI)',50,100));
  const initial=await evalJS('(()=>{const p=idlePreview.snapshot(),v=document.getElementById("idlePreviewVideo");return {'+
    'mode:smileWeather.snapshot().mode,source:v.getAttribute("src"),muted:v.muted,autoplay:v.autoplay,'+
    'loop:v.loop,tracks:p.physicalCameraTracks,ready:p.videoReady,paused:p.videoPaused}})()');
  check('idle landing uses one local laughing human clip, muted and looping, without camera',
    initial.mode==='idle'&&initial.source.includes('pexels-5700089-laugh-portrait.mp4')&&
    initial.muted&&initial.autoplay&&initial.loop&&initial.tracks===0,initial);
  check('muted prerecorded preview actually starts moving without a click',
    await waitFor('idlePreview.snapshot().active&&idlePreview.snapshot().videoCurrentTime>.3',60,150));
  const buttons=await evalJS('(()=>{const w=document.getElementById("welcome");return {'+
    'labels:[...w.querySelectorAll("button")].filter(b=>getComputedStyle(b).display!=="none").map(b=>b.textContent.trim()),'+
    'primary:document.getElementById("startCamera").getBoundingClientRect().height,'+
    'status:document.getElementById("sourceTag").textContent}})()');
  check('exactly THREE visible landing buttons, with camera as the prominent primary',
    buttons.labels.length===3&&
    buttons.labels[0]==='开启摄像头，查看 AR 效果'&&
    buttons.labels[1]==='播放微笑样片'&&
    buttons.labels[2]==='播放大笑样片'&&buttons.primary>=50,buttons);
  await evalJS('document.getElementById("idlePreviewVideo").currentTime=1.7');
  await sleep(1200);
  const smile=await evalJS('idlePreview.snapshot()');
  check('recorded smile automatically animates physically generated rain',
    smile.active&&smile.phase==='smile'&&smile.rainEnvelope>.45&&
    smile.particles>0&&smile.bursts===0,smile);
  await shot('V10_3_首页微笑雨幕自动预览');
  await evalJS('document.getElementById("idlePreviewVideo").currentTime=5.3');
  const burst=await waitFor(
    '(()=>{const p=idlePreview.snapshot();return p.phase==="laugh"&&p.bursts>0&&p.detonations>0?{...p}:null})()',
    33,140);
  check('same prerecorded actor changes to laughter and REAL fireworks bloom',
    burst?.bursts>0&&burst?.detonations>0&&burst.phase==='laugh',burst);
  await shot('V10_3_首页大笑烟花自动预览');
  await evalJS('document.getElementById("idlePreviewVideo").currentTime=12.1');
  const previousLoop=await evalJS('idlePreview.snapshot().loops');
  const loop=await waitFor(
    '(()=>{const p=idlePreview.snapshot();return p.loops>'+previousLoop+
    '&&p.phase==="smile"&&p.bursts===0?{...p}:null})()',24,160);
  check('end of video loops to early smile and clears prior fireworks',
    loop?.loops>previousLoop&&loop?.bursts===0&&loop?.phase==='smile',loop);
  await shot('V10_3_首页循环预览恢复');
  await send('Emulation.setDeviceMetricsOverride',{
    width:320,height:740,deviceScaleFactor:1,mobile:true
  });
  await sleep(180);
  const compact=await evalJS('(()=>{const rect=id=>document.getElementById(id).getBoundingClientRect();return {'+
    'scroll:document.documentElement.scrollWidth,primary:rect("startCamera").height,'+
    'left:rect("startCamera").left,right:rect("startCamera").right,'+
    'cameraTrack:idlePreview.snapshot().physicalCameraTracks}})()');
  check('320px landing remains visible and camera still unopened',
    compact.scroll<=320&&compact.primary>=43&&
    compact.left>=0&&compact.right<=321&&compact.cameraTrack===0,compact);
  await send('Emulation.setDeviceMetricsOverride',{
    width:390,height:844,deviceScaleFactor:1,mobile:true
  });
  await evalJS('document.getElementById("startClip").click()');
  check('smile button enters REAL MediaPipe recorded clip, not a timed fake',
    await waitFor('smileWeather.snapshot().mode==="clip"&&smileWeather.snapshot().workerReady',90,280));
  check('background autoplay pauses as soon as interactive AR begins',
    await evalJS('idlePreview.snapshot().videoPaused&&'+
      'idlePreview.snapshot().physicalCameraTracks===0'));
  await evalJS('document.getElementById("powerButton").click()');
  check('stop returns to autonomous video preview',
    await waitFor('smileWeather.snapshot().mode==="idle"&&idlePreview.snapshot().active',42,150));
  await evalJS('document.getElementById("startLaughClip").click()');
  check('laugh button enters its real MediaPipe sample with the same prerecorded person',
    await waitFor('smileWeather.snapshot().mode==="clip"&&smileWeather.snapshot().workerReady',90,280)&&
    await evalJS('document.getElementById("camera").src.includes("5700089")'));
  await evalJS('document.getElementById("powerButton").click()');
  result.pass=result.checks.every(x=>x.pass)&&result.errors.length===0;
}catch(err){result.errors.push(String(err.stack||err));}
finally{
  ws?.close();browser.kill();
  writeFileSync(join(dir,'V10_3_首页自动预览验收.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({pass:result.pass,checks:result.checks,
    errors:result.errors,screenshots:result.screenshots},null,2));
  if(!result.pass)process.exitCode=1;
}
