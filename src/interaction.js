/**
 * Visual expression controls, not emotion or audio recognition.
 * Scores are expected in [0, 1]; all timestamps and durations are milliseconds.
 * Thresholds are demo starting points: calibrate against the actual camera user.
 */
import {LaughTemporalEvidence} from './laugh-temporal.js';
const DEFAULTS = Object.freeze({
  smileOn: 0.32,
  smileOff: 0.23,
  laughSmileOn: 0.64,
  laughSmileOff: 0.42,
  jawOn: 0.28,
  jawOff: 0.16,
  smoothingMs: 45,
  sustainMs: 130,
  cooldownMs: 1200,
  rearmMs: 200,
  faceLossMs: 250,
});

const clamp01 = (value) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

export class ExpressionController {
  constructor(options = {}) {
    this.options = { ...DEFAULTS };
    this.temporal=new LaughTemporalEvidence();
    this.experimentalTemporal=true;
    this.temporalSupported=false;
    this.configure(options);
    this.reset();
  }
  setTemporalEnabled(enabled){
    this.experimentalTemporal=Boolean(enabled);
    this.temporal.reset();
    this.temporalSupported=false;
    this.candidate=null;
    this.candidateSince=null;
    return this;
  }

  configure(partial = {}) {
    const next = { ...this.options };
    for (const key of Object.keys(DEFAULTS)) {
      if (Object.hasOwn(partial, key)) {
        const value = partial[key];
        if (!Number.isFinite(value) || value < 0) throw new RangeError(`Invalid ${key}`);
        next[key] = value;
      }
    }
    for (const key of ['smileOn', 'smileOff', 'laughSmileOn', 'laughSmileOff', 'jawOn', 'jawOff']) {
      if (next[key] > 1) throw new RangeError(`${key} must be in [0, 1]`);
    }
    if (next.smileOff >= next.smileOn || next.laughSmileOff >= next.laughSmileOn || next.jawOff >= next.jawOn) {
      throw new RangeError('Exit thresholds must be lower than entry thresholds');
    }
    this.options = next;
    return this;
  }

  reset() {
    this.temporal.reset();
    this.temporalSupported=false;
    this.state = 'no-face';
    this.filters = { smile: 0, jaw: 0, lipGap: 0 };
    this.armed = true;
    this.lastTimestamp = null;
    this.lastFaceAt = null;
    this.lastBurstAt = -Infinity;
    this.candidate = null;
    this.candidateSince = null;
    this.rearmSince = null;
    this.wasLost = false;
    return this;
  }

  snapshot(reason = 'idle', burst = false) {
    const { smileOff, laughSmileOn } = this.options;
    const strength = clamp01((this.filters.smile - smileOff) / Math.max(0.01, laughSmileOn - smileOff));
    // Only visual face motion is available. This is not laughter sound volume.
    // Jaw opening dominates intensity; smiling and observed lip aperture refine it.
    const visualIntensity=this.state==='laugh'?clamp01(
      .58*clamp01((this.filters.jaw-.19)/.32)+
      .26*clamp01((this.filters.smile-.55)/.4)+
      .16*clamp01((this.filters.lipGap-.12)/.22)
    ):0;
    return {
      state: this.state,
      rainLevel: this.state === 'smile' ? 0.3 + 0.7 * strength : 0,
      burst,
      visualIntensity,
      temporalEnabled:this.experimentalTemporal,
      temporalSupported:this.temporalSupported,
      reason,
      filters: { ...this.filters },
      armed: this.armed,
    };
  }

