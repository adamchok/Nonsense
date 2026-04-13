export type SessionStatus = 'active' | 'finished';

/** Cash: all amounts are dollar. Chips: buy-ins, blinds, and cash-outs are tracked in chips; summaries use `dollarsPerChip` for dollar figures. */
export type SessionAmountUnit = 'cash' | 'chips';

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

export interface FriendRequestRecord {
  playerId: string;
  name: string;
  createdAt: Date;
  avatarEmoji?: string;
}

export interface SessionRecord {
  id: string;
  hostId: string;
  date: Date;
  location?: string;
  smallBlind?: number;
  bigBlind?: number;
  /** Defaults to `cash` when absent (legacy sessions). */
  amountUnit?: SessionAmountUnit;
  /** When `amountUnit === 'chips'`, dollar value of one chip (e.g. 0.5 for 100 chips = $50). */
  dollarsPerChip?: number;
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
  memberCount?: number;
  ownerId?: string;
  myRole?: 'owner' | 'member';
}

export interface GroupMember {
  id: string;
  name: string;
  isRegistered: boolean;
  avatarEmoji?: string;
}

export interface SavedLocation {
  id: string;
  name: string;
  createdAt: Date;
}
