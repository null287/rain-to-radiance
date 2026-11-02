import test from 'node:test';
import assert from 'node:assert/strict';
import { ExpressionController } from '../src/interaction.js';
import { PhysicsEngine, reflectAgainstHead } from '../src/physics.js';

function feed(controller, start, end, scores, every = 20) {
  const results = [];
  for (let timestamp = start; timestamp <= end; timestamp += every) {
    results.push(controller.update({ hasFace: true, ...scores, timestamp }));
  }
  return results;
}

function controller(options = {}) {
  return new ExpressionController({ smoothingMs: 0, ...options });
}

test('neutral and talking/open mouth never produce rain or firework events', () => {
  const c = controller();
  const neutral = feed(c, 0, 500, { smile: 0.08, jaw: 0.05 });
  const talking = feed(c, 520, 1600, { smile: 0.12, jaw: 0.85 });
  assert.equal(neutral.at(-1).state, 'neutral');
  assert.ok([...neutral, ...talking].every((r) => !r.burst && r.rainLevel === 0));
});

test('smile has a dwell and generates sustained rain without a firework', () => {
  const c = controller();
  feed(c, 0, 100, { smile: 0.05, jaw: 0.05 });
  assert.equal(c.update({ smile: 0.5, jaw: 0.1, hasFace: true, timestamp: 120 }).state, 'neutral');
  const results = feed(c, 140, 600, { smile: 0.5, jaw: 0.1 });
  assert.equal(results.at(-1).state, 'smile');
  assert.ok(results.at(-1).rainLevel > 0);
  assert.ok(results.every((r) => !r.burst));
});

test('smile hysteresis prevents threshold flicker', () => {
  const c = controller();
  feed(c, 0, 200, { smile: 0.4, jaw: 0.05 });
  const middle = feed(c, 220, 600, { smile: 0.27, jaw: 0.05 });
  assert.ok(middle.every((r) => r.state === 'smile'));
  assert.equal(feed(c, 620, 1000, { smile: 0.15, jaw: 0.05 }).at(-1).state, 'neutral');
});

test('a sustained laugh emits exactly one burst and suppresses rain', () => {
  const c = controller();
  feed(c, 0, 100, { smile: 0.05, jaw: 0.04 });
  const results = feed(c, 120, 4000, { smile: 0.85, jaw: 0.55 });
  assert.equal(results.filter((r) => r.burst).length, 1);
  assert.equal(results.at(-1).state, 'laugh');
  assert.equal(results.at(-1).rainLevel, 0);
  assert.equal(results.at(-1).armed, false);
});

test('brief expression spikes do not trigger', () => {
  const c = controller();
  feed(c, 0, 100, { smile: 0.05, jaw: 0.04 });
  const spike = feed(c, 120, 220, { smile: 0.9, jaw: 0.9 });
  const recover = feed(c, 240, 600, { smile: 0.05, jaw: 0.04 });
  assert.ok([...spike, ...recover].every((r) => !r.burst));
  assert.equal(recover.at(-1).state, 'neutral');
});

test('cooldown entry is consumed, and only a later relaxed/rearmed laugh can burst', () => {
  const c = controller();
  assert.equal(feed(c, 0, 220, { smile: 0.9, jaw: 0.5 }).filter((r) => r.burst).length, 1);
  feed(c, 240, 520, { smile: 0.05, jaw: 0.04 });
  const tooSoon = feed(c, 540, 1700, { smile: 0.9, jaw: 0.5 });
  assert.ok(tooSoon.every((r) => !r.burst));
  feed(c, 1720, 2020, { smile: 0.05, jaw: 0.04 });
  const again = feed(c, 2040, 2400, { smile: 0.9, jaw: 0.5 });
  assert.equal(again.filter((r) => r.burst).length, 1);
});

