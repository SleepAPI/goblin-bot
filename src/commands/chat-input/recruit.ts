import type { ChatInputCommand } from '@/commands/types';
import { FAMILY_LEADER_ROLE_ID } from '@/config/roles';
import { ClashOfClansClient, isValidPlayerTag, normalizePlayerTag } from '@/integrations/clashOfClans/client';
import { getRecruitAllowedRoleIds } from '@/recruit/configStore';
import { ensureRecruitThreadFromMessage, populateRecruitThread } from '@/recruit/createRecruitThread';
import {
  clearOpenApplicantThreadByThreadId,
  getOpenThreadByMessageId,
  registerOpenApplicantThread,
  releaseMessageIdLock,
  tryLockMessageId
} from '@/recruit/openApplicantStore';
import { getRoleIdsFromMember } from '@/utils/discordRoles';
import { SlashCommandBuilder } from 'discord.js';

const command: ChatInputCommand = {
  data: new SlashCommandBuilder()
    .setName('recruit')
    .setDescription('Look up a Clash of Clans player by tag')
    .addStringOption((opt) => opt.setName('player_tag').setDescription('Player tag, e.g. #ABC123').setRequired(true))
    .addStringOption((opt) =>
      opt
        .setName('source')
        .setDescription('Where this applicant came from')
        .addChoices(
          { name: 'Reddit', value: 'reddit' },
          { name: 'Discord', value: 'discord' },
          { name: 'Other', value: 'other' }
        )
    ),
  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guild || !interaction.guildId) {
      await interaction.reply({
        content: 'This command can only create threads inside a server channel.',
        ephemeral: true
      });
      return;
    }

    const guild = interaction.guild;
    const guildId = interaction.guildId;

    const leaderRole =
      guild.roles.cache.get(FAMILY_LEADER_ROLE_ID) ??
      (await guild.roles.fetch(FAMILY_LEADER_ROLE_ID).catch(() => null));

    if (!leaderRole) {
      await interaction.reply({
        content: `The Family Leader role (<@&${FAMILY_LEADER_ROLE_ID}>) is missing in this server. Create it to use this command.`,
        ephemeral: true
      });
      return;
    }

    const memberRoleIds = getRoleIdsFromMember(interaction.member);
    const allowedIds = await getRecruitAllowedRoleIds(guildId);
    const hasLeaderRole = memberRoleIds.has(FAMILY_LEADER_ROLE_ID);
    const hasAllowedRole = allowedIds.some((id) => memberRoleIds.has(id));

    if (!hasLeaderRole && !hasAllowedRole) {
      await interaction.reply({
        content: 'Only Family Leaders or configured roles can use this command.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply();

    const playerTag = interaction.options.getString('player_tag', true);
    if (!isValidPlayerTag(playerTag)) {
      await interaction.editReply(
        `Invalid player tag.\n` +
          `- Tag: \`${playerTag}\`\n` +
          `Expected something like \`#ABC123\` (letters/numbers only).`
      );
      return;
    }
    const client = new ClashOfClansClient();
    const normalizedPlayerTag = normalizePlayerTag(playerTag);
    const sourceInteractionId = interaction.id;
    let pendingMessageIdLock: string | null = null;

    try {
      // Check for existing thread by interaction ID in the store (fast in-memory lookup)
      const existingInStore = getOpenThreadByMessageId(sourceInteractionId);
      if (existingInStore) {
        const existingChannel = await interaction.client.channels.fetch(existingInStore.threadId).catch(() => null);
        const isStillOpen = existingChannel?.isThread() && !existingChannel.archived;
        if (isStillOpen) {
          await interaction.editReply(
            `A recruit thread already exists for this command: <#${existingInStore.threadId}>.\n` +
              'Close the existing thread before creating another.'
          );
          return;
        }
        clearOpenApplicantThreadByThreadId(existingInStore.threadId);
      }

      // Lock the interaction ID to prevent concurrent creation
      if (!tryLockMessageId(sourceInteractionId)) {
        // If lock fails, check one more time if a thread exists (race condition)
        const existingAfterLock = getOpenThreadByMessageId(sourceInteractionId);
        if (existingAfterLock) {
          const existingChannel = await interaction.client.channels.fetch(existingAfterLock.threadId).catch(() => null);
          const isStillOpen = existingChannel?.isThread() && !existingChannel.archived;
          if (isStillOpen) {
            await interaction.editReply(
              `A recruit thread already exists for this command: <#${existingAfterLock.threadId}>.\n` +
                'Close the existing thread before creating another.'
            );
            return;
          }
        }
        await interaction.editReply(
          'Another recruiter is already creating a recruit thread for this command. Please try again shortly.'
        );
        return;
      }
      pendingMessageIdLock = sourceInteractionId;

      const source = interaction.options.getString('source') ?? 'unknown';
      const player = await client.getPlayerByTag(playerTag);

      const thValue = typeof player.townHallLevel === 'number' && player.townHallLevel > 0 ? player.townHallLevel : '?';
      const threadName = `${player.name} TH ${thValue} ${source}. @${interaction.user.username}`;

      // Reply in-channel, then start a thread from that reply message.
      const replyMessage = await interaction.fetchReply();

      const thread = await ensureRecruitThreadFromMessage(replyMessage, threadName);

      if (thread) {
        // Register the thread in the store (using interaction ID as source message ID)
        const placeholderApplicantId = `player-tag:${normalizedPlayerTag}`;
        registerOpenApplicantThread({
          applicantId: placeholderApplicantId,
          applicantTag: player.name,
          threadId: thread.id,
          threadUrl: `https://discord.com/channels/${thread.guildId ?? '@me'}/${thread.id}`,
          playerTag: normalizedPlayerTag,
          guildId: thread.guildId ?? guildId,
          sourceMessageId: sourceInteractionId
        });
        pendingMessageIdLock = null;

        const summaryParts = [
          interaction.guild ? `from ${interaction.guild.name}` : undefined,
          `Requested via /recruit by ${interaction.user.tag}`
        ].filter(Boolean);
        const sourceSummary = summaryParts.join(' • ') || undefined;

        await populateRecruitThread({
          thread,
          player,
          client,
          customBaseId: `recruit:${interaction.id}`,
          replyMessageId: replyMessage.id,
          originalMessageSummary: sourceSummary
        });
        await interaction.editReply({ content: `Thread created: <#${thread.id}>` });
      } else {
        await interaction.editReply('Could not create a thread in this channel.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to look up that player. Please try again.';
      await interaction.editReply({
        content: `Could not look up that player tag.\n` + `- Tag: \`${playerTag}\`\n` + `- Error: ${msg}\n`
      });
    } finally {
      if (pendingMessageIdLock) {
        releaseMessageIdLock(pendingMessageIdLock);
      }
    }
  }
};

export default command;
