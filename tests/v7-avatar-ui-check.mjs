import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const baseline=process.argv.includes('--baseline');
const port=19363;
const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
 '--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-sync','--disable-background-networking',
 '--remote-debugging-port='+port,'--user-data-dir='+join(root,'browser-profile-v7-avatar'),
 '--window-size=1200,960','http://127.0.0.1:8896/'
],{stdio:'ignore',windowsHide:true});
let ws;
const evidence={checks:[],observations:[],errors:[],screenshots:[],pass:false};
try{
 let page;
 for(let i=0;i<80;i++){
  try{const r=await fetch('http://127.0.0.1:'+port+'/json/list');page=(await r.json()).find(p=>p.type==='page'&&p.url.includes('8896'));if(page)break;}catch{}
  await sleep(150);
 }
 assert.ok(page,'Edge CDP page available');
 ws=new WebSocket(page.webSocketDebuggerUrl);
 let seq=0;const jobs=new Map();
 ws.onmessage=e=>{
  const m=JSON.parse(e.data);
  if(m.method==='Runtime.exceptionThrown')evidence.errors.push(m.params?.exceptionDetails?.text||'exception');
  if(m.method==='Log.entryAdded'&&m.params.entry.level==='error'&&!String(m.params.entry.text).includes('XNNPACK'))evidence.errors.push(m.params.entry.text);
  if(m.id&&jobs.has(m.id)){const j=jobs.get(m.id);jobs.delete(m.id);m.error?j.reject(Error(m.error.message)):j.resolve(m.result);}
 };
 await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=()=>rej(Error('WebSocket connection'));});
 const send=(method,params={})=>new Promise((res,rej)=>{
  const id=++seq;jobs.set(id,{resolve:res,reject:rej});ws.send(JSON.stringify({id,method,params}));
  setTimeout(()=>{if(jobs.has(id)){jobs.delete(id);rej(Error('CDP timeout '+method));}},14000);
 });
 const evalJS=async expr=>{const v=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(v.exceptionDetails)throw Error(JSON.stringify(v.exceptionDetails));return v.result.value;};
 const check=(name,good,detail)=>{evidence.checks.push({name,pass:Boolean(good),detail});if(!baseline)assert.ok(good,name);};
 const shot=async name=>{
  const v=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  const p=join(root,name+'.png');writeFileSync(p,Buffer.from(v.data,'base64'));evidence.screenshots.push(p);
 };
 await send('Page.enable');await send('Runtime.enable');await send('Log.enable');await sleep(850);
 const metricsFn=function(){
  const outer=document.querySelector('.host-avatar'),img=document.getElementById('hostAvatar'),
    media=document.querySelector('.host-avatar-media'),dot=outer?.querySelector('i'),
    comment=document.querySelector('.chat-avatar');
  const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};
  const css=e=>e?{borderRadius:getComputedStyle(e).borderRadius,objectFit:getComputedStyle(e).objectFit,overflow:getComputedStyle(e).overflow,clipPath:getComputedStyle(e).clipPath}:null;
  return {screen:innerWidth,scroll:document.documentElement.scrollWidth,outer:box(outer),img:box(img),media:box(media),dot:box(dot),comment:box(comment),outerCss:css(outer),imgCss:css(img),mediaCss:css(media),natural:{w:img.naturalWidth,h:img.naturalHeight},dock:box(document.getElementById('dockEffects')),gear:box(document.getElementById('settingsButton'))};
 };
 for(const [width,height] of [[320,740],[390,844],[430,932],[768,960],[1200,960]]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});
  await sleep(160);
  const metric=await evalJS('('+metricsFn.toString()+')()');
  evidence.observations.push(metric);
  check('avatar outer is square '+width,Math.abs(metric.outer.w-metric.outer.h)<.8,metric.outer);
  check('avatar has circular cropped media '+width,metric.media!==null&&Math.abs(metric.media.w-metric.media.h)<.8&&metric.mediaCss.overflow==='hidden'&&metric.mediaCss.borderRadius==='50%',metric.mediaCss);
  check('photo is 1:1 within circle '+width,Math.abs(metric.img.w-metric.img.h)<.8&&Math.abs(metric.img.w-metric.media.w)<1,metric.img);
  check('screen no horizontal overflow '+width,metric.scroll<=metric.screen,metric.scroll);
  if(width===390)await shot(baseline?'V7_avatar_before':'V7_avatar_after');
 }
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await sleep(180);
 await evalJS('document.getElementById("settingsButton").click()');
 check('gear opens sheet',await evalJS('!document.getElementById("controlSheet").hidden'));
 await sleep(260);
 await shot(baseline?'V7_drawer_before':'V7_drawer_after');
 await evalJS('document.getElementById("sheetClose").click()');
 check('close button closes drawer',await evalJS('document.getElementById("controlSheet").hidden'));
 if(!baseline){
  const gesture=function(){
   document.getElementById('settingsButton').click();
   const el=document.querySelector('.sheet-grab');
   el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,pointerType:'touch',clientY:370}));
   el.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,pointerType:'touch',clientY:470}));
   el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1,pointerType:'touch',clientY:470}));
  };
  await evalJS('('+gesture.toString()+')()');await sleep(240);
  check('swipe down on grab handle closes drawer',await evalJS('document.getElementById("controlSheet").hidden'));
  const focusProbe=function(){
    const settings=document.getElementById('settingsButton');
    settings.focus();settings.click();
    const dialog=document.getElementById('controlSheet');
    dialog.focus();
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
    const visible=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href],summary')]
      .filter(el=>el.tabIndex>=0&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden');
    return {passed:document.activeElement===visible.at(-1),focus:document.activeElement?.outerHTML.slice(0,120)};
  };
  const focusResult=await evalJS('('+focusProbe.toString()+')()');
  check('dialog shift-tab avoids controls inside collapsed sections',focusResult.passed,focusResult);
  await evalJS('document.getElementById("sheetClose").click()');
  check('dialog restores focus on close',await evalJS('document.activeElement===document.getElementById("settingsButton")'));
  await evalJS('document.getElementById("simulate").click()');
  await sleep(100);
  const feedProbe=function(){
    for(let i=0;i<5;i++)document.getElementById('dockGuests').click();
    window.__departingProbe=[...document.querySelectorAll('.chat-feed>[data-departing=true]')];
    return {rows:document.getElementById('chatEvents').childElementCount,
      departing:document.querySelectorAll('.chat-feed>[data-departing="true"]').length,
      reduceMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};
  };
  const feedResult=await evalJS('('+feedProbe.toString()+')()');
  check('rapid simulated comments keep four active rows',feedResult.rows===4,feedResult);
  check('old comment transitions without an abrupt removal',
    feedResult.reduceMotion?feedResult.departing===0:feedResult.departing>0,feedResult);
  await sleep(330);
  const departure=await evalJS('({initial:window.__departingProbe.map(node=>({connected:node.isConnected,animations:node.getAnimations().map(a=>({state:a.playState,time:a.currentTime}))})),current:document.querySelectorAll(".chat-feed>[data-departing=true]").length})');
  check('departed comment cleans up after animation',departure.initial.every(node=>!node.connected),departure);
  await evalJS('document.getElementById("stop").click()');
 }
 evidence.pass=evidence.checks.every(x=>x.pass)&&evidence.errors.length===0;
}catch(e){evidence.errors.push(String(e.stack||e));}
finally{
 const p=join(root,baseline?'V7_avatar_baseline.json':'V7_avatar_ui_acceptance.json');
 writeFileSync(p,JSON.stringify(evidence,null,2));
 ws?.close();browser.kill();
 console.log(JSON.stringify({pass:evidence.pass,checked:evidence.checks.length,failed:evidence.checks.filter(x=>!x.pass),observations:evidence.observations,screenshots:evidence.screenshots,errors:evidence.errors},null,2));
 if(!baseline&&!evidence.pass)process.exitCode=1;
}
