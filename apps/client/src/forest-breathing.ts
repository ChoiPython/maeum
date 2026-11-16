import type { BreathingStatus, BreathingView } from '../../../shared/contracts.js';
import { settings } from '../../../shared/runtime.js';

const { breathingDurationMs, visualPulsePeriodMs } = settings.activities;

export class ForestBreathing implements BreathingView {
  status: BreathingStatus = 'idle';
  elapsedMs = 0;
  private lastTick = 0;
  private lightSentAt: number | null = null;

  get lightJourney(): number | null {
    if (this.lightSentAt === null || this.status !== 'running') return null;
    const journey = (this.elapsedMs - this.lightSentAt) / 3200;
    return journey < 1 ? journey : null;
  }

  offerLight() {
    if (this.status === 'running' && this.lightJourney === null) this.lightSentAt = this.elapsedMs;
  }

  get progress() { return this.elapsedMs / breathingDurationMs; }
  get phase() { return this.elapsedMs % visualPulsePeriodMs / visualPulsePeriodMs; }
  get light() { return (1 - Math.cos(this.phase * Math.PI * 2)) / 2; }

  start(now: number) {
    this.lightSentAt = null;
    this.elapsedMs = 0;
    this.status = 'running';
    this.lastTick = now;
  }

  advance(now: number) {
    if (this.status !== 'running') return;
    this.elapsedMs = Math.min(breathingDurationMs, this.elapsedMs + Math.max(0, now - this.lastTick));
    this.lastTick = now;
    if (this.elapsedMs === breathingDurationMs) this.status = 'completed';
  }

  pause(now: number) {
    this.advance(now);
    if (this.status === 'running') this.status = 'paused';
  }

  resume(now: number) {
    if (this.status !== 'paused') return;
    this.lastTick = now;
    this.status = 'running';
  }

  skip(now: number) {
    this.advance(now);
    if (this.status !== 'completed') this.status = 'skipped';
  }

  reset() {
    this.lightSentAt = null;
    this.status = 'idle';
    this.elapsedMs = 0;
    this.lastTick = 0;
  }
}
