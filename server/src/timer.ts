import type { Prisma, TimeSegment, WorkSession } from '@prisma/client';
import { prisma, type SegmentType } from './db.js';
import { HttpError } from './errors.js';
import { getSettings, type Settings } from './settings.js';

type Tx = Prisma.TransactionClient;
type Status = 'OFF' | SegmentType;

// Serialise timer changes per user so two requests can't both close the same segment.
const locks = new Map<string, Promise<unknown>>();
export function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(userId) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  locks.set(userId, run);
  run.finally(() => {
    if (locks.get(userId) === run) locks.delete(userId);
  }).catch(() => undefined);
  return run;
}

async function openSession(tx: Tx, userId: string) {
  const session = await tx.workSession.findFirst({
    where: { userId, clockOut: null },
    orderBy: { clockIn: 'desc' },
  });
  if (!session) return null;
  const segment = await tx.timeSegment.findFirst({
    where: { sessionId: session.id, end: null },
    orderBy: { start: 'desc' },
  });
  return { session, segment };
}

async function requireOpen(tx: Tx, userId: string, allowed: SegmentType[]) {
  const open = await openSession(tx, userId);
  if (!open || !open.segment) throw new HttpError(409, 'You are not clocked in');
  if (!allowed.includes(open.segment.type as SegmentType)) {
    throw new HttpError(409, `Not allowed while status is ${open.segment.type}`);
  }
  return open as { session: WorkSession; segment: TimeSegment };
}

/**
 * Closes the open segment at `at` and (optionally) opens the next one starting at exactly `at`,
 * so segments never overlap or leave gaps. Zero-length segments are dropped.
 */
async function transition(
  tx: Tx,
  segment: TimeSegment,
  at: Date,
  next: { type: SegmentType; projectId: string | null } | null,
) {
  if (at.getTime() <= segment.start.getTime()) {
    await tx.timeSegment.delete({ where: { id: segment.id } });
  } else {
    await tx.timeSegment.update({ where: { id: segment.id }, data: { end: at } });
  }
  if (next) {
    await tx.timeSegment.create({
      data: { sessionId: segment.sessionId, type: next.type, projectId: next.projectId, start: at },
    });
  }
}

async function assertProjectAssigned(tx: Tx, userId: string, projectId: unknown) {
  if (typeof projectId !== 'string' || !projectId) throw new HttpError(400, 'projectId is required');
  const assignment = await tx.projectAssignment.findUnique({
    where: { userId_projectId: { userId, projectId } },
    include: { project: true },
  });
  if (!assignment || !assignment.project.active) {
    throw new HttpError(403, 'Project is not assigned to you');
  }
  return projectId;
}

async function closeSession(tx: Tx, session: WorkSession, at: Date, reason: 'MANUAL' | 'IDLE_TIMEOUT') {
  await tx.workSession.update({
    where: { id: session.id },
    data: { clockOut: at, closeReason: reason },
  });
}

/** Auto clock-out at the moment idleness began: the trailing IDLE time is discarded. */
async function autoClockOut(tx: Tx, session: WorkSession, segment: TimeSegment, at: Date) {
  await transition(tx, segment, segment.type === 'IDLE' ? segment.start : at, null);
  await closeSession(tx, session, segment.type === 'IDLE' ? segment.start : at, 'IDLE_TIMEOUT');
}

// ---- Actions -------------------------------------------------------------------------------

export type Action =
  | 'clock-in'
  | 'break'
  | 'resume'
  | 'switch'
  | 'idle-start'
  | 'idle-end'
  | 'idle-timeout'
  | 'clock-out'
  | 'heartbeat'
  | 'ack-notice';

export async function runAction(userId: string, action: Action, body: Record<string, unknown>) {
  await withUserLock(userId, () =>
    prisma.$transaction(async (tx) => {
      const now = new Date();
      switch (action) {
        case 'clock-in': {
          if (await openSession(tx, userId)) throw new HttpError(409, 'Already clocked in');
          const projectId = await assertProjectAssigned(tx, userId, body.projectId);
          const session = await tx.workSession.create({
            data: { userId, clockIn: now, lastHeartbeat: now },
          });
          await tx.timeSegment.create({
            data: { sessionId: session.id, type: 'WORK', projectId, start: now },
          });
          return;
        }
        case 'break': {
          const { segment } = await requireOpen(tx, userId, ['WORK', 'IDLE']);
          await transition(tx, segment, now, { type: 'BREAK', projectId: segment.projectId });
          return;
        }
        case 'resume': {
          const { segment } = await requireOpen(tx, userId, ['BREAK']);
          await transition(tx, segment, now, { type: 'WORK', projectId: segment.projectId });
          return;
        }
        case 'switch': {
          const { segment } = await requireOpen(tx, userId, ['WORK']);
          const projectId = await assertProjectAssigned(tx, userId, body.projectId);
          if (projectId === segment.projectId) return;
          await transition(tx, segment, now, { type: 'WORK', projectId });
          return;
        }
        case 'idle-start': {
          const { segment } = await requireOpen(tx, userId, ['WORK']);
          // Backdate to the last input, but never before the current segment or into the future.
          const requested = new Date(String(body.idleSince ?? ''));
          if (Number.isNaN(requested.getTime())) throw new HttpError(400, 'idleSince is required');
          const idleSince = new Date(
            Math.min(now.getTime(), Math.max(segment.start.getTime(), requested.getTime())),
          );
          await transition(tx, segment, idleSince, { type: 'IDLE', projectId: segment.projectId });
          return;
        }
        case 'idle-end': {
          const { segment } = await requireOpen(tx, userId, ['IDLE']);
          await transition(tx, segment, now, { type: 'WORK', projectId: segment.projectId });
          return;
        }
        case 'idle-timeout': {
          const { session, segment } = await requireOpen(tx, userId, ['IDLE']);
          const { autoClockOutSec } = await getSettings();
          // Small tolerance: the desktop measures idle time from its own clock.
          if (now.getTime() - segment.start.getTime() < (autoClockOutSec - 30) * 1000) {
            throw new HttpError(409, 'Idle timeout not reached yet');
          }
          await autoClockOut(tx, session, segment, now);
          return;
        }
        case 'clock-out': {
          const { session, segment } = await requireOpen(tx, userId, ['WORK', 'BREAK', 'IDLE']);
          await transition(tx, segment, now, null);
          await closeSession(tx, session, now, 'MANUAL');
          return;
        }
        case 'heartbeat': {
          const open = await openSession(tx, userId);
          if (open) {
            await tx.workSession.update({ where: { id: open.session.id }, data: { lastHeartbeat: now } });
          }
          return;
        }
        case 'ack-notice': {
          await tx.workSession.updateMany({
            where: { userId, closeReason: 'IDLE_TIMEOUT', noticeAcked: false },
            data: { noticeAcked: true },
          });
          return;
        }
      }
    }),
  );
  return getState(userId);
}

