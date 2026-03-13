import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDraft, getDraft, getOrCreateDraft, setDraft } from './pollDraftState';

const USER = 'user1';
const GUILD = 'guild1';
const CHANNEL = 'chan1';

describe('pollDraftState', () => {
  beforeEach(() => {
    deleteDraft(USER);
  });

  describe('getOrCreateDraft', () => {
    it('creates a new draft with correct defaults', () => {
      const draft = getOrCreateDraft(USER, GUILD, CHANNEL);
      expect(draft.userId).toBe(USER);
      expect(draft.guildId).toBe(GUILD);
      expect(draft.channelId).toBe(CHANNEL);
      expect(draft.resultsRoleId).toBeNull();
      expect(draft.durationHours).toBe(24);
      expect(draft.questions).toEqual([]);
    });

    it('returns the existing draft without resetting it', () => {
      const draft = getOrCreateDraft(USER, GUILD, CHANNEL);
      draft.resultsRoleId = 'roleX';
      draft.durationHours = 48;

      const again = getOrCreateDraft(USER, GUILD, 'different-channel');
      expect(again.resultsRoleId).toBe('roleX');
      expect(again.durationHours).toBe(48);
      // channelId from original call is preserved
      expect(again.channelId).toBe(CHANNEL);
    });
  });

  describe('getDraft', () => {
    it('returns undefined when no draft exists for the user', () => {
      expect(getDraft('no-such-user')).toBeUndefined();
    });

    it('returns the draft after it has been created', () => {
      getOrCreateDraft(USER, GUILD, CHANNEL);
      expect(getDraft(USER)).toBeDefined();
    });
  });

  describe('setDraft', () => {
    it('stores mutations made to the draft object', () => {
      const draft = getOrCreateDraft(USER, GUILD, CHANNEL);
      draft.durationHours = 72;
      draft.resultsRoleId = 'role99';
      setDraft(draft);

      const retrieved = getDraft(USER);
      expect(retrieved?.durationHours).toBe(72);
      expect(retrieved?.resultsRoleId).toBe('role99');
    });
  });

  describe('deleteDraft', () => {
    it('removes the draft so getDraft returns undefined', () => {
      getOrCreateDraft(USER, GUILD, CHANNEL);
      deleteDraft(USER);
      expect(getDraft(USER)).toBeUndefined();
    });

    it('is a no-op when no draft exists', () => {
      expect(() => deleteDraft('ghost-user')).not.toThrow();
    });
  });

  it('drafts for different users are independent', () => {
    const a = getOrCreateDraft('userA', GUILD, CHANNEL);
    const b = getOrCreateDraft('userB', GUILD, CHANNEL);
    a.durationHours = 1;
    b.durationHours = 168;

    expect(getDraft('userA')?.durationHours).toBe(1);
    expect(getDraft('userB')?.durationHours).toBe(168);

    deleteDraft('userA');
    expect(getDraft('userA')).toBeUndefined();
    expect(getDraft('userB')).toBeDefined();
  });
});
