/**
 * Continuous, reversible rain intensity envelope.
 * New expression targets take effect on the NEXT render tick, without resetting
 * existing rain particles or finishing an outdated transition animation.
 */
export function advanceRain(current,target,dt,{riseSeconds=.19,fallSeconds=.30}={}){
  const c=Number.isFinite(current)?Math.min(1,Math.max(0,current)):0;
  const t=Number.isFinite(target)?Math.min(1,Math.max(0,target)):0;
  if(!Number.isFinite(dt)||dt<=0)return c;
  const tau=t>c?riseSeconds:fallSeconds;
  const next=c+(t-c)*(1-Math.exp(-Math.min(dt,.1)/Math.max(.001,tau)));
  return Math.abs(next-t)<.004?t:next;
}
