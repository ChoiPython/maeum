import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { GardenRoom } from './garden.js';
import { settings } from '../../../shared/runtime.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/contracts.js';

export function createGardenServer(options: { maxPlayers?: number; allowedOrigins?: string[] } = {}) {
  const room = new GardenRoom(options.maxPlayers);
  const allowedOrigins = options.allowedOrigins ?? [
    'http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4173',
  ];
  const http = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ status: 'ok', stage: 1, players: room.snapshot().players.length }));
    } else { response.writeHead(404); response.end(); }
  });
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
    cors: { origin: allowedOrigins },
    allowRequest: (request, callback) => callback(null,
      !request.headers.origin || allowedOrigins.includes(request.headers.origin)),
    maxHttpBufferSize: 4096,
  });
  const broadcast = () => io.to('garden').emit('garden:snapshot', room.snapshot());
  io.on('connection', (socket) => {
    socket.on('garden:join', async (payload, ack) => {
      if (typeof ack !== 'function') return;
      const result = room.join(socket.id, payload);
      if (result.ok) await socket.join('garden');
      ack(result);
      if (result.ok) broadcast();
    });
    socket.on('avatar:move', (payload) => {
      const error = room.move(socket.id, payload);
      if (error) socket.emit('garden:error', { code: error });
    });
    socket.on('disconnect', () => { room.leave(socket.id); broadcast(); });
  });
  const interval = setInterval(broadcast, settings.network.snapshotIntervalMs);
  interval.unref();
  return {
    room,
    async listen(port = 3002, host = '127.0.0.1'): Promise<string> {
      await new Promise<void>((resolve, reject) => {
        http.once('error', reject);
        http.listen(port, host, () => { http.off('error', reject); resolve(); });
      });
      const address = http.address();
      if (!address || typeof address === 'string') throw new Error('서버 주소를 확인하지 못했습니다.');
      return `http://${host}:${address.port}`;
    },
    async close() {
      clearInterval(interval);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
