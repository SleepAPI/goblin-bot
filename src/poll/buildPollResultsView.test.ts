import { describe, expect, it } from 'vitest';
import { buildPollResultsView } from './buildPollResultsView';
import type { SavedPoll } from './types';

function makePoll(overrides: Partial<SavedPoll> = {}): SavedPoll {
  return {
    id: 'poll1',
    guildId: 'guild1',
    channelId: 'chan1',
    resultsRoleId: 'role1',
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2026-01-02T00:00:00.000Z',
    questions: [],
    votes: [],
    ...overrides
  };
}

describe('buildPollResultsView', () => {
  it('returns a "no questions found" embed for an empty poll', () => {
    const { embeds } = buildPollResultsView(makePoll());
    expect(embeds).toHaveLength(1);
    expect(embeds[0].toJSON().description).toContain('No questions found');
  });

  it('produces one embed per question', () => {
    const poll = makePoll({
      questions: [
        { messageId: 'm1', type: 'choice', text: 'Q1?', answers: ['A', 'B'] },
        { messageId: 'm2', type: 'text', text: 'Q2?' }
      ],
      votes: [{}, {}]
    });
    const { embeds } = buildPollResultsView(poll);
    expect(embeds).toHaveLength(2);
    expect(embeds[0].toJSON().title).toBe('Q1: Q1?');
    expect(embeds[1].toJSON().title).toBe('Q2: Q2?');
  });

  it('shows "Poll ended" in the footer when endedAt is set', () => {
    const poll = makePoll({
      questions: [{ messageId: 'm1', type: 'choice', text: 'Test?', answers: ['A', 'B'] }],
      votes: [{}],
      endedAt: '2026-01-01T12:00:00.000Z'
    });
    const { embeds } = buildPollResultsView(poll);
    expect(embeds[0].toJSON().footer?.text).toBe('Poll ended');
  });

  describe('choice questions', () => {
    it('shows empty bars and zero total when no votes cast', () => {
      const poll = makePoll({
        questions: [{ messageId: 'm1', type: 'choice', text: 'Best color?', answers: ['Red', 'Blue'] }],
        votes: [{}]
      });
      const { embeds } = buildPollResultsView(poll);
      const desc = embeds[0].toJSON().description ?? '';
      expect(desc).toContain('Total votes: **0**');
      expect(embeds[0].toJSON().fields ?? []).toHaveLength(0);
    });

    it('tallies votes correctly', () => {
      const poll = makePoll({
        questions: [{ messageId: 'm1', type: 'choice', text: 'Best color?', answers: ['Red', 'Blue', 'Green'] }],
        // 2 Red, 1 Blue, 0 Green
        votes: [{ u1: 0, u2: 0, u3: 1 }]
      });
      const { embeds } = buildPollResultsView(poll);
      const desc = embeds[0].toJSON().description ?? '';
      expect(desc).toContain('Total votes: **3**');
    });

    it('groups voter mentions by answer in a breakdown field', () => {
      const poll = makePoll({
        questions: [{ messageId: 'm1', type: 'choice', text: 'Yes or no?', answers: ['Yes', 'No'] }],
        votes: [{ uA: 0, uB: 1, uC: 0 }]
      });
      const { embeds } = buildPollResultsView(poll);
      const fields = embeds[0].toJSON().fields ?? [];
      const breakdown = fields.find((f) => f.name === 'Voter breakdown');
      expect(breakdown).toBeDefined();
      // Yes voters
      expect(breakdown!.value).toContain('<@uA>');
      expect(breakdown!.value).toContain('<@uC>');
      // No voter
      expect(breakdown!.value).toContain('<@uB>');
    });

    it('does not include a breakdown field when there are no votes', () => {
      const poll = makePoll({
        questions: [{ messageId: 'm1', type: 'choice', text: 'Test?', answers: ['Yes', 'No'] }],
        votes: [{}]
      });
      const { embeds } = buildPollResultsView(poll);
      const fields = embeds[0].toJSON().fields ?? [];
      expect(fields.find((f) => f.name === 'Voter breakdown')).toBeUndefined();
    });
  });

  describe('text questions', () => {
    it('shows "No responses yet" description when no responses', () => {
      const poll = makePoll({
        questions: [{ messageId: 'm1', type: 'text', text: 'What do you think?' }],
        votes: [{}]
      });
      const { embeds } = buildPollResultsView(poll);
      expect(embeds[0].toJSON().description).toContain('No responses yet');
    });

    it('shows the response count in the description', () => {
      const poll = makePoll({
        questions: [{ messageId: 'm1', type: 'text', text: 'What do you think?' }],
        votes: [{ u1: 'Great idea!', u2: 'Needs work' }]
      });
      const { embeds } = buildPollResultsView(poll);
      expect(embeds[0].toJSON().description).toContain('2 responses received');
    });

    it('shows each response as a @mention: text line in the Responses field', () => {
      const poll = makePoll({
        questions: [{ messageId: 'm1', type: 'text', text: 'What do you think?' }],
        votes: [{ uX: 'Needs more activity', uY: 'Better war strategy' }]
      });
      const { embeds } = buildPollResultsView(poll);
      const fields = embeds[0].toJSON().fields ?? [];
      const responsesField = fields.find((f) => f.name === 'Responses');
      expect(responsesField).toBeDefined();
      expect(responsesField!.value).toContain('<@uX>: Needs more activity');
      expect(responsesField!.value).toContain('<@uY>: Better war strategy');
    });

    it('does not include individual responses in the embed description', () => {
      const poll = makePoll({
        questions: [{ messageId: 'm1', type: 'text', text: 'Opinions?' }],
        votes: [{ u1: 'My secret opinion' }]
      });
      const { embeds } = buildPollResultsView(poll);
      // The description should only contain the count, not the response text
      expect(embeds[0].toJSON().description).not.toContain('My secret opinion');
    });
  });
});
