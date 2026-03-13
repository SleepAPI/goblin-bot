import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder
} from 'discord.js';
import type { PollDraft } from './types';

const DURATION_OPTIONS = [
  { label: '1 hour', value: '1' },
  { label: '6 hours', value: '6' },
  { label: '12 hours', value: '12' },
  { label: '24 hours (default)', value: '24' },
  { label: '48 hours', value: '48' },
  { label: '72 hours', value: '72' },
  { label: '1 week', value: '168' }
];

type AnyRow = ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder | RoleSelectMenuBuilder>;

export interface PollDraftView {
  content: string;
  components: AnyRow[];
}

export function buildPollDraftView(draft: PollDraft): PollDraftView {
  const { userId, questions, resultsRoleId, durationHours } = draft;

  const roleLine = resultsRoleId
    ? `Results visible to: <@&${resultsRoleId}>`
    : 'Results role: _not set yet (required to publish)_';

  const durationLabel = DURATION_OPTIONS.find((o) => o.value === String(durationHours))?.label ?? `${durationHours}h`;

  const questionsSection =
    questions.length === 0
      ? '_No questions added yet._'
      : questions
          .map((q, i) => {
            const typeTag = q.type === 'text' ? '_(free text)_' : '_(multiple choice)_';
            const answerLines = q.answers?.map((a, j) => `  ${j + 1}. ${a}`).join('\n') ?? '';
            return `**Q${i + 1}: ${q.text}** ${typeTag}${answerLines ? '\n' + answerLines : ''}`;
          })
          .join('\n\n');

  const content = `**Poll Builder**\n` + `${roleLine}\n` + `Duration: ${durationLabel}\n\n` + questionsSection;

  const canPublish = questions.length > 0 && resultsRoleId !== null;

  const roleRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(`poll:set_role:${userId}`)
      .setPlaceholder('Select a role that can see results')
      .setMinValues(0)
      .setMaxValues(1)
  );

  const durationRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`poll:set_duration:${userId}`)
      .setPlaceholder('Select poll duration')
      .addOptions(
        DURATION_OPTIONS.map((o) => ({
          label: o.label,
          value: o.value,
          default: o.value === String(durationHours)
        }))
      )
  );

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`poll:add_choice:${userId}`)
      .setLabel('+ Add multiple choice question')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`poll:add_text:${userId}`)
      .setLabel('+ Add free text question')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`poll:publish:${userId}`)
      .setLabel('Publish poll')
      .setStyle(canPublish ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!canPublish)
  );

  const rows: AnyRow[] = [roleRow, durationRow, actionRow];

  if (questions.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`poll:del_q:${userId}`)
          .setPlaceholder('Remove a question')
          .addOptions(
            questions.map((q, i) => ({
              label: `Remove Q${i + 1}: ${q.text.slice(0, 85)}`,
              value: String(i)
            }))
          )
      )
    );
  }

  return { content, components: rows };
}
