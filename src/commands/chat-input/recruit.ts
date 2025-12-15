import type { ChatInputCommand } from '@/commands/types';
import { FAMILY_LEADER_ROLE_ID } from '@/config/roles';
import { ClashOfClansClient, isValidPlayerTag, type CocWarMember } from '@/integrations/clashOfClans/client';
import { getRecruitAllowedRoleIds } from '@/recruit/configStore';
import { getRoleIdsFromMember } from '@/utils/discordRoles';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  SlashCommandBuilder,
  ThreadAutoArchiveDuration,
  type AnyThreadChannel
} from 'discord.js';

// Hero max levels per Town Hall level (from Clash of Clans Wiki)
const HERO_MAX_LEVELS: Record<number, Record<string, number>> = {
  7: {
    'Barbarian King': 10
  },
  8: {
    'Barbarian King': 20,
    'Archer Queen': 10
  },
  9: {
    'Barbarian King': 30,
    'Archer Queen': 30,
    'Minion Prince': 10
  },
  10: {
    'Barbarian King': 40,
    'Archer Queen': 40,
    'Minion Prince': 20
  },
  11: {
    'Barbarian King': 50,
    'Archer Queen': 50,
    'Minion Prince': 30,
    'Grand Warden': 20
  },
  12: {
    'Barbarian King': 65,
    'Archer Queen': 65,
    'Minion Prince': 40,
    'Grand Warden': 40
  },
  13: {
    'Barbarian King': 75,
    'Archer Queen': 75,
    'Minion Prince': 50,
    'Grand Warden': 50,
    'Royal Champion': 25
  },
  14: {
    'Barbarian King': 85,
    'Archer Queen': 85,
    'Minion Prince': 60,
    'Grand Warden': 60,
    'Royal Champion': 30
  },
  15: {
    'Barbarian King': 90,
    'Archer Queen': 90,
    'Minion Prince': 70,
    'Grand Warden': 65,
    'Royal Champion': 40
  },
  16: {
    'Barbarian King': 95,
    'Archer Queen': 95,
    'Minion Prince': 80,
    'Grand Warden': 70,
    'Royal Champion': 45
  },
  17: {
    'Barbarian King': 100,
    'Archer Queen': 100,
    'Minion Prince': 90,
    'Grand Warden': 75,
    'Royal Champion': 50
  },
  18: {
    'Barbarian King': 105,
    'Archer Queen': 105,
    'Minion Prince': 95,
    'Grand Warden': 80,
    'Royal Champion': 55
  }
};

// Emojis for Town Hall levels
const TOWNHALL_EMOJIS: Record<number, string> = {
  1: '🏠',
  2: '🏘️',
  3: '🏛️',
  4: '🏰',
  5: '🏯',
  6: '🏰',
  7: '🏰',
  8: '🏰',
  9: '🏰',
  10: '🏰',
  11: '🏰',
  12: '🏰',
  13: '🏰',
  14: '🏰',
  15: '🏰',
  16: '🏰',
  17: '🏰',
  18: '🏰'
};

// Emojis for heroes
const HERO_EMOJIS: Record<string, string> = {
  'Barbarian King': '👑',
  'Archer Queen': '🏹',
  'Grand Warden': '🛡️',
  'Royal Champion': '⚔️',
  'Minion Prince': '🦇'
};

function getHeroMaxLevel(heroName: string, townHallLevel: number | undefined): number | undefined {
  if (!townHallLevel || townHallLevel < 1 || townHallLevel > 18) return undefined;
  return HERO_MAX_LEVELS[townHallLevel]?.[heroName];
}

function getTownHallEmoji(townHallLevel: number | undefined): string {
  if (!townHallLevel || townHallLevel < 1 || townHallLevel > 18) return '🏰';
  return TOWNHALL_EMOJIS[townHallLevel] ?? '🏰';
}

function getHeroEmoji(heroName: string): string {
  return HERO_EMOJIS[heroName] ?? '⚔️';
}

