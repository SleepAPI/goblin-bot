import type { CocCwlWar } from '@/integrations/clashOfClans/client';
import { normalizePlayerTag } from '@/integrations/clashOfClans/client';
import { logger } from '@/utils/logger';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Resolve data directory relative to the current working directory
// In production: process.cwd() is /root/goblin-bot (where npm run start is executed)
// In development: process.cwd() is <git root> (where npm run dev is executed)
// Data is always at <git root>/src/data
const projectRoot = process.cwd();
const DATA_DIR = path.resolve(projectRoot, 'src', 'data');

/**
 * Normalize clan tag for use in file paths (remove # and uppercase)
 */
function normalizeClanTagForPath(clanTag: string): string {
  const normalized = normalizePlayerTag(clanTag);
  return normalized.slice(1).toUpperCase(); // Remove # and uppercase
}

/**
 * Get the date key from a war end time (YYYY-MM format)
 */
function getDateKeyFromWar(war: CocCwlWar): string | null {
  if (!war.endTime) return null;
  // Parse ISO format like "20251203T081925.000Z"
  const match = war.endTime.match(/^(\d{4})(\d{2})\d{2}T/);
  if (!match) return null;
  const year = match[1];
  const month = match[2];
  return `${year}-${month}`;
}

/**
 * Get the date key from a date string (YYYY-MM format)
 */
function getDateKeyFromDate(dateStr: string): string {
  const match = dateStr.match(/^(\d{4})(\d{2})\d{2}T/);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }
  // Fallback: try parsing as Date
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get the day number from a war end time (1-7 for CWL)
 * This extracts the day of month, but for CWL we need the round number
 * For now, we'll use the day of month as a proxy (CWL wars are typically 7 days)
 */
function getDayFromWar(war: CocCwlWar, roundIndex?: number): number | null {
  // If roundIndex is provided, use it (1-indexed)
  if (roundIndex !== undefined) {
    return roundIndex + 1;
  }
  // Fallback: try to extract from date
  if (!war.endTime) return null;
  // Parse ISO format like "20251203T081925.000Z"
  const match = war.endTime.match(/^\d{4}\d{2}(\d{2})T/);
  if (!match) return null;
  const dayOfMonth = parseInt(match[1], 10);
  // CWL typically runs for 7 days, so we can use day of month modulo 7
  // But this is not reliable - better to pass roundIndex
  return dayOfMonth;
}

/**
 * Get file path for a cached CWL war
 */
async function getWarCachePath(clanTag: string, dateKey: string, day: number): Promise<string> {
  const actualDataDir = await getActualDataDir();
  const clanPath = normalizeClanTagForPath(clanTag);
  return path.join(actualDataDir, clanPath, dateKey, `day${day}.json`);
}

/**
 * Ensure the cache directory exists
 */
