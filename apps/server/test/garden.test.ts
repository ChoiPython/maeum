import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import { GardenRoom } from '../src/garden.js';
import { createGardenServer } from '../src/server.js';
import { zoneAt, recommend } from '../../../shared/runtime.js';
import type { ClientToServerEvents, GardenSnapshot, JoinAck, ServerToClientEvents } from '../../../shared/contracts.js';

test('감정 추천과 구역 경계는 공통 규칙을 따른다', () => {
  assert.equal(recommend('anxiety')?.recommendedZone, 'forest');
  assert.equal(recommend('overloaded')?.recommendedZone, 'lake');
  assert.equal(recommend('lonely')?.recommendedZone, 'plaza');
  assert.equal(recommend('tired')?.recommendedZone, 'forest');
  assert.equal(recommend('calm')?.recommendedZone, null);
  assert.equal(recommend(null), null);
  assert.equal(zoneAt(-6, 2), 'plaza');
  assert.equal(zoneAt(-6, 1.99), 'forest');
});
test('입장에 개인 데이터가 들어오면 거절하고 보관하지 않는다', () => {
  const room = new GardenRoom();
  assert.deepEqual(room.join('a', { emotionId: 'anxiety' }), { ok: false, code: 'INVALID_PAYLOAD' });
  assert.equal(room.snapshot().players.length, 0);
});
test('중복 입장은 한 명으로 유지하고 최대 인원을 제한한다', () => {
  const room = new GardenRoom(2);
  assert.equal(room.join('a', {}).ok, true);
  assert.equal(room.join('a', {}).ok, true);
  assert.equal(room.join('b', {}).ok, true);
  assert.deepEqual(room.join('c', {}), { ok: false, code: 'ROOM_FULL' });
  room.leave('b');
  assert.equal(room.join('c', {}).ok, true);
});
test('이동의 유한값·추가 필드·순서·과속·호수 진입을 검증한다', () => {
  const room = new GardenRoom();
  room.join('a', {}, 1000);
  assert.equal(room.move('a', { x: 0, z: 17.8, yaw: 0, seq: 1 }, 1100), null);
  for (const move of [
    { x: NaN, z: 17.8, yaw: 0, seq: 2 },
    { x: 0, z: Infinity, yaw: 0, seq: 2 },
    { x: 0, z: 17.8, yaw: 0, seq: 1 },
    { x: 20, z: 17.8, yaw: 0, seq: 2 },
    { x: 0, z: 17.8, yaw: 0, seq: 2, worryId: 'study' },
    { x: 14, z: -10, yaw: 0, seq: 2 },
  ]) assert.equal(room.move('a', move, 1200), 'INVALID_PAYLOAD');
  assert.equal(room.snapshot().players[0].z, 17.8);
});
test('너무 빈번한 이동은 거절한다', () => {
  const room = new GardenRoom();
  room.join('a', {}, 1000);
  for (let seq = 0; seq < 15; seq++) assert.equal(room.move('a', { x: 0, z: 18, yaw: 0, seq }, 1100), null);
  assert.equal(room.move('a', { x: 0, z: 18, yaw: 0, seq: 16 }, 1100), 'RATE_LIMITED');
});

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;
async function connect(url: string): Promise<Client> {
  const socket: Client = io(url, { reconnection: false, forceNew: true, autoConnect: false });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect();
  });
  return socket;
}
function join(socket: Client): Promise<JoinAck> {
  return new Promise((resolve) => socket.emit('garden:join', {}, resolve));
}
function snapshotWhere(socket: Client, predicate: (value: GardenSnapshot) => boolean) {
  return new Promise<GardenSnapshot>((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('garden:snapshot', receive); reject(new Error('snapshot timeout')); }, 3000);
    function receive(value: GardenSnapshot) {
      if (predicate(value)) { clearTimeout(timer); socket.off('garden:snapshot', receive); resolve(value); }
    }
    socket.on('garden:snapshot', receive);
  });
}
test('실제 두 Socket.IO 접속에서 입장·이동·퇴장·인원 제한을 확인한다', { timeout: 10000 }, async () => {
  const server = createGardenServer({ maxPlayers: 2 });
  const clients: Client[] = [];
  try {
    const url = await server.listen(0);
    assert.deepEqual(await (await fetch(`${url}/health`)).json(), { status: 'ok', stage: 1, players: 0 });
    const a = await connect(url), b = await connect(url), c = await connect(url);
    clients.push(a, b, c);
    const aJoin = await join(a);
    assert.equal(aJoin.ok, true);
    assert.equal((await join(b)).ok, true);
    assert.deepEqual(await join(c), { ok: false, code: 'ROOM_FULL' });
    const moved = snapshotWhere(b, (value) => value.players.some((player) => player.id === a.id && player.z === 17.9));
    a.emit('avatar:move', { x: 0, z: 17.9, yaw: 0, seq: 1 });
    assert.equal((await moved).players.length, 2);
    const left = snapshotWhere(a, (value) => value.players.length === 1);
    b.disconnect();
    assert.equal((await left).players[0].id, a.id);
    assert.equal((await join(c)).ok, true);
  } finally { clients.forEach((client) => client.disconnect()); await server.close(); }
});
