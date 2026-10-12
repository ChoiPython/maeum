import { io, type Socket } from 'socket.io-client';
import { settings } from '../../../shared/runtime.js';
import type { AvatarMove, ClientToServerEvents, ConnectionStatus, GardenSnapshot, ServerToClientEvents } from '../../../shared/contracts.js';

export class GardenConnection {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  private joined = false;
  private seq = 0;
  private sentAt = 0;
  private lastPosition = '';
  private disposed = false;
  constructor(
    onStatus: (status: ConnectionStatus, count: number) => void,
    onSnapshot: (snapshot: GardenSnapshot, selfId: string) => void,
    onResetPosition: () => void,
  ) {
    this.socket = io(import.meta.env.VITE_SOCKET_URL || undefined, {
      autoConnect: false, reconnectionDelay: 1000, reconnectionDelayMax: 5000,
    });
    this.socket.on('connect', async () => {
      onStatus('connecting', 0);
      try {
        const result = await this.socket.timeout(3000).emitWithAck('garden:join', {});
        if (this.disposed) return;
        if (!result.ok) {
          onStatus(result.code === 'ROOM_FULL' ? 'full' : 'offline', 0);
          return;
        }
        this.joined = true;
        this.seq = 0;
        this.sentAt = 0;
        this.lastPosition = '';
        onResetPosition();
        onSnapshot(result.snapshot, result.playerId);
        onStatus('online', result.snapshot.players.length);
      } catch { if (!this.disposed) onStatus('offline', 0); }
    });
    this.socket.on('garden:snapshot', (snapshot) => {
      if (!this.joined || !this.socket.id) return;
      onSnapshot(snapshot, this.socket.id);
      onStatus('online', snapshot.players.length);
    });
    this.socket.on('disconnect', () => {
      this.joined = false;
      onStatus('offline', 0);
      onSnapshot({ players: [], serverTimeMs: Date.now() }, '');
    });
    this.socket.on('connect_error', () => onStatus('offline', 0));
    onStatus('connecting', 0);
    this.socket.connect();
  }
  move(position: Omit<AvatarMove, 'seq'>) {
    if (!this.joined || !this.socket.connected) return;
    const now = performance.now();
    const key = `${position.x.toFixed(3)}:${position.z.toFixed(3)}:${position.yaw.toFixed(3)}`;
    if (now - this.sentAt < settings.network.movementSendIntervalMs || key === this.lastPosition) return;
    this.sentAt = now;
    this.lastPosition = key;
    this.socket.volatile.emit('avatar:move', { ...position, seq: this.seq++ });
  }
  dispose() {
    this.disposed = true;
    this.joined = false;
    this.socket.removeAllListeners();
    this.socket.disconnect();
  }
}
