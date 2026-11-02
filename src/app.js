import {ExpressionController} from './interaction.js';
import {PhysicsEngine} from './physics.js';
import {faceOutlineFromLandmarks} from './face-outline.js';
import {
  faceVideoProjection,projectFaceLandmark,geometryFromFaceOutline,isFreshFaceAnchor
} from './face-projection.js';
import {FireworkFlight} from './firework.js';
import {FireworkCadence} from './firework-cadence.js';
import {planAscent} from './launch-path.js';
import {
  FireworkVariationPlanner,fireworkPaletteFor,FIREWORK_SIZE_FACTORS,
  FIREWORK_STYLES
} from './firework-variation.js';
import {advanceRain} from './transition.js';
import {FrameBudget} from './frame-budget.js';
import {IdlePreviewEngine} from './idle-preview.js';
import {drawProxy} from './vfx-v2.js';
import {drawAmbient,drawParticlesV2,drawFlightsV2} from './vfx-filmic.js';

const $ = id => document.getElementById(id);
const stage=$('stage'),canvas=$('scene'),ctx=canvas.getContext('2d'),
  video=$('camera'),idlePreviewVideo=$('idlePreviewVideo');
const idlePreviewEngine=new IdlePreviewEngine();
const controller=new ExpressionController();
controller.setTemporalEnabled($('temporalLaugh').checked);
const physics=new PhysicsEngine({width:800,height:600,maxParticles:420});
const flight=new FireworkFlight({duration:.65,maxFlights:2});
const cadence=new FireworkCadence();
const fireworkVariations=new FireworkVariationPlanner();
const fireworkHistory=[];
const palettes={gold:['#fff3da','#ffdea7','#ffd08c','#ffba79','#fff9ed','#92dfea'],mint:['#f4ffff','#a8eaff','#8bd6ec','#c3f4ee','#d8dbff','#c9e8ff']};
const stateText={neutral:['STANDBY','等待微笑'],smile:['SMILE · RAIN','正在下雨'],laugh:['LAUGH · FIREWORK','烟花绽放'], 'no-face':['FACE NOT DETECTED','请看向镜头']};
let mode='idle',simulation='neutral',palette='gold',worker=null,
  stream=null,epoch=0,busy=false,localVideoUrl=null;
let clipSwitching=false,modelLoads=0,clipSwitches=0;
let width=800,height=600,dpr=1,head=null,lastHead=null,landmarks=[],sample=null,workerReady=false;
let lastTime=performance.now(),captureAt=0,lastVideoTime=-1,lastResultAt=0,frameId=0,lastRequestedId=0;
let pendingTimer=null,initReject=null,frameTimes=[],fps=0,inferenceMs=0,delegate='',bursts=0,totalFrames=0;
let pointer={x:.5,y:.57},rings=[],impacts=[],currentState='idle',gentle=matchMedia('(prefers-reduced-motion: reduce)').matches;
let expressionView=controller.snapshot(),pendingBurst=false,visibilityRevision=0,requestRevision=0,rainEnvelope=0,lastOverlayCollisionAt=0;
const frameBudget=new FrameBudget();
let lastRafAt=performance.now(),lastPaintMode='',lastMetricAt=0,renderFrames=0;
let faceProjection=null,faceProjectionKey='';
$('gentle').checked=gentle;
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
function status(text,error=false){
  $('status').textContent=text;$('status').classList.toggle('error',error);
  const errorLabel=$('welcomeError');
  if(errorLabel){errorLabel.hidden=!error;errorLabel.textContent=error?text:'';}
  const start=$('startCamera');
  if(start)start.textContent=error?'重新启动 AR':mode==='loading'?'正在启动 AR…':'开启摄像头，查看 AR 效果';
}
function setLoadingControls(isLoading){
  for(const id of ['startCamera','startClip','startLaughClip','sampleSmile','sampleLaugh','simulate']){
    const node=$(id);if(node)node.disabled=isLoading;
  }
  for(const button of document.querySelectorAll('[data-action]'))button.disabled=isLoading;
  $('welcome')?.setAttribute('aria-busy',String(isLoading));
  $('controlSheet')?.setAttribute('aria-busy',String(isLoading));
}
function resize(){
  const box=stage.getBoundingClientRect();
  const nextWidth=box.width,nextHeight=box.height;
  const nextDpr=Math.min(devicePixelRatio||1,frameBudget.settings(gentle).canvasDpr);
  const cw=Math.round(nextWidth*nextDpr),ch=Math.round(nextHeight*nextDpr);
  if(canvas.width===cw&&canvas.height===ch&&Math.abs(nextWidth-width)<.1&&Math.abs(nextHeight-height)<.1)return;
  width=nextWidth;height=nextHeight;dpr=nextDpr;
  canvas.width=cw;canvas.height=ch;ctx.setTransform(dpr,0,0,dpr,0,0);
  physics.resize(width,height);lastHead=null;
}
new ResizeObserver(resize).observe(stage);resize();

