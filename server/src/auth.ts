import type { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from './errors.js';
import type { Role } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret';

export interface AuthUser {
  id: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser) {
  return jwt.sign({ sub: user.id, role: user.role }, SECRET, { expiresIn: '30d' });
}

function readToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  // <img> tags can't send headers, so screenshot files also accept ?token=
  if (typeof req.query.token === 'string') return req.query.token;
  return undefined;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = readToken(req);
  if (!token) throw new HttpError(401, 'Missing token');
  try {
    const payload = jwt.verify(token, SECRET) as jwt.JwtPayload;
    req.user = { id: String(payload.sub), role: payload.role as Role };
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'ADMIN') throw new HttpError(403, 'Admin only');
  next();
};

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  return req.user;
}
