import { logger } from '@/utils/logger';
import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction
} from 'discord.js';
import { buildPollMessageView } from './buildPollMessageView';
import { findPollById, recordVote } from './pollCache';

export async function handlePollVoteButtonInteraction(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('pollv:')) return false;

  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: 'Polls can only be used inside a server.', flags: MessageFlags.Ephemeral });
    return true;
  }

  const parts = interaction.customId.split(':');
  const voteType = parts[1]; // 'c' or 't'
  const pollId = parts[2];
  const qIdx = parseInt(parts[3] ?? '0', 10);

  const poll = await findPollById(interaction.guildId, pollId);
  if (!poll) {
    await interaction.reply({ content: 'This poll no longer exists.', flags: MessageFlags.Ephemeral });
    return true;
  }

  if (poll.endedAt || new Date(poll.expiresAt) <= new Date()) {
    await interaction.reply({ content: 'This poll has ended.', flags: MessageFlags.Ephemeral });
    return true;
  }

  if (voteType === 't') {
    const questionVotes = poll.votes[qIdx] ?? {};
    const existingResponse = questionVotes[interaction.user.id];
    const questionLabel = poll.questions[qIdx]?.text.slice(0, 45) ?? 'Your response';
    const input = new TextInputBuilder()
      .setCustomId('poll_response')
      .setLabel(questionLabel)
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(1000)
      .setRequired(true)
      .setPlaceholder('Type your answer here...');

    if (typeof existingResponse === 'string') {
      input.setValue(existingResponse);
    }

    await interaction.showModal(
      new ModalBuilder()
        .setCustomId(`pollv:m:${pollId}:${qIdx}`)
        .setTitle(existingResponse !== undefined ? 'Update your response' : 'Submit your response')
        .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input))
    );
    return true;
  }

  if (voteType === 'c') {
    const aIdx = parseInt(parts[4] ?? '0', 10);

    const { voteChanged, notFound } = await recordVote(interaction.guildId, pollId, qIdx, interaction.user.id, aIdx);

    if (notFound) {
      await interaction.reply({ content: 'This poll no longer exists.', flags: MessageFlags.Ephemeral });
      return true;
    }

    const updatedPoll = await findPollById(interaction.guildId, pollId);
    if (!updatedPoll) {
      await interaction.reply({ content: 'Failed to record vote.', flags: MessageFlags.Ephemeral });
      return true;
    }

    const updatedVotes = updatedPoll.votes[qIdx] ?? {};
    await interaction.update(buildPollMessageView(updatedPoll, qIdx, updatedVotes));
    await interaction.followUp({
      content: voteChanged ? 'Your vote has been changed.' : 'Your vote has been recorded.',
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  return false;
}

export async function handlePollVoteModalInteraction(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('pollv:m:')) return false;

  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: 'Polls can only be used inside a server.', flags: MessageFlags.Ephemeral });
    return true;
  }

  const parts = interaction.customId.split(':');
  const pollId = parts[2];
  const qIdx = parseInt(parts[3] ?? '0', 10);

  const response = interaction.fields.getTextInputValue('poll_response').trim();
  if (!response) {
    await interaction.reply({ content: 'Response cannot be empty.', flags: MessageFlags.Ephemeral });
    return true;
  }

  try {
    const { voteChanged, notFound } = await recordVote(
      interaction.guildId,
      pollId,
      qIdx,
      interaction.user.id,
      response
    );

    if (notFound) {
      await interaction.reply({ content: 'This poll no longer exists.', flags: MessageFlags.Ephemeral });
      return true;
    }

    const confirmation = voteChanged ? 'Your response has been updated.' : 'Your response has been recorded.';
    const updatedPoll = await findPollById(interaction.guildId, pollId);

    if (updatedPoll && interaction.isFromMessage()) {
      const updatedVotes = updatedPoll.votes[qIdx] ?? {};
      await interaction.update(buildPollMessageView(updatedPoll, qIdx, updatedVotes));
      await interaction.followUp({ content: confirmation, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: confirmation, flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    logger.error({ err, pollId, qIdx }, 'Failed to record poll response');
    const payload = { content: 'Failed to record response. Please try again.', flags: MessageFlags.Ephemeral } as const;
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  }

  return true;
}
