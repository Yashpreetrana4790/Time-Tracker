import { Router } from 'express';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { requireAdmin, requireAuth } from '../auth.js';
import { getSettings, saveSettings } from '../settings.js';
import { getState, startOfDay, totals } from '../timer.js';

export const adminRouter = Router();
adminRouter.use('/admin', requireAuth, requireAdmin);

/** Live status + today's totals for every employee. */
adminRouter.get('/admin/overview', async (_req, res) => {
  const employees = await prisma.user.findMany({
    where: { role: 'EMPLOYEE' },
    orderBy: { name: 'asc' },
  });
  const rows = await Promise.all(
    employees.map(async (u) => {
      const [state, lastShot] = await Promise.all([
        getState(u.id),
        prisma.screenshot.findFirst({ where: { userId: u.id }, orderBy: { takenAt: 'desc' } }),
      ]);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        status: state.status,
        projectName: state.current?.projectName ?? null,
        clockIn: state.session?.clockIn ?? null,
        statusSince: state.current?.start ?? null,
        today: state.today,
        lastScreenshotAt: lastShot?.takenAt ?? null,
      };
    }),
  );
  res.json({ serverNow: new Date().toISOString(), employees: rows });
});

adminRouter.get('/admin/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, email: true, role: true },
  });
  res.json(users);
});

/** Sessions, segments, screenshots and totals for one user on one local day (YYYY-MM-DD). */
adminRouter.get('/admin/users/:id/day', async (req, res) => {
  const userId = String(req.params.id);
  const date = typeof req.query.date === 'string' ? req.query.date : '';
  const from = date ? new Date(`${date}T00:00:00`) : startOfDay(new Date());
  if (Number.isNaN(from.getTime())) throw new HttpError(400, 'Invalid date');
  const to = new Date(from.getTime() + 24 * 3600 * 1000);
  const now = new Date();
  const clipTo = now < to ? now : to;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) throw new HttpError(404, 'User not found');

  const sessions = await prisma.workSession.findMany({
    where: { userId, clockIn: { lt: to }, OR: [{ clockOut: null }, { clockOut: { gt: from } }] },
    orderBy: { clockIn: 'asc' },
    include: {
      segments: { orderBy: { start: 'asc' }, include: { project: { select: { name: true } } } },
    },
  });
  const segments = sessions.flatMap((s) => s.segments);

  const byProject = new Map<string, { projectName: string; work: number }>();
  for (const seg of segments) {
    if (seg.type !== 'WORK') continue;
    const t = totals([seg], from, clipTo).work;
    const key = seg.projectId ?? 'none';
    const entry = byProject.get(key) ?? { projectName: seg.project?.name ?? '—', work: 0 };
    entry.work += t;
    byProject.set(key, entry);
  }

  const screenshots = await prisma.screenshot.findMany({
    where: { userId, takenAt: { gte: from, lt: to } },
    orderBy: [{ takenAt: 'asc' }, { displayIndex: 'asc' }],
    include: { project: { select: { name: true } } },
  });

  res.json({
    user,
    from: from.toISOString(),
    to: to.toISOString(),
    serverNow: now.toISOString(),
    totals: totals(segments, from, clipTo),
    byProject: [...byProject.values()].sort((a, b) => b.work - a.work),
    sessions: sessions.map((s) => ({
      id: s.id,
      clockIn: s.clockIn,
      clockOut: s.clockOut,
      closeReason: s.closeReason,
      segments: s.segments.map((seg) => ({
        id: seg.id,
        type: seg.type,
        projectName: seg.project?.name ?? null,
        start: seg.start,
        end: seg.end,
      })),
    })),
    screenshots: screenshots.map((s) => ({
      id: s.id,
      takenAt: s.takenAt,
      displayIndex: s.displayIndex,
      projectName: s.project?.name ?? null,
      url: `/files/screenshots/${s.filePath}`,
    })),
  });
});

adminRouter.get('/admin/settings', async (_req, res) => {
  res.json(await getSettings());
});

adminRouter.put('/admin/settings', async (req, res) => {
  try {
    res.json(await saveSettings(req.body ?? {}));
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});

adminRouter.get('/admin/projects', async (_req, res) => {
  const projects = await prisma.project.findMany({
    orderBy: { name: 'asc' },
    include: { assignments: { select: { userId: true } } },
  });
  res.json(
    projects.map((p) => ({ id: p.id, name: p.name, active: p.active, userIds: p.assignments.map((a) => a.userId) })),
  );
});

adminRouter.post('/admin/projects', async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) throw new HttpError(400, 'name is required');
  const project = await prisma.project.create({ data: { name } });
  res.status(201).json(project);
});

adminRouter.patch('/admin/projects/:id', async (req, res) => {
  const data: { name?: string; active?: boolean } = {};
  if (typeof req.body?.name === 'string' && req.body.name.trim()) data.name = req.body.name.trim();
  if (typeof req.body?.active === 'boolean') data.active = req.body.active;
  res.json(await prisma.project.update({ where: { id: String(req.params.id) }, data }));
});

adminRouter.put('/admin/projects/:id/assignments', async (req, res) => {
  const projectId = String(req.params.id);
  const userIds: string[] = Array.isArray(req.body?.userIds) ? req.body.userIds.map(String) : [];
  await prisma.$transaction([
    prisma.projectAssignment.deleteMany({ where: { projectId } }),
    ...userIds.map((userId) => prisma.projectAssignment.create({ data: { projectId, userId } })),
  ]);
  res.json({ ok: true });
});
