import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './errors.js';
import { authRouter } from './routes/auth.js';
import { timerRouter } from './routes/timer.js';
import { screenshotRouter } from './routes/screenshots.js';
import { adminRouter } from './routes/admin.js';
import { sweepStaleSessions } from './timer.js';
import { getSettings } from './settings.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});
app.use(authRouter);
app.use(timerRouter);
app.use(screenshotRouter);
app.use(adminRouter);
app.use(errorHandler);

const port = Number(process.env.PORT || 4000);
app.listen(port, async () => {
  console.log(`Server listening on http://localhost:${port}`);
  console.log('Settings:', await getSettings());
});

setInterval(() => {
  sweepStaleSessions().catch((e) => console.error('[sweep] failed', e));
}, 30_000);
