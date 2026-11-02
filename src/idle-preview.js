import {previewHeadAt} from './preview-face.js';
/**
 * Muted, prerecorded landing-page preview only.
 *
 * Reuses the ACTUAL physics and rocket rendering pipeline but schedules the
 * smile→laugh cues from the known local video timeline. It is deliberately
 * NOT a MediaPipe inference, webcam session, or real LIVE broadcast.
 * Interactive modes use their separate original engines.
 */
import {PhysicsEngine} from './physics.js';
import {FireworkFlight} from './firework.js';
import {FireworkVariationPlanner,makeFireworkRandom} from './firework-variation.js';
import {planAscent} from './launch-path.js';
import {advanceRain} from './transition.js';

export const PREVIEW_SMILE_TO_LAUGH_AT=4.15;
export const PREVIEW_LAUGH_START_FIREWORK=4.38;
export const PREVIEW_VIDEO_DURATION=12.36;
const finite=n=>Number.isFinite(n);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

export function previewPhaseAt(time=0){
  const t=finite(time)?Math.max(0,time):0;
  return t<PREVIEW_SMILE_TO_LAUGH_AT?'smile':'laugh';
}

export class IdlePreviewEngine {
  constructor(){
    this.physics=new PhysicsEngine({width:390,height:844,
      maxParticles:215,random:makeFireworkRandom(0x20ad3e)});
    this.flight=new FireworkFlight({duration:.65,maxFlights:2});
    this.variations=new FireworkVariationPlanner({
      random:makeFireworkRandom(0x312764)
    });
    this.reset();
  }
  reset(){
    this.physics.clear();this.flight.reset();this.variations.reset();
    this.rings=[];this.impacts=[];
    this.lastVideoTime=null;this.lastLaunchTime=-Infinity;
    this.rainEnvelope=0;
    this.bursts=0;this.loopCount=this.loopCount||0;
    this.phase='smile';this.enabled=false;this.head=null;
  }
  update({time=0,now=0,dt=1/30,width=390,height=844,
    palette='gold',quality='balanced',reduceMotion=false}={}){
    const videoTime=Math.max(0,finite(time)?time:0);
    if(this.lastVideoTime!==null&&videoTime<this.lastVideoTime-.28){
      const oldLoops=this.loopCount;
      this.reset();
      this.loopCount=oldLoops+1;
    }
    this.enabled=true;
    this.lastVideoTime=videoTime;
    this.phase=previewPhaseAt(videoTime);
    this.physics.resize(width,height);
    this.physics.maxParticles=reduceMotion?95:quality==='lite'?125:215;
    const delta=clamp(finite(dt)?dt:1/30,.001,.08);
    this.rainEnvelope=advanceRain(this.rainEnvelope,
      this.phase==='smile'?.88:0,delta);
    const nextHead=previewHeadAt(videoTime,width,height);
    if(nextHead&&this.head){
      nextHead.vx=clamp((nextHead.cx-this.head.cx)/delta,-650,650);
      nextHead.vy=clamp((nextHead.cy-this.head.cy)/delta,-650,650);
    }
    this.head=nextHead;
    this.physics.update(delta,this.head,this.rainEnvelope);
    const available=this.physics.maxParticles-this.physics.particles.length;
    if(!reduceMotion&&this.phase==='laugh'&&
      videoTime>=PREVIEW_LAUGH_START_FIREWORK&&
      videoTime-this.lastLaunchTime>=1.22&&
      this.flight.flights.length<2&&available>=45){
      const item=this.variations.next({intensity:.8,quality});
      const route=planAscent({pattern:item.pattern,width,height,
        launchIndex:this.bursts,size:item.size,scale:item.scale});
      const variation={...item,depth:'front',theme:palette};
      if(this.flight.launch({
        x:route.startX,startY:route.startY,endY:route.endY,
        route,variation,colors:['#fff3d9','#ffca92','#ffedf4'],
        count:Math.max(36,Math.round(95*item.countScale)),
        speed:quality==='lite'?212:245
      })){
        this.bursts++;
        this.lastLaunchTime=videoTime;
      }
    }
    for(const bloom of this.flight.update(delta,this.physics)){
      this.rings.push({...bloom,start:now});
    }
    return this.snapshot();
  }
  snapshot(){
    return {
      enabled:this.enabled,phase:this.phase,videoTime:this.lastVideoTime??0,
      bursts:this.bursts,detonations:this.flight.detonations,
      rainEnvelope:this.rainEnvelope,particles:this.physics.particles.length,
      loops:this.loopCount,flights:this.flight.flights.length,
      collisions:this.physics.collisionCount,hasFace:Boolean(this.head),
      outlinePoints:this.head?.outline?.length||0,
      collisionSource:'measured-prerecorded-face-contour',
      source:'prerecorded-timed-visual-preview-not-face-inference'
    };
  }
}
