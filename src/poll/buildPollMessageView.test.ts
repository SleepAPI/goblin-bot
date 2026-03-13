import { describe, expect, it } from 'vitest';
import type { APIButtonComponentWithCustomId } from 'discord-api-types/v10';
import { buildPollMessageView } from './buildPollMessageView';
import type { SavedPoll } from './types';

function makePoll(overrides: Partial<SavedPoll> = {}): SavedPoll {
  return {
    id: 'poll1',
    guildId: 'guild1',
    channelId: 'chan1',
    resultsRoleId: 'role1',
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z', // far future so not expired
    questions: [{ messageId: 'm1', type: 'choice', text: 'Best color?', answers: ['Red', 'Blue', 'Green'] }],
    votes: [{}],
    ...overrides
  };
}

describe('buildPollMessageView', () => {
  it('mentions the results role in the footer so voters know results are private', () => {
    const view = buildPollMessageView(makePoll(), 0, {});
    expect(view.content).toContain('<@&role1>');
  });

  describe('choice questions', () => {
    it('shows bare answer text on buttons when no votes exist', () => {
      const view = buildPollMessageView(makePoll(), 0, {});
      const buttons = view.components.flatMap((row) => row.toJSON().components) as APIButtonComponentWithCustomId[];
      expect(buttons).toHaveLength(3);
      expect(buttons[0].label).toBe('Red');
      expect(buttons[1].label).toBe('Blue');
      expect(buttons[2].label).toBe('Green');
    });

    it('appends per-option tallies once any votes exist', () => {
      const votes = { u1: 0, u2: 0, u3: 1 }; // 2 Red, 1 Blue, 0 Green
      const view = buildPollMessageView(makePoll(), 0, votes);
      const buttons = view.components.flatMap((row) => row.toJSON().components) as APIButtonComponentWithCustomId[];
      expect(buttons[0].label).toContain('Red · 2');
      expect(buttons[1].label).toContain('Blue · 1');
      expect(buttons[2].label).toContain('Green · 0');
    });

    it('never shows voter names on buttons', () => {
      const votes = { user_alice: 0, user_bob: 1 };
      const view = buildPollMessageView(makePoll(), 0, votes);
      const fullContent = JSON.stringify(view);
      expect(fullContent).not.toContain('user_alice');
      expect(fullContent).not.toContain('user_bob');
    });

    it('includes total vote count in the message content', () => {
      const votes = { u1: 0, u2: 1 };
      const view = buildPollMessageView(makePoll(), 0, votes);
      expect(view.content).toContain('2 votes cast');
    });

    it('uses correct custom IDs containing pollId, questionIndex, and answerIndex', () => {
      const view = buildPollMessageView(makePoll(), 0, {});
      const buttons = view.components.flatMap((row) => row.toJSON().components) as APIButtonComponentWithCustomId[];
      expect(buttons[0].custom_id).toBe('pollv:c:poll1:0:0');
      expect(buttons[1].custom_id).toBe('pollv:c:poll1:0:1');
      expect(buttons[2].custom_id).toBe('pollv:c:poll1:0:2');
    });

    it('disables all buttons when the poll has ended', () => {
      const poll = makePoll({ endedAt: '2026-01-01T06:00:00.000Z' });
      const view = buildPollMessageView(poll, 0, {});
      const buttons = view.components.flatMap((row) => row.toJSON().components) as APIButtonComponentWithCustomId[];
      expect(buttons.every((b) => b.disabled)).toBe(true);
    });

    it('disables all buttons when the poll is past its expiry', () => {
      const poll = makePoll({ expiresAt: '2020-01-01T00:00:00.000Z' });
      const view = buildPollMessageView(poll, 0, {});
      const buttons = view.components.flatMap((row) => row.toJSON().components) as APIButtonComponentWithCustomId[];
      expect(buttons.every((b) => b.disabled)).toBe(true);
    });

    it('keeps buttons enabled for an active poll', () => {
      const view = buildPollMessageView(makePoll(), 0, {});
      const buttons = view.components.flatMap((row) => row.toJSON().components) as APIButtonComponentWithCustomId[];
      expect(buttons.every((b) => !b.disabled)).toBe(true);
    });
  });

  describe('text questions', () => {
    const textPoll = () =>
      makePoll({
        questions: [{ messageId: 'm1', type: 'text', text: 'What do you think?' }],
        votes: [{}]
      });

    it('shows a single "Submit response" button', () => {
      const view = buildPollMessageView(textPoll(), 0, {});
      const buttons = view.components.flatMap((row) => row.toJSON().components) as APIButtonComponentWithCustomId[];
      expect(buttons).toHaveLength(1);
      expect(buttons[0].label).toBe('Submit response');
    });

    it('uses the correct text-vote custom ID', () => {
      const view = buildPollMessageView(textPoll(), 0, {});
      const buttons = view.components.flatMap((row) => row.toJSON().components) as APIButtonComponentWithCustomId[];
      expect(buttons[0].custom_id).toBe('pollv:t:poll1:0');
    });

    it('shows response count in content once responses exist', () => {
      const votes = { u1: 'Great!', u2: 'Meh', u3: 'Love it' };
      const view = buildPollMessageView(textPoll(), 0, votes);
      expect(view.content).toContain('3 responses received');
    });

    it('does not reveal individual response text in the public message content', () => {
      const votes = { u1: 'My very private opinion' };
      const view = buildPollMessageView(textPoll(), 0, votes);
      expect(view.content).not.toContain('My very private opinion');
    });
  });
});
