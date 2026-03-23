export type SessionStatus = 'active' | 'finished';

export interface PlayerProfile {
  id: string;
  name: string;
  anonymousUid: string;
  refCode?: string;
  avatarEmoji?: string;
}

export interface FriendRecord {
  playerId: string;
  name: string;
  addedAt: Date;
  avatarEmoji?: string;
}

export interface SessionRecord {
  id: string;
  hostId: string;
  date: Date;
  location?: string;
  status: SessionStatus;
  finishedAt?: Date;
}

export interface BuyIn {
  id: string;
  sessionId: string;
  playerId: string;
  playerName: string;
  amount: number;
  createdAt: Date;
}

export interface SessionResult {
  playerId: string;
  playerName: string;
  totalBuyIn: number;
  cashOut: number;
  profit: number;
}

export interface EarlyCashOut {
  playerId: string;
  playerName: string;
  amount: number;
  cashedOutAt: Date;
}

export interface PokerGroup {
  id: string;
  name: string;
  createdAt: Date;
}

export interface GroupMember {
  id: string;
  name: string;
  isRegistered: boolean;
}
