/**
 * Event-driven overlay controller for an independent browser AR examination demo.
 * No connection to the TikTok platform. All spectator identities/events are labeled SIM.
 * AR events carry only non-identifying cue names, never camera frames/landmarks.
 */
import {OverlayEventBus,scriptedDemoEvent} from './overlay-events.js';
import {DEMO_PERSONAS,demoPersonaFor,demoHandleAt} from './demo-personas.js';
const $=id=>document.getElementById(id);
const sheet=$('controlSheet'),shade=$('sheetShade');
const bus=new OverlayEventBus();
const feed=$('chatEvents');
const likesCounter=$('likeCount');
const autoInput=$('autoOverlay'),reactionInput=$('reactiveChat');
const masterInput=$('overlayEnabled');
const layerInputs={
  chat:$('showComments'),like:$('showLikes'),
  gift:$('showGifts'),join:$('showJoins')
};
const stage=$('stage');
const layerVisible=type=>masterInput.checked&&Boolean(layerInputs[type]?.checked);
let lastFocus=null,toastTimer=0,autoTimer=0,autoStep=0,sheetDrag=null;
let giftTimer=0,joinTimer=0,pulseTimer=0;
let mode='idle',auto=autoInput.checked,likes=0,giftTotal=0,arTotal=0,joinTotal=0;
let chatTotal=0,totalEmitted=0,simEvents=0,reactionCount=0,lastReactionAt=-Infinity;
const reactionTimers=new Set(),reactionByCue=new Map();
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
// Official LIVE reference uses warm pink/red floating likes; colorful gift
// and co-host symbols are treated separately from the neutral tool icons.
const colors=['#fe2c55','#ff477d','#ff7a9a','#f73669','#ff9cb2'];
function toast(message,duration=2650){
  const node=$('uiToast');clearTimeout(toastTimer);
  node.textContent=message;node.hidden=false;
  toastTimer=setTimeout(()=>node.hidden=true,duration);
}
function openSheet(){
  if(!sheet.hidden)return;
  lastFocus=document.activeElement;sheet.hidden=false;shade.hidden=false;
  $('settingsButton').setAttribute('aria-expanded','true');
  $('dockEffects').setAttribute('aria-expanded','true');
  sheet.tabIndex=-1;sheet.focus({preventScroll:true});
}
function clearSheetDrag(){
  sheetDrag=null;
  sheet.style.removeProperty('transform');
  sheet.style.removeProperty('transition');
  sheet.style.removeProperty('animation');
  shade.style.removeProperty('opacity');
}
function closeSheet(){
  if(sheet.hidden)return;
  clearSheetDrag();
  sheet.hidden=true;shade.hidden=true;
  $('settingsButton').setAttribute('aria-expanded','false');
  $('dockEffects').setAttribute('aria-expanded','false');
  if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});
}
// The master toggle changes PRESENTATION, never the underlying AR simulation.
// Per-layer choices survive switching to a clean effects-only preview.
function syncPresentation(){
  const live=masterInput.checked;
  stage.dataset.preview=live?'live':'clean';
  $('exitClean').hidden=live;
  $('livePreset').classList.toggle('is-active',live);
  $('cleanPreset').classList.toggle('is-active',!live);
  $('livePreset').setAttribute('aria-pressed',String(live));
  $('cleanPreset').setAttribute('aria-pressed',String(!live));
  $('overlayToggles').classList.toggle('is-disabled',!live);
  for(const input of Object.values(layerInputs))input.disabled=!live;
  autoInput.disabled=!live;
  reactionInput.disabled=!live||!layerInputs.chat.checked;
  const commentsHidden=!layerVisible('chat');
  $('chatFeed').hidden=commentsHidden;
  $('dockComments').setAttribute('aria-pressed',String(!commentsHidden));
  $('dockComments').setAttribute('aria-label',commentsHidden?'显示演示评论':'隐藏演示评论');
  $('likeButton').hidden=!layerVisible('like');
  for(const button of document.querySelectorAll('[data-live-test]')){
    const type=button.dataset.liveTest==='likeBurst'?'like':button.dataset.liveTest;
    button.disabled=!layerVisible(type);
  }
  // Colorful LIVE actions should not look enabled if their corresponding
  // simulated layer has been switched off in the settings sheet.
  $('dockGift').disabled=!layerVisible('gift');
  $('dockGuests').disabled=!layerVisible('join');
  if(!layerVisible('like'))$('floatHearts').replaceChildren();
  if(!layerVisible('gift')){clearTimeout(giftTimer);$('giftAlert').hidden=true;}
  if(!layerVisible('join')){clearTimeout(joinTimer);$('joinBanner').hidden=true;}
  if(!live){clearTimeout(pulseTimer);$('interactionPulse').hidden=true;}
  if(auto&&live)scheduleAuto(true);
  else cancelAuto();
  refreshStats();
}
masterInput.addEventListener('change',syncPresentation);
for(const input of Object.values(layerInputs))input.addEventListener('change',syncPresentation);
$('livePreset').addEventListener('click',()=>{
  masterInput.checked=true;
  for(const input of Object.values(layerInputs))input.checked=true;
  reactionInput.checked=true;autoInput.checked=true;auto=true;
  syncPresentation();closeSheet();
});
$('cleanPreset').addEventListener('click',()=>{
  masterInput.checked=false;
  syncPresentation();closeSheet();
});
$('exitClean').addEventListener('click',()=>{
  masterInput.checked=true;syncPresentation();
});
// The graspable handle makes the sheet act like a familiar mobile bottom sheet.
// Other controls still scroll/click normally; only the 44px top handle starts dragging.
const sheetGrab=sheet.querySelector('.sheet-grab');
sheetGrab.addEventListener('pointerdown',event=>{
  if(sheet.hidden||event.button>0)return;
  sheetDrag={id:event.pointerId,at:event.clientY,delta:0,start:performance.now()};
  sheet.style.animation='none';
  sheet.style.transition='none';
  try{sheetGrab.setPointerCapture(event.pointerId);}catch{}
});
sheetGrab.addEventListener('pointermove',event=>{
  if(!sheetDrag||event.pointerId!==sheetDrag.id)return;
  const distance=Math.max(0,event.clientY-sheetDrag.at);
  sheetDrag.delta=distance;
  sheet.style.transform='translate3d(0,'+Math.min(distance,350)+'px,0)';
  shade.style.opacity=String(Math.max(.4,1-distance/520));
});
function finishSheetDrag(event,shouldEvaluate){
  if(!sheetDrag||event.pointerId!==sheetDrag.id)return;
  const drag=sheetDrag;
  sheetDrag=null;
  if(shouldEvaluate&&drag.delta>68){closeSheet();return;}
  sheet.style.transition='transform 150ms ease-out';
  sheet.style.transform='translate3d(0,0,0)';
  shade.style.opacity='1';
  setTimeout(()=>{
    if(sheet.hidden||sheetDrag)return;
    sheet.style.removeProperty('transform');
    sheet.style.removeProperty('transition');
    sheet.style.removeProperty('animation');
    shade.style.removeProperty('opacity');
  },175);
}
sheetGrab.addEventListener('pointerup',event=>finishSheetDrag(event,true));
sheetGrab.addEventListener('pointercancel',event=>finishSheetDrag(event,false));
for(const id of ['settingsButton','dockEffects','dockMore'])$(id).addEventListener('click',openSheet);
$('sheetClose').addEventListener('click',closeSheet);
shade.addEventListener('click',closeSheet);
document.addEventListener('keydown',event=>{
  if(sheet.hidden)return;
  if(event.key==='Escape'){event.preventDefault();closeSheet();return;}
  if(event.key!=='Tab')return;
  // Collapsed <details> children exist in DOM but must not receive modal focus.
  const nodes=[...sheet.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href],summary')]
    .filter(node=>node.tabIndex>=0&&node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden');
  if(!nodes.length)return;
  const first=nodes[0],last=nodes[nodes.length-1];
  if(document.activeElement===sheet||!sheet.contains(document.activeElement)){
    event.preventDefault();(event.shiftKey?last:first).focus();return;
  }
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
for(const button of document.querySelectorAll('[data-action]'))button.addEventListener('click',closeSheet);
for(const id of ['sampleSmile','sampleLaugh'])$(id).addEventListener('click',closeSheet);
$('stop').addEventListener('click',closeSheet);
function makeBadge(text){
  const node=document.createElement('span');node.className='rank-tag';
  node.textContent=text;return node;
}
function glyph(name){
  const node=document.createElement('span');
  node.className='ui-glyph';node.dataset.glyph=name;
  node.setAttribute('aria-hidden','true');return node;
}
function makeChat(event){
  const row=document.createElement('div');
  row.className='chat-line';
  if(event.type==='gift')row.classList.add('gift-message');
  if(event.type==='join')row.classList.add('join-message');
  if(event.source==='ar')row.classList.add('ar-message');
  row.dataset.eventType=event.type;
  const avatar=document.createElement('span');
  avatar.className='chat-avatar';
  avatar.classList.add(event.source==='ar'?'tech-avatar':event.type==='gift'?'action-avatar':'system-avatar');
  const persona=event.source==='sim'?demoPersonaFor(event.name):null;
  if(persona){
    const photo=document.createElement('img');photo.src=persona.avatar;photo.alt='';
    photo.loading='lazy';photo.decoding='async';avatar.classList.add('has-photo');avatar.append(photo);
  }else if(event.source==='ar')avatar.append(glyph('sparkle'));
  else if(event.type==='gift')avatar.append(glyph('gift-color'));
  else avatar.textContent=event.name[0]?.toUpperCase()||'·';
  const copy=document.createElement('div');copy.className='chat-copy';
  const title=document.createElement('span');title.className='chat-label';
  if(event.source==='sim'&&event.type==='gift')title.append(makeBadge('45'));
  const name=document.createTextNode((event.source==='ar'?'AR EFFECT':event.name)+' ');
  const tag=document.createElement('small');
  tag.textContent=event.source==='ar'?'· 实时特效':'· 模拟';
  title.append(name,tag);
  const message=document.createElement('span');
  message.className='chat-body';
  if(event.type==='join')message.textContent='加入了演示直播间';
  else if(event.type==='like')message.textContent='送出了 '+event.count+' 个演示点赞';
  else if(event.type==='gift')message.textContent='送出 '+event.gift+' ×'+event.count;
  else message.textContent=event.message;
  copy.append(title,message);row.append(avatar,copy);
  return row;
}
function renderFeed(event){
  feed.querySelector('.chat-placeholder')?.remove();
  const host=feed.parentElement;
  const animate=!reduceMotion&&!document.hidden&&!host.hidden&&getComputedStyle(host).visibility!=='hidden';
  const before=animate?[...feed.children].map(row=>({row,rect:row.getBoundingClientRect()})):[];
  feed.append(makeChat(event));
  // Keep at most four active rows; let an aria-hidden visual copy of the oldest row fade out.
  while(feed.childElementCount>4){
    const outgoing=feed.firstElementChild;
    if(animate){
      const rect=before.find(item=>item.row===outgoing)?.rect||outgoing.getBoundingClientRect();
      const hostRect=host.getBoundingClientRect();
      const ghost=outgoing.cloneNode(true);
      ghost.dataset.departing='true';
      ghost.setAttribute('aria-hidden','true');
      ghost.style.cssText='position:absolute;top:'+(rect.top-hostRect.top)+'px;left:'+
        (rect.left-hostRect.left)+'px;width:'+rect.width+'px;margin:0;pointer-events:none';
      host.append(ghost);
      const exit=ghost.animate([
        {opacity:.92,transform:'translate3d(0,0,0)'},
        {opacity:0,transform:'translate3d(0,-12px,0)'}
      ],{duration:210,easing:'ease-in',fill:'forwards'});
      exit.finished.catch(()=>{}).finally(()=>ghost.remove());
    }
    outgoing.remove();
  }
  // Move retained lines smoothly instead of making the whole chat column jump.
  if(animate){
    for(const {row,rect} of before){
      if(!row.isConnected)continue;
      const dy=rect.top-row.getBoundingClientRect().top;
      if(Math.abs(dy)>1)row.animate([
        {transform:'translate3d(0,'+dy+'px,0)'},
        {transform:'translate3d(0,0,0)'}
      ],{duration:210,easing:'cubic-bezier(.2,.7,.2,1)'});
    }
  }
}
function floatHearts(count){
  if(!layerVisible('like'))return;
  const host=$('floatHearts');
  const n=Math.min(10,Math.max(1,count));
  for(let i=0;i<n;i++){
    const shape=document.createElement('span');shape.className='float-heart';
    shape.style.setProperty('--heart-left',(3+Math.random()*28)+'px');
    shape.style.setProperty('--heart-size',(18+Math.random()*15)+'px');
    shape.style.setProperty('--heart-color',colors[(i+Math.floor(Math.random()*colors.length))%colors.length]);
    shape.style.setProperty('--heart-sway',((Math.random()-.5)*85)+'px');
    shape.style.setProperty('--heart-spin',((Math.random()-.5)*50)+'deg');
    shape.style.setProperty('--heart-life',(1650+i*78+Math.random()*240)+'ms');
    shape.append(glyph('heart-solid'));host.append(shape);
    // Bound transient DOM work under repeated likes or high event volume.
    while(host.childElementCount>28)host.firstElementChild?.remove();
    setTimeout(()=>shape.remove(),2800);
  }
}
function giftAlert(event){
  const el=$('giftAlert');clearTimeout(giftTimer);
  $('giftName').textContent=event.gift;
  $('giftSender').textContent=event.name+' · 模拟';
  $('giftCount').textContent='x'+event.count;
  el.hidden=false;el.style.animation='none';void el.offsetWidth;el.style.animation='';
  giftTimer=setTimeout(()=>el.hidden=true,2400);
  floatHearts(Math.min(6,event.count*2+2));
}
function joinAlert(event){
  const el=$('joinBanner');clearTimeout(joinTimer);
  $('joinText').textContent=event.name+' 加入了预览';
  el.hidden=false;el.style.animation='none';void el.offsetWidth;el.style.animation='';
  joinTimer=setTimeout(()=>el.hidden=true,1850);
}
function pulse(text){
  const node=$('interactionPulse');clearTimeout(pulseTimer);
  $('interactionText').textContent=text;node.hidden=false;
  node.style.animation='none';void node.offsetWidth;node.style.animation='';
  pulseTimer=setTimeout(()=>node.hidden=true,1350);
}
function refreshStats(){
  // Separate user-facing simulated activity from noisy internal AR cue counts.
  // Otherwise the manual button's effect gets lost next to e.g. "AR 109".
  $('overlayMiniStats').textContent='模拟互动 '+simEvents+' · 评论 '+chatTotal+
    ' · 点赞 '+likes+' · 礼物 '+giftTotal+' · 进场 '+joinTotal;
  $('overlayModeLabel').textContent=!masterInput.checked?'EFFECTS ONLY':
    (auto?'AUTO ON':'MANUAL')+' / DEMO';
  likesCounter.textContent=String(likes);
}
function onOverlayEvent(event){
  totalEmitted++;
  if(event.source==='sim'&&layerVisible(event.type))simEvents++;
  if(event.type==='like'&&layerVisible('like')){
    likes+=event.count;floatHearts(Math.min(8,event.count+2));
  }
  if(event.type==='chat'&&layerVisible('chat'))chatTotal++;
  if(event.type==='gift'&&layerVisible('gift')){
    giftTotal+=event.count;giftAlert(event);
  }
  if(event.type==='join'&&layerVisible('join')){
    joinTotal++;joinAlert(event);
  }
  if(event.type==='ar'){
    arTotal++;
    if(masterInput.checked&&event.cue==='collision')pulse('火花与头部发生碰撞');
    if(masterInput.checked&&event.cue==='bloom')pulse('烟花绽放 · 光已点亮');
  }
  // Physical AR events stay separate from fictional audience messages.
  if(event.type!=='ar'&&layerVisible(event.type)&&layerVisible('chat')){
    renderFeed(event);
  }
  refreshStats();
}
bus.subscribe(onOverlayEvent);
function emit(type,extras={}){
  return bus.emit({type,source:'sim',manual:true,...extras});
}
const demoNames=DEMO_PERSONAS.map(person=>person.handle);
let manualStep=0;
function emitDemo(type){
  const domain=type==='likeBurst'?'like':type;
  if(!layerVisible(domain))return false;
  const name=demoNames[manualStep++%demoNames.length];
  if(type==='chat')return emit('chat',{name,message:['wait, it rains when you smile? ☔','the spark actually bounced 😂','that transition was so clean ✨','do it again!!'][manualStep%4]});
  if(type==='like')return emit('like',{name,count:3});
  if(type==='likeBurst')return emit('like',{name,count:12});
  if(type==='gift')return emit('gift',{name,gift:manualStep%2?'星愿':'银河星光',count:1});
  if(type==='join')return emit('join',{name});
  return false;
}
for(const button of document.querySelectorAll('[data-live-test]')){
  button.addEventListener('click',()=>{
    const type=button.dataset.liveTest;
    if(mode==='idle'||mode==='loading'){
      manualFeedback('请先启动真人样片或物理模拟，再触发模拟直播互动。',true);
      return;
    }
    const result=emitDemo(type);
    if(!result){
      manualFeedback('当前互动已关闭或点击过快，请稍候再试。',true);
      return;
    }
    const messages={
      chat:'已发送模拟评论 · 查看左下角弹幕',
      like:'模拟点赞 +3 · 观察浮动爱心',
      likeBurst:'模拟连击点赞 +12 · 观察浮动爱心',
      gift:'已送出模拟礼物 · 查看礼物动画',
      join:'模拟观众已进场 · 查看进场提示'
    };
    closeSheet();
    toast(messages[type]||'已触发模拟互动',1900);
  });
}
$('clearOverlay').addEventListener('click',()=>{
  // Clearing should stay cleared. Otherwise the active auto loop immediately
  // repopulates the counters and appears to ignore the user's click.
  autoInput.checked=false;auto=false;
  reactionInput.checked=false;
  resetOverlay();
  syncPresentation();
  manualFeedback('已清空互动；自动播放与特效联动评论已暂停，AR 特效继续运行。');
});
function manualFeedback(message,error=false){
  const el=$('manualEventFeedback');
  el.textContent=message;
  el.dataset.status=error?'error':'ok';
}
function cancelAuto(){clearTimeout(autoTimer);autoTimer=0;}
function scheduleAuto(initial=false){
  cancelAuto();
  if(!auto||!masterInput.checked||mode==='idle'||mode==='loading'||document.hidden)return;
  autoTimer=setTimeout(()=>{
    if(auto&&masterInput.checked&&mode!=='idle'&&mode!=='loading'&&!document.hidden){
      // Respect independent layer switches; never manufacture disabled gifts,
      // likes or comments. No real TikTok accounts or payment events exist.
      for(let i=0;i<9;i++){
        const event=scriptedDemoEvent(autoStep++);
        if(layerVisible(event.type)){
          bus.emit(event);
          break;
        }
      }
    }
    scheduleAuto();
  },initial?950:(2650+(autoStep%4)*370));
}
function resetOverlay(){
  cancelAuto();clearTimeout(giftTimer);clearTimeout(joinTimer);clearTimeout(pulseTimer);
  for(const timer of reactionTimers)clearTimeout(timer);
  reactionTimers.clear();reactionByCue.clear();lastReactionAt=-Infinity;reactionCount=0;
  $('giftAlert').hidden=true;$('joinBanner').hidden=true;$('interactionPulse').hidden=true;
  $('floatHearts').replaceChildren();
  feed.parentElement.querySelectorAll('[data-departing="true"]').forEach(row=>row.remove());
  feed.replaceChildren();
  const row=document.createElement('div');row.className='chat-line chat-placeholder';
  const avatar=document.createElement('span');avatar.className='chat-avatar system-avatar';avatar.append(glyph('sparkle'));
  const copy=document.createElement('div');copy.className='chat-copy';
  const title=document.createElement('span');title.className='chat-label';title.textContent='系统提示 · 演示';
  const body=document.createElement('span');body.className='chat-body';body.textContent='开始后，直播消息和礼物会动态出现。';
  copy.append(title,body);row.append(avatar,copy);feed.append(row);
  bus.clear();autoStep=0;likes=0;giftTotal=0;arTotal=0;joinTotal=0;chatTotal=0;totalEmitted=0;simEvents=0;
  refreshStats();
}
reactionInput.addEventListener('change',()=>{
  for(const timer of reactionTimers)clearTimeout(timer);
  reactionTimers.clear();
});
autoInput.addEventListener('change',()=>{
  auto=autoInput.checked;
  syncPresentation();
});
document.addEventListener('ar:session',event=>{
  const next=event.detail?.mode;
  if(!['idle','loading','simulation','camera','clip'].includes(next))return;
  mode=next;
  if(next==='idle'||next==='loading'){resetOverlay();return;}
  resetOverlay();
  // Spectator activity should not fabricate itself at session start.
  if(auto&&masterInput.checked)scheduleAuto();
});
function scheduleReactiveComment(cue){
  if(!reactionInput.checked||!layerVisible('chat')||
     !['rain','bloom','collision'].includes(cue)||document.hidden)return;
  const now=performance.now(),lastCue=reactionByCue.get(cue)??-Infinity;
  const cooldown=cue==='collision'?4400:cue==='rain'?3400:1500;
  if(now-lastCue<cooldown||now-lastReactionAt<850)return;
  reactionByCue.set(cue,now);lastReactionAt=now;
  const messages={
    rain:['wait, the rain is reacting ☔','the rain has such a vibe','did smiling start the rain?!'],
    bloom:['WAIT the fireworks!! ✨','that bloom is clean 🔥','omg that launch was smooth'],
    collision:['it bounced off your head 😂','the sparks actually ricochet','look at the head tracking!']
  };
  const reactionIndex=manualStep++;
  const reactionHandle=demoHandleAt(reactionIndex + 3);
  const reactionText=messages[cue][reactionIndex%messages[cue].length];
  const boundMode=mode;
  const timer=setTimeout(()=>{
    reactionTimers.delete(timer);
    if(mode!==boundMode||!reactionInput.checked||!layerVisible('chat')||document.hidden)return;
    const sent=bus.emit({type:'chat',source:'sim',name:reactionHandle,message:reactionText});
    if(sent)reactionCount++;
  },cue==='collision'?380:cue==='bloom'?450:580);
  reactionTimers.add(timer);
}
document.addEventListener('ar:effect',event=>{
  const cue=event.detail?.cue;
  if(mode==='idle'||mode==='loading')return;
  const messages={
    rain:'微笑已触发实时雨幕',
    neutral:'表情回到自然状态',
    launch:'一束烟花正在升空',
    bloom:'烟花绽放，继续移动头部',
    collision:'火花的轨迹因碰撞而改变'
  };
  if(!messages[cue])return;
  bus.emit({type:'ar',source:'ar',name:'AR EFFECT',cue,message:messages[cue]});
  scheduleReactiveComment(cue);
});
$('likeButton').addEventListener('click',()=>{
  const accepted=emitDemo('like');
  const node=$('likeButton');node.classList.remove('is-liked');void node.offsetWidth;node.classList.add('is-liked');
  if(!accepted)toast('互动太密集，已限流');
});
$('dockComments').addEventListener('click',()=>{
  layerInputs.chat.checked=!layerInputs.chat.checked;
  syncPresentation();
  const hidden=!layerVisible('chat');
  $('dockComments').setAttribute('aria-pressed',String(!hidden));
  $('dockComments').setAttribute('aria-label',hidden?'显示演示评论':'隐藏演示评论');
});
$('dockGuests').addEventListener('click',()=>{if(!emitDemo('join'))toast('事件过密，已限流');});
let giftIconFeedbackTimer=0;
$('dockGift').addEventListener('click',()=>{
  if(mode==='idle'||mode==='loading'){
    toast('请先开启真人样片或物理模拟，再触发演示礼物');return;
  }
  if(!emitDemo('gift')){
    toast('礼物已关闭或互动过密，请在设置中检查');return;
  }
  const button=$('dockGift');
  button.classList.add('is-gifting');
  clearTimeout(giftIconFeedbackTimer);
  giftIconFeedbackTimer=setTimeout(()=>button.classList.remove('is-gifting'),680);
});
$('dockLive').addEventListener('click',()=>{
  const state=window.smileWeather?.snapshot();
  toast(state?.mode==='camera'?'摄像头表情识别中 · 直播数据仅模拟':
    state?.mode==='simulation'?'实时特效模拟中 · 无摄像头':
    state?.mode==='clip'?'录制真人样片 · 本地MediaPipe逐帧追踪':
    '本地原型，未连接真实 TikTok LIVE');
});
$('dockShare').addEventListener('click',()=>toast('当前为本地Demo；还未部署可公开访问的HTTPS网址'));
$('powerButton').addEventListener('click',()=>{
  if(mode==='idle'){toast('当前没有运行中的体验');return;}
  const previous=mode;
  $('stop').click();closeSheet();
  toast(previous==='camera'?'摄像头已关闭':previous==='clip'?'真人样片已停止':'模拟体验已结束');
});
syncPresentation();
// Stable, read-only observability for the isolated Edge tests.
Object.defineProperty(window,'livePreviewUI',{value:Object.freeze({
  snapshot:()=>({
    layout:'immersive-live-v4',mode,drawerOpen:!sheet.hidden,
    sampleCommentsVisible:layerVisible('chat')&&!$('chatFeed').hidden,
    sampleLikes:likes,totalEvents:totalEmitted,gifts:giftTotal,
    comments:chatTotal,joins:joinTotal,arEvents:arTotal,
    autoOverlay:auto,reactiveChat:reactionInput.checked,reactionCount,
    previewMode:stage.dataset.preview,overlayEnabled:masterInput.checked,
    layers:{comments:layerVisible('chat'),likes:layerVisible('like'),
      gifts:layerVisible('gift'),joins:layerVisible('join')},
    giftVisible:layerVisible('gift')&&!$('giftAlert').hidden,
    joinVisible:layerVisible('join')&&!$('joinBanner').hidden,
    floatingHearts:$('floatHearts').childElementCount,
    feedRows:feed.childElementCount,bus:bus.snapshot()
  })
})});
