// Waits for the API server, then starts electron-vite.
// Also drops ELECTRON_RUN_AS_NODE: shells spawned by VS Code / other Electron apps inherit it,
// which would make Electron start as plain Node and crash.
import { spawn } from 'node:child_process';

const url = process.env.API_HEALTH_URL ?? 'http://localhost:4000/health';
const deadline = Date.now() + 120_000;

async function serverUp() {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

console.log(`Waiting for ${url} …`);
while (!(await serverUp())) {
  if (Date.now() > deadline) {
    console.error(`Timed out waiting for ${url}`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 500));
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn('electron-vite', ['dev'], { stdio: 'inherit', env, shell: process.platform === 'win32' });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
