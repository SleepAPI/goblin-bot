import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageFlags } from 'discord.js';
import type { ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
import { handlePollVoteButtonInteraction, handlePollVoteModalInteraction } from './handlePollVoteInteraction';

vi.mock('./pollCache', () => ({
  findPollById: vi.fn(),
  recordVote: vi.fn()
}));

vi.mock('./buildPollMessageView', () => ({
  buildPollMessageView: vi.fn().mockReturnValue({ content: 'updated', components: [] })
}));

import { findPollById, recordVote } from './pollCache';
const mockFindPollById = vi.mocked(findPollById);
const mockRecordVote = vi.mocked(recordVote);

function makeActivePoll() {
  return {
    id: 'poll1',
    guildId: 'guild1',
    channelId: 'chan1',
    resultsRoleId: 'role1',
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
    questions: [{ messageId: 'm1', type: 'choice' as const, text: 'Best color?', answers: ['Red', 'Blue'] }],
    votes: [{}]
  };
}

function makeButtonInteraction(customId: string, overrides: Record<string, unknown> = {}): ButtonInteraction {
  return {
    customId,
    inGuild: vi.fn().mockReturnValue(true),
    guildId: 'guild1',
    user: { id: 'user1' },
    replied: false,
    deferred: false,
    reply: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
    ...overrides
  } as unknown as ButtonInteraction;
}

function makeModalInteraction(
  customId: string,
  response: string,
  overrides: Record<string, unknown> = {}
): ModalSubmitInteraction {
  return {
    customId,
    inGuild: vi.fn().mockReturnValue(true),
    guildId: 'guild1',
    user: { id: 'user1' },
    replied: false,
    deferred: false,
    isFromMessage: vi.fn().mockReturnValue(true),
    fields: { getTextInputValue: vi.fn().mockReturnValue(response) },
    reply: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    ...overrides
  } as unknown as ModalSubmitInteraction;
}

describe('handlePollVoteButtonInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false for custom IDs that do not start with pollv:', async () => {
    const interaction = makeButtonInteraction('settings:something');
    const result = await handlePollVoteButtonInteraction(interaction);
    expect(result).toBe(false);
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it('replies with an error if the poll does not exist in cache', async () => {
    mockFindPollById.mockResolvedValue(null);
    const interaction = makeButtonInteraction('pollv:c:poll1:0:0');
    await handlePollVoteButtonInteraction(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('no longer exists') })
    );
  });

  it('replies with "poll has ended" for an ended poll', async () => {
    mockFindPollById.mockResolvedValue({ ...makeActivePoll(), endedAt: '2026-01-01T06:00:00.000Z' });
    const interaction = makeButtonInteraction('pollv:c:poll1:0:0');
    await handlePollVoteButtonInteraction(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('ended') })
    );
  });

  it('replies with "poll has ended" for an expired poll', async () => {
    mockFindPollById.mockResolvedValue({ ...makeActivePoll(), expiresAt: '2020-01-01T00:00:00.000Z' });
    const interaction = makeButtonInteraction('pollv:c:poll1:0:0');
    await handlePollVoteButtonInteraction(interaction);
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('ended') })
    );
  });

  describe('choice votes (pollv:c)', () => {
    it('records the correct answer index and updates the public message', async () => {
      const poll = makeActivePoll();
      mockFindPollById.mockResolvedValue(poll);
      mockRecordVote.mockResolvedValue({ alreadyVoted: false, notFound: false });

      const interaction = makeButtonInteraction('pollv:c:poll1:0:1');
      await handlePollVoteButtonInteraction(interaction);

      expect(mockRecordVote).toHaveBeenCalledWith('guild1', 'poll1', 0, 'user1', 1);
      expect(interaction.update).toHaveBeenCalled();
    });

    it('sends an ephemeral confirmation after a successful vote', async () => {
      mockFindPollById.mockResolvedValue(makeActivePoll());
      mockRecordVote.mockResolvedValue({ alreadyVoted: false, notFound: false });

      const interaction = makeButtonInteraction('pollv:c:poll1:0:0');
      await handlePollVoteButtonInteraction(interaction);

      expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral }));
    });

    it('does not update the public message if the user already voted', async () => {
      mockFindPollById.mockResolvedValue(makeActivePoll());
      mockRecordVote.mockResolvedValue({ alreadyVoted: true, notFound: false });

      const interaction = makeButtonInteraction('pollv:c:poll1:0:0');
      await handlePollVoteButtonInteraction(interaction);

      expect(interaction.update).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('already voted'),
          flags: MessageFlags.Ephemeral
        })
      );
    });

    it('does not leak voter identity when updating the public message', async () => {
      mockFindPollById.mockResolvedValue(makeActivePoll());
      mockRecordVote.mockResolvedValue({ alreadyVoted: false, notFound: false });

      const interaction = makeButtonInteraction('pollv:c:poll1:0:0');
      await handlePollVoteButtonInteraction(interaction);

      // The update call args should not contain the userId
      const updateArg = JSON.stringify((interaction.update as ReturnType<typeof vi.fn>).mock.calls[0]);
      expect(updateArg).not.toContain('user1');
    });
  });

  describe('free text trigger (pollv:t)', () => {
    it('shows the response modal when the user has not yet submitted', async () => {
      // votes[0] is empty — user has not submitted
      mockFindPollById.mockResolvedValue({ ...makeActivePoll(), votes: [{}] });

      const interaction = makeButtonInteraction('pollv:t:poll1:0');
      await handlePollVoteButtonInteraction(interaction);

      expect(interaction.showModal).toHaveBeenCalled();
      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it('blocks the modal if the user already submitted a response', async () => {
      const poll = { ...makeActivePoll(), votes: [{ user1: 'I already answered' }] };
      mockFindPollById.mockResolvedValue(poll);

      const interaction = makeButtonInteraction('pollv:t:poll1:0');
      await handlePollVoteButtonInteraction(interaction);

      expect(interaction.showModal).not.toHaveBeenCalled();
      expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral }));
    });
  });
});

