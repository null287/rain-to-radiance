import {reflectAgainstFaceOutline} from './face-outline.js';
import {fireworkPaletteFor} from './firework-variation.js';
/**
 * Screen-space particle physics. Coordinates are CSS pixels, time is seconds,
 * velocities are pixels/second, and head.angle is radians.
 * The tracked face drives a moving ellipse proxy, not a reconstructed 3D skull.
 */
const TAU = Math.PI * 2;
const EPSILON = 0.05;
const PALETTE = ['#ffdb7a', '#ff855f', '#ffc5dd', '#b2a1ff', '#a7fff1'];
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

function limitVelocity(object, maximum) {
  const speed = Math.hypot(object.vx, object.vy);
  if (speed > maximum) {
    object.vx *= maximum / speed;
    object.vy *= maximum / speed;
  }
}

/**
 * Mutates particle.x/y/vx/vy. prevX/prevY must be the start of the current step.
 * head is at the END of that step. Returns true only for an incoming impact;
 * an already penetrating, outward-moving particle is corrected without a bounce.
 * lastCollision contains the world-space surface contact and outward normal.
 * Adding particle radius to the ellipse axes is a stable small-particle proxy.
 */
export function reflectAgainstHead(particle, head, options = {}) {
  particle.lastCollision = null;
  if (!head || head.valid === false || !Number.isFinite(head.cx) || !Number.isFinite(head.cy)
      || !Number.isFinite(head.rx) || !Number.isFinite(head.ry) || head.rx <= 0 || head.ry <= 0) return false;
  // Real camera/recorded faces use their actual tracked face-oval polygon.
  // The synthetic illustration still uses the original debug ellipse.
  if(Array.isArray(head.outline)&&head.outline.length>=12){
    return reflectAgainstFaceOutline(particle,head,options);
  }
  const dt = Math.max(0, finite(options.dt));
  const restitution = clamp(finite(options.restitution, 0.62), 0, 1);
  const maxSpeed = Math.max(1, finite(options.maxSpeed, 1200));
  const angle = finite(head.angle);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const hvx = finite(head.vx);
  const hvy = finite(head.vy);
  const rx = head.rx + Math.max(0, finite(particle.r));
  const ry = head.ry + Math.max(0, finite(particle.r));
  const invRx2 = 1 / (rx * rx);
  const invRy2 = 1 / (ry * ry);
  const local = (x, y) => ({ x: c * x + s * y, y: -s * x + c * y });
  const world = (x, y) => ({ x: c * x - s * y, y: s * x + c * y });
  const start = local(finite(particle.prevX, particle.x) - (head.cx - hvx * dt),
    finite(particle.prevY, particle.y) - (head.cy - hvy * dt));
  const end = local(particle.x - head.cx, particle.y - head.cy);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const startQ = start.x * start.x * invRx2 + start.y * start.y * invRy2;
  const inside = startQ < 1;
  let hitT;
  let qx;
  let qy;

  if (inside) {
    hitT = 0;
    if (startQ > 1e-12) {
      const scale = 1 / Math.sqrt(startQ);
      qx = start.x * scale;
      qy = start.y * scale;
    } else {
      // At the exact center, choose the escape direction already being travelled.
      const relative = local(finite(particle.vx) - hvx, finite(particle.vy) - hvy);
      const length = Math.sqrt(relative.x * relative.x * invRx2 + relative.y * relative.y * invRy2);
      qx = length > 1e-9 ? relative.x / length : 0;
      qy = length > 1e-9 ? relative.y / length : -ry;
    }
  } else {
    const a = dx * dx * invRx2 + dy * dy * invRy2;
    if (a < 1e-14) return false;
    const b = 2 * (start.x * dx * invRx2 + start.y * dy * invRy2);
    const discriminant = b * b - 4 * a * (startQ - 1);
    if (discriminant < 0) return false;
    const entry = (-b - Math.sqrt(Math.max(0, discriminant))) / (2 * a);
    if (entry < -1e-8 || entry > 1) return false;
    hitT = clamp(entry, 0, 1);
    qx = start.x + dx * hitT;
    qy = start.y + dy * hitT;
  }

  const gradient = world(qx * invRx2, qy * invRy2);
  const normalLength = Math.hypot(gradient.x, gradient.y);
  if (normalLength < 1e-12) return false;
  const nx = gradient.x / normalLength;
  const ny = gradient.y / normalLength;
  const offset = world(qx, qy);
  const headAtHitX = head.cx - hvx * dt * (1 - hitT);
  const headAtHitY = head.cy - hvy * dt * (1 - hitT);
  const contactX = headAtHitX + offset.x;
  const contactY = headAtHitY + offset.y;
  const relativeVx = finite(particle.vx) - hvx;
  const relativeVy = finite(particle.vy) - hvy;
  const normalVelocity = relativeVx * nx + relativeVy * ny;
  const incoming = normalVelocity < -1e-6;

  if (incoming) {
    particle.vx = relativeVx - (1 + restitution) * normalVelocity * nx + hvx;
    particle.vy = relativeVy - (1 + restitution) * normalVelocity * ny + hvy;
    limitVelocity(particle, maxSpeed);
    particle.x = contactX + nx * EPSILON + particle.vx * dt * (1 - hitT);
    particle.y = contactY + ny * EPSILON + particle.vy * dt * (1 - hitT);
    particle.bounces = finite(particle.bounces) + 1;
    particle.lastCollision = { x: contactX, y: contactY, normalX: nx, normalY: ny, kind: particle.kind };
  } else if (inside) {
    // Use the current center, so head motion does not leave the corrected point inside.
    particle.x = head.cx + offset.x + nx * EPSILON;
    particle.y = head.cy + offset.y + ny * EPSILON;
  } else {
    return false;
  }

  // A velocity cap or tracking shape change can leave residual penetration.
  const final = local(particle.x - head.cx, particle.y - head.cy);
  const finalQ = final.x * final.x * invRx2 + final.y * final.y * invRy2;
  if (finalQ < 1) {
    particle.x = head.cx + offset.x + nx * EPSILON;
    particle.y = head.cy + offset.y + ny * EPSILON;
  }
  return incoming;
}

