import type { ChatInputCommand } from '@/commands/types';
import { MessageFlags, SlashCommandBuilder } from 'discord.js';

const command: ChatInputCommand = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Replies with Pong!'),
  async execute(interaction) {
    await interaction.reply({
      content: 'Pong!',
      flags: MessageFlags.Ephemeral
    });
  }
};

export default command;
