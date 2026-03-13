import { EmbedBuilder } from 'discord.js';
import type { SavedPoll } from './types';

function progressBar(count: number, total: number, width = 12): string {
  if (total === 0) return '░'.repeat(width);
  const filled = Math.round((count / total) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function pct(count: number, total: number): string {
  if (total === 0) return ' 0%';
  return `${Math.round((count / total) * 100)}%`.padStart(3);
}

function chunkFields(lines: string[]): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > 1024) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function buildPollResultsView(poll: SavedPoll): { embeds: EmbedBuilder[] } {
  const expiresTimestamp = Math.floor(new Date(poll.expiresAt).getTime() / 1000);
  const embeds: EmbedBuilder[] = [];

  for (const [index, question] of poll.questions.entries()) {
    const votes = poll.votes[index] ?? {};
    const totalResponses = Object.keys(votes).length;

    const embed = new EmbedBuilder()
      .setTitle(`Q${index + 1}: ${question.text}`)
      .setColor(0x5865f2)
      .setFooter({ text: poll.endedAt ? 'Poll ended' : `Expires <t:${expiresTimestamp}:R>` });

    if (question.type === 'text') {
      embed.setDescription(
        totalResponses === 0
          ? '_No responses yet._'
          : `${totalResponses} response${totalResponses !== 1 ? 's' : ''} received.`
      );

      if (totalResponses > 0) {
        const responseLines = Object.entries(votes).map(([userId, response]) => `<@${userId}>: ${String(response)}`);
        chunkFields(responseLines).forEach((chunk, i) => {
          embed.addFields({ name: i === 0 ? 'Responses' : '\u200b', value: chunk });
        });
      }
    } else {
      // Choice question — bar chart
      const answers = question.answers ?? [];
      const tallies = new Array<number>(answers.length).fill(0);
      for (const v of Object.values(votes)) {
        if (typeof v === 'number' && v >= 0 && v < tallies.length) tallies[v]++;
      }

      const barLines = answers.map((text, i) => {
        const count = tallies[i];
        const label = text.slice(0, 22).padEnd(22);
        const bar = progressBar(count, totalResponses);
        const countStr = String(count).padStart(3);
        return `${label} ${bar}  ${countStr} (${pct(count, totalResponses)})`;
      });

      embed.setDescription(`\`\`\`\n${barLines.join('\n')}\n\`\`\`` + `\nTotal votes: **${totalResponses}**`);

      if (totalResponses > 0) {
        // Group voter mentions by answer
        const votersByAnswer = new Map<number, string[]>();
        for (const [userId, v] of Object.entries(votes)) {
          if (typeof v === 'number' && v >= 0 && v < answers.length) {
            const existing = votersByAnswer.get(v) ?? [];
            existing.push(`<@${userId}>`);
            votersByAnswer.set(v, existing);
          }
        }

        const voterLines: string[] = [];
        for (const [i, answer] of answers.entries()) {
          const mentions = votersByAnswer.get(i);
          if (mentions && mentions.length > 0) {
            voterLines.push(`**${answer}** (${mentions.length}): ${mentions.join(', ')}`);
          }
        }

        if (voterLines.length > 0) {
          chunkFields(voterLines).forEach((chunk, i) => {
            embed.addFields({ name: i === 0 ? 'Voter breakdown' : '\u200b', value: chunk });
          });
        }
      }
    }

    embeds.push(embed);
  }

  if (embeds.length === 0) {
    return { embeds: [new EmbedBuilder().setDescription('No questions found for this poll.')] };
  }

  return { embeds };
}
