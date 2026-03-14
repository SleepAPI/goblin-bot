import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { SavedPoll } from './types';

export interface PollMessageView {
  content: string;
  components: ActionRowBuilder<ButtonBuilder>[];
}

export function buildPollMessageView(
  poll: SavedPoll,
  qIdx: number,
  votes: Record<string, number | string>
): PollMessageView {
  const question = poll.questions[qIdx];
  const isExpired = !!(poll.endedAt || new Date(poll.expiresAt) <= new Date());
  const voteCount = Object.keys(votes).length;
  const roleList =
    poll.resultsRoleIds.length > 0 ? poll.resultsRoleIds.map((id) => `<@&${id}>`).join(', ') : 'admins';
  const footer = `*Votes are anonymous — individual responses visible only to ${roleList}*`;

  if (question.type === 'text') {
    const countLine = voteCount > 0 ? `\n${voteCount} response${voteCount !== 1 ? 's' : ''} received.` : '';
    return {
      content: `**${question.text}**${countLine}\n${footer}`,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`pollv:t:${poll.id}:${qIdx}`)
            .setLabel('Submit response')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(isExpired)
        )
      ]
    };
  }

  // Choice question — tally per-answer votes
  const answers = question.answers ?? [];
  const tallies = new Array<number>(answers.length).fill(0);
  for (const v of Object.values(votes)) {
    if (typeof v === 'number' && v >= 0 && v < tallies.length) tallies[v]++;
  }

  const buttons = answers.map((text, i) => {
    const label = voteCount > 0 ? `${text.slice(0, 70)} · ${tallies[i]}` : text.slice(0, 80);
    return new ButtonBuilder()
      .setCustomId(`pollv:c:${poll.id}:${qIdx}:${i}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isExpired);
  });

  // Max 5 buttons per row
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
  }

  const countLine = voteCount > 0 ? `\n${voteCount} vote${voteCount !== 1 ? 's' : ''} cast.` : '';
  return {
    content: `**${question.text}**${countLine}\n${footer}`,
    components: rows
  };
}
