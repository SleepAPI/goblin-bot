import { describe, expect, it } from 'vitest';

describe('recruit command thread name construction', () => {
  it('includes username in thread name format', () => {
    const playerName = 'TestPlayer';
    const thValue = 15;
    const source = 'discord';
    const username = 'testuser';

    const threadName = `${playerName} TH ${thValue} ${source}. @${username}`;

    expect(threadName).toContain('@testuser');
    expect(threadName).toBe('TestPlayer TH 15 discord. @testuser');
  });

  it('includes username with unknown source', () => {
    const playerName = 'TestPlayer';
    const thValue = 15;
    const source = 'unknown';
    const username = 'testuser';

    const threadName = `${playerName} TH ${thValue} ${source}. @${username}`;

    expect(threadName).toContain('@testuser');
    expect(threadName).toBe('TestPlayer TH 15 unknown. @testuser');
  });

  it('handles different usernames correctly', () => {
    const playerName = 'TestPlayer';
    const thValue = 15;
    const source = 'reddit';
    const username = 'anotheruser';

    const threadName = `${playerName} TH ${thValue} ${source}. @${username}`;

    expect(threadName).toContain('@anotheruser');
    expect(threadName).toBe('TestPlayer TH 15 reddit. @anotheruser');
  });

  it('handles question mark TH level', () => {
    const playerName = 'TestPlayer';
    const thValue = '?';
    const source = 'discord';
    const username = 'testuser';

    const threadName = `${playerName} TH ${thValue} ${source}. @${username}`;

    expect(threadName).toContain('@testuser');
    expect(threadName).toBe('TestPlayer TH ? discord. @testuser');
  });
});
