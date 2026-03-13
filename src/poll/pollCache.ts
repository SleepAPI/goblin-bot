import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SavedPoll } from './types';

const POLLS_DIR = path.resolve(process.cwd(), 'src', 'data', 'polls');

async function ensurePollsDir(): Promise<void> {
  await fs.mkdir(POLLS_DIR, { recursive: true });
}

function getPollsFilePath(guildId: string): string {
  return path.join(POLLS_DIR, `${guildId}.json`);
}

async function writePollsFile(guildId: string, polls: SavedPoll[]): Promise<void> {
  await ensurePollsDir();
  const filePath = getPollsFilePath(guildId);
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ polls }, null, 2), 'utf8');
  await fs.rename(tmp, filePath);
}

export async function loadPolls(guildId: string): Promise<SavedPoll[]> {
  try {
    const raw = await fs.readFile(getPollsFilePath(guildId), 'utf8');
    return (JSON.parse(raw) as { polls: SavedPoll[] }).polls ?? [];
  } catch {
    return [];
  }
}

export async function savePoll(poll: SavedPoll): Promise<void> {
  const existing = await loadPolls(poll.guildId);
  await writePollsFile(poll.guildId, [...existing, poll]);
}

export async function updatePoll(guildId: string, pollId: string, updates: Partial<SavedPoll>): Promise<void> {
  const existing = await loadPolls(guildId);
  await writePollsFile(
    guildId,
    existing.map((p) => (p.id === pollId ? { ...p, ...updates } : p))
  );
}

export async function findPollById(guildId: string, pollId: string): Promise<SavedPoll | null> {
  const polls = await loadPolls(guildId);
  return polls.find((p) => p.id === pollId) ?? null;
}

export async function listActivePolls(guildId: string): Promise<SavedPoll[]> {
  const polls = await loadPolls(guildId);
  const now = Date.now();
  return polls.filter((p) => !p.endedAt && new Date(p.expiresAt).getTime() > now);
}

export async function listAllPolls(guildId: string): Promise<SavedPoll[]> {
  return loadPolls(guildId);
}

/**
 * Record a vote for a question. Returns whether the user had already voted.
 * Reads, updates, and writes atomically (best-effort for single-process use).
 */
export async function recordVote(
  guildId: string,
  pollId: string,
  questionIndex: number,
  userId: string,
  vote: number | string
): Promise<{ alreadyVoted: boolean; notFound: boolean }> {
  const polls = await loadPolls(guildId);
  const pollIndex = polls.findIndex((p) => p.id === pollId);

  if (pollIndex === -1) return { alreadyVoted: false, notFound: true };

  const poll = polls[pollIndex];
  const questionVotes = poll.votes[questionIndex];

  if (!questionVotes) return { alreadyVoted: false, notFound: true };
  if (questionVotes[userId] !== undefined) return { alreadyVoted: true, notFound: false };

  questionVotes[userId] = vote;
  await writePollsFile(guildId, polls);

  return { alreadyVoted: false, notFound: false };
}
