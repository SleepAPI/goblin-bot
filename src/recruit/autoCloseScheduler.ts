import { clearOpenApplicantThreadByThreadId, getAllOpenApplicantEntries } from '@/recruit/openApplicantStore';
import { logger } from '@/utils/logger';
import type { Client, ThreadChannel } from 'discord.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly

async function closeThread(thread: ThreadChannel, reason: string) {
  try {
    await thread.send({
      content: reason
    });
  } catch {
    // ignore send errors (archived threads might reject sends)
  }

  try {
    if (!thread.locked) {
      await thread.setLocked(true, reason);
    }
  } catch {
    // ignore
  }

  try {
    if (!thread.archived) {
      await thread.setArchived(true, reason);
    }
  } catch {
    // ignore
  }
}

async function sweep(client: Client) {
  const entries = getAllOpenApplicantEntries();
  if (entries.length === 0) return;

  const cutoff = Date.now() - WEEK_MS;
  for (const entry of entries) {
    if (entry.openedAt >= cutoff) continue;

    try {
      const channel = await client.channels.fetch(entry.threadId).catch(() => null);
      if (!channel || !channel.isThread()) {
        clearOpenApplicantThreadByThreadId(entry.threadId);
        continue;
      }

      await closeThread(channel, 'Auto-closing this recruit thread after 7 days.');
      clearOpenApplicantThreadByThreadId(entry.threadId);
      logger.info(
        {
          threadId: entry.threadId,
          applicantId: entry.applicantId
        },
        'Auto-closed stale recruit thread'
      );
    } catch (err) {
      logger.warn(
        { err, threadId: entry.threadId, applicantId: entry.applicantId },
        'Failed to auto-close recruit thread'
      );
    }
  }
}

export function startRecruitThreadAutoCloser(client: Client): void {
  let running = false;

  const runSweep = async () => {
    if (running) return;
    running = true;
    try {
      await sweep(client);
    } finally {
      running = false;
    }
  };

  void runSweep();
  setInterval(() => {
    void runSweep();
  }, SWEEP_INTERVAL_MS).unref?.();
}