export class PhysicsEngine {
  constructor({ width = 640, height = 480, maxParticles = 400, random = Math.random, maxSpeed = 1100 } = {}) {
    this.width = Math.max(1, finite(width, 640));
    this.height = Math.max(1, finite(height, 480));
    this.maxParticles = clamp(Math.floor(finite(maxParticles, 400)), 1, 2000);
    this.maxSpeed = Math.max(1, finite(maxSpeed, 1100));
    this.random = typeof random === 'function' ? random : Math.random;
    this.particles = [];
    this.lastCollisions = [];
    this.collisionCount = 0;
    this.nextId = 1;
    this.rainRemainder = 0;
  }

  resize(width, height) {
    this.width = Math.max(1, finite(width, this.width));
    this.height = Math.max(1, finite(height, this.height));
  }

  clear() {
    this.particles.length = 0;
    this.lastCollisions.length = 0;
    this.collisionCount = 0;
    this.rainRemainder = 0;
  }

  addParticle(properties) {
    if (this.particles.length >= this.maxParticles) return false;
    const particle = {
      id: this.nextId++, kind: 'spark', x: 0, y: 0, vx: 0, vy: 0,
      r: 2, age: 0, life: 2, color: '#ffdb7a', alpha: 1, bounces: 0,
      ...properties,
    };
    particle.prevX = particle.x;
    particle.prevY = particle.y;
    limitVelocity(particle, this.maxSpeed);
    this.particles.push(particle);
    return true;
  }

