import type { CocCwlWar } from '@/integrations/clashOfClans/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isWarFinished } from './cwlDataCache';

const baseTimestamp = Date.UTC(2026, 0, 6, 0, 0, 0);

function createMockWar(overrides: Partial<CocCwlWar> = {}): CocCwlWar {
  return {
    state: 'warEnded',
    teamSize: 15,
    attacksPerMember: 1,
    startTime: '20260101T000000.000Z',
    endTime: '20260105T000000.000Z',
    clan: { tag: '#CLAN', name: 'Clan' },
    opponent: { tag: '#OPP', name: 'Opponent' },
    ...overrides
  };
}

describe('isWarFinished', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(baseTimestamp);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when the war ended time is in the past', () => {
    const war = createMockWar();
    expect(isWarFinished(war)).toBe(true);
  });

  it('returns false when the war end time is still in the future', () => {
    const war = createMockWar({ endTime: '20260110T000000.000Z' });
    expect(isWarFinished(war)).toBe(false);
  });

  it('returns true when the war has no end time but the state is warEnded', () => {
    const war = createMockWar({ endTime: undefined });
    expect(isWarFinished(war)).toBe(true);
  });

  it('returns false when the state is not warEnded even if the end time has passed', () => {
    const war = createMockWar({ state: 'inWar' });
    expect(isWarFinished(war)).toBe(false);
  });
});