// ---- Read model ----------------------------------------------------------------------------

export function startOfDay(d: Date) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

type SegmentLike = { type: string; start: Date; end: Date | null };

/** Seconds per segment type, clipped to [from, to]. Open segments run until `to`. */
export function totals(segments: SegmentLike[], from: Date, to: Date) {
  const result = { work: 0, break: 0, idle: 0 };
  for (const s of segments) {
    const start = Math.max(s.start.getTime(), from.getTime());
    const end = Math.min((s.end ?? to).getTime(), to.getTime());
    if (end <= start) continue;
    const secs = Math.round((end - start) / 1000);
    if (s.type === 'WORK') result.work += secs;
    else if (s.type === 'BREAK') result.break += secs;
    else if (s.type === 'IDLE') result.idle += secs;
  }
  return result;
}

export async function todayTotals(userId: string, now = new Date()) {
  const from = startOfDay(now);
  const segments = await prisma.timeSegment.findMany({
    where: {
      session: { userId },
      start: { lt: now },
      OR: [{ end: null }, { end: { gt: from } }],
    },
  });
  return totals(segments, from, now);
}

export interface TimerState {
  serverNow: string;
  status: Status;
  settings: Settings;
  session: { id: string; clockIn: string } | null;
  current: { type: SegmentType; start: string; projectId: string | null; projectName: string | null } | null;
  today: { work: number; break: number; idle: number };
  notice: { autoClockOutAt: string } | null;
}

export async function getState(userId: string): Promise<TimerState> {
  const now = new Date();
  const [open, settings, today, unacked] = await Promise.all([
    openSession(prisma, userId),
    getSettings(),
    todayTotals(userId, now),
    prisma.workSession.findFirst({
      where: { userId, closeReason: 'IDLE_TIMEOUT', noticeAcked: false },
      orderBy: { clockOut: 'desc' },
    }),
  ]);
  let project: { name: string } | null = null;
  if (open?.segment?.projectId) {
    project = await prisma.project.findUnique({ where: { id: open.segment.projectId } });
  }
  return {
    serverNow: now.toISOString(),
    status: (open?.segment?.type as SegmentType | undefined) ?? 'OFF',
    settings,
    session: open ? { id: open.session.id, clockIn: open.session.clockIn.toISOString() } : null,
    current: open?.segment
      ? {
          type: open.segment.type as SegmentType,
          start: open.segment.start.toISOString(),
          projectId: open.segment.projectId,
          projectName: project?.name ?? null,
        }
      : null,
    today,
    notice: unacked?.clockOut ? { autoClockOutAt: unacked.clockOut.toISOString() } : null,
  };
}

// ---- Background sweep ----------------------------------------------------------------------

/**
 * Server-side safety net for when the desktop app isn't around to report:
 *  - IDLE longer than the auto clock-out limit → clock out at idle start.
 *  - WORK with no heartbeat for that long (app quit / machine asleep) → clock out at last heartbeat.
 * Breaks are left alone: idle detection doesn't apply to them.
 */
export async function sweepStaleSessions() {
  const { autoClockOutSec } = await getSettings();
  const cutoff = new Date(Date.now() - autoClockOutSec * 1000);
  const sessions = await prisma.workSession.findMany({
    where: { clockOut: null },
    include: { segments: { where: { end: null } } },
  });
  for (const session of sessions) {
    const segment = session.segments[0];
    if (!segment) continue;
    const lastSeen = session.lastHeartbeat ?? session.clockIn;
    const idleTooLong = segment.type === 'IDLE' && segment.start <= cutoff;
    const silentTooLong = segment.type === 'WORK' && lastSeen <= cutoff;
    if (!idleTooLong && !silentTooLong) continue;
    await withUserLock(session.userId, () =>
      prisma.$transaction(async (tx) => {
        const fresh = await tx.timeSegment.findUnique({ where: { id: segment.id } });
        if (!fresh || fresh.end) return;
        const at = idleTooLong ? fresh.start : new Date(Math.max(lastSeen.getTime(), fresh.start.getTime()));
        await autoClockOut(tx, session, fresh, at);
      }),
    );
    console.log(`[sweep] auto clocked out session ${session.id}`);
  }
}
