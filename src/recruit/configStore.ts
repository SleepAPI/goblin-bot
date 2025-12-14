import { promises as fs } from 'node:fs';
import path from 'node:path';

type RecruitGuildConfig = {
  // Town Hall => role IDs
  thRoleIds: Record<string, string[]>;
};

type RecruitConfigFile = {
  version: 1;
  guilds: Record<string, RecruitGuildConfig>;
};

const DEFAULT_CONFIG: RecruitConfigFile = {
  version: 1,
  guilds: {}
};

const CONFIG_PATH = path.resolve(process.cwd(), 'recruit-config.json');

let cached: RecruitConfigFile | undefined;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<RecruitConfigFile> {
  if (cached) return cached;

  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as RecruitConfigFile;
    if (parsed?.version !== 1 || typeof parsed.guilds !== 'object' || !parsed.guilds) {
      cached = { ...DEFAULT_CONFIG };
      return cached;
    }
    cached = parsed;
    return cached;
  } catch {
    cached = { ...DEFAULT_CONFIG };
    return cached;
  }
}

async function save(next: RecruitConfigFile): Promise<void> {
  const dir = path.dirname(CONFIG_PATH);
  await fs.mkdir(dir, { recursive: true });

  const tmp = `${CONFIG_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await fs.rename(tmp, CONFIG_PATH);
}

function normalizeRoleIds(roleIds: string[]): string[] {
  return Array.from(new Set(roleIds.filter((r) => typeof r === 'string' && r.trim().length > 0)));
}

function assertTownHall(th: number): asserts th is number {
  if (!Number.isInteger(th) || th < 1 || th > 18) {
    throw new Error(`Town Hall must be an integer 1-18 (got ${th})`);
  }
}

export async function getRecruitRoleIdsForTownHall(guildId: string, th: number): Promise<string[]> {
  assertTownHall(th);
  const cfg = await load();
  const guild = cfg.guilds[guildId];
  return normalizeRoleIds(guild?.thRoleIds?.[String(th)] ?? []);
}

export async function setRecruitRoleIdsForTownHall(guildId: string, th: number, roleIds: string[]): Promise<void> {
  assertTownHall(th);

  const cleaned = normalizeRoleIds(roleIds);
  const cfg = await load();

  const next: RecruitConfigFile = {
    ...cfg,
    guilds: {
      ...cfg.guilds,
      [guildId]: {
        thRoleIds: {
          ...(cfg.guilds[guildId]?.thRoleIds ?? {}),
          [String(th)]: cleaned
        }
      }
    }
  };

  cached = next;
  // Serialize writes to avoid corrupting the file.
  writeChain = writeChain.then(() => save(next));
  await writeChain;
}

export async function getRecruitRoleMappingSummary(guildId: string): Promise<string> {
  const cfg = await load();
  const guild = cfg.guilds[guildId];
  const thRoleIds = guild?.thRoleIds ?? {};

  const lines: string[] = [];
  for (let th = 1; th <= 18; th++) {
    const roles = normalizeRoleIds(thRoleIds[String(th)] ?? []);
    if (roles.length === 0) continue;
    lines.push(`- TH${th}: ${roles.map((r) => `<@&${r}>`).join(' ')}`);
  }

  return lines.length > 0 ? lines.join('\n') : '_No leader roles configured yet._';
}
