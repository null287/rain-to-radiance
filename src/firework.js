/**
 * Each flight follows a bounded screen-space ascent route from BELOW the
 * bottom edge; its trail samples reflect the actual path (straight/arc/S).
 * No inference, network or browser dependency; deterministic unit-testable.
 */
const safe = n => Number.isFinite(n);
const clamp = (x,lo,hi) => Math.max(lo,Math.min(hi,x));
import {pointOnAscent} from './launch-path.js';

export class FireworkFlight {
  constructor({duration = 0.78,maxFlights = 2} = {}) {
    if(!safe(duration) || duration <= 0 || !safe(maxFlights) || maxFlights < 1) throw new RangeError('Invalid flight settings');
    this.duration=duration;this.maxFlights=Math.floor(maxFlights);
    this.flights=[];this.launched=0;this.detonations=0;
  }
  launch({x,startY,endY,colors,count=100,speed=255,variation=null,route=null} = {}) {
    if (![x,startY,endY,count,speed].every(safe) || startY <= endY) return false;
    if(this.flights.length >= this.maxFlights) return false;
    const ascent=route||{type:'straight',depth:'front',direction:1,
      startX:x,endX:x,startY,endY,amplitude:0};
    if(!['front','back'].includes(ascent.depth)||
       ![ascent.startX,ascent.endX,ascent.startY,ascent.endY,
        ascent.amplitude].every(safe) || ascent.startY<=ascent.endY)return false;
    this.flights.push({x:ascent.startX,startY:ascent.startY,endY:ascent.endY,
      prevX:ascent.startX,prevY:ascent.startY,
      y:ascent.startY,elapsed:0,duration:this.duration,route:ascent,
      depth:ascent.depth,trail:[{x:ascent.startX,y:ascent.startY}],
      colors,count:clamp(Math.floor(count),0,250),speed:clamp(speed,0,600),
      variation});
    this.launched++;
    return true;
  }
  update(dt,physics) {
    if(!safe(dt) || dt<=0) return [];
    const blooms=[];
    const duration=Math.min(dt,0.1);
    const active=[];
    for(const f of this.flights) {
      f.prevX=f.x;f.prevY=f.y;
      f.elapsed=Math.min(f.duration,f.elapsed+duration);
      const t=f.elapsed/f.duration;
      const point=pointOnAscent(f.route,t);
      f.x=point.x;f.y=point.y;
      f.trail.push({x:f.x,y:f.y});
      if(f.trail.length>23)f.trail.shift();
      if(t >= 1 - 1e-8) {
        const count=physics.spawnBurst({
          x:f.x,y:f.endY,count:f.count,colors:f.colors,speed:f.speed,
          variation:f.variation
        });
        this.detonations++;
        blooms.push({x:f.x,y:f.endY,count,
          depth:f.depth,
          pattern:f.variation?.pattern||'peony',
          size:f.variation?.size||'M',
          scale:f.variation?.scale||1,
          accent:f.variation?.accent||null,
          theme:f.variation?.theme||'gold'});
      } else active.push(f);
    }
    this.flights=active;
    return blooms;
  }
  reset() {this.flights=[];this.launched=0;this.detonations=0;}
}
