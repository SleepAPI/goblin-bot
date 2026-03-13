import { getChatInputCommandMap, getMessageCommandMap } from '@/bot/state';
import { handleCwlComponentInteraction } from '@/cwl/handleCwlComponentInteraction';
import { handleCwlNavigation } from '@/cwl/handleCwlNavigation';
import type { ClientEvent } from '@/events/types';
import { handlePollComponentInteraction, handlePollModalInteraction } from '@/poll/handlePollInteraction';
import { handlePollVoteButtonInteraction, handlePollVoteModalInteraction } from '@/poll/handlePollVoteInteraction';
import { handleApplicantDmInteraction } from '@/recruit/applicantDmInteractions';
import { handleRecruitComponentInteraction } from '@/recruit/handleRecruitComponentInteraction';
import { handleRecruiterDmComponentInteraction } from '@/recruit/recruiterDmControls';
import {
  handleSettingsComponentInteraction,
  handleSettingsModalInteraction
} from '@/settings/handleSettingsComponentInteraction';
import { logger } from '@/utils/logger';
import { MessageFlags } from 'discord.js';

const event: ClientEvent<'interactionCreate'> = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (interaction.isAutocomplete()) {
      const command = getChatInputCommandMap().get(interaction.commandName);
      if (command?.autocomplete) {
        await command.autocomplete(interaction);
      }
      return;
    }

    // Handle /recruit buttons/selects (Accept/Close) globally so they keep working
    // even after the short-lived per-message collectors expire.
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      try {
        const dmHandled = await handleRecruiterDmComponentInteraction(interaction);
        if (dmHandled) return;
      } catch (err) {
        logger.error({ err, customId: interaction.customId }, 'Recruit DM interaction failed');
        await interaction.reply({
          content: 'Something went wrong while handling that DM control.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      try {
        const applicantHandled = await handleApplicantDmInteraction(interaction);
        if (applicantHandled) return;
      } catch (err) {
        logger.error({ err, customId: interaction.customId }, 'Applicant interaction failed');
        await interaction.reply({
          content: 'Something went wrong while handling that option.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }
    }

    if (
      interaction.isButton() ||
      interaction.isStringSelectMenu() ||
      interaction.isRoleSelectMenu() ||
      interaction.isChannelSelectMenu()
    ) {
      if (interaction.isButton()) {
        try {
          const handled = await handlePollVoteButtonInteraction(interaction);
          if (handled) return;
        } catch (err) {
          logger.error({ err, customId: interaction.customId }, 'Poll vote button interaction failed');
          const payload = {
            content: 'Something went wrong recording your vote.',
            flags: MessageFlags.Ephemeral
          } as const;
          if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
          else await interaction.reply(payload);
          return;
        }
      }

      if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isRoleSelectMenu()) {
        try {
          const handled = await handlePollComponentInteraction(interaction);
          if (handled) return;
        } catch (err) {
          logger.error({ err, customId: interaction.customId }, 'Poll component interaction failed');
          const payload = {
            content: 'Something went wrong with the poll builder.',
            flags: MessageFlags.Ephemeral
          } as const;
          if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
          else await interaction.reply(payload);
          return;
        }
      }

      try {
        const handled = await handleSettingsComponentInteraction(interaction);
        if (handled) return;
      } catch (err) {
        logger.error({ err, customId: interaction.customId }, 'Settings component interaction failed');

        const payload = {
          content: 'Something went wrong while handling that settings menu.',
          flags: MessageFlags.Ephemeral
        } as const;

        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
        return;
      }

      if (interaction.isStringSelectMenu()) {
        try {
          const cwlHandled = await handleCwlComponentInteraction(interaction);
          if (cwlHandled) return;
        } catch (err) {
          logger.error({ err, customId: interaction.customId }, 'CWL component interaction failed');
          // Continue to other handlers
        }
      }

      if (interaction.isButton() && interaction.customId.startsWith('cwl:nav:')) {
        try {
          const navHandled = await handleCwlNavigation(interaction);
          if (navHandled) return;
        } catch (err) {
          logger.error({ err, customId: interaction.customId }, 'CWL navigation failed');
        }
      }

      try {
        const handled = await handleRecruitComponentInteraction(interaction);
        if (handled) return;
      } catch (err) {
        logger.error({ err, customId: interaction.customId }, 'Component interaction failed');

        const payload = {
          content: 'Something went wrong while handling that button/menu.',
          flags: MessageFlags.Ephemeral
        } as const;

        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
        return;
      }
    }

    if (interaction.isMessageContextMenuCommand()) {
      const command = getMessageCommandMap().get(interaction.commandName);
      if (!command) {
        await interaction.reply({
          content: 'Unknown command. (Try redeploying commands.)',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      try {
        await command.execute(interaction);
      } catch (err) {
        logger.error({ err, command: interaction.commandName }, 'Message command failed');

        const payload = {
          content: 'Something went wrong while running that command.',
          flags: MessageFlags.Ephemeral
        } as const;

        if (interaction.deferred || interaction.replied) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      try {
        const handled = await handlePollVoteModalInteraction(interaction);
        if (handled) return;
      } catch (err) {
        logger.error({ err, customId: interaction.customId }, 'Poll vote modal interaction failed');
        const payload = {
          content: 'Something went wrong recording your response.',
          flags: MessageFlags.Ephemeral
        } as const;
        if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
        else await interaction.reply(payload);
        return;
      }

      try {
        const handled = await handlePollModalInteraction(interaction);
        if (handled) return;
      } catch (err) {
        logger.error({ err, customId: interaction.customId }, 'Poll modal interaction failed');
        const payload = {
          content: 'Something went wrong with the poll modal.',
          flags: MessageFlags.Ephemeral
        } as const;
        if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
        else await interaction.reply(payload);
        return;
      }

      try {
        const handled = await handleSettingsModalInteraction(interaction);
        if (handled) return;
      } catch (err) {
        logger.error({ err, customId: interaction.customId }, 'Settings modal interaction failed');
        await interaction.reply({
          content: 'Something went wrong while saving those settings.',
          flags: MessageFlags.Ephemeral
        });
        return;
      }
    }

    if (!interaction.isChatInputCommand()) return;

    const command = getChatInputCommandMap().get(interaction.commandName);
    if (!command) {
      await interaction.reply({
        content: 'Unknown command. (Try redeploying commands.)',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error({ err, command: interaction.commandName }, 'Command failed');

      const payload = {
        content: 'Something went wrong while running that command.',
        flags: MessageFlags.Ephemeral
      } as const;

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
  }
};

export default event;
