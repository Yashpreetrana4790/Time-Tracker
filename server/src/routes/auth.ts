import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { currentUser, requireAuth, signToken } from '../auth.js';

export const authRouter = Router();

const publicUser = (u: { id: string; name: string; email: string; role: string }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});

authRouter.post('/auth/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  res.json({ token: signToken({ id: user.id, role: user.role as 'ADMIN' | 'EMPLOYEE' }), user: publicUser(user) });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: currentUser(req).id } });
  if (!user) throw new HttpError(401, 'User no longer exists');
  res.json(publicUser(user));
});

authRouter.get('/projects/mine', requireAuth, async (req, res) => {
  const assignments = await prisma.projectAssignment.findMany({
    where: { userId: currentUser(req).id, project: { active: true } },
    include: { project: true },
    orderBy: { project: { name: 'asc' } },
  });
  res.json(assignments.map((a) => ({ id: a.project.id, name: a.project.name })));
});
