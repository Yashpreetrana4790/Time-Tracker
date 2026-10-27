import { prisma } from './db.js';

export interface Settings {
  idleThresholdSec: number;
  autoClockOutSec: number;
  screenshotIntervalSec: number;
}

const envNumber = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// .env provides the defaults; values saved by an admin (Setting table) override them.
export function defaultSettings(): Settings {
  return {
    idleThresholdSec: envNumber('IDLE_THRESHOLD_SEC', 300),
    autoClockOutSec: envNumber('AUTO_CLOCK_OUT_SEC', 7200),
    screenshotIntervalSec: envNumber('SCREENSHOT_INTERVAL_SEC', 600),
  };
}

export async function getSettings(): Promise<Settings> {
  const settings = defaultSettings();
  const rows = await prisma.setting.findMany();
  for (const row of rows) {
    if (row.key in settings) {
      const n = Number(row.value);
      if (Number.isFinite(n) && n > 0) settings[row.key as keyof Settings] = n;
    }
  }
  return settings;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const keys: (keyof Settings)[] = ['idleThresholdSec', 'autoClockOutSec', 'screenshotIntervalSec'];
  for (const key of keys) {
    const value = patch[key];
    if (value === undefined) continue;
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < 10) throw new Error(`${key} must be a number >= 10`);
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: String(n) },
      update: { value: String(n) },
    });
  }
  return getSettings();
}
