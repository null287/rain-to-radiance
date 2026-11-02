/**
 * V9.1 continuous-laugh fireworks: one immediate first launch per confirmed
 * laugh entrance, then naturally spaced follow-up comets while laugh persists.
 * This is a presentation scheduler, not a second face classifier.
 * No timers, no GPU work, no external calls; the render loop owns time.
 */
export class FireworkCadence {
  constructor({intervalsMs=[660,720,630,760,680]}={}){
    if(!Array.isArray(intervalsMs)||intervalsMs.length===0||
       intervalsMs.some(n=>!Number.isFinite(n)||n<430||n>1400)){
      throw new RangeError('Invalid fireworks cadence intervals');
    }
    this.intervalsMs=[...intervalsMs];
    this.reset();
  }
  intervalFor(intensity,launches){
    if(!Number.isFinite(intensity))return this.intervalsMs[(launches-1)%this.intervalsMs.length];
    const strength=Math.max(0,Math.min(1,intensity));
    // V9.8: a livelier but still bounded sequence. Ordinary open-mouth laugh
    // ~0.9s, exaggerated ~0.46-0.52s. No mic input, no timer-per-particle.
    const accent=[0,28,-22,42,-12][(launches-1)%5];
    return Math.max(450,Math.min(1060,1020-575*strength+accent));
  }
  reset(){
    this.active=false;
    this.pendingEntry=false;
    this.launches=0;
    this.lastAt=-Infinity;
    this.nextAt=Infinity;
    this.smoothedIntensity=0;
    this.lastIntensityAt=null;
    this.intervalMs=null;
  }
  update({now,confirmedLaugh=false,fresh=true,firstBurst=false,canLaunch=true,intensity}={}){
    if(!Number.isFinite(now))return false;
    if(!confirmedLaugh){this.reset();return false;}
    // A stale camera frame cannot start or advance fireworks.
    if(!fresh)return false;
    const adaptive=Number.isFinite(intensity);
    if(adaptive){
      const target=Math.max(0,Math.min(1,intensity));
      const dt=this.lastIntensityAt===null?Infinity:Math.max(0,now-this.lastIntensityAt);
      const alpha=this.lastIntensityAt===null?1:1-Math.exp(-dt/175);
      this.smoothedIntensity+=(target-this.smoothedIntensity)*alpha;
      this.lastIntensityAt=now;
      // Recalculate NEXT launch while the user is laughing. When the face
      // becomes more expressive, the next comet moves earlier without
      // scheduling extra timers or restarting an already flying firework.
      if(this.active){
        this.intervalMs=this.intervalFor(this.smoothedIntensity,this.launches);
        this.nextAt=this.lastAt+this.intervalMs;
      }
    }
    if(firstBurst)this.pendingEntry=true;
    if(!this.active){
      if(!this.pendingEntry||!canLaunch)return false;
      this.active=true;this.pendingEntry=false;
    }else if(now<this.nextAt||!canLaunch){
      return false;
    }
    this.lastAt=now;
    this.launches++;
    this.intervalMs=this.intervalFor(adaptive?this.smoothedIntensity:NaN,this.launches);
    this.nextAt=now+this.intervalMs;
    return true;
  }
  snapshot(){
    return {
      active:this.active,pendingEntry:this.pendingEntry,launches:this.launches,
      lastAt:this.lastAt,nextAt:this.nextAt,
      intervalMs:this.intervalMs,visualIntensity:this.smoothedIntensity
    };
  }
}