async function ensureCacheDir(clanTag: string, dateKey: string): Promise<void> {
  const actualDataDir = await getActualDataDir();
  const clanPath = normalizeClanTagForPath(clanTag);
  const dir = path.join(actualDataDir, clanPath, dateKey);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Parse the war's end time and return the timestamp, if available.
 */
function normalizeWarEndTime(endTime: string): string | null {
  const match = endTime.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?:\.(\d{1,3}))?Z$/);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second, fraction] = match;
  const milliseconds = (fraction || '000').padEnd(3, '0').slice(0, 3);
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${milliseconds}Z`;
}

function parseWarEndTimestamp(war: CocCwlWar): number | null {
  if (!war.endTime) {
    return null;
  }

  const parsed = Date.parse(war.endTime);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }

  const normalized = normalizeWarEndTime(war.endTime);
  if (!normalized) {
    return null;
  }

  const normalizedParsed = Date.parse(normalized);
  return Number.isNaN(normalizedParsed) ? null : normalizedParsed;
}

/**
 * Check if a war has finished (state is "warEnded" and the end time has passed).
 */
export function isWarFinished(war: CocCwlWar): boolean {
  if (war.state !== 'warEnded') {
    return false;
  }

  const endTimestamp = parseWarEndTimestamp(war);
  if (endTimestamp === null) {
    // Missing or unparsable end time - fall back to war state only.
    return true;
  }

  return endTimestamp <= Date.now();
}

/**
 * Load a cached CWL war from disk
 */
export async function loadCachedWar(clanTag: string, dateKey: string, day: number): Promise<CocCwlWar | null> {
  try {
    const filePath = await getWarCachePath(clanTag, dateKey, day);
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as CocCwlWar;
  } catch {
    return null;
  }
}

/**
 * Save a CWL war to cache (only if war has finished)
 * @param war The war data to cache
 * @param clanTag The clan tag this war belongs to
 * @param roundIndex The round index (0-based, will be converted to 1-based day number)
 */
export async function saveWarToCache(war: CocCwlWar, clanTag: string, roundIndex?: number): Promise<void> {
  try {
    if (!isWarFinished(war)) {
      // Don't cache ongoing wars
      return;
    }

    const dateKey = getDateKeyFromWar(war);
    const day = getDayFromWar(war, roundIndex);

    if (!dateKey || !day) {
      // Can't determine date/day, skip caching
      return;
    }

    const cachedWar = await loadCachedWar(clanTag, dateKey, day);
    if (cachedWar && cachedWar.endTime && war.endTime && cachedWar.endTime === war.endTime) {
      // War already cached for this day, skip re-writing to avoid duplicates
      return;
    }

    await ensureCacheDir(clanTag, dateKey);
    const filePath = await getWarCachePath(clanTag, dateKey, day);
    const tmp = `${filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(war, null, 2), 'utf8');
    await fs.rename(tmp, filePath);
  } catch {
    // Silently fail caching - don't break the command if cache fails
    // Log if needed but don't throw
  }
}

/**
 * Load all cached wars for a clan in a specific month
 */
export async function loadCachedWarsForMonth(clanTag: string, dateKey: string): Promise<Map<number, CocCwlWar>> {
  const wars = new Map<number, CocCwlWar>();

  try {
    // Try to read all day files
    for (let day = 1; day <= 7; day++) {
      const war = await loadCachedWar(clanTag, dateKey, day);
      if (war) {
        wars.set(day, war);
      }
    }
  } catch {
    // Directory doesn't exist or other error, return empty map
  }

  return wars;
}

/**
 * Get date key from a date string or Date object
 */
export function getDateKey(date: string | Date): string {
  if (typeof date === 'string') {
    return getDateKeyFromDate(date);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get the data directory (always at <git root>/src/data)
 * Ensures the directory exists, creating it if necessary
 */
async function getActualDataDir(): Promise<string> {
  // Ensure the directory exists
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Ignore errors - directory might already exist or creation might fail
    // Will fail gracefully later when trying to access files
  }
  return DATA_DIR;
}

/**
 * List available date keys (months) for a clan
 */
export async function listAvailableMonths(clanTag: string): Promise<string[]> {
  try {
    const actualDataDir = await getActualDataDir();
    const clanPath = normalizeClanTagForPath(clanTag);
    const clanDir = path.join(actualDataDir, clanPath);

    // Log for debugging
    logger.debug({ clanTag, clanPath, clanDir, dataDir: actualDataDir, cwd: process.cwd() }, 'Listing months for clan');

    // Check if directory exists
    try {
      await fs.access(clanDir);
    } catch (accessErr) {
      // Directory doesn't exist, log and return empty array
      logger.warn(
        { clanTag, clanPath, clanDir, dataDir: actualDataDir, cwd: process.cwd(), err: accessErr },
        'Clan data directory does not exist'
      );
      return [];
    }

    const entries = await fs.readdir(clanDir, { withFileTypes: true });
    const months = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => /^\d{4}-\d{2}$/.test(name)) // Only include valid YYYY-MM format
      .sort()
      .reverse();

    logger.debug({ clanTag, clanPath, months, entryCount: entries.length }, 'Found months for clan');
    return months;
  } catch (err) {
    // Log error for debugging but still return empty array
    logger.error(
      { err, clanTag, clanPath: normalizeClanTagForPath(clanTag), dataDir: DATA_DIR, cwd: process.cwd() },
      'Error listing months for clan'
    );
    return [];
  }
}
