import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type GuildTextBasedChannel,
  type StringSelectMenuInteraction
} from 'discord.js';
import { getRecruitDmSession, type RecruitDmSession } from '@/recruit/dmSessionStore';
import { logger } from '@/utils/logger';

function isApplicantCustomId(customId: string): boolean {
  return customId.startsWith('recruit_app:');
}

function parseCustomId(customId: string): { action: string; sessionId: string } | null {
  if (!isApplicantCustomId(customId)) return null;
  const [, action, sessionId] = customId.split(':');
  if (!sessionId) return null;
  return { action, sessionId };
}

async function notifyThread(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  session: RecruitDmSession,
  content: string
) {
  try {
    const channel = await interaction.client.channels.fetch(session.threadId).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
    const guildChannel = channel as GuildTextBasedChannel;
    await guildChannel.send({
      content,
      allowedMentions: { users: [session.recruiterId] }
    });
  } catch (err) {
    logger.warn({ err, sessionId: session?.id }, 'Failed to notify recruit thread from applicant DM');
  }
}

export async function handleApplicantDmInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction
): Promise<boolean> {
  if (!isApplicantCustomId(interaction.customId)) return false;
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return false;

  const session = getRecruitDmSession(parsed.sessionId);
  if (!session) {
    await interaction.reply({
      content: 'This recruit session expired. Please run the command again if you still need help.',
      ephemeral: false
    });
    return true;
  }

  if (interaction.isButton()) {
    if (parsed.action === 'talk') {
      await interaction.reply({
        content: 'Thanks! I just let the clan know you want to chat. Someone will DM you shortly.',
        ephemeral: false
      });
      await notifyThread(
        interaction,
        session,
        `📣 ${interaction.user} would like to talk to a clanmate. <@${session.recruiterId}>`
      );
      return true;
    }
    return false;
  }

  if (interaction.isStringSelectMenu()) {
    if (parsed.action === 'apply') {
      const clanTag = interaction.values?.[0];
      if (!clanTag) {
        await interaction.reply({ content: 'Please pick a clan first.', ephemeral: false });
        return true;
      }
      const summary = session.clanSummaries?.find((entry) => entry.tag === clanTag);
      if (!summary) {
        await interaction.reply({
          content: 'That clan is no longer available. Try another option.',
          ephemeral: false
        });
        return true;
      }
      if (!summary.eligible) {
        await interaction.reply({
          content: summary.reason ? `That clan is currently unavailable: ${summary.reason}` : 'That clan is full.',
          ephemeral: false
        });
        return true;
      }

      const hasLink = typeof summary.applicationUrl === 'string' && summary.applicationUrl.startsWith('http');
      const lines = [`Awesome! I'll let **${summary.name}** know you're ready to apply.`];
      if (summary.applicationUrl) {
        lines.push(hasLink ? `Apply here: ${summary.applicationUrl}` : summary.applicationUrl);
      }
      const applicationUrl = hasLink ? summary.applicationUrl : undefined;
      const components =
        applicationUrl && hasLink
          ? [
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setStyle(ButtonStyle.Link)
                  .setLabel(`Apply to ${summary.name}`)
                  .setURL(applicationUrl)
              )
            ]
          : [];

      await interaction.reply({
        content: lines.join('\n'),
        components
      });
      await notifyThread(
        interaction,
        session,
        `📥 ${interaction.user} wants to apply to **${summary.name}** (${summary.tag}). <@${session.recruiterId}>`
      );
      return true;
    }
  }

  return false;
}
