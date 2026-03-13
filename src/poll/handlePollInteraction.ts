import { logger } from '@/utils/logger';
import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type RoleSelectMenuInteraction,
  type StringSelectMenuInteraction
} from 'discord.js';
import { randomBytes } from 'node:crypto';
import { buildPollDraftView } from './buildPollDraftView';
import { buildPollMessageView } from './buildPollMessageView';
import { savePoll } from './pollCache';
import { deleteDraft, getDraft, setDraft } from './pollDraftState';
import type { SavedPoll, SavedPollQuestion } from './types';

export type PollComponentInteraction = ButtonInteraction | StringSelectMenuInteraction | RoleSelectMenuInteraction;

function buildChoiceModal(userId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`poll:modal_choice:${userId}`)
    .setTitle('Add multiple choice question')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('poll_question')
          .setLabel('Question')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(300)
          .setRequired(true)
          .setPlaceholder('e.g. Should we merge Clan A and Clan B?')
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('poll_a1')
          .setLabel('Answer 1')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(55)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('poll_a2')
          .setLabel('Answer 2')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(55)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('poll_a3')
          .setLabel('Answer 3 (optional)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(55)
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('poll_a4')
          .setLabel('Answer 4 (optional)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(55)
          .setRequired(false)
      )
    );
}

function buildTextModal(userId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`poll:modal_text:${userId}`)
    .setTitle('Add free text question')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('poll_question')
          .setLabel('Question')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(300)
          .setRequired(true)
          .setPlaceholder('e.g. What is one thing we could improve in our clan?')
      )
    );
}

async function publishPoll(interaction: ButtonInteraction): Promise<void> {
  const userId = interaction.user.id;
  const draft = getDraft(userId);

  if (!draft?.resultsRoleId || draft.questions.length === 0) {
    await interaction.reply({ content: 'Poll is not ready to publish.', flags: MessageFlags.Ephemeral });
    return;
  }

  const channel =
    interaction.guild?.channels.cache.get(draft.channelId) ??
    (await interaction.guild?.channels.fetch(draft.channelId).catch(() => null));

  if (!channel?.isTextBased()) {
    await interaction.update({ content: 'Could not find the channel to post the poll in.', components: [] });
    return;
  }

  await interaction.deferUpdate();

  const pollId = randomBytes(4).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + draft.durationHours * 60 * 60 * 1000);

  // Build a stub SavedPoll so we can generate message views before the final record is written
  const stub: SavedPoll = {
    id: pollId,
    guildId: draft.guildId,
    channelId: draft.channelId,
    resultsRoleId: draft.resultsRoleId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    questions: [],
    votes: []
  };

  const savedQuestions: SavedPollQuestion[] = [];

  for (const [qIdx, question] of draft.questions.entries()) {
    try {
      // Push question into stub before building the view so buildPollMessageView can access it
      stub.questions.push({ messageId: '', type: question.type, text: question.text, answers: question.answers });
      stub.votes.push({});

      const view = buildPollMessageView(stub, qIdx, {});
      const message = await channel.send(view);

      stub.questions[qIdx].messageId = message.id;
      savedQuestions.push({
        messageId: message.id,
        type: question.type,
        text: question.text,
        answers: question.answers
      });
    } catch (err) {
      logger.error({ err, question: question.text }, 'Failed to post poll question');
    }
  }

  if (savedQuestions.length === 0) {
    await interaction.editReply({
      content: 'Failed to post any poll questions. Check bot permissions.',
      components: []
    });
    return;
  }

  const savedPoll: SavedPoll = {
    id: pollId,
    guildId: draft.guildId,
    channelId: draft.channelId,
    resultsRoleId: draft.resultsRoleId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    questions: savedQuestions,
    votes: savedQuestions.map(() => ({}))
  };

  await savePoll(savedPoll);
  deleteDraft(userId);

  const qCount = savedQuestions.length;
  await interaction.editReply({
    content:
      `Poll published with ${qCount} question${qCount === 1 ? '' : 's'}! ` +
      `Use \`/poll results\` to see responses (requires <@&${draft.resultsRoleId}>).`,
    components: []
  });
}

