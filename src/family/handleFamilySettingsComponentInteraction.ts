import { FAMILY_LEADER_ROLE_ID } from '@/config/roles';
import {
  getRecruitAllowedRoleSummary,
  getRecruitRoleMappingSummary,
  setRecruitAllowedRoleIds
} from '@/recruit/configStore';
import { getRoleIdsFromMember } from '@/utils/discordRoles';
import {
  ActionRowBuilder,
  RoleSelectMenuBuilder,
  type ButtonInteraction,
  type RoleSelectMenuInteraction,
  type StringSelectMenuInteraction
} from 'discord.js';

type FamilySettingsComponentInteraction = RoleSelectMenuInteraction | ButtonInteraction | StringSelectMenuInteraction;

function buildRolesSelect(): ActionRowBuilder<RoleSelectMenuBuilder> {
  const rolesSelect = new RoleSelectMenuBuilder()
    .setCustomId('family-settings:recruit_roles')
    .setPlaceholder('Select roles allowed to use /recruit')
    .setMinValues(0)
    .setMaxValues(25);

  return new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(rolesSelect);
}

async function handleRecruitRoles(interaction: RoleSelectMenuInteraction) {
  if (!interaction.inGuild() || !interaction.guild || !interaction.guildId) {
    await interaction.reply({ content: 'This can only be used inside a server.', ephemeral: true });
    return;
  }

  const guild = interaction.guild;
  const guildId = interaction.guildId;

  const leaderRole =
    guild.roles.cache.get(FAMILY_LEADER_ROLE_ID) ?? (await guild.roles.fetch(FAMILY_LEADER_ROLE_ID).catch(() => null));

  if (!leaderRole) {
    await interaction.reply({
      content: `The Family Leader role (<@&${FAMILY_LEADER_ROLE_ID}>) is missing in this server. Create it to use this command.`,
      ephemeral: true
    });
    return;
  }

  const memberRoleIds = getRoleIdsFromMember(interaction.member);
  if (!memberRoleIds.has(leaderRole.id)) {
    await interaction.reply({
      content: 'Only members with the Family Leader role can use this.',
      ephemeral: true
    });
    return;
  }

  const selected = Array.from(new Set((interaction.values ?? []).slice(0, 25)));
  await setRecruitAllowedRoleIds(guildId, selected);

  const allowedSummary = await getRecruitAllowedRoleSummary(guildId);
  const recruitSummary = await getRecruitRoleMappingSummary(guildId);

  await interaction.update({
    content:
      `**Family settings**\n` +
      `- Leader role: <@&${leaderRole.id}>\n` +
      `- Recruit leader role mapping:\n${recruitSummary}\n\n` +
      `**/recruit access**\n` +
      `- Family Leaders are always allowed.\n` +
      `- Additional allowed roles: ${allowedSummary}\n\n` +
      `Select roles below to allow them to run /recruit.\n` +
      `To edit per-TH leader roles, use the ⚙️ Settings button on a /recruit thread. (Future settings can live here.)`,
    components: [buildRolesSelect()]
  });
}

export async function handleFamilySettingsComponentInteraction(
  interaction: FamilySettingsComponentInteraction
): Promise<boolean> {
  if (!interaction.customId.startsWith('family-settings:')) return false;

  const action = interaction.customId.split(':')[1];
  if (action === 'recruit_roles' && interaction.isRoleSelectMenu()) {
    await handleRecruitRoles(interaction);
    return true;
  }

  return false;
}
