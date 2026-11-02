/**
 * Small, deterministic LIVE event channel for the examination prototype.
 * This is NOT a TikTok connector. All spectator events are locally simulated.
 * An event has source=sim or source=ar; no real usernames or gifts are imported.
 */
import {demoHandleAt} from './demo-personas.js';
const TYPES=new Set(['join','chat','like','gift','ar']);
const CUES=new Set(['rain','neutral','launch','bloom','collision','camera','stop']);
const clean=(v,max=84)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);

export class OverlayEventBus{
  constructor({clock=()=>Date.now(),capacity=48,windowMs=2000,maxPerWindow=18,maxManualPerWindow=12}={}){
    this.clock=clock;this.capacity=capacity;this.windowMs=windowMs;
    this.maxPerWindow=maxPerWindow;this.maxManualPerWindow=maxManualPerWindow;
    this.events=[];this.listeners=new Set();
    this.times=[];this.manualTimes=[];this.seen=new Set();this.nextId=1;this.dropped=0;
  }
  subscribe(fn){
    if(typeof fn!=='function')throw new TypeError('listener must be a function');
    this.listeners.add(fn);
    return ()=>this.listeners.delete(fn);
  }
  emit(raw={}){
    if(!TYPES.has(raw.type))return false;
    const time=this.clock();
    // Deliberate test-button clicks use their own small, bounded budget.
    // A busy simulated LIVE/AR event stream must not silently swallow them.
    // The manual flag is internal; it is not exported as viewer event data.
    const manual=raw.source!=='ar'&&raw.manual===true;
    this.times=this.times.filter(t=>time-t<this.windowMs);
    this.manualTimes=this.manualTimes.filter(t=>time-t<this.windowMs);
    if(manual?this.manualTimes.length>=this.maxManualPerWindow:
      this.times.length>=this.maxPerWindow){this.dropped++;return false;}
    if(raw.id!==undefined&&this.seen.has(raw.id))return false;
    const event=Object.freeze({
      id:clean(raw.id??('evt-'+this.nextId++),64),
      type:raw.type,
      source:raw.source==='ar'?'ar':'sim',
      name:clean(raw.name||'AR demo',24),
      message:clean(raw.message,96),
      gift:clean(raw.gift||'星愿',20),
      count:Math.max(1,Math.min(99,Math.floor(Number(raw.count)||1))),
      cue:CUES.has(raw.cue)?raw.cue:null,
      time
    });
    this.seen.add(event.id);
    (manual?this.manualTimes:this.times).push(time);
    this.events.push(event);
    if(this.events.length>this.capacity){
      const excess=this.events.splice(0,this.events.length-this.capacity);
      for(const item of excess)this.seen.delete(item.id);
    }
    for(const fn of this.listeners){
      try{fn(event);}catch{ /* observer failures never interrupt AR */ }
    }
    return event;
  }
  snapshot(){return {events:this.events.length,dropped:this.dropped,subscribers:this.listeners.size,last:this.events.at(-1)?.type||null};}
  clear(){
    this.events.length=0;this.times.length=0;this.manualTimes.length=0;
    this.seen.clear();this.dropped=0;
  }
}
export function scriptedDemoEvent(index){
  const sequence=[
    {type:'join',name:'neon_visitor'},
    {type:'chat',name:'studio_guest',message:'did the rain react to your smile? ☔'},
    {type:'like',name:'demo_viewer',count:4},
    {type:'chat',name:'night_arc',message:'try laughing a little harder 😂'},
    {type:'gift',name:'light_guest',gift:'星愿',count:1},
    {type:'chat',name:'lumen_guest',message:'wait do the sparks bounce off your head?'},
    {type:'join',name:'rain_watcher'},
    {type:'like',name:'live_guest',count:7},
    {type:'chat',name:'studio_guest',message:'ok that was way smoother than I expected'}
  ];
  return {...sequence[((index%sequence.length)+sequence.length)%sequence.length],name:demoHandleAt(index),source:'sim'};
}
