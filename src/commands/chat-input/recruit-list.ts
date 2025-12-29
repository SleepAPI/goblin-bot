import type { ChatInputCommand } from '@/commands/types';
import { FAMILY_LEADER_ROLE_ID } from '@/config/roles';
import { getRecruitAllowedRoleIds } from '@/recruit/configStore';
import { getRoleIdsFromMember } from '@/utils/discordRoles';
import { logger } from '@/utils/logger';
import { SlashCommandBuilder } from 'discord.js';

const command: ChatInputCommand = {
  data: new SlashCommandBuilder()
    .setName('recruit-list')
    .setDescription('Show all open recruit threads in this server')
    .setDMPermission(false),
  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guild || !interaction.guildId) {
      await interaction.reply({
        content: 'This command can only be used inside a server channel.',
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

    await interaction.deferReply({ ephemeral: true });

    const botId = interaction.client.user?.id;
    if (!botId) {
      await interaction.editReply('Bot user is unavailable. Please try again.');
      return;
    }

    try {
      const fetched = await guild.channels.fetchActiveThreads();
      const openThreads = fetched.threads.filter(
        (thread) => !thread.archived && !thread.locked && thread.ownerId === botId
      );

      if (openThreads.size === 0) {
        await interaction.editReply('No open recruit threads found.');
        return;
      }

      const sorted = Array.from(openThreads.values()).sort(
        (a, b) => (a.createdTimestamp ?? 0) - (b.createdTimestamp ?? 0)
      );

      // Fetch creator info for all threads in parallel for better performance
      const threadData = await Promise.all(
        sorted.map(async (thread) => {
          let creatorMention = 'Unknown';
          try {
            // Try starter message first (cheaper than fetching thread messages)
            const starterMessage = await thread.fetchStarterMessage().catch(() => null);
            if (starterMessage?.content) {
              const starterMatch = starterMessage.content.match(/Recruit thread created by\s*<@!?(\d+)>/i);
              if (starterMatch && starterMatch[1]) {
                creatorMention = `<@${starterMatch[1]}>`;
                return { thread, creatorMention };
              }
            }

            // Fallback: fetch first few messages from thread (reduced limit for performance)
            const messages = await thread.messages.fetch({ limit: 3 }).catch(() => null);
            if (messages && messages.size > 0) {
              // Get the oldest message (last in the collection since messages are newest first)
              const firstMessage = messages.last();
              if (firstMessage) {
                // Check message content and embeds for creator mention
                const contentToCheck = firstMessage.content ?? '';
                const embedTexts = firstMessage.embeds
                  .map((embed) => [
                    embed.title,
                    embed.description,
                    ...(embed.fields?.map((f) => `${f.name} ${f.value}`) ?? [])
                  ])
                  .flat()
                  .filter(Boolean)
                  .join('\n');

                const fullText = `${contentToCheck}\n${embedTexts}`;

                if (fullText) {
                  // Look for "Recruit thread created by <@userId>" or "requested by <@userId>" patterns
                  const createdByMatch = fullText.match(/Recruit thread created by\s*<@!?(\d+)>/i);
                  if (createdByMatch && createdByMatch[1]) {
                    creatorMention = `<@${createdByMatch[1]}>`;
                  } else {
                    const requestedByMatch = fullText.match(/requested by\s*<@!?(\d+)>/i);
                    if (requestedByMatch && requestedByMatch[1]) {
                      creatorMention = `<@${requestedByMatch[1]}>`;
                    } else {
                      // Fallback: check for any user mention (excluding bot)
                      const anyMentionMatch = fullText.match(/<@!?(\d+)>/);
                      if (anyMentionMatch && anyMentionMatch[1] && anyMentionMatch[1] !== botId) {
                        creatorMention = `<@${anyMentionMatch[1]}>`;
                      }
                    }
                  }
                }
              }
            }
          } catch (err) {
            logger.error({ err, threadId: thread.id }, 'Error determining creator');
          }

          return { thread, creatorMention };
        })
      );

      const lines: string[] = [];
      let hiddenCount = 0;
      let runningLength = 0;

      for (const { thread, creatorMention } of threadData) {
        const createdDate = thread.createdAt
          ? thread.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : 'Unknown date';
        const line = `<#${thread.id}> — Created by ${creatorMention}: ${createdDate}`;
        const nextLength = runningLength + line.length + (lines.length ? 1 : 0);

        if (nextLength > 1800) {
          hiddenCount += 1;
          continue;
        }

        lines.push(line);
        runningLength = nextLength;
      }

      let content = `Open recruit threads (${openThreads.size}):\n${lines.join('\n')}`;
      if (hiddenCount > 0) {
        content += `\n…and ${hiddenCount} more not shown to stay under Discord message limits.`;
      }

      await interaction.editReply({ content });
    } catch {
      await interaction.editReply('Could not load open recruit threads right now. Please try again.');
    }
  }
};

export default command;
