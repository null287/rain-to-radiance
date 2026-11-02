import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const dir=dirname(fileURLToPath(import.meta.url));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
 '--headless=new','--no-first-run','--no-default-browser-check',
 '--disable-extensions','--disable-sync','--disable-background-networking',
 '--remote-debugging-port=9401','--user-data-dir='+join(dir,'browser-profile-v9-1'),
 '--window-size=450,930','http://127.0.0.1:8896/'
],{stdio:'ignore',windowsHide:true});
const result={checks:[],errors:[],screenshots:[],observations:[],pass:false,
  environment:'V9.1 Edge simulation, 390x844 DPR1; NO physical camera'};
let ws;
try{
 let page;
 for(let i=0;i<90;i++){
  try{const r=await fetch('http://127.0.0.1:9401/json/list');
   page=(await r.json()).find(p=>p.type==='page'&&p.url.includes('8896'));
   if(page)break;
  }catch{}await sleep(150);
 }
 assert.ok(page,'Edge headless page with local AR application');
 ws=new WebSocket(page.webSocketDebuggerUrl);
 const jobs=new Map();let seq=0;
 ws.onmessage=e=>{
  const m=JSON.parse(e.data);
  if(m.method==='Runtime.exceptionThrown')result.errors.push(m.params?.exceptionDetails?.text||'Runtime exception');
  if(m.method==='Log.entryAdded'&&m.params.entry.level==='error'&&!m.params.entry.text.includes('XNNPACK'))
   result.errors.push(m.params.entry.text);
  if(m.id&&jobs.has(m.id)){
   const j=jobs.get(m.id);jobs.delete(m.id);
   m.error?j.reject(Error(m.error.message)):j.resolve(m.result);
  }
 };
 await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=()=>rej(Error('CDP WebSocket'));});
 const send=(method,params={})=>new Promise((res,rej)=>{
  const id=++seq;jobs.set(id,{resolve:res,reject:rej});ws.send(JSON.stringify({id,method,params}));
  setTimeout(()=>{if(jobs.has(id)){jobs.delete(id);rej(Error('CDP timeout '+method));}},16000);
 });
 const evalJS=async expression=>{
  const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error('Runtime JavaScript: '+r.exceptionDetails.text);
  return r.result.value;
 };
 const pointerClick=async selector=>{
   const rect=await evalJS('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');el.scrollIntoView({block:"center"});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
   for(const type of ['mouseMoved','mousePressed','mouseReleased']){
     await send('Input.dispatchMouseEvent',{
       type,x:rect.x,y:rect.y,button:type==='mouseMoved'?'none':'left',
       buttons:type==='mousePressed'?1:0,clickCount:type==='mouseMoved'?0:1
     });
   }
 };
 const check=(name,good,detail=null)=>{
  result.checks.push({name,pass:Boolean(good),detail});assert.ok(good,name);
 };
 const shot=async name=>{
  const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const path=join(dir,name+'.png');writeFileSync(path,Buffer.from(r.data,'base64'));
  result.screenshots.push(path);
 };
 await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 let ready=false;
 for(let i=0;i<50;i++){
  ready=await evalJS('Boolean(window.smileWeather&&window.livePreviewUI)');
  if(ready)break;await sleep(100);
 }
 check('both AR and interactive LIVE controllers are mounted',ready);
 const initial=await evalJS('livePreviewUI.snapshot()');
 check('default LIVE presentation retains no fabricated automatic visitors',
   initial.previewMode==='live'&&initial.overlayEnabled&&!initial.autoOverlay&&initial.totalEvents===0,initial);
 check('all four independent layer switches are available and on',await evalJS(
   '["showComments","showLikes","showGifts","showJoins"].every(id=>document.getElementById(id).checked)'));
 check('live and effects-only preset controls exist',await evalJS(
   'Boolean(document.getElementById("livePreset")&&document.getElementById("cleanPreset")&&document.getElementById("exitClean"))'));
 await evalJS('document.getElementById("simulate").click()');
 await sleep(250);
 check('simulation starts without a physical camera',await evalJS(
   'smileWeather.snapshot().mode==="simulation"&&smileWeather.snapshot().tracks.length===0'));
 check('experimental multi-frame laughter recognition is on by default but reversible',
   await evalJS('document.getElementById("temporalLaugh").checked'));
 await evalJS('document.getElementById("temporalLaugh").click()');
 check('experimental recognition can revert to the original classifier',
   await evalJS('!document.getElementById("temporalLaugh").checked&&document.getElementById("status").textContent.includes("逐帧大笑判断")'));
 await evalJS('document.getElementById("temporalLaugh").click()');
 check('experimental recognition can be reenabled without a page reload',
   await evalJS('document.getElementById("temporalLaugh").checked&&document.getElementById("status").textContent.includes("已开启多帧大笑判断")'));
 // Allow fresh neutral samples to rearm after startup/feature toggles.
 await sleep(450);
 await evalJS('document.querySelector("[data-expression=laugh]").click()');
 let firstFirework=null;
 const start=Date.now(),samples=[];
 while(Date.now()-start<5050){
  await sleep(120);
  const snap=await evalJS('smileWeather.snapshot()');
  const elapsed=Date.now()-start;
  if(firstFirework===null&&snap.bursts>0)firstFirework=elapsed;
  samples.push({elapsed,mode:snap.mode,state:snap.state,
    reason:snap.expressionScores?.reason,cadence:snap.fireworkCadence,
    bursts:snap.bursts,detonations:snap.detonations,
    flights:snap.rockets,particles:snap.particles,fps:snap.fps});
  if(elapsed>1200&&elapsed<1480)await shot('V9_1_live_fireworks');
 }
 result.observations=samples.filter((_,i)=>i%5===0);
 const afterLaugh=await evalJS('smileWeather.snapshot()');
 check('clear laughter launches the first comet without a long idle pause',
   firstFirework!==null&&firstFirework<550,{firstFirework});
 check('sustained laughter produces consecutive launches and blooms',
   afterLaugh.bursts>=4&&afterLaugh.detonations>=3,{bursts:afterLaugh.bursts,blooms:afterLaugh.detonations});
 check('continuous sequence is denser but remains frame-budget bounded',
   afterLaugh.bursts>=6&&afterLaugh.bursts<=12&&afterLaugh.particles<=420,afterLaugh);
 const design=await evalJS('window.fireworkDesign.snapshot()');
 check('live fireworks contain six distinct physical bloom designs',
   design.history.length>=6&&
   new Set(design.history.slice(0,6).map(f=>f.pattern)).size===6,design.history);
 const frontOnlyUI=await evalJS('!document.getElementById("portraitDepth")&&'+
   '!document.getElementById("previewFireworkDepth")&&'+
   '!document.getElementById("backScene")');
 check('fireworks launch from below screen only in the front; S-bend stays subtle',
   design.history.slice(0,6).every(f=>f.startY>844&&
     f.depth==='front')&&
   frontOnlyUI&&
   new Set(design.history.slice(0,6).map(f=>f.trajectory)).has('s-curve')&&
   design.history.slice(0,6).every(f=>
     f.trajectory==='straight'||f.trajectory==='s-curve'),
   design.history.slice(0,6));
 check('fireworks are not locked above the screen center and bloom near the top',
   design.history.length>=6&&
   Math.min(...design.history.slice(0,6).map(f=>f.endX))<390*.35&&
   Math.max(...design.history.slice(0,6).map(f=>f.endX))>390*.70&&
   design.history.slice(0,6).every(f=>f.endY>=844*.16&&f.endY<=844*.30),
   design.history.slice(0,6));
 check('different visible firework sizes and finite scales are actually launched',
   new Set(design.history.map(f=>f.size)).size>=2&&
   design.history.every(f=>f.scale>=.70&&f.scale<=1.56),design.history);
 check('simulation includes an explicitly visual laugh-exaggeration control',
   await evalJS('Boolean(document.getElementById("simLaughIntensity")&&document.getElementById("simIntensityText"))'));
 await evalJS('(()=>{const x=document.getElementById("simLaughIntensity");x.value="0";x.dispatchEvent(new Event("input",{bubbles:true}))})()');
 await sleep(480);
 const ordinary=await evalJS('smileWeather.snapshot().fireworkCadence');
 await evalJS('(()=>{const x=document.getElementById("simLaughIntensity");x.value="100";x.dispatchEvent(new Event("input",{bubbles:true}))})()');
 await sleep(480);
 const intense=await evalJS('smileWeather.snapshot().fireworkCadence');
 check('more exaggerated visual laughter measurably shortens the launch interval',
   ordinary.intervalMs>intense.intervalMs+175&&
   ordinary.visualIntensity<intense.visualIntensity&&
   await evalJS('document.getElementById("simIntensityText").value==="夸张"'),
   {ordinary,intense});
 await evalJS('document.querySelector("[data-expression=smile]").click()');
 await sleep(390);
 const stoppedAt=await evalJS('smileWeather.snapshot().bursts');
 await sleep(1250);
 check('returning to smile prevents any later queued launches',
   await evalJS('smileWeather.snapshot().bursts')===stoppedAt,{stoppedAt});
 await evalJS('document.querySelector("[data-expression=laugh]").click()');
 await sleep(320);
 check('fresh laugh entry starts a new firework sequence',
   await evalJS('smileWeather.snapshot().bursts')>stoppedAt);
 await evalJS('document.getElementById("settingsButton").click()');
 await sleep(180);
 await shot('V9_1_control_panel_top');
 check('settings show a single master switch and four independent toggles',
   await evalJS('!document.getElementById("controlSheet").hidden&&document.querySelectorAll("#overlayToggles input").length===4'));
 await evalJS('document.getElementById("overlayEnabled").scrollIntoView({block:"center"})');
 await sleep(180);
 await shot('V9_1_control_panel_overlays');
 await evalJS('document.getElementById("showGifts").click()');
 check('turning off gifts disables only the gift event and hides gift alerts',
   await evalJS('!livePreviewUI.snapshot().layers.gifts&&document.querySelector("[data-live-test=gift]").disabled&&livePreviewUI.snapshot().layers.comments'));
 await evalJS('document.getElementById("showLikes").click()');
 check('turning off likes hides the counter and floating hearts',
   await evalJS('!livePreviewUI.snapshot().layers.likes&&document.getElementById("likeButton").hidden&&livePreviewUI.snapshot().floatingHearts===0'));
 await evalJS('document.getElementById("showComments").click()');
 check('turning off comments hides feed and disables reaction-comment setting',
   await evalJS('!livePreviewUI.snapshot().sampleCommentsVisible&&document.getElementById("reactiveChat").disabled'));
 await evalJS('document.getElementById("showJoins").click()');
 check('all independent overlays can be off without stopping physical AR',
   await evalJS('!Object.values(livePreviewUI.snapshot().layers).some(Boolean)&&smileWeather.snapshot().mode==="simulation"'));
 await evalJS('document.getElementById("cleanPreset").click()');
 const clean=await evalJS('(()=>{const s=livePreviewUI.snapshot();return {mode:s.previewMode,active:s.overlayEnabled,exitVisible:!document.getElementById("exitClean").hidden,head:getComputedStyle(document.querySelector(".live-head")).display,dock:getComputedStyle(document.querySelector(".live-dock")).display,feed:getComputedStyle(document.getElementById("chatFeed")).display,canvas:getComputedStyle(document.getElementById("scene")).display}})()');
 check('effects-only hides the LIVE UI while preserving the AR canvas',
   clean.mode==='clean'&&!clean.active&&clean.exitVisible&&clean.head==='none'&&clean.dock==='none'&&clean.feed==='none'&&clean.canvas!=='none',clean);
 await shot('V9_1_effects_only');
 const beforeClean=await evalJS('smileWeather.snapshot().bursts');
 await sleep(950);
 const afterClean=await evalJS('smileWeather.snapshot().bursts');
 check('effects-only does not stop expression-driven fireworks',afterClean>beforeClean,{beforeClean,afterClean});
 await evalJS('document.getElementById("exitClean").click()');
 check('one-click exit restores the previous per-layer toggle choices',
   await evalJS('livePreviewUI.snapshot().overlayEnabled&&Object.values(livePreviewUI.snapshot().layers).every(v=>v===false)'));
 await evalJS('document.getElementById("settingsButton").click()');
 await evalJS('document.getElementById("livePreset").click()');
 check('LIVE preset restores all viewer layers and enables automatic demo events',
   await evalJS('livePreviewUI.snapshot().overlayEnabled&&livePreviewUI.snapshot().autoOverlay&&Object.values(livePreviewUI.snapshot().layers).every(Boolean)'));
 await sleep(1280);
 check('automatic LIVE preset produces a locally simulated viewer entry',
   await evalJS('livePreviewUI.snapshot().joins>=1'));
 await evalJS('document.getElementById("settingsButton").click()');
 // Reproduce the original user report: the AR event limiter becomes saturated
 // while all the manual buttons still appear enabled.
 await evalJS('for(let i=0;i<30;i++)document.dispatchEvent(new CustomEvent("ar:effect",{detail:{cue:"bloom"}}))');
 check('AR event burst saturates automatic channel for regression setup',
   await evalJS('livePreviewUI.snapshot().bus.dropped>0'));
 const beforeGift=await evalJS('livePreviewUI.snapshot().gifts');
 await pointerClick('[data-live-test=gift]');
 await sleep(120);
 check('real pointer gift click survives saturated AR stream and displays feedback',
   await evalJS('livePreviewUI.snapshot().gifts')>beforeGift&&
     await evalJS('document.getElementById("controlSheet").hidden&&'+
       '!document.getElementById("uiToast").hidden&&'+
       'document.getElementById("uiToast").textContent.includes("模拟礼物")'));
 await evalJS('document.getElementById("settingsButton").click()');
 await pointerClick('#clearOverlay');
 check('clear interactions does not reset live AR physics or current input',
   await evalJS('smileWeather.snapshot().mode==="simulation"&&livePreviewUI.snapshot().sampleLikes===0&&livePreviewUI.snapshot().gifts===0&&livePreviewUI.snapshot().comments===0'));
 check('clear stays in sheet, visibly confirms success and pauses automatic refill',
   await evalJS('!document.getElementById("controlSheet").hidden&&'+
     '!livePreviewUI.snapshot().autoOverlay&&'+
     '!livePreviewUI.snapshot().reactiveChat&&'+
     'document.getElementById("manualEventFeedback").textContent.includes("已清空")'));
 check('cleared statistics show simulated audience actions, not internal AR cues',
   await evalJS('document.getElementById("overlayMiniStats").textContent.includes("模拟互动 0")'));
 await evalJS('document.getElementById("sheetClose").click()');
 await evalJS('document.querySelector("[data-live-test=likeBurst]").click()');
 check('burst-like button creates actual simulated likes and floating hearts',
   await evalJS('livePreviewUI.snapshot().sampleLikes>=12&&livePreviewUI.snapshot().floatingHearts>0'));
 await sleep(140);
 await shot('V9_1_like_burst');
 await evalJS('document.getElementById("settingsButton").click()');
 await evalJS('document.querySelector("[data-live-test=gift]").click()');
 await sleep(160);
 check('enabled gifts show a real simulated gift animation',
   await evalJS('livePreviewUI.snapshot().giftVisible&&livePreviewUI.snapshot().gifts>=1'));
 await shot('V9_1_gift_feedback');
 // The user must be able to audition any of the six styles in the ORIGINAL
 // interactive Demo rather than being sent to a static screenshot gallery.
 await evalJS('document.querySelector("[data-expression=neutral]").click()');
 await sleep(800);
 await evalJS('document.getElementById("settingsButton").click()');
 await evalJS('document.getElementById("fireworkPreviewTools").open=true');
 check('the live firework audition is inside the original control sheet',
   await evalJS('document.getElementById("fireworkPreviewTools").open&&'+
     'document.getElementById("controlSheet").contains(document.getElementById("previewFireworkLaunch"))'));
 const earlier=await evalJS('smileWeather.snapshot().bursts');
 await evalJS('(()=>{document.getElementById("previewFireworkPattern").value="willow";'+
   'document.getElementById("previewFireworkSize").value="L"})()');
 await pointerClick('#previewFireworkLaunch');
 await sleep(110);
 const manual=await evalJS('(()=>{const a=fireworkDesign.snapshot();const s=smileWeather.snapshot();'+
   'return {scene:s.mode,bursts:s.bursts,sourceTracks:s.tracks,fly:a.flying,'+
   'last:a.history.at(-1),sheetHidden:document.getElementById("controlSheet").hidden}})()');
 check('a manual willow L audition truly launches on the SAME running simulation',
   manual.scene==='simulation'&&manual.bursts===earlier+1&&
   manual.last?.pattern==='willow'&&manual.last?.size==='L'&&
   manual.fly.some(f=>f.pattern==='willow'&&f.size==='L')&&
   manual.sheetHidden&&manual.sourceTracks.length===0,manual);
 await sleep(800);
 check('audition is a physical rocket and visible bloom, not a static screenshot',
   await evalJS('smileWeather.snapshot().detonations>0'));
 await evalJS('document.getElementById("stop").click()');
 check('stop releases simulation and clears LIVE overlays',
   await evalJS('smileWeather.snapshot().mode==="idle"&&livePreviewUI.snapshot().totalEvents===0'));
 await evalJS('document.getElementById("settingsButton").click()');
 await evalJS('document.getElementById("fireworkPreviewTools").open=true');
 await evalJS('document.getElementById("previewFireworkLaunch").click()');
 check('manual audition never substitutes a fake avatar for an idle camera',
   await evalJS('smileWeather.snapshot().mode==="idle"&&'+
     '!document.getElementById("controlSheet").hidden&&'+
     'document.getElementById("previewFireworkStatus").textContent.includes("请先选择")'));
 // Publication package intentionally excludes private work/ histories.
 // The old local screenshot-gallery redirect is outside this site's routes.
 result.excludedChecks=['legacy local work/v9_7_art_comparison.html redirect (not a published route)'];
 result.pass=result.checks.every(c=>c.pass)&&result.errors.length===0;
}catch(error){result.errors.push(String(error.stack||error));}
finally{
 const path=join(dir,'V9_1_live_panel_acceptance.json');
 writeFileSync(path,JSON.stringify(result,null,2),'utf8');
 ws?.close();browser.kill();
 console.log(JSON.stringify({pass:result.pass,checked:result.checks.length,
  failed:result.checks.filter(c=>!c.pass),errors:result.errors,observations:result.observations,
  screenshots:result.screenshots},null,2));
 if(!result.pass)process.exitCode=1;
}