function setState(state){
  if(state===currentState)return;currentState=state;
  const [caption,title]=stateText[state]||stateText.neutral;
  $('stateCaption').textContent=caption;$('stateTitle').textContent=title;stage.dataset.expression=state;
  if(state==='smile'||state==='neutral')document.dispatchEvent(new CustomEvent('ar:effect',{detail:{cue:state==='smile'?'rain':'neutral'}}));
}
function releaseCamera(){
  if(stream)for(const track of stream.getTracks())track.stop();
  stream=null;video.pause();video.srcObject=null;
  video.removeAttribute('src');video.load();
  if(localVideoUrl){URL.revokeObjectURL(localVideoUrl);localVideoUrl=null;}
  stage.classList.remove('camera-active');
}
function pauseIdlePreview(){
  idlePreviewVideo.pause();
  idlePreviewEngine.reset();
}
function startIdlePreview({restart=false}={}){
  if(restart&&idlePreviewVideo.readyState>=1){
    try{idlePreviewVideo.currentTime=0;}catch{}
  }
  idlePreviewVideo.muted=true;
  idlePreviewVideo.play().catch(()=>{
    // Muted inline autoplay is supported in modern Edge. If a custom user
    // policy blocks it, keep the local poster as an explicit fallback.
    $('idlePreviewCueText').textContent='预览未自动播放 · 可选择样片观看';
  });
}
function cleanup(){
  epoch++;clipSwitching=false;clearTimeout(pendingTimer);pendingTimer=null;
  pauseIdlePreview();
  if(initReject){initReject(new Error('Session cancelled'));initReject=null;}
  if(worker){worker.terminate();worker=null;}
  releaseCamera();workerReady=false;busy=false;sample=null;head=null;lastHead=null;landmarks=[];
  controller.reset();physics.clear();flight.reset();cadence.reset();fireworkVariations.reset();fireworkHistory.length=0;
  rainEnvelope=0;rings=[];impacts=[];bursts=0;lastResultAt=0;lastVideoTime=-1;lastOverlayCollisionAt=0;
  expressionView=controller.snapshot();pendingBurst=false;visibilityRevision++;
  frameBudget.reset();lastPaintMode='';lastTime=performance.now();frameTimes.length=0;fps=0;renderFrames=0;
  $('startCamera').disabled=false;$('stop').disabled=true;
  setLoadingControls(false);
}
function idle(){
  cleanup();mode='idle';stage.dataset.mode=mode;$('simulationControls').hidden=true;$('welcome').hidden=false;
  $('sourceTag').textContent='自动循环预览 · 非实时识别';
  $('stageHint').innerHTML='SMILE → RAIN<br>LAUGH → FIREWORK';
  if($('hostAvatar'))$('hostAvatar').src='./assets/preview-poster-862-later.jpg';
  setState('neutral');status('当前体验已结束。可以切换真人样片、真实摄像头或模拟模式。');
  startIdlePreview({restart:true});
  document.dispatchEvent(new CustomEvent('ar:session',{detail:{mode:'idle'}}));
}
function startSimulation(){
  cleanup();mode='simulation';stage.dataset.mode=mode;simulation='neutral';pointer={x:.5,y:.57};
  $('simulationControls').hidden=false;$('welcome').hidden=true;$('stop').disabled=false;
  $('sourceTag').textContent='模拟特效 / 无摄像头';$('stageHint').innerHTML='MOVE YOUR POINTER<br>HEAD COLLISION';
  chooseExpression('neutral');status('模拟体验：用 1/2/3 切换表情，下方滑杆模拟不同程度的大笑表情；越夸张，烟花发射越密集。无需麦克风。');
  document.dispatchEvent(new CustomEvent('ar:session',{detail:{mode:'simulation'}}));
}
function chooseExpression(value){
  simulation=value;
  document.querySelectorAll('[data-expression]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.expression===value)));
}
function createLandmarker(token,requestedDelegate='GPU'){
  return new Promise((resolve,reject)=>{
    const localWorker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});worker=localWorker;
    initReject=reject;
    pendingTimer=setTimeout(()=>reject(new Error('识别模型加载超时，请重新开启；也可以先使用模拟体验。')),30000);
    localWorker.onmessage=({data})=>{
      if(token!==epoch)return;
      if(data.type==='ready'){
        clearTimeout(pendingTimer);initReject=null;workerReady=true;delegate=data.delegate;modelLoads++;resolve();
      }else if(data.type==='result'){
        if(data.id!==lastRequestedId)return;
        busy=false;clearTimeout(pendingTimer);
        const receivedAt=performance.now();
        if(document.hidden||requestRevision!==visibilityRevision||receivedAt-data.timestamp>400)return;
        totalFrames++;inferenceMs=data.inferenceMs;lastResultAt=receivedAt;
        landmarks=data.landmarks;sample={
          smile:data.smile,jaw:data.jaw,cheek:data.cheek,
          stretch:data.stretch,lipGap:data.lipGap,
          hasFace:landmarks.length>0
        };
        // Dwell must be supported by several fresh predictions, never repeated renders of one frame.
        expressionView=controller.update({...sample,timestamp:receivedAt});
        pendingBurst=pendingBurst||expressionView.burst;
      }else if(data.type==='error'){
        if(data.phase==='init'){
          clearTimeout(pendingTimer);initReject=null;
          if(requestedDelegate==='GPU'){
            localWorker.terminate();worker=null;
            status('正在改用兼容模式加载识别，稍候即可开启摄像头。');
            createLandmarker(token,'CPU').then(resolve,reject);
          }else reject(new Error(data.message));
        }
        else {failCamera('识别处理中断，请重新开启摄像头。详细信息：'+data.message);}
      }
    };
    localWorker.onerror=event=>{if(token!==epoch)return;const message=event.message||'识别线程无法启动';if(initReject){clearTimeout(pendingTimer);initReject=null;reject(new Error(message));}else failCamera(message);};
    localWorker.postMessage({type:'init',delegate:requestedDelegate});
  });
}
async function fastSwitchClip(kind){
  if(clipSwitching)return;
  clipSwitching=true;
  const token=epoch;
  setLoadingControls(true);
  $('sourceTag').textContent='正在切换真人样片';
  status('复用已加载的MediaPipe人脸模型，正在切换视频画面。');
  try{
    video.pause();
    const next=kind==='laugh'?'./assets/pexels-5700089-laugh-portrait.mp4':'./assets/pexels-8627840-portrait-540p.mp4';
    video.src=next;
    if($('hostAvatar'))$('hostAvatar').src=kind==='laugh'?'./assets/preview-poster-laugh.jpg':'./assets/preview-poster-862-later.jpg';
    // Retain the expensive model Worker while resetting expression/physics histories.
    controller.reset();cadence.reset();expressionView=controller.snapshot();
    visibilityRevision++;
    sample=null;landmarks=[];head=null;lastHead=null;lastResultAt=0;lastVideoTime=-1;
    physics.clear();flight.reset();rainEnvelope=0;rings=[];impacts=[];
    clearTimeout(pendingTimer);pendingTimer=null;
    pendingBurst=false;busy=false;lastRequestedId=-1;bursts=0;frameTimes.length=0;
    video.load();await video.play();
    if(token!==epoch)return;
    clipSwitches++;
    setState('neutral');
    $('sourceTag').textContent=kind==='laugh'?'大笑样片 · 实际识别':'微笑样片 · 实际识别';
    status('样片已切换，继续用真实面部关键点驱动粒子，不需要重新加载识别模型。');
    document.dispatchEvent(new CustomEvent('ar:session',{detail:{mode:'clip'}}));
  }catch(error){
    if(token===epoch)failCamera('真人样片切换失败：'+(error?.message||'未知错误'));
  }finally{
    if(token===epoch){clipSwitching=false;setLoadingControls(false);}
  }
}
async function startClip(file=null){
  if(mode==='clip'&&workerReady&&!localVideoUrl&&(file===null||file==='laugh'))return fastSwitchClip(file==='laugh'?'laugh':'smile');
  if(file && typeof file!=='string' && (!file.type.startsWith('video/') || file.size>120*1024*1024)){
    status('请选择不超过120MB的视频文件（MP4/WebM等）。',true);return;
  }
  cleanup();mode='loading';stage.dataset.mode=mode;$('simulationControls').hidden=true;
  setLoadingControls(true);
  document.dispatchEvent(new CustomEvent('ar:session',{detail:{mode:'loading'}}));
  $('startCamera').disabled=true;$('stop').disabled=false;
  $('sourceTag').textContent='正在加载本地人脸识别';
  status('正在初始化MediaPipe，随后会分析录制样片中的每一帧；不会请求摄像头。');
  const token=epoch;
  try{
    await createLandmarker(token);
    if(token!==epoch)return;
    if(file&&typeof file!=='string')localVideoUrl=URL.createObjectURL(file);
    video.src=localVideoUrl||(file==='laugh'?'./assets/pexels-5700089-laugh-portrait.mp4':'./assets/pexels-8627840-portrait-540p.mp4');
    const avatar=$('hostAvatar');
    if(avatar){avatar.src=file==='laugh'?'./assets/preview-poster-laugh.jpg':'./assets/preview-poster-862-later.jpg';}
    video.loop=true;video.muted=true;video.playsInline=true;
    video.load();await video.play();
    if(token!==epoch)return;
    mode='clip';stage.dataset.mode=mode;stage.classList.add('camera-active');
    setLoadingControls(false);
    $('welcome').hidden=true;$('sourceTag').textContent=localVideoUrl?'用户视频 · 实时逐帧识别':file==='laugh'?'大笑样片 · 实际识别':'微笑样片 · 实际识别';
    $('stageHint').innerHTML='REAL FACE TRACKING<br>RECORDED CLIP';
    status('使用录制的人像视频做真实人脸追踪：雨、烟花与碰撞由模型和物理系统驱动；不是实时摄像头。');
    document.dispatchEvent(new CustomEvent('ar:session',{detail:{mode:'clip'}}));
  }catch(error){
    if(token!==epoch)return;
    failCamera('样片或人脸模型加载失败：'+(error?.message||'未知错误'));
  }
}
function failCamera(message){
  idle();status(message,true);$('sourceTag').textContent='摄像头体验中断';
}
async function startCamera(){
  cleanup();mode='loading';stage.dataset.mode=mode;$('simulationControls').hidden=true;
  setLoadingControls(true);
  document.dispatchEvent(new CustomEvent('ar:session',{detail:{mode:'loading'}}));
  $('startCamera').disabled=true;$('stop').disabled=false;$('sourceTag').textContent='准备本地识别';
  status('正在加载本地识别模型。首次开启稍需等待，随后浏览器会请求摄像头权限。');
  const token=epoch;
  try{
    if(!isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('请从本机 localhost 或 HTTPS 地址打开，直接双击 HTML 无法使用摄像头。');
    await createLandmarker(token);if(token!==epoch)return;
    const incoming=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:960},height:{ideal:720},frameRate:{ideal:24,max:30}},audio:false});
    if(token!==epoch){incoming.getTracks().forEach(t=>t.stop());return;}
    stream=incoming;video.srcObject=stream;await video.play();if(token!==epoch)return;
    stream.getVideoTracks().forEach(track=>{
      track.addEventListener('ended',()=>{if(token===epoch)failCamera('摄像头连接已断开。请确认设备连接后重新开启；可以先使用模拟体验。');});
      track.addEventListener('mute',()=>{if(token===epoch)status('摄像头暂时没有提供画面，请检查设备连接或隐私开关。',true);});
      track.addEventListener('unmute',()=>{if(token===epoch)status('画面已恢复。对镜头微笑看雨，再张嘴大笑看烟花；从大笑回到微笑后仍可再次触发。');});
    });
    mode='camera';stage.dataset.mode=mode;stage.classList.add('camera-active');$('welcome').hidden=true;
    setLoadingControls(false);
    $('sourceTag').textContent='摄像头 AR / 本地识别';$('stageHint').innerHTML='SMILE → RAIN<br>LAUGH → FIREWORK';
    status('面部动作实时驱动：微笑下雨，大笑先升空再绽放；持续大笑时会有节奏地连续烟花，停止大笑后不再新发射。');
    document.dispatchEvent(new CustomEvent('ar:session',{detail:{mode:'camera'}}));
  }catch(error){
    if(token!==epoch)return;
    const labels={NotAllowedError:'摄像头权限未开启。请在浏览器地址栏允许摄像头，然后重试。',NotFoundError:'没有找到摄像头。请检查设备连接，或先试模拟体验。',NotReadableError:'摄像头当前无法读取，可能被其他应用占用或设备断开。请检查后重试。',OverconstrainedError:'摄像头不支持当前画面配置，请换设备或使用模拟体验。'};
    failCamera(labels[error.name]||error.message||'摄像头开启失败，请重试。');
  }
}
async function capture(now){
  if((mode!=='camera'&&mode!=='clip')||!workerReady||busy||document.hidden||video.readyState<2||video.currentTime===lastVideoTime)return;
  const settings=frameBudget.settings(gentle);
  const interval=Math.max(settings.captureInterval,inferenceMs>65?110:0);
  if(now-captureAt<interval)return;
  const token=epoch,revision=visibilityRevision;busy=true;captureAt=now;lastVideoTime=video.currentTime;
  try{
    const targetWidth=Math.min(frameBudget.settings(gentle).captureWidth,video.videoWidth);
    const bitmap=await createImageBitmap(video,{resizeWidth:targetWidth,resizeHeight:Math.round(video.videoHeight*targetWidth/video.videoWidth)});
    if(token!==epoch||(mode!=='camera'&&mode!=='clip')){bitmap.close();return;}
    if(revision!==visibilityRevision||document.hidden){bitmap.close();busy=false;return;}
    const id=++frameId;lastRequestedId=id;requestRevision=revision;
    worker.postMessage({type:'frame',bitmap,id,timestamp:now},[bitmap]);
    pendingTimer=setTimeout(()=>{if(token===epoch&&busy)failCamera('识别暂时没有响应。已释放摄像头，请重新开启。');},5000);
  }catch(error){if(token===epoch)failCamera('读取当前视频帧失败，请重新开启输入。');}
}
// A single, testable object-fit:cover projection matches the video preview;
// the camera is CSS-mirrored ONCE, while recorded clips remain unmirrored.
function projectionForCurrentVideo(){
  const key=[video.videoWidth,video.videoHeight,width,height,mode].join(':');
  if(key!==faceProjectionKey){
    faceProjectionKey=key;
    faceProjection=faceVideoProjection({
      videoWidth:video.videoWidth,videoHeight:video.videoHeight,
      viewWidth:width,viewHeight:height,
      mirrored:mode==='camera'
    });
  }
  return faceProjection;
}
function mapPoint(point){
  return projectFaceLandmark(point,projectionForCurrentVideo())||
    {x:NaN,y:NaN};
}
function updateHead(dt){
  let target=null;
  if(mode==='simulation')target={cx:width*pointer.x,cy:height*pointer.y,rx:Math.min(width*.19,86),ry:Math.min(width*.236,110),angle:0,valid:true};
  else if((mode==='camera'||mode==='clip')&&sample?.hasFace&&performance.now()-lastResultAt<520){
    const top=mapPoint(landmarks[10]),bottom=mapPoint(landmarks[152]);
    // A tight tracked face contour replaces the old 20% inflated invisible
    // ellipse on real videos. Hair is not segmented; don't claim head-hair hits.
    const outline=faceOutlineFromLandmarks(landmarks,mapPoint);
    if(!outline){head=null;lastHead=null;return;}
    const measured=geometryFromFaceOutline(outline);
    if(!measured){head=null;lastHead=null;return;}
    target={...measured,
      angle:Math.atan2(bottom.y-top.y,bottom.x-top.x)-Math.PI/2,
      outline,valid:true};
  }
  if(!target){
    if(lastHead&&sample?.hasFace&&(mode==='camera'||mode==='clip')&&performance.now()-lastResultAt<550){head={...lastHead,vx:0,vy:0};return;}
    head=null;lastHead=null;return;
  }
  if(lastHead){
    if(target.outline&&lastHead.outline?.length===target.outline.length){
      // V10.2: the old center and outline had different smoothing constants.
      // That shifted launch anchors away from the collision polygon when the
      // person's head moved. Smooth the polygon ONCE and derive its center
      // from that SAME geometry. Live camera uses a shorter visual lag.
      const oAlpha=1-Math.exp(-dt/(mode==='camera'?.026:.042));
      target.outline=target.outline.map((p,i)=>({
        x:lastHead.outline[i].x+(p.x-lastHead.outline[i].x)*oAlpha,
        y:lastHead.outline[i].y+(p.y-lastHead.outline[i].y)*oAlpha
      }));
      const aligned=geometryFromFaceOutline(target.outline);
      if(!aligned){head=null;lastHead=null;return;}
      Object.assign(target,aligned);
    }else{
      const alpha=1-Math.exp(-dt/.065);
      target.cx=lastHead.cx+(target.cx-lastHead.cx)*alpha;
      target.cy=lastHead.cy+(target.cy-lastHead.cy)*alpha;
    }
    target.vx=clamp((target.cx-lastHead.cx)/Math.max(dt,.008),-650,650);target.vy=clamp((target.cy-lastHead.cy)/Math.max(dt,.008),-650,650);
  }else{target.vx=0;target.vy=0;}
  head=target;lastHead={...target};
}
function launchFirework(now,intensity=0,manualVariation=null){
  // When using REAL video, never invent an on-screen center if the current
  // frame lacks a trustworthy tracked face. This previously made some
  // fireworks launch from a phantom position unrelated to the actual person.
  if((mode==='camera'||mode==='clip')&&
     !isFreshFaceAnchor({mode,head,hasFace:sample?.hasFace,
       ageMs:now-lastResultAt}))return false;
  const quality=frameBudget.settings(gentle).quality;
  // In normal camera / clip use, the visual laugh classifier chooses styles.
  // Only a deliberate click in the settings drawer overrides ONE launch,
  // without replacing the live input or altering the autonomous sequence.
  let selected;
  if(manualVariation){
    const pattern=FIREWORK_STYLES.includes(manualVariation.pattern)
      ?manualVariation.pattern:'peony';
    const preferred=Object.hasOwn(FIREWORK_SIZE_FACTORS,manualVariation.size)
      ?manualVariation.size:'M';
    const size=quality==='lite'&&['L','XL'].includes(preferred)?'M':preferred;
    const factor=FIREWORK_SIZE_FACTORS[size];
    selected={pattern,size,scale:factor.scale,countScale:factor.count,
      intensity:clamp(intensity,0,1),sequence:'manual-preview'};
  }else{
    selected=fireworkVariations.next({intensity,quality});
  }
  // Product decision: all six patterns launch in front of the person.
  // The old rear-layer mask is deliberately not loaded or rendered.
  const depth='front';
  const variation={...selected,depth,theme:palette,
    accent:fireworkPaletteFor(selected.pattern,palette).accent};
  // 70% vertical / 30% subtle S, independent of the six bloom patterns.
  // Distributed bloom X may be on either side or anywhere between; the head
  // does not force every rocket back into the center of the screen.
  const route=planAscent({
    pattern:variation.pattern,width,height,
    size:variation.size,scale:variation.scale,launchIndex:bursts
  });
  const launched=flight.launch({x:route.startX,startY:route.startY,
    endY:route.endY,route,
    // More active stars per bloom, still limited by the existing bounded
    // particle pool. Lite/balanced retain their smaller frame budgets.
    count:Math.round(frameBudget.settings(gentle).burstParticles*variation.countScale*1.16),
    speed:gentle?205:275,colors:palettes[palette],variation});
  if(launched){
    bursts++;
    fireworkHistory.push({
      pattern:variation.pattern,size:variation.size,
      scale:variation.scale,sequence:variation.sequence,intensity:variation.intensity,
      depth,trajectory:route.type,startY:route.startY,startX:route.startX,
      endX:route.endX,endY:route.endY,
      theme:variation.theme,accent:fireworkPaletteFor(variation.pattern,variation.theme).accent
    });
    if(fireworkHistory.length>12)fireworkHistory.shift();
    document.dispatchEvent(new CustomEvent('ar:effect',{detail:{cue:'launch'}}));
  }
  return launched;
}
function drawBackground(now){drawAmbient(ctx,{mode,width,height,now,rainEnvelope,palette});}
function drawHead(now){drawProxy(ctx,{head,mode,palette,debug:$('debug').checked,landmarks,mapPoint});}
function drawLayers(now,dt){
  drawBackground(now);
  const quality=frameBudget.settings(gentle).quality;
  const shared={particles:physics.particles,collisions:physics.lastCollisions,
    impacts,rings,now,dt,head,mode,palette,rainEnvelope,quality};
  // When diagnosing real camera geometry, show the FACE LOCK outline above
  // bright fireworks so the user can visually verify that collisions really
  // follow their face. This is diagnostic-only; normal VFX layering is intact.
  const trackedDebug=$('debug').checked&&(mode==='camera'||mode==='clip');
  if(!trackedDebug)drawHead(now);
  drawParticlesV2(ctx,{...shared,effectLayer:'front'});
  drawFlightsV2(ctx,{flights:flight.flights,palette,now,quality,effectLayer:'front'});
  if(trackedDebug)drawHead(now);
}
function tick(now){
  requestAnimationFrame(tick);
  const rafGap=now-lastRafAt;lastRafAt=now;
  if(document.hidden){lastTime=now;return;}
  if(mode==='idle'){
    // Muted loop showing ONE actual actor transition from smile to laughter.
    // Independent bounded preview physics: main MediaPipe engine remains
    // idle and no microphone or physical camera is requested.
    if(now-lastTime<1000/(gentle?20:30)-2)return;
    const dt=Math.min(.06,Math.max(.001,(now-lastTime)/1000));lastTime=now;
    if(idlePreviewVideo.readyState>=2&&!idlePreviewVideo.paused){
      const quality=frameBudget.settings(gentle).quality;
      const preview=idlePreviewEngine.update({
        time:idlePreviewVideo.currentTime,now,dt,width,height,palette,
        quality,reduceMotion:gentle
      });
      drawAmbient(ctx,{mode:'idle',width,height,now,palette,rainEnvelope:preview.rainEnvelope});
      drawParticlesV2(ctx,{
        particles:idlePreviewEngine.physics.particles,
        collisions:[],impacts:idlePreviewEngine.impacts,
        rings:idlePreviewEngine.rings,
        now,dt,head:null,mode:'idle',palette,
        rainEnvelope:preview.rainEnvelope,quality
      });
      drawFlightsV2(ctx,{
        flights:idlePreviewEngine.flight.flights,palette,now,quality
      });
      stage.dataset.previewPhase=preview.phase;
      $('idlePreviewCueText').textContent=preview.phase==='smile'
        ?'自动预览 · 微笑雨幕':'自动预览 · 大笑烟花';
      lastPaintMode='preview';
      return;
    }
    if(lastPaintMode!=='idle'){ctx.clearRect(0,0,width,height);lastPaintMode='idle';}
    return;
  }
  if(mode==='loading'){
    if(lastPaintMode!==mode){ctx.clearRect(0,0,width,height);lastPaintMode=mode;}
    lastTime=now;return;
  }
  lastPaintMode='';
  const settings=frameBudget.settings(gentle);
  const targetFps=$('controlSheet')?.hidden?settings.maxFps:Math.min(30,settings.maxFps);
  if(now-lastTime<1000/targetFps-2)return;
  const workStart=performance.now();
  const dt=Math.min(.05,Math.max(.001,(now-lastTime)/1000));lastTime=now;
  frameTimes.push(dt);if(frameTimes.length>45)frameTimes.shift();
  fps=Math.round(frameTimes.length/frameTimes.reduce((a,b)=>a+b,0));
  capture(now);
  let result;
  if(mode==='simulation'){
    const exaggeration=Number($('simLaughIntensity').value)/100;
    result=controller.update({
      smile:simulation==='laugh'?.72+.22*exaggeration:simulation==='smile'?.48:.04,
      jaw:simulation==='laugh'?.30+.40*exaggeration:.02,
      lipGap:simulation==='laugh'?.19+.20*exaggeration:0,
      hasFace:true,timestamp:now
    });
  }
  else if((mode==='camera'||mode==='clip')&&sample&&now-lastResultAt<520)result=expressionView;
  else {result=controller.update({hasFace:false,timestamp:now});pendingBurst=false;}
  if(mode==='camera'||mode==='clip'||mode==='simulation')setState(result.state);
  updateHead(dt);
  physics.maxParticles=settings.maxParticles;
  const firstBurst=mode==='simulation'?result.burst:pendingBurst;
  const confirmedLaugh=result.state==='laugh';
  // Only live MediaPipe predictions or fresh simulation frames may advance the
  // sequence. A lost face/hidden page never triggers deferred fireworks.
  const fresh=mode==='simulation'||(
    (mode==='camera'||mode==='clip')&&sample?.hasFace&&now-lastResultAt<360);
  const occupied=physics.particles.length;
  // V9.8: the old 75% reserve made a denser bloom block the next launch.
  // Retain a strict minimum of live particle slots while allowing the
  // existing proportional burst generator to scale to available headroom.
  const minimumBloomSlots=Math.max(40,Math.ceil(settings.burstParticles*.5));
  const hasAnchor=isFreshFaceAnchor({
    mode,head,hasFace:sample?.hasFace,ageMs:now-lastResultAt
  });
  const canLaunch=hasAnchor&&flight.flights.length<2&&
    occupied<=settings.maxParticles-minimumBloomSlots;
  if(cadence.update({
    now,confirmedLaugh,fresh,firstBurst,canLaunch,
    intensity:result.visualIntensity
  })){
    launchFirework(now,result.visualIntensity);
  }
  pendingBurst=false;
  const targetRain=(mode==='camera'||mode==='clip'||mode==='simulation')?result.rainLevel:0;
  rainEnvelope=advanceRain(rainEnvelope,targetRain,dt);
  physics.update(dt,head,rainEnvelope);
  if(physics.lastCollisions.length&&now-lastOverlayCollisionAt>1100){
    lastOverlayCollisionAt=now;
    document.dispatchEvent(new CustomEvent('ar:effect',{detail:{cue:'collision'}}));
  }
  for(const bloom of flight.update(dt,physics)){
    rings.push({...bloom,start:now});
    document.dispatchEvent(new CustomEvent('ar:effect',{detail:{cue:'bloom'}}));
  }
  drawLayers(now,dt);renderFrames++;
  if($('debug').checked&&now-lastMetricAt>250){lastMetricAt=now;$('metricText').textContent=`${mode.toUpperCase()}  ·  ${fps} fps\n粒子 ${physics.particles.length} / ${physics.maxParticles}   碰撞 ${physics.collisionCount}\n微笑 ${result.filters.smile.toFixed(2)}  张嘴 ${result.filters.jaw.toFixed(2)}\n发射 ${bursts} · 绽放 ${flight.detonations} · 飞行 ${flight.flights.length} · 雨量 ${rainEnvelope.toFixed(2)}   ${(mode==='camera'||mode==='clip')?delegate+' / '+inferenceMs.toFixed(1)+' ms':'模拟输入 · 非识别结果'}\n画质 ${frameBudget.settings(gentle).quality} · 主线程绘制 ${frameBudget.workMs.toFixed(1)}ms`;
  }
  if($('debug').checked&&lastMetricAt===now){
    const rhythm=cadence.snapshot();
    const latest=fireworkHistory.at(-1);
    const styles={
      peony:'牡丹',chrysanthemum:'菊花',willow:'垂柳',
      ring:'光环',strobe:'碎闪',double:'双层'
    };
    $('metricText').textContent+=
      '\n唇距 '+result.filters.lipGap.toFixed(2)+
      ' · 视觉大笑强度 '+Math.round(result.visualIntensity*100)+'%'+
      ' · 发射间隔 '+(rhythm.intervalMs===null?'—':Math.round(rhythm.intervalMs)+'ms')+
      '\n最新烟花 '+(latest?styles[latest.pattern]+' · '+latest.size:'尚未发射');
  }
  const changed=frameBudget.record({rafMs:Math.max(1,rafGap),workMs:performance.now()-workStart,now});
  if(changed)resize();
}
requestAnimationFrame(tick);

