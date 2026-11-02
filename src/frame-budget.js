/**
 * Adaptive, bounded render budget. Separate from facial/physics semantics.
 * Thresholds are project heuristics, NOT official TikTok performance targets.
 */
export class FrameBudget {
  constructor({windowSize=36,slowWindows=2,goodWindows=5,cooldownMs=3500}={}){
    this.windowSize=windowSize;this.slowWindows=slowWindows;this.goodWindows=goodWindows;
    this.cooldownMs=cooldownMs;this.quality='full';this.samples=[];
    this.slowCount=0;this.goodCount=0;this.lastChange=-Infinity;
    this.rafMs=16.7;this.workMs=0;this.transitions=0;
  }
  record({rafMs,workMs,now}){
    if(![rafMs,workMs,now].every(Number.isFinite) || rafMs<=0||workMs<0)return false;
    this.samples.push({raf:Math.min(120,rafMs),work:Math.min(120,workMs)});
    if(this.samples.length<this.windowSize)return false;
    this.rafMs=this.samples.reduce((n,s)=>n+s.raf,0)/this.samples.length;
    this.workMs=this.samples.reduce((n,s)=>n+s.work,0)/this.samples.length;
    this.samples.length=0;
    const slow=this.rafMs>=24||this.workMs>=13.5;
    const good=this.rafMs<=18.5&&this.workMs<=9;
    this.slowCount=slow?this.slowCount+1:0;
    this.goodCount=good?this.goodCount+1:0;
    if(now-this.lastChange<this.cooldownMs)return false;
    const levels=['full','balanced','lite'];
    const i=levels.indexOf(this.quality);
    if(this.slowCount>=this.slowWindows&&i<levels.length-1){
      this.quality=levels[i+1];this.lastChange=now;
    }else if(this.goodCount>=this.goodWindows&&i>0){
      this.quality=levels[i-1];this.lastChange=now;
    }else return false;
    this.transitions++;this.slowCount=0;this.goodCount=0;
    return true;
  }
  settings(forceLite=false){
    const q=forceLite?'lite':this.quality;
    if(q==='lite')return {quality:q,maxParticles:180,maxFps:30,canvasDpr:1.25,captureWidth:320,captureInterval:95,burstParticles:75};
    if(q==='balanced')return {quality:q,maxParticles:280,maxFps:45,canvasDpr:1.6,captureWidth:420,captureInterval:68,burstParticles:100};
    return {quality:q,maxParticles:420,maxFps:60,canvasDpr:2,captureWidth:480,captureInterval:48,burstParticles:132};
  }
  reset(){
    this.samples.length=0;this.slowCount=0;this.goodCount=0;
    this.rafMs=16.7;this.workMs=0;
  }
  snapshot(forceLite=false){
    return {autoQuality:this.quality,effectiveQuality:this.settings(forceLite).quality,rafMs:this.rafMs,workMs:this.workMs,transitions:this.transitions};
  }
}
