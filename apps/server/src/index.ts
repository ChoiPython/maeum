import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { createGardenServer } from './server.js';

if (existsSync('.env')) loadEnvFile('.env');
const port = Number(process.env.PORT ?? 3002);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT는 1~65535 정수여야 합니다.');
const host = process.env.HOST ?? '127.0.0.1';
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((value) => value.trim()).filter(Boolean);
const server = createGardenServer({ allowedOrigins });
console.log(`마음정원 서버: ${await server.listen(port, host)}`);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.close();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
