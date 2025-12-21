import {
  getRecruitAllowedRoleSummary,
  getRecruitDmTemplates,
  getRecruitRoleMappingSummary,
  getRecruitThreadChannelSummary
} from '@/recruit/configStore';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder
} from 'discord.js';

type SettingsView = {
  content: string;
  components: Array<
    ActionRowBuilder<RoleSelectMenuBuilder | ChannelSelectMenuBuilder | StringSelectMenuBuilder | ButtonBuilder>
  >;
};

function buildBackRow() {
  const backButton = new ButtonBuilder().setCustomId('settings:back').setStyle(ButtonStyle.Secondary).setLabel('Back');
  return new ActionRowBuilder<ButtonBuilder>().addComponents(backButton);
}

export async function buildSettingsMenuView(guildId: string, leaderRoleId?: string): Promise<SettingsView> {
  const allowedSummary = await getRecruitAllowedRoleSummary(guildId);
  const channelSummary = await getRecruitThreadChannelSummary(guildId);
  const templates = await getRecruitDmTemplates(guildId);
  const leaderSummary = leaderRoleId ? `<@&${leaderRoleId}>` : '_Leader role not found in this server._';
  const templateSummary =
    templates.length > 0
      ? `${templates.length} template${templates.length === 1 ? '' : 's'}`
      : '_No templates set yet._';

  const select = new StringSelectMenuBuilder()
    .setCustomId('settings:menu_select')
    .setPlaceholder('Select a setting to configure')
    .addOptions(
      {
        label: 'Recruit access roles',
        value: 'recruit_roles',
        description: 'Choose which roles can run /recruit'
      },
      {
        label: 'Message recruit channel',
        value: 'recruit_channel',
        description: 'Choose the channel for right-click recruit threads'
      },
      {
        label: 'Recruit DM templates',
        value: 'dm_templates',
        description: 'Customize the copy recruiters paste into DMs'
      }
    );

  return {
    content:
      `**Settings overview**\n` +
      `- Leader role: ${leaderSummary}\n` +
      `- Additional /recruit roles: ${allowedSummary}\n` +
      `- Message recruit channel: ${channelSummary}\n` +
      `- Recruit DM templates: ${templateSummary}\n\n` +
      `Select an option below to configure it.`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)]
  };
}

export async function buildRecruitRolesView(guildId: string, leaderRoleId?: string): Promise<SettingsView> {
  const recruitSummary = await getRecruitRoleMappingSummary(guildId);
  const allowedSummary = await getRecruitAllowedRoleSummary(guildId);
  const leaderSummary = leaderRoleId ? `<@&${leaderRoleId}>` : '_Leader role not found in this server._';

  const select = new RoleSelectMenuBuilder()
    .setCustomId('settings:recruit_roles')
    .setPlaceholder('Select roles allowed to use /recruit')
    .setMinValues(0)
    .setMaxValues(25);

  return {
    content:
      `**Recruit access roles**\n` +
      `- Leader role: ${leaderSummary}\n` +
      `- Recruit leader role mapping:\n${recruitSummary}\n\n` +
      `- Additional /recruit roles: ${allowedSummary}\n\n` +
      `Family Leaders always have access. Select additional roles below if you need more teams to run /recruit.`,
    components: [buildBackRow(), new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select)]
  };
}

export async function buildRecruitChannelView(guildId: string): Promise<SettingsView> {
  const channelSummary = await getRecruitThreadChannelSummary(guildId);

  const select = new ChannelSelectMenuBuilder()
    .setCustomId('settings:recruit_channel')
    .setPlaceholder('Select a channel for message recruits')
    .setMinValues(0)
    .setMaxValues(1)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

  return {
    content:
      `**Message recruit threads**\n` +
      `- Current destination: ${channelSummary}\n\n` +
      `Right-click recruit commands will create threads in the selected channel.`,
    components: [buildBackRow(), new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select)]
  };
}

export async function buildRecruitDmTemplatesView(guildId: string): Promise<SettingsView> {
  const templates = await getRecruitDmTemplates(guildId);
  const hasTemplates = templates.length > 0;
  const summary = hasTemplates
    ? templates
        .slice(0, 25)
        .map((template, index) => {
          const preview =
            template.content.length > 80 ? `${template.content.slice(0, 77)}…` : template.content || 'Empty template';
          return `${index + 1}. **${template.name}** — ${preview}`;
        })
        .join('\n')
    : '_No DM templates configured yet._';

  const addRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('settings:dm_templates_add').setLabel('Add template').setStyle(ButtonStyle.Primary)
  );

  const rows: Array<ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>> = [buildBackRow(), addRow];

  if (hasTemplates) {
    const editSelect = new StringSelectMenuBuilder()
      .setCustomId('settings:dm_templates_edit')
      .setPlaceholder('Select a template to edit')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        templates.slice(0, 25).map((template) => ({
          label: template.name.slice(0, 100),
          value: template.id
        }))
      );
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(editSelect));

    const deleteSelect = new StringSelectMenuBuilder()
      .setCustomId('settings:dm_templates_delete')
      .setPlaceholder('Select a template to delete')
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        templates.slice(0, 25).map((template) => ({
          label: template.name.slice(0, 100),
          value: template.id
        }))
      );
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(deleteSelect));
  }

  return {
    content: `**Recruit DM templates**\n` + `${summary}`,
    components: rows
  };
}
