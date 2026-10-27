import { app, desktopCapturer, screen, shell, systemPreferences } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { api, ApiError } from './api';

interface QueuedMeta {
  sessionId: string;
  projectId: string | null;
  takenAt: string;
  displayIndex: number;
}

export interface ShotContext {
  /** Returns the current session/project only while status is WORK, otherwise null. */
  getWorkContext(): { sessionId: string; projectId: string | null; serverOffsetMs: number } | null;
  onMetaChange(): void;
}

const queueDir = () => {
  const dir = path.join(app.getPath('userData'), 'screenshot-queue');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

export function screenPermission(): 'granted' | 'missing' | 'n/a' {
  if (process.platform !== 'darwin') return 'n/a';
  return systemPreferences.getMediaAccessStatus('screen') === 'granted' ? 'granted' : 'missing';
}

export function openScreenPermissionSettings() {
  return shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  );
}

export function queuedCount() {
  return fs.readdirSync(queueDir()).filter((f) => f.endsWith('.json')).length;
}

/**
 * One screenshot at a random moment inside every interval window. Windows are anchored to
 * the moment work (re)starts — clock in, resume from break, or return from idle.
 */
export class ScreenshotScheduler {
  private windowTimer?: NodeJS.Timeout;
  private shotTimer?: NodeJS.Timeout;
  private retryTimer?: NodeJS.Timeout;
  private flushing = false;
  private intervalSec = 600;

  constructor(private ctx: ShotContext) {
    this.retryTimer = setInterval(() => void this.flushQueue(), 60_000);
  }

  get running() {
    return this.windowTimer !== undefined;
  }

  start(intervalSec: number) {
    this.stop();
    this.intervalSec = intervalSec;
    this.scheduleWindow(Date.now());
  }

  /** Called when settings change; restarts windows only if the interval actually changed. */
  updateInterval(intervalSec: number) {
    if (this.running && intervalSec !== this.intervalSec) this.start(intervalSec);
  }

  stop() {
    clearTimeout(this.windowTimer);
    clearTimeout(this.shotTimer);
    this.windowTimer = this.shotTimer = undefined;
  }

  private scheduleWindow(windowStart: number) {
    const ms = this.intervalSec * 1000;
    const shotAt = windowStart + Math.random() * ms;
    this.shotTimer = setTimeout(() => void this.capture(), Math.max(0, shotAt - Date.now()));
    this.windowTimer = setTimeout(() => this.scheduleWindow(windowStart + ms), windowStart + ms - Date.now());
  }

  private async capture() {
    const work = this.ctx.getWorkContext();
    if (!work) return;

    if (screenPermission() === 'missing') {
      // Asking for sources triggers the macOS permission prompt the first time. Without the
      // permission macOS only returns the wallpaper, so nothing is saved.
      await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }).catch(() => {});
      this.ctx.onMetaChange();
      return;
    }

    const displays = screen.getAllDisplays();
    const maxW = Math.max(...displays.map((d) => d.size.width * d.scaleFactor));
    const maxH = Math.max(...displays.map((d) => d.size.height * d.scaleFactor));
    const scale = Math.min(1, 1920 / maxW);
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(maxW * scale), height: Math.round(maxH * scale) },
    });

    // Re-check: the user may have gone on break while we were capturing.
    const still = this.ctx.getWorkContext();
    if (!still || still.sessionId !== work.sessionId) return;

    const takenAt = new Date(Date.now() + work.serverOffsetMs).toISOString();
    sources.forEach((source, displayIndex) => {
      if (source.thumbnail.isEmpty()) return;
      const base = path.join(queueDir(), `${Date.now()}_${displayIndex}`);
      fs.writeFileSync(`${base}.jpg`, source.thumbnail.toJPEG(60));
      const meta: QueuedMeta = { sessionId: work.sessionId, projectId: work.projectId, takenAt, displayIndex };
      fs.writeFileSync(`${base}.json`, JSON.stringify(meta));
    });
    await this.flushQueue();
  }

  /** Uploads queued shots oldest-first. Network/server errors leave the file for the next retry. */
  async flushQueue() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const dir = queueDir();
      const metas = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
      for (const metaFile of metas) {
        const base = path.join(dir, metaFile.replace(/\.json$/, ''));
        if (!fs.existsSync(`${base}.jpg`)) {
          fs.rmSync(`${base}.json`, { force: true });
          continue;
        }
        const meta = JSON.parse(fs.readFileSync(`${base}.json`, 'utf8')) as QueuedMeta;
        const form = new FormData();
        form.append('file', new Blob([fs.readFileSync(`${base}.jpg`)], { type: 'image/jpeg' }), 'shot.jpg');
        form.append('sessionId', meta.sessionId);
        if (meta.projectId) form.append('projectId', meta.projectId);
        form.append('takenAt', meta.takenAt);
        form.append('displayIndex', String(meta.displayIndex));
        try {
          await api('POST', '/screenshots', form);
        } catch (e) {
          const status = e instanceof ApiError ? e.status : 0;
          const retryable = status === 0 || status === 401 || status === 429 || status >= 500;
          if (retryable) break;
          // Rejected for good (e.g. falls inside a backdated idle period) — drop it.
          console.warn(`[screenshots] dropped ${metaFile}: ${(e as Error).message}`);
        }
        fs.rmSync(`${base}.json`, { force: true });
        fs.rmSync(`${base}.jpg`, { force: true });
      }
    } catch (e) {
      console.error('[screenshots] flush failed', e);
    } finally {
      this.flushing = false;
      this.ctx.onMetaChange();
    }
  }
}
