import { Router } from 'express';
import { currentUser, requireAuth } from '../auth.js';
import { getState, runAction, type Action } from '../timer.js';

export const timerRouter = Router();
timerRouter.use('/timer', requireAuth);

timerRouter.get('/timer/state', async (req, res) => {
  res.json(await getState(currentUser(req).id));
});

const actions: Action[] = [
  'clock-in',
  'break',
  'resume',
  'switch',
  'idle-start',
  'idle-end',
  'idle-timeout',
  'clock-out',
  'heartbeat',
  'ack-notice',
];

for (const action of actions) {
  timerRouter.post(`/timer/${action}`, async (req, res) => {
    res.json(await runAction(currentUser(req).id, action, req.body ?? {}));
  });
}
