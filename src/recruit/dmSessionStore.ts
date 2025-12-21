import { randomBytes } from 'node:crypto';
import type { RecruitClanConfig, RecruitDmTemplateConfig } from '@/recruit/configStore';

export type RecruitClanSummary = {
  tag: string;
  name: string;
  memberCount: number;
  memberLimit: number;
  minTownHall?: number;
  maxTownHall?: number;
  applicationUrl?: string;
  eligible: boolean;
  reason?: string;
};

export type RecruitDmSession = {
  id: string;
  guildId: string;
  threadId: string;
  threadUrl: string;
  homeGuildName?: string;
  recruiterId: string;
  recruiterTag: string;
  applicantId: string;
  applicantTag: string;
  applicantDisplayName?: string;
  player: {
    name: string;
    tag: string;
    townHallLevel?: number;
  };
  originalMessageUrl: string;
  communityInviteUrl?: string;
  clans: RecruitClanConfig[];
  templates: RecruitDmTemplateConfig[];
  createdAt: number;
  statusMessage?: string;
  recruiterControlsClosed?: boolean;
  dmChannelId?: string;
  dmMessageId?: string;
  clanSummaries?: RecruitClanSummary[];
};

const sessions = new Map<string, RecruitDmSession>();
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour
function generateId(): string {
  return randomBytes(8).toString('hex');
}

function cleanup() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

export function createRecruitDmSession(data: Omit<RecruitDmSession, 'id' | 'createdAt'>): RecruitDmSession {
  cleanup();
  const id = generateId();
  const session: RecruitDmSession = {
    ...data,
    id,
    createdAt: Date.now()
  };
  sessions.set(id, session);
  return session;
}

export function getRecruitDmSession(id: string): RecruitDmSession | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(id);
    return undefined;
  }
  return session;
}

export function updateRecruitDmSession(
  id: string,
  patch: Partial<Omit<RecruitDmSession, 'id' | 'createdAt'>>
): RecruitDmSession | undefined {
  const current = getRecruitDmSession(id);
  if (!current) return undefined;
  const next: RecruitDmSession = {
    ...current,
    ...patch,
    id: current.id,
    createdAt: current.createdAt
  };
  sessions.set(id, next);
  return next;
}

export function closeRecruiterDmSession(id: string): void {
  const current = getRecruitDmSession(id);
  if (!current) return;
  updateRecruitDmSession(id, { recruiterControlsClosed: true });
}

export function deleteRecruitDmSession(id: string): void {
  sessions.delete(id);
}