$('startCamera').addEventListener('click',startCamera);$('startClip').addEventListener('click',()=>startClip());$('startLaughClip').addEventListener('click',()=>startClip('laugh'));
$('sampleSmile').addEventListener('click',()=>startClip());$('sampleLaugh').addEventListener('click',()=>startClip('laugh'));
$('simulate').addEventListener('click',startSimulation);$('stop').addEventListener('click',idle);
$('videoPicker').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';if(file)void startClip(file);});
document.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>$(button.dataset.action==='camera'?'startCamera':button.dataset.action==='clip'?'startClip':'simulate').click()));
document.querySelectorAll('[data-expression]').forEach(b=>b.addEventListener('click',()=>chooseExpression(b.dataset.expression)));
$('simLaughIntensity').addEventListener('input',()=>{
  const value=Number($('simLaughIntensity').value);
  $('simIntensityText').value=value<34?'普通':value<75?'明显':'夸张';
});
document.querySelectorAll('[data-palette]').forEach(b=>b.addEventListener('click',()=>{
  palette=b.dataset.palette;stage.dataset.palette=palette;$('paletteName').textContent=palette==='gold'?'电光金':'冰蓝光子';
  document.querySelectorAll('[data-palette]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});
}));
$('sensitivity').addEventListener('input',()=>{
  const n=Number($('sensitivity').value)/100;
  controller.configure({smileOn:.32-n*.4,smileOff:.23-n*.3,laughSmileOn:.64-n*.35,laughSmileOff:.42-n*.28,jawOn:.28-n*.26,jawOff:.16-n*.12});
  $('sensitivityValue').value=n===0?'标准':n>0?'更灵敏':'更稳定';
});
$('temporalLaugh').addEventListener('change',()=>{
  controller.setTemporalEnabled($('temporalLaugh').checked);
  status($('temporalLaugh').checked
    ?'已开启多帧大笑判断：短暂的张嘴/微笑分数波动不再轻易打断大笑候选。'
    :'已恢复原有的逐帧大笑判断；其他特效与物理不变。');
});
// Explicitly user-triggered VISUAL audition on the SAME live Canvas.
// No recorded screenshot, second rendering surface, or automatic camera access.
$('previewFireworkLaunch').addEventListener('click',()=>{
  const feedback=$('previewFireworkStatus');
  if(mode==='idle'||mode==='loading'){
    feedback.textContent='请先选择「微笑真人样片」「大笑真人样片」或开启摄像头，再实时试放。';
    return;
  }
  const pattern=$('previewFireworkPattern').value;
  const size=$('previewFireworkSize').value;
  const now=performance.now();
  const intensity=expressionView.visualIntensity||.75;
  if((mode==='camera'||mode==='clip')&&
     !isFreshFaceAnchor({mode,head,hasFace:sample?.hasFace,
       ageMs:now-lastResultAt})){
    feedback.textContent='正在重新定位真实人脸，请正对摄像头后再次试放。';
    return;
  }
  const launched=launchFirework(now,intensity,{pattern,size});
  if(!launched){
    feedback.textContent='当前已有两束烟花升空，请等绽放后再试。';
    return;
  }
  feedback.textContent='已从屏幕底部、人物前方发射 '+pattern+' · '+size+'。';
  $('sheetClose').click();
});
$('debug').addEventListener('change',()=>$('metrics').hidden=!$('debug').checked);
$('gentle').addEventListener('change',()=>gentle=$('gentle').checked);
stage.addEventListener('pointermove',event=>{if(mode!=='simulation'||event.target.closest('button,.control-sheet,.simulation-controls'))return;const rect=stage.getBoundingClientRect();pointer={x:clamp((event.clientX-rect.left)/width,.15,.85),y:clamp((event.clientY-rect.top)/height,.35,.77)};});
stage.addEventListener('pointerdown',event=>{if(mode==='simulation'&&!event.target.closest('button,.control-sheet,.simulation-controls'))stage.setPointerCapture(event.pointerId);});
addEventListener('keydown',event=>{if(mode!=='simulation'||['INPUT','TEXTAREA'].includes(event.target.tagName))return;const state={1:'neutral',2:'smile',3:'laugh'}[event.key];if(state)chooseExpression(state);});
document.addEventListener('visibilitychange',()=>{
  if(mode==='idle'){
    if(document.hidden)idlePreviewVideo.pause();
    else startIdlePreview();
    lastTime=performance.now();
    return;
  }
  visibilityRevision++;controller.reset();expressionView=controller.snapshot();pendingBurst=false;
  sample=null;head=null;lastHead=null;lastResultAt=0;
  physics.clear();flight.reset();cadence.reset();rainEnvelope=0;rings=[];impacts=[];
  if(mode==='camera')clearTimeout(pendingTimer);
  if(!document.hidden){
    lastTime=performance.now();lastVideoTime=-1;
    if(busy&&mode==='camera'){const token=epoch;pendingTimer=setTimeout(()=>{if(token===epoch&&busy)failCamera('识别暂停后未恢复，请重新开启摄像头。');},5000);}
  }
});
video.addEventListener('seeked',()=>{
  if(mode==='clip'){
    controller.reset();cadence.reset();expressionView=controller.snapshot();
    pendingBurst=false;sample=null;landmarks=[];head=null;lastHead=null;
    lastResultAt=0;lastVideoTime=-1;
    visibilityRevision++;
  }
});
addEventListener('pagehide',idle);

// Read-only observability for reproducible tests; no control bypasses or uploads.
Object.defineProperty(window,'smileWeather',{value:Object.freeze({snapshot:()=>({presentation:'live-v3',mode,state:currentState,bursts,detonations:flight.detonations,rockets:flight.flights.length,fireworkCadence:cadence.snapshot(),rainEnvelope,particles:physics.particles.length,collisions:physics.collisionCount,fps,inferenceMs,delegate,totalFrames,hasFace:sample?.hasFace||false,expressionScores:{smile:sample?.smile??0,jaw:sample?.jaw??0,cheek:sample?.cheek??0,stretch:sample?.stretch??0,lipGap:sample?.lipGap??0,filteredSmile:expressionView.filters.smile,filteredJaw:expressionView.filters.jaw,reason:expressionView.reason},predictionAgeMs:lastResultAt?Math.round(performance.now()-lastResultAt):null,head:head?{cx:head.cx,cy:head.cy,rx:head.rx,ry:head.ry,angle:head.angle,valid:head.valid,vx:head.vx,vy:head.vy,outlinePoints:head.outline?.length??0}:null,faceProjection:faceProjection?{scale:faceProjection.scale,offsetX:faceProjection.offsetX,offsetY:faceProjection.offsetY,mirrored:faceProjection.mirrored,videoWidth:faceProjection.videoWidth,videoHeight:faceProjection.videoHeight,viewWidth:faceProjection.viewWidth,viewHeight:faceProjection.viewHeight}:null,faceAnchorValid:isFreshFaceAnchor({mode,head,hasFace:sample?.hasFace,ageMs:performance.now()-lastResultAt}),tracks:stream?.getTracks().map(t=>({kind:t.kind,readyState:t.readyState}))||[],workerReady,palette,quality:frameBudget.snapshot(gentle),renderDpr:dpr,renderFrames,modelLoads,clipSwitches})})});
Object.defineProperty(window,'idlePreview',{value:Object.freeze({
  snapshot:()=>({
    ...idlePreviewEngine.snapshot(),
    active:mode==='idle'&&!idlePreviewVideo.paused&&idlePreviewVideo.readyState>=2,
    videoReady:idlePreviewVideo.readyState>=2,
    videoPaused:idlePreviewVideo.paused,
    videoMuted:idlePreviewVideo.muted,
    videoDuration:idlePreviewVideo.duration||0,
    videoCurrentTime:idlePreviewVideo.currentTime,
    physicalCameraTracks:stream?.getVideoTracks().length||0
  })
})});
startIdlePreview();
// The bounded, read-only design log lets local browser tests verify that
// visually distinct planned fireworks actually entered the live renderer.
Object.defineProperty(window,'fireworkDesign',{value:Object.freeze({
  snapshot:()=>({history:fireworkHistory.map(v=>({...v})),
    flying:flight.flights.map(f=>({
      pattern:f.variation?.pattern||'peony',
      size:f.variation?.size||'M',x:f.x,y:f.y,
      depth:f.depth||'front',
      route:f.route?{
        type:f.route.type,startX:f.route.startX,startY:f.route.startY,
        endX:f.route.endX,endY:f.route.endY,amplitude:f.route.amplitude
      }:null,
      trailCount:f.trail?.length||0
    })),
    plannerLaunches:fireworkVariations.launches
  })
})});
