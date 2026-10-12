import { settings, zoneAt, isWalkable } from '../../../shared/runtime.js';
import type { AvatarMove, ErrorCode, GardenSnapshot, JoinAck, SharedPlayer } from '../../../shared/contracts.js';

interface Entry {
  player: SharedPlayer;
  lastMoveAt: number;
  seq: number;
  windowAt: number;
  events: number;
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export class GardenRoom {
  private readonly entries = new Map<string, Entry>();
  constructor(private readonly maxPlayers = settings.network.maxPlayers) {}

  snapshot(now = Date.now()): GardenSnapshot {
    return { players: [...this.entries.values()].map(({ player }) => ({ ...player })), serverTimeMs: now };
  }

  join(id: string, payload: unknown, now = Date.now()): JoinAck {
    if (!isRecord(payload) || Object.keys(payload).length !== 0) return { ok: false, code: 'INVALID_PAYLOAD' };
    if (this.entries.has(id)) return { ok: true, playerId: id, snapshot: this.snapshot(now) };
    if (this.entries.size >= this.maxPlayers) return { ok: false, code: 'ROOM_FULL' };
    const { x, z, yaw } = settings.world.spawn;
    this.entries.set(id, {
      player: { id, x, z, yaw, zone: zoneAt(x, z) },
      lastMoveAt: now, seq: -1, windowAt: now, events: 0,
    });
    return { ok: true, playerId: id, snapshot: this.snapshot(now) };
  }

  move(id: string, payload: unknown, now = Date.now()): ErrorCode | null {
    const entry = this.entries.get(id);
    if (!entry) return 'NOT_JOINED';
    if (!isRecord(payload) || Object.keys(payload).sort().join(',') !== 'seq,x,yaw,z') return 'INVALID_PAYLOAD';
    const { x, z, yaw, seq } = payload as unknown as AvatarMove;
    if (![x, z, yaw, seq].every((value) => typeof value === 'number' && Number.isFinite(value))
      || !Number.isSafeInteger(seq) || seq < 0 || seq <= entry.seq
      || Math.abs(yaw) > Math.PI || !isWalkable(x, z)) return 'INVALID_PAYLOAD';
    if (now - entry.windowAt >= 1000) { entry.windowAt = now; entry.events = 0; }
    entry.events += 1;
    if (entry.events > settings.network.maxMovementEventsPerSecond) return 'RATE_LIMITED';
    const elapsed = Math.max(0, (now - entry.lastMoveAt) / 1000);
    const limit = elapsed * settings.world.walkSpeedMps + settings.world.movementToleranceM;
    if (Math.hypot(x - entry.player.x, z - entry.player.z) > limit) return 'INVALID_PAYLOAD';
    entry.player = { id, x, z, yaw, zone: zoneAt(x, z) };
    entry.seq = seq;
    entry.lastMoveAt = now;
    return null;
  }

  leave(id: string) { this.entries.delete(id); }
}
