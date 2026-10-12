/**
 * 마음정원 구현 계약 초안, 2026.10.12.
 * 타입 선언이며 앱/서버 구현 및 런타임 입력 검증을 대신하지 않습니다.
 * 개인 상태는 Socket.IO 이벤트 인터페이스에 포함하지 않습니다.
 */
export type EmotionId = 'anxiety' | 'overloaded' | 'lonely' | 'tired' | 'calm';
export type WorryId = 'study' | 'career' | 'relationships' | 'financial' | 'other' | 'prefer_not_to_say';
export type SupportMessageId = 'C01' | 'C02' | 'C03' | 'C04' | 'C05' | 'C06';
export type ActivityZoneId = 'forest' | 'lake' | 'plaza';
export type ZoneId = 'entry' | ActivityZoneId | 'path';
export type Rating = 1 | 2 | 3 | 4 | 5;
export type BreathingStatus = 'idle' | 'running' | 'paused' | 'completed' | 'skipped';
export type LakeStatus = 'idle' | 'selected' | 'animating' | 'completed' | 'skipped';
export type SupportStatus = 'idle' | 'sending' | 'accepted' | 'failed' | 'skipped';
export type ConnectionStatus = 'offline' | 'connecting' | 'online' | 'full';

export interface Ratings {
  tension: Rating | null;
  comfort: Rating | null;
}

/** 개인 상태입니다. 네트워크 전송과 영구 저장에 사용하지 않습니다. */
export interface SessionState {
  emotionId: EmotionId | null;
  worryId: WorryId | null;
  before: Ratings;
  after: Ratings;
  visitedZones: ActivityZoneId[];
  breathing: { status: BreathingStatus; elapsedMs: number };
  lake: { status: LakeStatus };
  support: { status: SupportStatus };
  muted: boolean;
  volume: number;
}

export interface BreathingView {
  status: BreathingStatus;
  elapsedMs: number;
  /** 0~1, 완료 판정은 타이머 상태가 결정합니다. */
  progress: number;
}

export interface ForestSceneApi {
  updateBreathing(view: BreathingView): void;
  reset(): void;
  dispose(): void;
}

export interface LakeSceneApi {
  /** 이미 실행 중이면 false. 범주를 인자로 받거나 공유하지 않습니다. */
  playRelease(onComplete: () => void): boolean;
  pause(): void;
  resume(): void;
  cancelRelease(): void;
  dispose(): void;
}

export interface AvatarMove {
  x: number;
  z: number;
  yaw: number;
  seq: number;
}

export interface SharedPlayer {
  id: string;
  x: number;
  z: number;
  yaw: number;
  /** 서버가 공통 좌표 설정으로 계산합니다. */
  zone: ZoneId;
}

export interface GardenSnapshot {
  players: SharedPlayer[];
  serverTimeMs: number;
}

export type ErrorCode = 'ROOM_FULL' | 'NOT_JOINED' | 'INVALID_PAYLOAD' |
  'OUTSIDE_PLAZA' | 'NO_RECIPIENT' | 'RATE_LIMITED';

export interface FailedAck {
  ok: false;
  code: ErrorCode;
  retryAfterMs?: number;
}

export type JoinAck = {
  ok: true;
  playerId: string;
  snapshot: GardenSnapshot;
} | FailedAck;

export interface SupportRequest {
  messageId: SupportMessageId;
  requestId: string;
}

export type SupportAck = {
  ok: true;
  requestId: string;
  /** 서버 전송 대상 수. 실제 카드 표시 확인 수가 아닙니다. */
  recipientCount: number;
} | FailedAck;

export interface SupportReceived extends SupportRequest {
  fromPlayerId: string;
  serverTimeMs: number;
}

export interface ClientToServerEvents {
  'garden:join': (payload: Record<string, never>, ack: (result: JoinAck) => void) => void;
  'avatar:move': (payload: AvatarMove) => void;
  'support:send': (payload: SupportRequest, ack: (result: SupportAck) => void) => void;
}

export interface ServerToClientEvents {
  'garden:snapshot': (snapshot: GardenSnapshot) => void;
  'support:receive': (message: SupportReceived) => void;
  'garden:error': (error: { code: ErrorCode }) => void;
}

/** 기존 콘텐츠/설정과 같은 ID를 유지합니다. 런타임 입력은 별도로 검사합니다. */
export interface EmotionOption {
  id: EmotionId;
  label: string;
  recommendedZone: ActivityZoneId | null;
  guidance: string;
}