  spawnBurst({ x = this.width / 2, y = this.height * 0.25,
    count = 80, colors = PALETTE, speed = 270, variation = null } = {}) {
    const palette = Array.isArray(colors) && colors.length ? colors : PALETTE;
    const requested=clamp(Math.floor(finite(count,80)),0,500);
    // If the bounded particle pool is busy, build a proportional miniature
    // of the complete pattern. Otherwise 'double' can lose its entire inner
    // wave because the outer wave fills the remaining slots first.
    // Opposed radial pairs must stay complete even under particle pressure.
    // An odd or half-truncated burst otherwise leaves one side unmatched.
    const available=Math.min(requested,Math.max(0,this.maxParticles-this.particles.length));
    const total=available-available%2;
    const styles=['peony','chrysanthemum','willow','ring','strobe','double'];
    const pattern=styles.includes(variation?.pattern)?variation.pattern:'peony';
    // The current product direction is front-only: every burst stays visible
    // in front of the subject and remains eligible for real face collisions.
    const depth='front';
    const size=['S','M','L','XL'].includes(variation?.size)?variation.size:'M';
    const scale=clamp(finite(variation?.scale,1),.62,1.56);
    const scheme=variation?.pattern?
      fireworkPaletteFor(pattern,variation?.theme||'gold'):null;
    const rotation=this.random()*TAU;
    const outerCount=pattern==='double'
      ?Math.min(total,2*Math.round(total*.58/2)):total;
    const innerCount=total-outerCount;
    const pairedSeeds={main:[],outer:[],inner:[]};
    let spawned = 0;
    for (let i = 0; i < total && this.particles.length < this.maxParticles; i += 1) {
      // Previous double blossoms gave the OUTER half the first 58% of the
      // circle and the INNER half the last 42%: each layer was an incomplete
      // arc, producing an ugly left/right split. Every layer now spans its
      // OWN full circle using opposite, matched radial pairs.
      const secondary=pattern==='double'&&i>=outerCount;
      const layer=pattern==='double'?(secondary?'inner':'outer'):'main';
      const layerCount=secondary?innerCount:outerCount;
      const localIndex=secondary?i-outerCount:i;
      const pairCount=Math.max(1,Math.ceil(layerCount/2));
      const pairIndex=localIndex%pairCount;
      const opposite=localIndex>=pairCount;
      let paired=pairedSeeds[layer][pairIndex];
      if(!paired){
        paired={
          angular:(this.random()-.5)*.052,
          radial:(this.random()-.5),
          speed:(this.random()-.5)*.12,
          radius:this.random(),life:this.random(),tint:this.random(),
          shimmer:this.random()*TAU,hz:this.random()
        };
        pairedSeeds[layer][pairIndex]=paired;
      }
      let angle=rotation+Math.PI*(pairIndex+.5)/pairCount+
        paired.angular+(opposite?Math.PI:0)+(secondary?.11:0);
      // V9.8: lift the silhouette of every pattern, not only the XL class.
      // Independent shells still preserve the peony's depth and negative space.
      let shell=[.36,.53,.72,.91,1.10,1.24][pairIndex%6];
      let vyScale=1;
      let trailScale=1;
      let gravityScale=1,dragScale=1;
      let delay=0;
      let sparkRole=pairIndex%9===0?'comet':pairIndex%4===0?'dust':'ember';
      // Each pattern changes the actual particle velocities, not merely the
      // renderer's palette or the number of repeated circular particles.
      if(pattern==='chrysanthemum'){
        shell=.81+(pairIndex%8)*.058;       // evenly balanced strands
        sparkRole=pairIndex%5===0?'comet':'ember';
        trailScale=1.54;gravityScale=.89;
      }else if(pattern==='willow'){
        shell=.72+(pairIndex%5)*.13;
        sparkRole=pairIndex%3===0?'comet':'ember';
        trailScale=1.95;gravityScale=1.58;dragScale=.76;
        // Starts as a balanced round bloom, then gravity forms hanging willow.
      }else if(pattern==='ring'){
        shell=1.06+paired.radial*.058;        // circular, not squashed oval
        sparkRole=pairIndex%8===0?'comet':'ember';
        trailScale=.76;gravityScale=.77;
      }else if(pattern==='strobe'){
        // Eight opposed rays instead of seven uneven sector groups.
        const spoke=pairIndex%4;
        angle=rotation+spoke*TAU/8+paired.angular*2.2+
          (opposite?Math.PI:0);
        shell=.61+(Math.floor(pairIndex/4)%5)*.15;
        sparkRole=pairIndex%3===0?'dust':'ember';
        trailScale=.55;gravityScale=1.08;
      }else if(pattern==='double'){
        shell=secondary?.60+(pairIndex%4)*.08:1.02+(pairIndex%5)*.05;
        delay=secondary?.18+(pairIndex%3)*.015:0;
        sparkRole=pairIndex%7===0?'comet':'ember';
        trailScale=secondary?.86:1.22;
        gravityScale=secondary?.85:1.06;
      }
      const velocity=Math.max(0,finite(speed,270))*scale*shell*
        (1+paired.speed);
      // Independently distribute visibly different star sizes inside EACH
      // explosion: a few bold hero sparks, many mid-sized stars and smaller
      // scattered dust. Size is not synonymous with the firework's overall
      // S/M/L/XL spread, and never requires spawning extra particles.
      const tierIndex=pairIndex%15;
      // ~13% large hero stars, ~27% small glitter, remainder main structure.
      const sparkTier=tierIndex===0||tierIndex===8?'hero':
        ([2,6,11,13].includes(tierIndex)?'fine':'body');
      const rBase=sparkTier==='hero'?2.10+paired.radius*.95:
        sparkTier==='fine'?.38+paired.radius*.42:
        1.02+paired.radius*.65;
      // Tiny intra-pair variation preserves organic stars without creating
      // differently-sized halves of an otherwise circular explosion.
      const r=rBase*(size==='XL'?1.12:size==='S'?.93:1)*
        (opposite?1.012:.988);
      const lifeBase=sparkRole==='comet'?1.42+paired.life*.8:
        sparkRole==='dust'?.95+paired.life*.58:1.25+paired.life*.85;
      const life=lifeBase*(pattern==='willow'?1.28:pattern==='strobe'?.79:1)*
        (sparkTier==='hero'?1.10:sparkTier==='fine'?.81:1);
      const colorPool=scheme?
        (layer==='inner'?scheme.inner:scheme.primary):palette;
      const tintPick=paired.tint;
      const colorIndex=tintPick<.48?0:tintPick<.76?1:tintPick<.92?2:3;
      const color=colorPool[colorIndex%colorPool.length];
      const luminance=sparkTier==='hero'?1.27:
        sparkTier==='fine'?.67:1.02;
      if (this.addParticle({
        kind:'spark',sparkRole,sparkTier,pattern,burstSize:size,
        burstLayer:layer,depth,pairIndex,opposite,
        x:finite(x),y:finite(y),
        vx:Math.cos(angle)*velocity,
        vy:Math.sin(angle)*velocity*vyScale,
        r,life,age:-delay,alpha:delay>0?0:1,brightness:luminance,
        trailScale,gravityScale,dragScale,
        shimmerPhase:paired.shimmer,
        shimmerHz:pattern==='strobe'?18+paired.hz*13:7+paired.hz*6,
        color,
      })) spawned += 1;
    }
    return spawned;
  }