function formatCocTime(input?: string): string | undefined {
  if (!input) return undefined;
  const iso = input.includes('.') ? input : input.replace(/(\.\d{3}Z)?$/, '.000Z');
  // CoC uses e.g. 20250101T000000.000Z
  const normalized = iso.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.(\d{3})Z$/, '$1-$2-$3T$4:$5:$6.$7Z');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return undefined;
  return `<t:${Math.floor(d.getTime() / 1000)}:R>`;
}

function findMember(members: CocWarMember[] | undefined, tag: string): CocWarMember | undefined {
  return (members ?? []).find((m) => m.tag === tag);
}

type WarAttackRow = {
  stars: number;
  destructionPercentage: number;
  defenderTownHall?: number;
  opponentName?: string;
  warType: 'Current war' | 'CWL';
  warEnds?: string;
};

function collectAttacksFromWar(opts: {
  warType: WarAttackRow['warType'];
  playerTag: string;
  clanName?: string;
  opponentName?: string;
  clanMembers?: CocWarMember[];
  opponentMembers?: CocWarMember[];
  warEnds?: string;
}): WarAttackRow[] {
  const attacker = findMember(opts.clanMembers, opts.playerTag);
  if (!attacker?.attacks?.length) return [];

  return attacker.attacks.map((a) => {
    const defender = findMember(opts.opponentMembers, a.defenderTag);
    return {
      stars: a.stars,
      destructionPercentage: a.destructionPercentage,
      defenderTownHall: defender?.townhallLevel,
      opponentName: opts.opponentName,
      warType: opts.warType,
      warEnds: opts.warEnds
    };
  });
}

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

    try {
      const source = interaction.options.getString('source') ?? 'unknown';
      const player = await client.getPlayerByTag(playerTag);

      const thValue = typeof player.townHallLevel === 'number' && player.townHallLevel > 0 ? player.townHallLevel : '?';
      const threadName = `${player.name} TH ${thValue} ${source}.`;
      const embedTitle = `${player.name} (${player.tag})`;

      // Reply in-channel, then start a thread from that reply message.
      await interaction.editReply({ content: `Creating thread for \`${threadName}\`...` });
      const replyMessage = await interaction.fetchReply();

      let thread: AnyThreadChannel | null = null;
      if (replyMessage.channel.isThread()) {
        thread = replyMessage.channel;
      } else if (replyMessage.hasThread && replyMessage.thread) {
        thread = replyMessage.thread;
      } else {
        thread = await replyMessage.startThread({
          name: threadName.slice(0, 100),
          autoArchiveDuration: ThreadAutoArchiveDuration.OneDay
        });
      }

      if (thread) {
        const heroes = (player.heroes ?? []).filter((h) => (h?.name ?? '').trim().length > 0);
        const thLevel = player.townHallLevel;
        const heroesValue =
          heroes.length > 0
            ? heroes
                .map((h) => {
                  const heroMax = getHeroMaxLevel(h.name, thLevel);
                  const max = heroMax !== undefined ? `/${heroMax}` : '';
                  const emoji = getHeroEmoji(h.name);
                  return `${emoji} ${h.name}: ${h.level}${max}`;
                })
                .join('\n')
            : 'Unknown';

        const leagueName = player.leagueTier?.name ?? player.league?.name ?? 'Unranked';
        const trophies = typeof player.trophies === 'number' ? `${player.trophies} trophies` : 'Unknown trophies';
        const leagueRankValue = `${leagueName} (${trophies})`;
        const leagueThumbnail = player.leagueTier?.iconUrls?.medium ?? player.leagueTier?.iconUrls?.small ?? undefined;

        const thEmoji = getTownHallEmoji(thLevel);
        const thValue = thLevel !== undefined ? `${thEmoji} TH${thLevel}` : 'Unknown';

        // ---- Build paginated embeds ----
        const overviewEmbed = new EmbedBuilder()
          .setTitle(embedTitle)
          .setDescription(player.clan ? `Clan: ${player.clan.name} (${player.clan.tag})` : 'Clan: None')
          .addFields(
            { name: 'Town Hall', value: thValue, inline: true },
            { name: 'Current league rank', value: leagueRankValue, inline: true },
            { name: 'EXP level', value: String(player.expLevel ?? 'Unknown'), inline: true },
            { name: 'Hero levels', value: heroesValue, inline: false }
          )
          .setFooter({ text: 'Page 1/2 • Overview' });

        if (leagueThumbnail) {
          overviewEmbed.setThumbnail(leagueThumbnail);
        }

        // War page: uses current war + CWL war tags (if available). Regular past-war attacks are not exposed by the official API.
        let warSummaryLines: string[] = [];
        let warRecentLines: string[] = [];

        if (!player.clan?.tag) {
          warSummaryLines = ['No clan on profile — cannot look up war attacks.'];
        } else {
          const clanTag = player.clan.tag;

          // Current war attacks (if in war)
          try {
            const currentWar = await client.getCurrentWarByClanTag(clanTag);
            if (currentWar?.state && currentWar.state !== 'notInWar') {
              const opponentName = currentWar.opponent?.name;
              const ends = formatCocTime(currentWar.endTime);
              const rows = collectAttacksFromWar({
                warType: 'Current war',
                playerTag: player.tag,
                opponentName,
                clanMembers: currentWar.clan?.members,
                opponentMembers: currentWar.opponent?.members,
                warEnds: ends
              });

              if (rows.length > 0) {
                warSummaryLines.push(`Current war: ${rows.length} attack(s) found${ends ? ` • ends ${ends}` : ''}`);
                warRecentLines.push(
                  ...rows.slice(0, 5).map((r) => {
                    const th = r.defenderTownHall ? `TH${r.defenderTownHall}` : 'TH?';
                    const opp = r.opponentName ? ` vs ${r.opponentName}` : '';
                    return `- ⭐${r.stars} • ${r.destructionPercentage}% • ${th}${opp}`;
                  })
                );
              } else {
                warSummaryLines.push('Current war: no attacks found for this player.');
              }
            } else {
              warSummaryLines.push('Current war: clan is not in war.');
            }
          } catch {
            warSummaryLines.push('Current war: unavailable (API restriction or clan data not accessible).');
          }

          // CWL attacks (if league group is available)
          try {
            const group = await client.getWarLeagueGroupByClanTag(clanTag);
            const warTags =
              (group.rounds ?? [])
                .flatMap((r) => r.warTags ?? [])
                .filter((t) => t && t !== '#0')
                .slice(0, 8) ?? [];

            const cwlRows: WarAttackRow[] = [];
            for (const warTag of warTags) {
              try {
                const war = await client.getCwlWarByTag(warTag);
                // Determine which side is "our" clan by matching tag
                const isClanSide = war.clan?.tag === clanTag;
                const ourSide = isClanSide ? war.clan : war.opponent;
                const theirSide = isClanSide ? war.opponent : war.clan;
                const ends = formatCocTime(war.endTime);

                cwlRows.push(
                  ...collectAttacksFromWar({
                    warType: 'CWL',
                    playerTag: player.tag,
                    opponentName: theirSide?.name,
                    clanMembers: ourSide?.members,
                    opponentMembers: theirSide?.members,
                    warEnds: ends
                  })
                );
              } catch {
                // ignore individual war failures
              }
            }

            if (cwlRows.length > 0) {
              const totalStars = cwlRows.reduce((s, r) => s + r.stars, 0);
              const totalPct = cwlRows.reduce((s, r) => s + r.destructionPercentage, 0);
              const avgStars = (totalStars / cwlRows.length).toFixed(2);
              const avgPct = (totalPct / cwlRows.length).toFixed(1);
              warSummaryLines.push(`CWL: ${cwlRows.length} attack(s) • avg ⭐${avgStars} • avg ${avgPct}%`);

              // Append some CWL recent lines if we don't already have 5
              const remaining = Math.max(0, 5 - warRecentLines.length);
              if (remaining > 0) {
                warRecentLines.push(
                  ...cwlRows.slice(0, remaining).map((r) => {
                    const th = r.defenderTownHall ? `TH${r.defenderTownHall}` : 'TH?';
                    const opp = r.opponentName ? ` vs ${r.opponentName}` : '';
                    const ends = r.warEnds ? ` • ends ${r.warEnds}` : '';
                    return `- ⭐${r.stars} • ${r.destructionPercentage}% • ${th}${opp}${ends}`;
                  })
                );
              }
            } else {
              warSummaryLines.push('CWL: no attack history found (not in CWL, or data not available).');
            }
          } catch {
            warSummaryLines.push('CWL: unavailable (clan not in league group or API restriction).');
          }
        }

        if (warRecentLines.length === 0) {
          warRecentLines = ['No attack-level data available from the official API for this player right now.'];
        }

        const warEmbed = new EmbedBuilder()
          .setTitle(`${embedTitle} — War performance`)
          .setDescription(
            [
              '**Recent attacks (best-effort)**',
              ...warRecentLines,
              '',
              '**Summary**',
              ...warSummaryLines.map((l) => `- ${l}`),
              '',
              '_Note: The official CoC API does not expose “player war log” for regular past wars; attack-level history is only available for current war and CWL wars._'
            ].join('\n')
          )
          .setFooter({ text: 'Page 2/2 • War performance' });

        const pages = [overviewEmbed, warEmbed];
        let pageIndex = 0;

        const customBase = `recruit:${interaction.id}`;
        const prevBtn = new ButtonBuilder()
          .setCustomId(`${customBase}:prev`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel('Prev')
          .setDisabled(true);
        const nextBtn = new ButtonBuilder()
          .setCustomId(`${customBase}:next`)
          .setStyle(ButtonStyle.Secondary)
          .setLabel('Next')
          .setDisabled(pages.length <= 1);

        const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn);

        const tagNoHash = player.tag.replace('#', '');
        const th = typeof player.townHallLevel === 'number' ? player.townHallLevel : 0;
        const replyMessageId = replyMessage.id;

        const acceptBtn = new ButtonBuilder()
          .setCustomId(`recruit:accept:${th}:${tagNoHash}`)
          .setStyle(ButtonStyle.Success)
          .setLabel('Ping Leaders')
          .setDisabled(th <= 0);
        const settingsBtn = new ButtonBuilder()
          .setCustomId(`recruit:settings:${th}:${tagNoHash}`)
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⚙️')
          .setLabel('Settings')
          .setDisabled(th <= 0);
        const closeBtn = new ButtonBuilder()
          .setCustomId(`recruit:close:${tagNoHash}:${replyMessageId}`)
          .setStyle(ButtonStyle.Danger)
          .setLabel('Close');
        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(acceptBtn, settingsBtn, closeBtn);

        const pagedMessage = await thread.send({
          embeds: [pages[pageIndex]],
          components: [navRow, actionRow]
        });

        const collector = pagedMessage.createMessageComponentCollector({
          componentType: ComponentType.Button,
          filter: (i) => i.customId === `${customBase}:prev` || i.customId === `${customBase}:next`,
          time: 15 * 60 * 1000
        });

        collector.on('collect', async (i) => {
          if (i.customId === `${customBase}:prev`) pageIndex = Math.max(0, pageIndex - 1);
          if (i.customId === `${customBase}:next`) pageIndex = Math.min(pages.length - 1, pageIndex + 1);

          prevBtn.setDisabled(pageIndex === 0);
          nextBtn.setDisabled(pageIndex === pages.length - 1);
          const updatedNavRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn);

          await i.update({ embeds: [pages[pageIndex]], components: [updatedNavRow, actionRow] });
        });

        collector.on('end', async () => {
          try {
            prevBtn.setDisabled(true);
            nextBtn.setDisabled(true);
            const disabledNavRow = new ActionRowBuilder<ButtonBuilder>().addComponents(prevBtn, nextBtn);
            await pagedMessage.edit({ components: [disabledNavRow, actionRow] });
          } catch {
            // ignore
          }
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
    }
  }
};

export default command;
