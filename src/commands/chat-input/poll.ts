import type { ChatInputCommand } from '@/commands/types';
import { buildPollDraftView } from '@/poll/buildPollDraftView';
import { buildPollResultsView } from '@/poll/buildPollResultsView';
import { findPollById, listActivePolls, listAllPolls, updatePoll } from '@/poll/pollCache';
import { getOrCreateDraft } from '@/poll/pollDraftState';
import type { SavedPoll } from '@/poll/types';
import { getRoleIdsFromMember } from '@/utils/discordRoles';
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction, type Guild } from 'discord.js';

async function handleCreate(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) return;

  const draft = getOrCreateDraft(interaction.user.id, interaction.guildId, interaction.channelId);
  const view = buildPollDraftView(draft);
  await interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
}

async function handleResults(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) return;

  const pollId = interaction.options.getString('poll_id');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let poll: SavedPoll | null = null;
  if (pollId) {
    poll = await findPollById(interaction.guildId, pollId);
  } else {
    // Most recent active poll, or most recent overall if none active
    const active = await listActivePolls(interaction.guildId);
    poll = active[active.length - 1] ?? null;
    if (!poll) {
      const all = await listAllPolls(interaction.guildId);
      poll = all[all.length - 1] ?? null;
    }
  }

  if (!poll) {
    await interaction.editReply({ content: 'No polls found for this server.' });
    return;
  }

  const memberRoleIds = getRoleIdsFromMember(interaction.member);
  const guild = interaction.guild as Guild | null;
  const isOwner = guild?.ownerId === interaction.user.id;

  if (!isOwner && !memberRoleIds.has(poll.resultsRoleId)) {
    await interaction.editReply({
      content: `You need the <@&${poll.resultsRoleId}> role to view detailed poll results.`
    });
    return;
  }

  const { embeds } = buildPollResultsView(poll);
  await interaction.editReply({ embeds: embeds.slice(0, 10) });

  for (let i = 10; i < embeds.length; i += 10) {
    await interaction.followUp({ embeds: embeds.slice(i, i + 10), flags: MessageFlags.Ephemeral });
  }
}

async function handleEnd(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) return;

  const pollId = interaction.options.getString('poll_id');
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let poll: SavedPoll | null = null;
  if (pollId) {
    poll = await findPollById(interaction.guildId, pollId);
  } else {
    const active = await listActivePolls(interaction.guildId);
    poll = active[active.length - 1] ?? null;
  }

  if (!poll) {
    await interaction.editReply({ content: 'No active poll found.' });
    return;
  }

  const memberRoleIds = getRoleIdsFromMember(interaction.member);
  const guild = interaction.guild as Guild | null;
  const isOwner = guild?.ownerId === interaction.user.id;

  if (!isOwner && !memberRoleIds.has(poll.resultsRoleId)) {
    await interaction.editReply({
      content: `You need the <@&${poll.resultsRoleId}> role to end this poll.`
    });
    return;
  }

  const endedAt = new Date().toISOString();
  await updatePoll(interaction.guildId, poll.id, { endedAt });

  // Disable buttons on published messages so no new votes can be cast
  const channel = guild ? await guild.channels.fetch(poll.channelId).catch(() => null) : null;
  if (channel?.isTextBased()) {
    const { buildPollMessageView } = await import('@/poll/buildPollMessageView');
    const endedPoll = { ...poll, endedAt };
    for (const [qIdx, q] of poll.questions.entries()) {
      try {
        const message = await channel.messages.fetch(q.messageId);
        await message.edit(buildPollMessageView(endedPoll, qIdx, poll.votes[qIdx] ?? {}));
      } catch {
        // Message deleted, skip
      }
    }
  }

  const qCount = poll.questions.length;
  await interaction.editReply({
    content: `Poll ended. ${qCount} question${qCount === 1 ? '' : 's'} closed. Use \`/poll results\` to view responses.`
  });
}

const command: ChatInputCommand = {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create and manage pseudo-anonymous polls')
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('create').setDescription('Open the interactive poll builder'))
    .addSubcommand((sub) =>
      sub
        .setName('results')
        .setDescription('View detailed voter breakdown (requires results role)')
        .addStringOption((opt) =>
          opt
            .setName('poll_id')
            .setDescription('Which poll to view (defaults to most recent)')
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('end')
        .setDescription('End a poll early (requires results role)')
        .addStringOption((opt) =>
          opt
            .setName('poll_id')
            .setDescription('Which poll to end (defaults to most recent active)')
            .setRequired(false)
            .setAutocomplete(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'create') return handleCreate(interaction);
    if (sub === 'results') return handleResults(interaction);
    if (sub === 'end') return handleEnd(interaction);
  },

  async autocomplete(interaction) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.respond([]);
      return;
    }

    const sub = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused().toLowerCase();

    try {
      const polls =
        sub === 'end' ? await listActivePolls(interaction.guildId) : await listAllPolls(interaction.guildId);

      const choices = polls
        .filter((p) => {
          const label = p.questions[0]?.text ?? p.id;
          return label.toLowerCase().includes(focused) || p.id.includes(focused);
        })
        .slice(-25) // most recent 25
        .reverse()
        .map((p) => ({
          name: (p.questions[0]?.text ?? p.id).slice(0, 100),
          value: p.id
        }));

      await interaction.respond(choices);
    } catch {
      await interaction.respond([]);
    }
  }
};

export default command;