  update(deltaSeconds, head = null, rainLevel = 0) {
    this.lastCollisions.length = 0;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    // Cap catch-up after backgrounding; callers should pause capture/render loops too.
    const dt = Math.min(deltaSeconds, 0.1);
    const rain = clamp(finite(rainLevel), 0, 1);
    // Keep a guaranteed headroom for laugh-triggered fireworks even after a
    // long smile, instead of letting rain saturate the entire particle pool.
    const reserved = Math.min(132, Math.floor(this.maxParticles * .4));
    const rainCapacity = Math.max(1, this.maxParticles - reserved);
    this.rainRemainder = rain > 0 ? this.rainRemainder + 165 * rain * dt : 0;
    let rainCount = 0;
    for (const p of this.particles) if (p.kind === 'rain') rainCount++;
    while (this.rainRemainder >= 1) {
      this.rainRemainder -= 1;
      if (rainCount >= rainCapacity)continue;
      const fallSpeed = 335 + this.random() * 170;
      if (this.addParticle({
        kind: 'rain', x: this.random() * this.width, y: -12,
        vx: -18 + this.random() * 36, vy: fallSpeed, r: 1.1,
        life: this.height / fallSpeed + 1.2, color: '#b0dfff',
      })) rainCount++;
    }

    const collider = head && head.valid !== false ? { ...head, vx: finite(head.vx), vy: finite(head.vy) } : null;
    if (collider) limitVelocity(collider, 800);

    for (const p of this.particles) {
      let activeDt=dt;
      // Double-shell inner sparks remain invisible/inert until the secondary
      // wave; no phantom collisions can occur before those sparks appear.
      if(p.age<0){
        activeDt=Math.max(0,dt+p.age);
        if(activeDt===0){p.age+=dt;p.alpha=0;continue;}
        p.age=0;
      }
      const steps=Math.max(1,Math.ceil(activeDt/(1/60)));
      const step=activeDt/steps;
      const frameX = p.x;
      const frameY = p.y;
      for (let i = 0; i < steps; i += 1) {
        p.prevX = p.x;
        p.prevY = p.y;
        p.vy += (p.kind === 'rain' ? 420 : 235*clamp(finite(p.gravityScale,1),.5,2)) * step;
        const drag = Math.exp(-(p.kind === 'rain' ? 0.03 : 0.22*clamp(finite(p.dragScale,1),.4,2)) * step);
        p.vx *= drag;
        p.vy *= drag;
        limitVelocity(p, this.maxSpeed);
        p.x += p.vx * step;
        p.y += p.vy * step;
        // Only sparks genuinely in FRONT may physically impact the face.
        // Background sparks use person occlusion, not a phantom face collider.
        if (collider && p.kind === 'spark') {
          const remaining = activeDt - (i + 1) * step;
          const stepHead = { ...collider, cx: collider.cx - collider.vx * remaining, cy: collider.cy - collider.vy * remaining };
          if (reflectAgainstHead(p, stepHead, { dt: step, restitution: p.kind === 'rain' ? 0.18 : 0.62, maxSpeed: this.maxSpeed })) {
            this.lastCollisions.push(p.lastCollision);
            // Restart a short trail after reflection; otherwise the pre-impact
            // streak visually cuts through the face as a false collision.
            p.lastImpactAge=p.age+activeDt;
            this.collisionCount += 1;
          }
        }
      }
      p.prevX = frameX;
      p.prevY = frameY;
      p.age += activeDt;
      p.alpha = clamp((p.life - p.age) / Math.min(0.7, p.life), 0, 1);
    }
    // Compact in place: renderers may safely keep a reference to particles.
    let live = 0;
    for (const p of this.particles) {
      if (p.age < p.life && p.y < this.height + 80 && p.x > -160 && p.x < this.width + 160
          && Number.isFinite(p.x) && Number.isFinite(p.y)) this.particles[live++] = p;
    }
    this.particles.length = live;
  }
}
