import type { PollDraft } from './types';

const drafts = new Map<string, PollDraft>();

export function getDraft(userId: string): PollDraft | undefined {
  return drafts.get(userId);
}

export function setDraft(draft: PollDraft): void {
  drafts.set(draft.userId, draft);
}

export function deleteDraft(userId: string): void {
  drafts.delete(userId);
}

export function getOrCreateDraft(userId: string, guildId: string, channelId: string): PollDraft {
  const existing = drafts.get(userId);
  if (existing) return existing;

  const draft: PollDraft = {
    userId,
    guildId,
    channelId,
    resultsRoleId: null,
    durationHours: 24,
    questions: []
  };
  drafts.set(userId, draft);
  return draft;
}
