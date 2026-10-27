import { app, Menu, Tray, nativeImage } from 'electron';
import path from 'node:path';
import type { TimerState } from '../shared/types';

const LABELS = { OFF: 'Clocked out', WORK: 'Working', BREAK: 'On break', IDLE: 'Idle' } as const;

export function formatHMS(totalSec: number) {
  const s = Math.max(0, Math.floor(totalSec));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export class AppTray {
  private tray: Tray;
  private ticker: NodeJS.Timeout;
  private state: TimerState | null = null;
  private offsetMs = 0;

  constructor(private showWindow: () => void) {
    const icon = nativeImage.createFromPath(path.join(app.getAppPath(), 'resources', 'trayTemplate.png'));
    icon.setTemplateImage(true);
    this.tray = new Tray(icon);
    this.tray.on('click', () => this.showWindow());
    this.render();
    this.ticker = setInterval(() => this.renderTitle(), 1000);
  }

  update(state: TimerState | null) {
    this.state = state;
    if (state) this.offsetMs = Date.parse(state.serverNow) - Date.now();
    this.render();
  }

  destroy() {
    clearInterval(this.ticker);
    this.tray.destroy();
  }

  private elapsed() {
    if (!this.state?.session) return null;
    return (Date.now() + this.offsetMs - Date.parse(this.state.session.clockIn)) / 1000;
  }

  private renderTitle() {
    const elapsed = this.elapsed();
    const status = this.state?.status ?? 'OFF';
    const text = elapsed === null ? '' : ` ${status === 'WORK' ? '' : `${LABELS[status]} · `}${formatHMS(elapsed)}`;
    if (process.platform === 'darwin') this.tray.setTitle(text);
    this.tray.setToolTip(`Time Tracker — ${LABELS[status]}${text ? ` (${text.trim()})` : ''}`);
  }

  private render() {
    const status = this.state?.status ?? 'OFF';
    const project = this.state?.current?.projectName;
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `${LABELS[status]}${project && status !== 'OFF' ? ` — ${project}` : ''}`, enabled: false },
        { type: 'separator' },
        { label: 'Open Time Tracker', click: () => this.showWindow() },
        { label: 'Quit', click: () => app.quit() },
      ]),
    );
    this.renderTitle();
  }
}
