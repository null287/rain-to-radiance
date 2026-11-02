import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const port=19478;
const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
 '--headless=new','--no-first-run','--no-default-browser-check','--disable-sync',
 '--disable-extensions','--disable-background-networking','--remote-debugging-port='+port,
 '--user-data-dir='+join(here,'browser-profile-v10-icons'),
 '--window-size=460,930','http://127.0.0.1:8896/'
],{stdio:'ignore',windowsHide:true});
const outcome={pass:false,checks:[],errors:[],screenshots:[],source:'Remix Icon 4.9.1, offline SVG; public TikTok LIVE reference; no TikTok proprietary icon assets'};
let ws;
try{
 let page=null;
 for(let i=0;i<100;i++){
   try{const rs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
       page=rs.find(x=>x.type==='page'&&x.url.includes('8896'));if(page)break;
   }catch{}
   await sleep(120);
 }
 if(!page)throw Error('Browser not available');
 ws=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=()=>reject(Error('CDP connection'))});
 const pending=new Map();let seq=0;
 ws.onmessage=e=>{
   const m=JSON.parse(e.data);
   if(m.method==='Runtime.exceptionThrown')outcome.errors.push('Runtime exception: '+(m.params?.exceptionDetails?.text||'?'));
   if(m.method==='Log.entryAdded'&&m.params.entry?.level==='error'&&
     !String(m.params.entry.text).includes('XNNPACK'))outcome.errors.push(m.params.entry.text);
   if(m.id&&pending.has(m.id)){const x=pending.get(m.id);pending.delete(m.id);
     m.error?x.reject(Error(m.error.message)):x.resolve(m.result)}
 };
 const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
   setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('Timeout '+method))}},15000);
 });
 const evaluate=async exp=>{
   const m=await send('Runtime.evaluate',{expression:exp,returnByValue:true,awaitPromise:true});
   if(m.exceptionDetails)throw Error('JS '+m.exceptionDetails.text);
   return m.result.value;
 };
 const check=(name,condition,detail)=>{
   outcome.checks.push({name,pass:!!condition,detail});
   if(!condition)throw Error('Assertion '+name+': '+JSON.stringify(detail));
 };
 const capture=async filename=>{
   const v=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   const f=join(here,filename+'.png');
   writeFileSync(f,Buffer.from(v.data,'base64'));outcome.screenshots.push(f);
 };
 await send('Page.enable');await send('Runtime.enable');await send('Log.enable');
 for(const [width,height] of [[390,844],[320,740],[430,932]]){
   await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
   await sleep(180);
   const layout=await evaluate(`(()=>{
      const buttons=[...document.querySelectorAll('.live-dock button')].filter(e=>getComputedStyle(e).display!=='none');
      const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height,top:r.top,bottom:r.bottom}};
      const samples=buttons.map(b=>({id:b.id,box:rect(b),
        mask:getComputedStyle(b.querySelector('.ui-glyph')).maskImage,
        background:getComputedStyle(b.querySelector('.ui-glyph')).backgroundImage}));
      return {width:innerWidth,scroll:document.documentElement.scrollWidth,
        icons:samples,likeMask:getComputedStyle(document.querySelector('#likeButton .ui-glyph')).maskImage,
        settingsMask:getComputedStyle(document.querySelector('#settingsButton .ui-glyph')).maskImage,
        settings:rect(document.getElementById('settingsButton')),
        officialClaim:document.getElementById('welcome')?.textContent.includes('非官方')}
   })()`);
   check('No horizontal viewport overflow '+width,layout.scroll<=width,layout);
   check('All action icons load licensed SVG masks or a multicolor gift graphic '+width,
     layout.icons.length>=5&&layout.icons.every(b=>
       (b.mask!=='none'||(b.id==='dockGift'&&b.background.includes('iconpark-gift-pink.svg')))&&
       b.box.width>=39.9&&b.box.height>=39.9),layout);
   check('Header action masks use licensed assets '+width,
     layout.likeMask!=='none'&&layout.settingsMask!=='none',layout);
   check('Bottom action controls do not collide or leave viewport '+width,
     layout.icons.every((v,i)=>v.box.left>=0&&v.box.right<=width+1&&
       layout.icons.every((o,j)=>i===j||o.box.right<=v.box.left+1||o.box.left>=v.box.right-1)),layout);
   check('TikTok brand independence is still visible '+width,layout.officialClaim);
   if(width===390)await capture('V10_1_LIVE_01_idle_color');
 }
 const colorEvidence=await evaluate(
   '(async()=>{const svg=await(await fetch("./assets/ui-icons/iconpark-gift-pink.svg")).text();'+
   'const colors=[...new Set(svg.match(/#[a-f0-9]{6}/gi)||[])];'+
   'const get=s=>{const c=getComputedStyle(document.querySelector(s));return {background:c.backgroundImage,mask:c.maskImage}};'+
   'return {colors,gift:get("#dockGift .ui-glyph"),group:get("#dockGuests .ui-glyph"),'+
   'effects:get("#dockEffects .ui-glyph"),comment:get("#dockComments .ui-glyph"),'+
   'share:get("#dockShare .ui-glyph"),settings:get("#settingsButton .ui-glyph"),'+
   'heart:get("#likeButton .ui-glyph")}})()');
 check('Gift SVG visibly contains three separately colored vector regions',
   colorEvidence.colors.length>=3&&
   colorEvidence.gift.background.includes('iconpark-gift-pink.svg'),colorEvidence);
 check('Co-host and effects glyphs use restrained pink/cyan accent gradients',
   colorEvidence.group.background.includes('gradient')&&
   colorEvidence.effects.background.includes('gradient'),colorEvidence);
 check('Chat, share and settings remain neutral utility glyphs',
   colorEvidence.comment.background==='none'&&
   colorEvidence.share.background==='none'&&
   colorEvidence.settings.background==='none',colorEvidence);
 check('Like affordance receives warm LIVE pink emphasis',
   colorEvidence.heart.background.includes('gradient'),colorEvidence.heart);
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await evaluate('document.getElementById("simulate").click()');
 await sleep(270);
 const before=await evaluate('livePreviewUI.snapshot()');
 await evaluate('document.getElementById("dockGift").click()');
 await sleep(120);
 const gift=await evaluate('livePreviewUI.snapshot()');
 check('Dedicated gift control launches a local simulated gift',gift.gifts===before.gifts+1&&gift.giftVisible,{before:before.gifts,after:gift.gifts});
 check('Gift animation displays a true multicolor licensed asset',await evaluate(
  'document.querySelector("#giftAlert .ui-glyph").dataset.glyph==="gift-color"&&'+
  'getComputedStyle(document.querySelector("#giftAlert .ui-glyph")).backgroundImage.includes("iconpark-gift-pink.svg")'));
 check('Gift dock shows a transient success color state',await evaluate(
  'document.getElementById("dockGift").classList.contains("is-gifting")'));
 await capture('V10_1_LIVE_02_gift_color');
 await evaluate('document.getElementById("likeButton").click()');
 check('Heart button creates multiple licensed floating hearts',await evaluate(
  'livePreviewUI.snapshot().floatingHearts>0&&[...document.querySelectorAll("#floatHearts .ui-glyph")].every(el=>getComputedStyle(el).maskImage!=="none")'));
 await evaluate('document.getElementById("dockComments").click()');
 check('Comment button hides comments and updates semantic state',await evaluate(
  '!livePreviewUI.snapshot().sampleCommentsVisible&&document.getElementById("dockComments").getAttribute("aria-pressed")==="false"'));
 await evaluate('document.getElementById("dockComments").click()');
 check('Comment button restores comments',await evaluate('livePreviewUI.snapshot().sampleCommentsVisible'));
 await evaluate('document.getElementById("dockEffects").click()');
 check('Effect tool opens real modal and sets expanded state',await evaluate(
   '!document.getElementById("controlSheet").hidden&&document.getElementById("dockEffects").getAttribute("aria-expanded")==="true"'));
 await evaluate('document.getElementById("showGifts").click()');
 check('Disabled gift layer also disables the colorful gift dock control',await evaluate(
   'document.getElementById("dockGift").disabled&&'+
   'document.querySelector("[data-live-test=gift]").disabled'));
 await evaluate('document.getElementById("showGifts").click()');
 check('Restoring gifts restores colored action availability',await evaluate(
   '!document.getElementById("dockGift").disabled&&'+
   '!document.querySelector("[data-live-test=gift]").disabled'));
 const sheetIcons=await evaluate(`(()=>{
  const ids=['sheetClose','stop','clearOverlay'];
  return {buttons:ids.map(id=>({id,ok:!!document.querySelector('#'+id+' .ui-glyph')})),
    manual:[...document.querySelectorAll('[data-live-test]')].map(b=>[b.dataset.liveTest,!!b.querySelector('.ui-glyph')])}
 })()`);
 check('Close, stop and all manual events have unified icons',
   sheetIcons.buttons.every(x=>x.ok)&&sheetIcons.manual.every(x=>x[1]),sheetIcons);
 await capture('V10_1_LIVE_03_settings_color');
 await evaluate('document.getElementById("sheetClose").click()');
 check('Close icon maintains modal behavior',await evaluate(
  'document.getElementById("controlSheet").hidden&&document.getElementById("dockEffects").getAttribute("aria-expanded")==="false"'));
 await evaluate('document.getElementById("dockMore").click()');
 check('More control also opens the modal',await evaluate('!document.getElementById("controlSheet").hidden'));
 await evaluate('document.getElementById("sheetClose").click()');
 await evaluate('document.getElementById("stop").click()');
 check('All UI changes preserve AR session cleanup',await evaluate('smileWeather.snapshot().mode==="idle"'));
 outcome.pass=outcome.checks.every(x=>x.pass)&&outcome.errors.length===0;
}catch(e){outcome.errors.push(String(e.stack||e));}
finally{
 ws?.close();browser.kill();
 writeFileSync(join(here,'V10_1_LIVE_UI_colors_check.json'),JSON.stringify(outcome,null,2),'utf8');
 console.log(JSON.stringify({pass:outcome.pass,checks:outcome.checks.length,
  lastChecks:outcome.checks.slice(-10),errors:outcome.errors,screenshots:outcome.screenshots},null,2));
 if(!outcome.pass)process.exitCode=1;
}

