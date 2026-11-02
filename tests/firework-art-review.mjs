/**
 * Read-only-on-product visual acceptance run: screenshots are written only
 * into the project's ignored work/ directory. Drives the ACTUAL live canvas.
 * No camera, microphone, external network or TikTok account.
 */
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const requestedTheme=process.argv.includes('--mint')?'mint':'gold';
const outDir=join(root,'work',requestedTheme==='mint'?'v9_9_art_review_mint':'v9_9_art_review');
mkdirSync(outDir,{recursive:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const port=requestedTheme==='mint'?9421:9420;
const browser=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',[
  '--headless=new','--no-first-run','--no-default-browser-check',
  '--disable-extensions','--disable-sync','--disable-background-networking',
  '--remote-debugging-port='+port,
  '--user-data-dir='+join(outDir,'edge-profile'),
  '--window-size=470,930','http://127.0.0.1:8896/'
],{stdio:'ignore',windowsHide:true});
let ws;
const receipts=[],errors=[],history=[];
try{
  let page=null;
  for(let i=0;i<110;i++){
    try{
      const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
      page=pages.find(x=>x.type==='page'&&x.url.includes('8896'));
      if(page)break;
    }catch{}
    await sleep(130);
  }
  if(!page)throw Error('Isolated local Edge tab missing');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  const pending=new Map();let seq=0;
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.method==='Runtime.exceptionThrown')
      errors.push('Browser runtime: '+(m.params?.exceptionDetails?.text||'uncaught'));
    if(m.id&&pending.has(m.id)){
      const item=pending.get(m.id);pending.delete(m.id);
      m.error?item.reject(Error(m.error.message)):item.resolve(m.result);
    }
  };
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++seq;pending.set(id,{resolve,reject});
    ws.send(JSON.stringify({id,method,params}));
  });
  const evalJS=async expression=>{
    const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error('Runtime JS '+r.exceptionDetails.text);
    return r.result.value;
  };
  const shot=async name=>{
    const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    const file=join(outDir,name+'.png');
    writeFileSync(file,Buffer.from(r.data,'base64'));
    return file;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{
    width:390,height:844,deviceScaleFactor:1,mobile:true
  });
  let ready=false;
  for(let i=0;i<80;i++){
    ready=await evalJS('Boolean(window.smileWeather&&window.fireworkDesign)');
    if(ready)break;
    await sleep(100);
  }
  if(!ready)throw Error('V9.8 scene or design log not mounted');
  if(requestedTheme==='mint'){
    await evalJS('document.querySelector("[data-palette=mint]").click()');
  }
  const selectedTheme=await evalJS('document.getElementById("stage").dataset.palette');
  if(selectedTheme!==requestedTheme)
    throw Error('Requested palette not selected: '+selectedTheme);
  await evalJS('document.getElementById("simulate").click()');
  await evalJS('document.getElementById("cleanPreset").click()');
  await evalJS('(()=>{const i=document.getElementById("simLaughIntensity");i.value="85";i.dispatchEvent(new Event("input",{bubbles:true}))})()');
  await evalJS('document.querySelector("[data-expression=laugh]").click()');
  const begin=await evalJS('(()=>{const s=smileWeather.snapshot();return {mode:s.mode,state:s.state,preview:document.getElementById("stage").dataset.preview,selected:document.querySelector("[data-expression=laugh]").getAttribute("aria-pressed")}})()');
  if(begin.mode!=='simulation'||begin.selected!=='true')
    throw Error('Simulation did not enter laugh input: '+JSON.stringify(begin));
  let lastDetonation=0;
  const started=Date.now();
  while(Date.now()-started<18000&&receipts.length<6){
    await sleep(68);
    const scene=await evalJS('(()=>{const s=smileWeather.snapshot();const d=fireworkDesign.snapshot();return {mode:s.mode,state:s.state,detonations:s.detonations,bursts:s.bursts,particles:s.particles,collisions:s.collisions,fps:s.fps,history:d.history}})()');
    history.push({elapsed:Date.now()-started,detonations:scene.detonations,
      mode:scene.mode,state:scene.state,bursts:scene.bursts,
      particles:scene.particles,fps:scene.fps});
    if(scene.particles>420)throw Error('Particle cap exceeded: '+scene.particles);
    if(scene.detonations>lastDetonation){
      const number=lastDetonation+1;
      const variation=scene.history[number-1];
      if(!variation)throw Error('No design metadata for detonation '+number);
      if(variation.theme!==requestedTheme)
        throw Error('Firework did not inherit selected palette: '+variation.theme);
      // The delayed inner layer of double blossoms needs a short extra beat.
      await sleep(variation.pattern==='double'?270:170);
      const file=await shot('bloom_'+String(number).padStart(2,'0')+
        '_'+variation.pattern+'_'+variation.size);
      const live=await evalJS('(()=>{const s=smileWeather.snapshot();return {fps:s.fps,particles:s.particles,collisions:s.collisions}})()');
      receipts.push({number,pattern:variation.pattern,size:variation.size,
        scale:+variation.scale.toFixed(3),intensity:+variation.intensity.toFixed(3),
        theme:variation.theme,accent:variation.accent,screenshot:file,...live});
      lastDetonation=scene.detonations;
    }
  }
  if(receipts.length!==6)throw Error('Expected six actual blooms, captured '+receipts.length);
  if(new Set(receipts.map(r=>r.pattern)).size!==6)throw Error('Not all six shapes were seen');
  if(new Set(receipts.map(r=>r.size)).size<2)throw Error('No size variation');
  await evalJS('document.getElementById("stop").click()');
}catch(err){
  errors.push(String(err.stack||err));
}finally{
  ws?.close();
  browser.kill();
  const result={
    pass:errors.length===0,captured:receipts.length,requestedTheme,receipts,errors,
    metric:'Headless Edge 390x844 DPR1, simulated laughter only; screenshot is not a physical camera test',
    frameSamples:history.filter((x,i)=>i%10===0)
  };
  writeFileSync(join(outDir,'gallery-report.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({pass:result.pass,captured:result.captured,
    receipts,errors},null,2));
  if(!result.pass)process.exitCode=1;
}