test('face-loss grace expires and recovery cannot replay an old laugh', () => {
  const c = controller();
  feed(c, 0, 300, { smile: 0.9, jaw: 0.5 });
  assert.equal(c.update({ hasFace: false, timestamp: 400 }).state, 'laugh');
  const lost = c.update({ hasFace: false, timestamp: 560 });
  assert.equal(lost.state, 'no-face');
  assert.equal(lost.rainLevel, 0);
  assert.equal(lost.armed, false);
  const returned = feed(c, 580, 1800, { smile: 0.9, jaw: 0.5 });
  assert.ok(returned.every((r) => !r.burst));
  feed(c, 1820, 2120, { smile: 0.05, jaw: 0.04 });
  assert.equal(feed(c, 2140, 2500, { smile: 0.9, jaw: 0.5 }).filter((r) => r.burst).length, 1);
});

test('a detection gap cannot count toward the expression dwell', () => {
  const c = controller();
  feed(c, 0, 100, { smile: 0.05, jaw: 0.04 });
  c.update({ hasFace: true, smile: 0.9, jaw: 0.5, timestamp: 120 });
  c.update({ hasFace: false, timestamp: 180 });
  const returned = c.update({ hasFace: true, smile: 0.9, jaw: 0.5, timestamp: 300 });
  assert.equal(returned.burst, false);
  assert.equal(returned.state, 'neutral');
});

test('out-of-order and invalid score data cannot introduce NaN or duplicate events', () => {
  const c = controller();
  feed(c, 0, 200, { smile: 0.1, jaw: 0.05 });
  const stale = c.update({ hasFace: true, smile: 1, jaw: 1, timestamp: 100 });
  assert.equal(stale.reason, 'stale-frame');
  assert.equal(stale.state, 'neutral');
  const invalid = c.update({ hasFace: true, smile: NaN, jaw: Infinity, timestamp: 220 });
  assert.equal(invalid.burst, false);
  assert.ok(Number.isFinite(invalid.filters.smile) && Number.isFinite(invalid.filters.jaw));
});

test('smoothing dampens a single noisy sample and reset clears all gesture history', () => {
  const c = new ExpressionController();
  feed(c, 0, 100, { smile: 0, jaw: 0 });
  const noisy = c.update({ hasFace: true, smile: 1, jaw: 1, timestamp: 120 });
  assert.ok(noisy.filters.smile > 0 && noisy.filters.smile < 0.5);
  assert.equal(noisy.burst, false);
  c.reset();
  assert.equal(feed(c, 0, 400, { smile: 0.9, jaw: 0.6 }).filter((r) => r.burst).length, 1);
});

const head = (overrides = {}) => ({ cx: 0, cy: 0, rx: 20, ry: 30, angle: 0, vx: 0, vy: 0, valid: true, ...overrides });
const particle = (overrides = {}) => ({ kind: 'spark', prevX: -50, prevY: 0, x: 50, y: 0, vx: 1000, vy: 0, r: 2, bounces: 0, ...overrides });
const outside = (p, h) => {
  const c = Math.cos(h.angle); const s = Math.sin(h.angle);
  const dx = p.x - h.cx; const dy = p.y - h.cy;
  const x = c * dx + s * dy; const y = -s * dx + c * dy;
  return (x / (h.rx + p.r)) ** 2 + (y / (h.ry + p.r)) ** 2 >= 1 - 1e-8;
};

test('continuous collision catches a fast particle even when both endpoints are outside', () => {
  const p = particle({ prevX: -100, x: 100, vx: 2000 });
  const h = head();
  assert.equal(reflectAgainstHead(p, h, { dt: 0.1, restitution: 0.6, maxSpeed: 2500 }), true);
  assert.ok(p.vx < 0 && p.x < -h.rx);
  assert.ok(outside(p, h));
  assert.equal(p.bounces, 1);
  assert.ok(p.lastCollision.normalX < -0.99);
});

test('outgoing boundary particles are not reflected again', () => {
  const p = particle({ prevX: -22, x: -32, vx: -100 });
  assert.equal(reflectAgainstHead(p, head(), { dt: 0.1 }), false);
  assert.equal(p.vx, -100);
  assert.equal(p.bounces, 0);
});

