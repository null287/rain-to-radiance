/**
 * LIVE firework ascent choreography.
 * 70% vertical, 30% subtle S-curves in each complete group of ten launches.
 * Bloom locations span the useful full width rather than tracking a forced
 * center lane. A size-aware upper-screen height reduces bloom clipping.
 */
const TAU=Math.PI*2;
const GOLDEN=.6180339887498949;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
export const ASCENT_MIX=Object.freeze([
  'straight','straight','s-curve','straight','straight',
  's-curve','straight','straight','straight','s-curve'
]);
export function ascentForLaunch(index=0){
  return ASCENT_MIX[Math.abs(Math.floor(finite(index,0)))%ASCENT_MIX.length];
}
// Retained for callers using the original query. Bloom pattern no longer
// dictates the route: ALL six patterns may use either trajectory.
export const ascentForPattern=()=> 'straight';

export function burstPositionForLaunch({
  launchIndex=0,width=390,height=844,size='M',scale=1
}={}){
  const w=Math.max(100,finite(width,390)),h=Math.max(200,finite(height,844));
  const index=Math.max(0,Math.floor(finite(launchIndex,0)));
  // Quasi-random but reproducible x coverage, including both outer thirds.
  const fraction=(.32+(index+.5)*GOLDEN)%1;
  const inset=clamp(.075+Math.max(0,finite(scale,1)-.8)*.035,.075,.11);
  const x=w*(inset+(1-inset*2)*fraction);
  // Keep every burst towards the top without cutting off larger blossoms.
  const base=({S:.195,M:.22,L:.255,XL:.28})[size]??.22;
  const stagger=((index*7)%5-2)*.006;
  const y=h*clamp(base+stagger,.17,.30);
  return Object.freeze({x,y,normalizedX:x/w,normalizedY:y/h});
}

export function planAscent({
  pattern='peony',width=390,height=844,launchIndex=0,
  size='M',scale=1,apexY,burstX
}={}){
  const w=Math.max(100,finite(width,390)),h=Math.max(200,finite(height,844));
  const position=burstPositionForLaunch({launchIndex,width:w,height:h,size,scale});
  const endX=clamp(finite(burstX,position.x),w*.075,w*.925);
  const type=ascentForLaunch(launchIndex);
  const direction=Math.floor(finite(launchIndex,0))%2===0?1:-1;
  return Object.freeze({
    type,depth:'front',direction,
    startX:endX,endX,startY:h+42,
    endY:clamp(finite(apexY,position.y),h*.16,h*.30),
    // Only about 6–8 CSS pixels on a 390px phone.
    amplitude:type==='s-curve'?clamp(w*.017,4.5,8.5):0,
    pattern
  });
}
export function pointOnAscent(route,progress){
  const t=clamp(finite(progress,0),0,1);
  const eased=1-(1-t)*(1-t);
  const wiggle=route.type==='s-curve'
    ?route.direction*route.amplitude*Math.sin(TAU*t)*(1-.08*t)
    :0;
  return {
    x:route.startX+(route.endX-route.startX)*eased+wiggle,
    y:route.startY+(route.endY-route.startY)*eased
  };
}
