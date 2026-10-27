import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '../db.js';
import { HttpError } from '../errors.js';
import { currentUser, requireAdmin, requireAuth } from '../auth.js';

export const SCREENSHOT_DIR = path.resolve(import.meta.dirname, '../../storage/screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

export const screenshotRouter = Router();

screenshotRouter.post('/screenshots', requireAuth, upload.single('file'), async (req, res) => {
  const userId = currentUser(req).id;
  if (!req.file) throw new HttpError(400, 'file is required');
  const takenAt = new Date(String(req.body.takenAt ?? ''));
  if (Number.isNaN(takenAt.getTime())) throw new HttpError(400, 'takenAt is required');
  const sessionId = String(req.body.sessionId ?? '');
  const session = await prisma.workSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw new HttpError(400, 'Unknown session');

  // Only accept shots that fall inside a WORK segment. Shots that ended up inside a
  // (backdated) IDLE segment are rejected, so idle time never has screenshots.
  const segment = await prisma.timeSegment.findFirst({
    where: {
      sessionId,
      start: { lte: takenAt },
      OR: [{ end: null }, { end: { gt: takenAt } }],
    },
  });
  if (!segment || segment.type !== 'WORK') {
    throw new HttpError(422, 'Screenshot is not inside a work period');
  }

  const ext = req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
  const fileName = `${userId}_${takenAt.getTime()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await fs.promises.writeFile(path.join(SCREENSHOT_DIR, fileName), req.file.buffer);

  const shot = await prisma.screenshot.create({
    data: {
      userId,
      sessionId,
      projectId: segment.projectId,
      takenAt,
      displayIndex: Number(req.body.displayIndex ?? 0) || 0,
      filePath: fileName,
    },
  });
  res.status(201).json({ id: shot.id });
});

screenshotRouter.get('/files/screenshots/:name', requireAuth, requireAdmin, (req, res) => {
  const name = path.basename(String(req.params.name));
  const file = path.join(SCREENSHOT_DIR, name);
  if (!fs.existsSync(file)) throw new HttpError(404, 'Not found');
  res.sendFile(file);
});