export async function handlePollComponentInteraction(interaction: PollComponentInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('poll:')) return false;

  if (!interaction.inGuild() || !interaction.guildId) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Polls can only be used inside a server.', flags: MessageFlags.Ephemeral });
    }
    return true;
  }

  const parts = interaction.customId.split(':');
  const action = parts[1];
  const targetUserId = parts[2];

  if (targetUserId !== interaction.user.id) {
    await interaction.reply({ content: "That's someone else's poll builder.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const userId = interaction.user.id;

  if (action === 'add_choice' && interaction.isButton()) {
    await interaction.showModal(buildChoiceModal(userId));
    return true;
  }

  if (action === 'add_text' && interaction.isButton()) {
    await interaction.showModal(buildTextModal(userId));
    return true;
  }

  if (action === 'publish' && interaction.isButton()) {
    await publishPoll(interaction);
    return true;
  }

  if (action === 'set_role' && interaction.isRoleSelectMenu()) {
    await interaction.deferUpdate();
    const draft = getDraft(userId);
    if (!draft) {
      await interaction.followUp({
        content: 'Poll session expired. Run `/poll create` again.',
        flags: MessageFlags.Ephemeral
      });
      return true;
    }
    draft.resultsRoleId = interaction.values[0] ?? null;
    setDraft(draft);
    await interaction.editReply(buildPollDraftView(draft));
    return true;
  }

  if (action === 'set_duration' && interaction.isStringSelectMenu()) {
    await interaction.deferUpdate();
    const draft = getDraft(userId);
    if (!draft) {
      await interaction.followUp({
        content: 'Poll session expired. Run `/poll create` again.',
        flags: MessageFlags.Ephemeral
      });
      return true;
    }
    draft.durationHours = parseInt(interaction.values[0] ?? '24', 10);
    setDraft(draft);
    await interaction.editReply(buildPollDraftView(draft));
    return true;
  }

  if (action === 'del_q' && interaction.isStringSelectMenu()) {
    await interaction.deferUpdate();
    const draft = getDraft(userId);
    if (!draft) {
      await interaction.followUp({
        content: 'Poll session expired. Run `/poll create` again.',
        flags: MessageFlags.Ephemeral
      });
      return true;
    }
    const index = parseInt(interaction.values[0] ?? '-1', 10);
    if (index >= 0 && index < draft.questions.length) {
      draft.questions.splice(index, 1);
      setDraft(draft);
    }
    await interaction.editReply(buildPollDraftView(draft));
    return true;
  }

  return false;
}

export async function handlePollModalInteraction(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('poll:modal_')) return false;

  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: 'Polls can only be used inside a server.', flags: MessageFlags.Ephemeral });
    return true;
  }

  const isChoice = interaction.customId.startsWith('poll:modal_choice:');
  const isText = interaction.customId.startsWith('poll:modal_text:');
  if (!isChoice && !isText) return false;

  const userId = interaction.user.id;
  const draft = getDraft(userId);

  if (!draft) {
    await interaction.reply({
      content: 'Poll session expired. Run `/poll create` again.',
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  if (draft.questions.length >= 5) {
    await interaction.reply({ content: 'Maximum 5 questions per poll.', flags: MessageFlags.Ephemeral });
    return true;
  }

  const questionText = interaction.fields.getTextInputValue('poll_question').trim();
  if (!questionText) {
    await interaction.reply({ content: 'Question text is required.', flags: MessageFlags.Ephemeral });
    return true;
  }

  if (isText) {
    draft.questions.push({ type: 'text', text: questionText });
  } else {
    const a1 = interaction.fields.getTextInputValue('poll_a1').trim();
    const a2 = interaction.fields.getTextInputValue('poll_a2').trim();
    const a3 = interaction.fields.getTextInputValue('poll_a3')?.trim();
    const a4 = interaction.fields.getTextInputValue('poll_a4')?.trim();

    if (!a1 || !a2) {
      await interaction.reply({ content: 'At least 2 answers are required.', flags: MessageFlags.Ephemeral });
      return true;
    }

    const answers = [a1, a2, a3, a4].filter((a): a is string => Boolean(a));
    draft.questions.push({ type: 'choice', text: questionText, answers });
  }

  setDraft(draft);

  const view = buildPollDraftView(draft);
  if (interaction.isFromMessage()) {
    await interaction.update(view);
  } else {
    await interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
  }

  return true;
}