test('an inside outward particle is depenetrated without a false impact', () => {
  const p = particle({ prevX: 2, x: 7, vx: 50 });
  const h = head();
  assert.equal(reflectAgainstHead(p, h, { dt: 0.1 }), false);
  assert.ok(outside(p, h));
  assert.equal(p.vx, 50);
  assert.equal(p.bounces, 0);
});

test('moving head transfers velocity to a stationary particle using relative velocity', () => {
  const p = particle({ prevX: 25, x: 25, vx: 0, r: 0 });
  const h = head({ cx: 10, vx: 100 });
  assert.equal(reflectAgainstHead(p, h, { dt: 0.1, restitution: 0.6 }), true);
  assert.ok(p.vx > 100);
  assert.ok(outside(p, h));
});

test('rotated ellipse uses its own axes rather than an axis-aligned bounding box', () => {
  const p = particle({ prevX: -40, x: 40, vx: 800, r: 0 });
  const h = head({ rx: 50, ry: 10, angle: Math.PI / 2 });
  assert.equal(reflectAgainstHead(p, h, { dt: 0.1 }), true);
  assert.ok(Math.abs(p.lastCollision.x + 10) < 1e-6);
  assert.ok(outside(p, h));
});

test('invalid/no-face collider leaves particles unreflected', () => {
  const p = particle();
  assert.equal(reflectAgainstHead(p, head({ valid: false }), { dt: 0.1 }), false);
  assert.equal(p.vx, 1000);
  assert.equal(reflectAgainstHead(p, head({ rx: 0 }), { dt: 0.1 }), false);
});

test('particle speed cap remains enforced after moving-head impact', () => {
  const p = particle({ prevX: 25, x: 25, vx: 0, r: 0 });
  const h = head({ cx: 10, vx: 100 });
  reflectAgainstHead(p, h, { dt: 0.1, restitution: 1, maxSpeed: 90 });
  assert.ok(Math.hypot(p.vx, p.vy) <= 90 + 1e-9);
  assert.ok(outside(p, h));
});

test('engine reports per-frame contacts while keeping cumulative collision count', () => {
  const engine = new PhysicsEngine({ width: 640, height: 480, random: () => 0.5 });
  engine.addParticle({ kind: 'spark', x: 100, y: 200, vx: 1000, vy: 0, r: 2, life: 3 });
  engine.update(0.1, head({ cx: 170, cy: 200, rx: 25, ry: 40 }), 0);
  assert.ok(engine.lastCollisions.length >= 1);
  const count = engine.collisionCount;
  assert.equal(engine.lastCollisions[0].kind, 'spark');
  assert.ok(Number.isFinite(engine.lastCollisions[0].normalX));
  engine.update(0.01, null, 0);
  assert.equal(engine.lastCollisions.length, 0);
  assert.equal(engine.collisionCount, count);
});

test('particle cap, gravity, lifetime and clear prevent unbounded accumulation', () => {
  const engine = new PhysicsEngine({ width: 640, height: 480, maxParticles: 40, random: () => 0.5 });
  assert.equal(engine.spawnBurst({ x: 320, y: 100, count: 100, speed: 0 }), 40);
  const arrayReference = engine.particles;
  engine.update(0.05, null, 1);
  assert.equal(engine.particles.length, 40);
  assert.ok(engine.particles.every((p) => p.vy > 0));
  for (let i = 0; i < 80; i += 1) engine.update(0.05, null, 0);
  assert.equal(engine.particles.length, 0);
  assert.equal(engine.particles, arrayReference);
  engine.update(0.1, null, 1);
  assert.ok(engine.particles.length > 0 && engine.particles.every((p) => p.kind === 'rain'));
  engine.clear();
  assert.equal(engine.particles.length, 0);
  assert.equal(engine.collisionCount, 0);
});
