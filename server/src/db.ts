import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export type SegmentType = 'WORK' | 'BREAK' | 'IDLE';
export type CloseReason = 'MANUAL' | 'IDLE_TIMEOUT';
export type Role = 'ADMIN' | 'EMPLOYEE';
