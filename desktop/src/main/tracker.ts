import { powerMonitor } from 'electron';
import type { AppMeta, Status, TimerState } from '../shared/types';
import { api, isNetworkError } from './api';
import { ScreenshotScheduler, queuedCount, screenPermission } from './screenshots';

const IDLE_CHECK_MS = 10_000;
// While idle we look more often so the return to work is picked up quickly.
const RESUME_CHECK_MS = 2_000;
const HEARTBEAT_MS = 30_000;

type Listener = {
  state(state: TimerState): void;
  meta(meta: AppMeta): void;
};

/**
 * Owns the timer state on the desktop: applies server responses, runs idle detection,
 * drives the screenshot scheduler and keeps the server heartbeat going.
 */
export class Tracker {
  state: TimerState | null = null;
  online = true;
  /** serverTime - localTime, so client-measured moments can be sent in server time. */
  private serverOffsetMs = 0;
  private busy = false;
  private timers: NodeJS.Timeout[] = [];
  private shots: ScreenshotScheduler;

  constructor(private listener: Listener) {
    this.shots = new ScreenshotScheduler({
      getWorkContext: () =>
        this.state?.status === 'WORK' && this.state.session
          ? {
              sessionId: this.state.session.id,
              projectId: this.state.current?.projectId ?? null,
              serverOffsetMs: this.serverOffsetMs,
            }
          : null,
      onMetaChange: () => this.emitMeta(),
    });
  }

  get status(): Status {
    return this.state?.status ?? 'OFF';
  }

  start() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.timers.push(
      setInterval(() => void this.checkIdle(false), IDLE_CHECK_MS),
      setInterval(() => void this.checkIdle(true), RESUME_CHECK_MS),
      setInterval(() => void this.heartbeat(), HEARTBEAT_MS),
    );
    void this.shots.flushQueue();
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.shots.stop();
  }

  reset() {
    this.stop();
    this.state = null;
  }

  apply(next: TimerState) {
    const prevStatus = this.status;
    this.state = next;
    this.serverOffsetMs = Date.parse(next.serverNow) - Date.now();
    this.online = true;

    if (next.status === 'WORK' && prevStatus !== 'WORK') {
      this.shots.start(next.settings.screenshotIntervalSec);
    } else if (next.status !== 'WORK') {
      this.shots.stop();
    } else {
      this.shots.updateInterval(next.settings.screenshotIntervalSec);
    }

    this.listener.state(next);
    this.emitMeta();
  }

  emitMeta() {
    this.listener.meta({
      online: this.online,
      screenPermission: screenPermission(),
      queuedScreenshots: queuedCount(),
    });
  }

  async refresh() {
    const state = await this.call(() => api<TimerState>('GET', '/timer/state'));
    return state;
  }

  async action(action: string, body: Record<string, unknown> = {}) {
    return this.call(() => api<TimerState>('POST', `/timer/${action}`, body));
  }

  private async call(fn: () => Promise<TimerState>) {
    try {
      const state = await fn();
      this.apply(state);
      void this.shots.flushQueue();
      return state;
    } catch (e) {
      if (isNetworkError(e)) {
        this.online = false;
        this.emitMeta();
      }
      throw e;
    }
  }

  private async heartbeat() {
    try {
      if (this.state?.session) await this.action('heartbeat');
      else await this.refresh();
    } catch {
      /* reported through meta.online */
    }
  }

  private async checkIdle(resumeCheck: boolean) {
    const state = this.state;
    if (!state || this.busy) return;
    const { idleThresholdSec, autoClockOutSec } = state.settings;
    const idleSec = powerMonitor.getSystemIdleTime();

    this.busy = true;
    try {
      if (!resumeCheck && state.status === 'WORK' && idleSec >= idleThresholdSec) {
        const idleSince = new Date(Date.now() + this.serverOffsetMs - idleSec * 1000);
        console.log(`[idle] no input for ${idleSec}s → IDLE since ${idleSince.toISOString()}`);
        await this.action('idle-start', { idleSince: idleSince.toISOString() });
      } else if (resumeCheck && state.status === 'IDLE') {
        if (idleSec < idleThresholdSec) {
          console.log('[idle] input resumed → WORK');
          await this.action('idle-end');
        } else if (idleSec >= autoClockOutSec) {
          console.log('[idle] idle limit reached → auto clock-out');
          await this.action('idle-timeout');
        }
      }
    } catch (e) {
      console.warn('[idle]', (e as Error).message);
      // Our view may be stale (e.g. the server already auto clocked us out).
      await this.refresh().catch(() => {});
    } finally {
      this.busy = false;
    }
  }
}
