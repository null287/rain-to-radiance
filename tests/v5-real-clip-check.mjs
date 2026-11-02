import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const dir=dirname(fileURLToPath(import.meta.url));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const port=19351;
const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-sync',
  '--disable-background-networking','--remote-debugging-port='+port,
  '--user-data-dir='+join(dir,'browser-profile-v5-real-clip'),
  '--window-size=470,930','http://127.0.0.1:8896/'
],{stdio:'ignore',windowsHide:true});
const result={environment:'Edge 390x844; bundled Pexels recorded face clip only, no physical camera',checks:[],errors:[],screenshots:[],pass:false};
let ws;
try{
  let page;
  for(let i=0;i<90;i++){
    try{const resp=await fetch('http://127.0.0.1:'+port+'/json/list');const list=await resp.json();page=list.find(p=>p.type==='page'&&p.url.includes('8896'));if(page)break;}catch{}
    await sleep(120);
  }
  assert.ok(page,'CDP page');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  let seq=0;const pending=new Map();
  ws.onmessage=ev=>{
    const msg=JSON.parse(ev.data);
    if(msg.method==='Runtime.exceptionThrown')result.errors.push(msg.params?.exceptionDetails?.text||'JS exception');
    if(msg.method==='Log.entryAdded'&&msg.params.entry.level==='error'){
      const item=msg.params.entry.text;
      if(!item.includes('INFO: Created TensorFlow Lite XNNPACK delegate for CPU.'))result.errors.push(item);
    }
    if(msg.id&&pending.has(msg.id)){const q=pending.get(msg.id);pending.delete(msg.id);msg.error?q.reject(Error(msg.error.message)):q.resolve(msg.result);}
  };
  await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=()=>rej(Error('CDP websocket'));});
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
    setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('Timeout '+method));}},15000);
  });
  const evalJS=async src=>{
    const reply=await send('Runtime.evaluate',{expression:src,returnByValue:true,awaitPromise:true});
    if(reply.exceptionDetails)throw Error('Runtime: '+reply.exceptionDetails.text);
    return reply.result.value;
  };
  const check=(name,good,detail)=>{result.checks.push({name,pass:Boolean(good),detail});assert.ok(good,name);};
  const shot=async name=>{
    const reply=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    const p=join(dir,name+'.png');writeFileSync(p,Buffer.from(reply.data,'base64'));result.screenshots.push(p);
  };
  await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  // A cold browser can take longer to apply the local CSS after CDP attaches.
  // Check the SAME visible poster requirement, but wait for stylesheet load.
  let posterReady=false;
  for(let attempt=0;attempt<35;attempt++){
    posterReady=await evalJS('Boolean(document.getElementById("stage"))&&'+
      'getComputedStyle(document.getElementById("stage")).backgroundImage.includes("preview-poster-862")');
    if(posterReady)break;
    await sleep(120);
  }
  check('real portrait poster on idle',posterReady);
  check('recorded clip entrance exists',await evalJS('Boolean(document.getElementById("startClip") && document.getElementById("videoPicker"))'));
  check('automatic fabricated spectators disabled',await evalJS('!document.getElementById("autoOverlay").checked'));
  await shot('V5_01_真人预览待机');
  await evalJS('document.getElementById("startClip").click()');
  let state=null;
  for(let i=0;i<95;i++){
    await sleep(320);
    state=await evalJS('({mode:smileWeather.snapshot().mode,status:document.getElementById("status").textContent,workerReady:smileWeather.snapshot().workerReady})');
    if(state.mode==='clip'||(state.mode==='idle'&&state.status.includes('失败')))break;
  }
  check('MediaPipe worker started recorded-source AR',state.mode==='clip'&&state.workerReady,state);
  check('recorded video is not CSS-mirrored against its landmark coordinates',
    await evalJS('getComputedStyle(document.getElementById("camera")).transform==="none"'));
  let faces=[];
  for(let i=0;i<30;i++){
    await sleep(250);
    const next=await evalJS('({snap:smileWeather.snapshot(),video:{readyState:document.getElementById("camera").readyState,currentTime:document.getElementById("camera").currentTime,width:document.getElementById("camera").videoWidth,height:document.getElementById("camera").videoHeight}})');
    faces.push(next);
    if(next.snap.totalFrames>=6&&next.snap.hasFace)break;
  }
  const last=faces.at(-1);
  check('video frames are actually decoded',last.video.readyState>=2&&last.video.width===540&&last.video.height===960,last.video);
  check('worker decoded real human facial landmarks',last.snap.totalFrames>=6&&faces.some(p=>p.snap.hasFace),{frames:last.snap.totalFrames,hasFace:last.snap.hasFace,state:last.snap.state});
  check('no physical camera track is opened',last.snap.tracks.length===0,last.snap.tracks);
  // The Worker result may land between two animation frames. Wait for the
  // head-outline renderer to consume real landmarks rather than treating that
  // brief render race as a failed model. No mock collider is substituted.
  let trackedHead=last.snap.head;
  for(let retry=0;retry<18&&!(trackedHead?.rx>10&&trackedHead.outlinePoints>=12);retry++){
    await sleep(125);
    trackedHead=await evalJS('smileWeather.snapshot().head');
  }
  check('real face collider uses tracked video landmarks',
    trackedHead?.rx>10&&trackedHead.outlinePoints>=12,trackedHead);
  const projection=await evalJS('smileWeather.snapshot()');
  check('actual recorded-face projection uses video cover geometry without mirroring',
    projection.faceProjection?.videoWidth===540&&
    projection.faceProjection?.videoHeight===960&&
    projection.faceProjection?.mirrored===false&&
    projection.faceAnchorValid===true&&
    Math.abs(projection.faceProjection.viewWidth-390)<1&&
    Math.abs(projection.faceProjection.viewHeight-844)<1,
    {projection:projection.faceProjection,head:projection.head});
  await evalJS('(()=>{const d=document.getElementById("debug");d.checked=true;d.dispatchEvent(new Event("change"))})()');
  await sleep(200);
  const diagnostics=await evalJS('(()=>{const h=smileWeather.snapshot().head,'+
    'm=document.getElementById("metrics").getBoundingClientRect();'+
    'return {head:h,metrics:{top:m.top,bottom:m.bottom,left:m.left,right:m.right},'+
    'debugVisible:!document.getElementById("metrics").hidden}})()');
  check('calibration diagnostics do not obscure the actual tracked face',
    diagnostics.debugVisible&&diagnostics.head?.outlinePoints>=12&&
    diagnostics.metrics.top>diagnostics.head.cy+diagnostics.head.ry,
    diagnostics);
  await shot('V10_2_真人面部轮廓对齐校验');
  await evalJS('(()=>{const d=document.getElementById("debug");d.checked=false;d.dispatchEvent(new Event("change"))})()');
  // The requested final experience is front-only. A prerecorded clip must
  // not load an extra person segmenter or paint a rear/occluded fireworks layer.
  check('human video uses front-only effects without background segmentation',
    await evalJS('!document.getElementById("backScene")&&'+
      '!document.getElementById("portraitDepth")&&'+
      '!document.getElementById("previewFireworkDepth")&&'+
      'typeof window.portraitDepth==="undefined"'));
  await shot('V5_02_真人视频实际追踪');
  result.observations=[];
  for(let i=0;i<10;i++){
    await sleep(650);
    result.observations.push(await evalJS('({mode:smileWeather.snapshot().mode,state:smileWeather.snapshot().state,frames:smileWeather.snapshot().totalFrames,rain:smileWeather.snapshot().rainEnvelope,bursts:smileWeather.snapshot().bursts,seconds:document.getElementById("camera").currentTime})'));
  }
  await shot('V5_03_真人样片逐帧效果');
  result.smilePerformance=await evalJS('({fps:smileWeather.snapshot().fps,inferenceMs:smileWeather.snapshot().inferenceMs,quality:smileWeather.snapshot().quality,renderDpr:smileWeather.snapshot().renderDpr,frames:smileWeather.snapshot().renderFrames})');
  check('real smile automatically causes rain',result.observations.some(x=>x.state==='smile'&&x.rain>.2),result.observations);
  const initialModelLoads=await evalJS('smileWeather.snapshot().modelLoads');
  await evalJS('document.getElementById("sampleLaugh").click()');
  let laughMode='loading';
  for(let i=0;i<95;i++){
    await sleep(320);laughMode=await evalJS('smileWeather.snapshot().mode');
    if(laughMode==='clip'||laughMode==='idle')break;
  }
  check('second prerecorded portrait switched and model ready',laughMode==='clip');
  check('clip switching reuses the existing model',await evalJS('smileWeather.snapshot().modelLoads')===initialModelLoads&&await evalJS('smileWeather.snapshot().clipSwitches')>=1);
  result.laughObservations=[];
  for(let i=0;i<19;i++){
    await sleep(620);
    result.laughObservations.push(await evalJS('({mode:smileWeather.snapshot().mode,state:smileWeather.snapshot().state,hasFace:smileWeather.snapshot().hasFace,bursts:smileWeather.snapshot().bursts,detonations:smileWeather.snapshot().detonations,collisions:smileWeather.snapshot().collisions,seconds:document.getElementById("camera").currentTime})'));
  }
  await shot('V5_04_大笑真实样片追踪');
  result.laughPerformance=await evalJS('({fps:smileWeather.snapshot().fps,inferenceMs:smileWeather.snapshot().inferenceMs,quality:smileWeather.snapshot().quality,renderDpr:smileWeather.snapshot().renderDpr,frames:smileWeather.snapshot().renderFrames})');
  check('second clip has genuine detected face landmarks',result.laughObservations.some(o=>o.hasFace));
  check('recorded laugh actually fires independent fireworks',result.laughObservations.some(o=>o.state==='laugh'&&o.bursts>0));
  check('recorded face controls real particle head collision',result.laughObservations.some(o=>o.collisions>0));
  check('preview avatar follows the selected person',await evalJS('document.getElementById("hostAvatar").getAttribute("src").includes("preview-poster-laugh.jpg")'));
  // The manual V9.7 audition must modify the REAL VIDEO Canvas without
  // secretly swapping to the illustrated simulation or displaying a PNG.
  await evalJS('document.getElementById("settingsButton").click()');
  await evalJS('document.getElementById("fireworkPreviewTools").open=true');
  await evalJS('(()=>{document.getElementById("previewFireworkPattern").value="ring";'+
    'document.getElementById("previewFireworkSize").value="S"})()');
  // A manual audition is intentionally refused during stale face tracking
  // or while both launch slots are occupied. Start from actual readiness.
  for(let attempt=0;attempt<40;attempt++){
    if(await evalJS('smileWeather.snapshot().faceAnchorValid&&smileWeather.snapshot().rockets<2'))break;
    await sleep(100);
  }
  const beforeAudition=await evalJS('({bursts:smileWeather.snapshot().bursts,'+
    'detonations:smileWeather.snapshot().detonations,mode:smileWeather.snapshot().mode,'+
    'head:smileWeather.snapshot().head})');
  for(let attempt=0;attempt<40;attempt++){
    const triggered=await evalJS('(()=>{const s=smileWeather.snapshot();if(!s.faceAnchorValid||s.rockets>=2)return false;document.getElementById("previewFireworkLaunch").click();return true})()');
    if(triggered)break;
    await sleep(100);
  }
  await sleep(130);
  const trial=await evalJS('(()=>{const s=smileWeather.snapshot(),d=fireworkDesign.snapshot();'+
    'return {mode:s.mode,bursts:s.bursts,workerReady:s.workerReady,'+
    'videoSize:document.getElementById("camera").videoWidth,'+
    'videoTrackCount:s.tracks.length,latest:d.history.findLast(item=>item.sequence==="manual-preview"),'+
    'sheetHidden:document.getElementById("controlSheet").hidden}})()');
  check('manual ring audition launches on current prerecorded human without fake substitution',
    beforeAudition.mode==='clip'&&trial.mode==='clip'&&trial.workerReady&&
    trial.videoSize>0&&trial.videoTrackCount===0&&trial.sheetHidden&&
    trial.bursts>=beforeAudition.bursts+1&&
    trial.latest?.pattern==='ring'&&trial.latest?.size==='S'&&
    trial.latest?.sequence==='manual-preview',trial);
  check('manual fireworks use a varied full-width ascent and keep real face tracking active',
    Number.isFinite(beforeAudition.head?.cx)&&
    Number.isFinite(trial.latest?.startX)&&
    Number.isFinite(trial.latest?.endY)&&
    trial.latest.startX>=390*.075&&trial.latest.startX<=390*.925&&
    trial.latest.endY>=844*.16&&trial.latest.endY<=844*.30,
    {head:beforeAudition.head,launch:trial.latest});
  await sleep(900);
  check('real recorded video audition completes the physics and live canvas bloom',
    await evalJS('smileWeather.snapshot().detonations')>beforeAudition.detonations);
  await evalJS('document.getElementById("settingsButton").click()');
  await evalJS('document.getElementById("fireworkPreviewTools").open=true');
  await evalJS('(()=>{document.getElementById("previewFireworkPattern").value="willow";'+
    'document.getElementById("previewFireworkSize").value="M"})()');
  const priorLaunches=await evalJS('smileWeather.snapshot().bursts');
  await evalJS('document.getElementById("previewFireworkLaunch").click()');
  await sleep(130);
  const frontFlight=await evalJS('(()=>{const s=smileWeather.snapshot(),'+
    'a=fireworkDesign.snapshot();return {'+
    'mode:s.mode,bursts:s.bursts,flight:a.flying.at(-1),last:a.history.at(-1)}})()');
  check('willow rocket rises from the bottom, mainly vertical with only optional S variation',
    frontFlight.mode==='clip'&&frontFlight.bursts===priorLaunches+1&&
    frontFlight.flight?.size==='M'&&frontFlight.flight?.pattern==='willow'&&
    frontFlight.flight?.depth==='front'&&frontFlight.last?.depth==='front'&&
    ['straight','s-curve'].includes(frontFlight.last?.trajectory)&&
    frontFlight.last?.startY>844&&
    frontFlight.flight?.route?.amplitude<=8.5,frontFlight);
  await shot('V5_05_真人前景S形升空');
  await sleep(750);
  check('front-only firework blooms above the actual video without switching inputs',
    await evalJS('smileWeather.snapshot().mode==="clip"&&'+
      'smileWeather.snapshot().detonations>0&&'+
      'fireworkDesign.snapshot().history.every(x=>x.depth==="front")'));
  await shot('V5_06_真人前景圆形绽放');
  await evalJS('document.getElementById("simulate").click()');
  await sleep(220);
  check('switching recorded source back to simulation releases media mode',await evalJS('smileWeather.snapshot().mode==="simulation"'));
  await evalJS('document.getElementById("stop").click()');
  check('stop frees resources',await evalJS('smileWeather.snapshot().mode==="idle"&&smileWeather.snapshot().tracks.length===0'));
  result.pass=result.checks.every(x=>x.pass)&&result.errors.length===0;
}catch(e){result.errors.push(String(e.stack||e));}
finally{
  writeFileSync(join(dir,'V5_真人样片逐帧识别验收.json'),JSON.stringify(result,null,2),'utf8');
  ws?.close();browser.kill();
  console.log(JSON.stringify({pass:result.pass,checks:result.checks.map(c=>[c.name,c.pass]),errors:result.errors,screenshots:result.screenshots},null,2));
  if(!result.pass)process.exitCode=1;
}
