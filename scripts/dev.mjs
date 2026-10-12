import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientRequire = createRequire(path.join(root, 'apps/client/package.json'));
const viteCli = path.join(path.dirname(clientRequire.resolve('vite/package.json')), 'bin/vite.js');
let stopping = false;
const services = [
  spawn(process.execPath, [viteCli], {
    cwd: path.join(root, 'apps/client'), stdio: 'inherit',
  }),
  spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    cwd: path.join(root, 'apps/server'), stdio: 'inherit',
  }),
];
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of services) child.kill();
  process.exitCode = code;
}
for (const child of services) {
  child.on('error', (error) => { console.error(error.message); stop(1); });
  child.on('exit', (code) => { if (!stopping) stop(code ?? 1); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
