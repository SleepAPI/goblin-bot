export type QuestionType = 'choice' | 'text';

export interface PollQuestion {
  type: QuestionType;
  text: string;
  answers?: string[]; // only for 'choice', 2–4 items
}

export interface PollDraft {
  userId: string;
  guildId: string;
  channelId: string;
  resultsRoleIds: string[];
  durationHours: number;
  questions: PollQuestion[];
}

export interface SavedPollQuestion {
  messageId: string;
  type: QuestionType;
  text: string;
  answers?: string[]; // only for 'choice'
}

export interface SavedPoll {
  id: string;
  guildId: string;
  channelId: string;
  resultsRoleIds: string[];
  createdAt: string; // ISO
  expiresAt: string; // ISO
  questions: SavedPollQuestion[];
  // votes[questionIndex][userId] = answerIndex (choice) | response string (text)
  votes: Array<Record<string, number | string>>;
  endedAt?: string; // ISO — set when manually ended
}
