/** Fictional, offline-only viewer identities. Photos depict Pexels stock models, NOT
 * the named fictional accounts, a real LIVE audience, or product endorsement. */
export const DEMO_PERSONAS=Object.freeze([
  Object.freeze({handle:'mila.afterglow',avatar:'./assets/audience-avatars/portrait-2709388.jpg'}),
  Object.freeze({handle:'camila.hello',avatar:'./assets/audience-avatars/portrait-4906289.jpg'}),
  Object.freeze({handle:'noah.citylife',avatar:'./assets/audience-avatars/portrait-30494318.jpg'}),
  Object.freeze({handle:'ade.onair',avatar:'./assets/audience-avatars/portrait-19379640.jpg'}),
  Object.freeze({handle:'ava.lumen',avatar:'./assets/audience-avatars/portrait-7500224.jpg'}),
  Object.freeze({handle:'jay.greenroom',avatar:'./assets/audience-avatars/portrait-35470070.jpg'}),
  Object.freeze({handle:'sol.oldschool',avatar:'./assets/audience-avatars/portrait-19829075.jpg'}),
  Object.freeze({handle:'eli.waves',avatar:'./assets/audience-avatars/portrait-18272416.jpg'}),
  Object.freeze({handle:'liam.studio',avatar:'./assets/audience-avatars/portrait-3228892.jpg'}),
  Object.freeze({handle:'sofie.nights',avatar:'./assets/audience-avatars/portrait-13350397.jpg'}),
]);
const byHandle=new Map(DEMO_PERSONAS.map(person=>[person.handle,person]));
export const demoPersonaFor=handle=>byHandle.get(handle)||null;
export const demoHandleAt=index=>DEMO_PERSONAS[((index%DEMO_PERSONAS.length)+DEMO_PERSONAS.length)%DEMO_PERSONAS.length].handle;