describe('handlePollVoteModalInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false for custom IDs that do not start with pollv:m:', async () => {
    const interaction = makeModalInteraction('poll:modal_choice:user1', 'text');
    const result = await handlePollVoteModalInteraction(interaction);
    expect(result).toBe(false);
  });

  it('records the full text response verbatim', async () => {
    mockRecordVote.mockResolvedValue({ alreadyVoted: false, notFound: false });
    mockFindPollById.mockResolvedValue(makeActivePoll());

    const interaction = makeModalInteraction('pollv:m:poll1:0', 'My detailed response here');
    await handlePollVoteModalInteraction(interaction);

    expect(mockRecordVote).toHaveBeenCalledWith('guild1', 'poll1', 0, 'user1', 'My detailed response here');
  });

  it('sends an ephemeral confirmation after recording', async () => {
    mockRecordVote.mockResolvedValue({ alreadyVoted: false, notFound: false });
    mockFindPollById.mockResolvedValue(makeActivePoll());

    const interaction = makeModalInteraction('pollv:m:poll1:0', 'A response');
    await handlePollVoteModalInteraction(interaction);

    expect(interaction.followUp).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral }));
  });

  it('rejects duplicate responses ephemerally without updating the public message', async () => {
    mockRecordVote.mockResolvedValue({ alreadyVoted: true, notFound: false });

    const updateMock = vi.fn().mockResolvedValue(undefined);
    const interaction = makeModalInteraction('pollv:m:poll1:0', 'A duplicate response', { update: updateMock });
    await handlePollVoteModalInteraction(interaction);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: MessageFlags.Ephemeral }));
    expect(updateMock).not.toHaveBeenCalled();
    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  it('replies with an error for an empty response', async () => {
    const interaction = makeModalInteraction('pollv:m:poll1:0', '   '); // whitespace only
    await handlePollVoteModalInteraction(interaction);

    expect(mockRecordVote).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('empty') })
    );
  });
});