  update({ smile = 0, jaw = 0, lipGap = 0, hasFace = false, timestamp } = {}) {
    const now = Number.isFinite(timestamp) ? timestamp : (globalThis.performance?.now() ?? Date.now());
    if (this.lastTimestamp !== null && now <= this.lastTimestamp) return this.snapshot('stale-frame');
    const dt = this.lastTimestamp === null ? 0 : now - this.lastTimestamp;
    this.lastTimestamp = now;
    const o = this.options;

    if (!hasFace) {
      this.temporal.reset();
      this.temporalSupported=false;
      // Do not count a detection gap towards a pending expression or rearm dwell.
      this.candidate = null;
      this.candidateSince = null;
      this.rearmSince = null;
      if (this.lastFaceAt !== null && now - this.lastFaceAt < o.faceLossMs) {
        return this.snapshot('tracking-grace');
      }
      if (this.lastFaceAt !== null) {
        this.armed = false;
        this.wasLost = true;
      }
      this.state = 'no-face';
      this.filters = { smile: 0, jaw: 0, lipGap: 0 };
      return this.snapshot('face-lost');
    }

    const firstSample = this.lastFaceAt === null || this.state === 'no-face';
    // A long unreported gap is also a loss; an old pose must not trigger a burst.
    if (this.lastFaceAt !== null && now - this.lastFaceAt >= o.faceLossMs) {
      this.temporal.reset();
      this.temporalSupported=false;
      this.armed = false;
      this.wasLost = true;
      this.candidate = null;
      this.candidateSince = null;
      this.rearmSince = null;
    }
    this.lastFaceAt = now;
    const alpha = firstSample || o.smoothingMs === 0 ? 1 : 1 - Math.exp(-dt / o.smoothingMs);
    this.filters.smile += alpha * (clamp01(smile) - this.filters.smile);
    this.filters.jaw += alpha * (clamp01(jaw) - this.filters.jaw);
    this.filters.lipGap += alpha * (clamp01(lipGap) - this.filters.lipGap);
    const s = this.filters.smile;
    const j = this.filters.jaw;
    const g = this.filters.lipGap;
    const temporal=this.experimentalTemporal?this.temporal.update({
      // Shadow replay was measured on actual per-prediction scores. Temporal
      // voting already de-noises two separated frames, so double smoothing
      // here would erase the brief but real laugh we are trying to recover.
      timestamp:now,hasFace:true,
      smile:clamp01(smile),jaw:clamp01(jaw),lipGap:clamp01(lipGap)
    }):{supported:false};
    this.temporalSupported=temporal.supported;

    // Visible teeth or a very strong smile alone are STILL a smile. Fireworks
    // need both a smile and a distinctly open laughing mouth, held over time.
    // A wide-jaw route supports different face geometry; talking/yawning
    // without smiling is explicitly excluded.
    const standardLaugh = s >= o.laughSmileOn && j >= o.jawOn;
    const wideMouthLaugh = s >= Math.max(.48, o.smileOn + .15) &&
      j >= Math.max(.41, o.jawOn * 1.45);
    // A very broad grin can expose teeth while the lips remain relatively
    // close. The additional *landmark aperture* gate allows clearly open
    // laughter to start before the jawOpen coefficient crosses its old .28
    // threshold; it does not classify an ordinary toothy grin as laughter.
    const visualOpenLaugh =
      s >= Math.max(.70, o.laughSmileOn-.01) &&
      j >= Math.max(.18, o.jawOn-.10) && g >= .20;
    const laughOn = standardLaugh || wideMouthLaugh || visualOpenLaugh ||
      this.temporalSupported;
    const holdLaugh = this.state === 'laugh' && s >= o.laughSmileOff && j >= o.jawOff;
    const smileThreshold = this.state === 'smile' || this.state === 'laugh' ? o.smileOff : o.smileOn;
    const target = laughOn || holdLaugh ? 'laugh' : s >= smileThreshold ? 'smile' : 'neutral';

    // Rearm after a confirmed laugh exit, including returning to an ordinary smile.
    // Sustained laughter cannot rearm; a tracking gap cannot count toward the dwell.
    if (!this.armed && target !== 'laugh' && j < o.jawOff) {
      if (this.rearmSince === null) this.rearmSince = now;
      if (now - this.rearmSince >= o.rearmMs) {
        this.armed = true;
        this.wasLost = false;
      }
    } else {
      this.rearmSince = null;
    }

    let burst = false;
    let reason = this.wasLost ? 'recovered-await-exit' : `${this.state}-held`;
    if (target === this.state) {
      this.candidate = null;
      this.candidateSince = null;
    } else {
      if (this.candidate !== target) {
        this.candidate = target;
        this.candidateSince = now;
      }
      const safeInitialNeutral = this.state === 'no-face' && target === 'neutral';
      // Slightly faster laugh confirmation without accepting 50–100ms noise.
      // Two separate, valid video frames already spaced >=115ms provide the
      // dwell evidence for the optional temporal route. Do not wait ANOTHER
      // 115ms and lose a head-lean laugh to one fluctuating blendshape.
      const confirmMs=target==='laugh'
        ?(this.temporalSupported?0:Math.min(o.sustainMs,115))
        :o.sustainMs;
      if (safeInitialNeutral || now - this.candidateSince >= confirmMs) {
        this.state = target;
        this.candidate = null;
        this.candidateSince = null;
        reason = `${target}-enter`;
        if (target === 'laugh') {
          const cooled = now - this.lastBurstAt >= o.cooldownMs;
          burst = this.armed && cooled;
          reason = burst ? 'laugh-burst' : this.armed ? 'cooldown' : 'await-exit';
          // Consume every entry, including an entry during cooldown; no delayed burst.
          this.armed = false;
          this.rearmSince = null;
          if (burst) this.lastBurstAt = now;
        }
      } else {
        reason = `pending-${target}`;
      }
    }
    return this.snapshot(reason, burst);
  }
}

export { DEFAULTS as EXPRESSION_DEFAULTS };
