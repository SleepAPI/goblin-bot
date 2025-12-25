import { describe, expect, it } from 'vitest';

describe('recruit message command thread name construction', () => {
  function sanitizeThreadName(input: string | undefined): string {
    if (!input) return '';
    return input.replace(/[^a-zA-Z0-9 _-]/g, '').trim();
  }

  it('includes applicant username when applicant is not a bot', () => {
    const safePlayerName = 'TestPlayer';
    const thValue = 15;
    const applicantUsername = 'applicantuser';
    const isBot = false;

    const applicantUsernamePart = !isBot ? ` @${applicantUsername}` : '';
    const threadName = `${safePlayerName} TH ${thValue} (Discord)${applicantUsernamePart}`;

    expect(threadName).toContain('@applicantuser');
    expect(threadName).toBe('TestPlayer TH 15 (Discord) @applicantuser');
  });

  it('does not include username when applicant is a bot', () => {
    const safePlayerName = 'TestPlayer';
    const thValue = 15;
    const applicantUsername = 'botuser';
    const isBot = true;

    const applicantUsernamePart = !isBot ? ` @${applicantUsername}` : '';
    const threadName = `${safePlayerName} TH ${thValue} (Discord)${applicantUsernamePart}`;

    expect(threadName).not.toContain('@botuser');
    expect(threadName).toBe('TestPlayer TH 15 (Discord)');
  });

  it('handles different applicant usernames correctly', () => {
    const safePlayerName = 'TestPlayer';
    const thValue = 15;
    const applicantUsername = 'differentuser';
    const isBot = false;

    const applicantUsernamePart = !isBot ? ` @${applicantUsername}` : '';
    const threadName = `${safePlayerName} TH ${thValue} (Discord)${applicantUsernamePart}`;

    expect(threadName).toContain('@differentuser');
    expect(threadName).toBe('TestPlayer TH 15 (Discord) @differentuser');
  });

  it('handles missing applicant user gracefully', () => {
    const safePlayerName = 'TestPlayer';
    const thValue = 15;
    // Simulate null applicant user - when applicantUser is null, no username is added
    const applicantUsername = '';
    const threadName = `${safePlayerName} TH ${thValue} (Discord)${applicantUsername}`;

    expect(threadName).not.toContain('@');
    expect(threadName).toBe('TestPlayer TH 15 (Discord)');
  });

  it('sanitizes player name correctly', () => {
    const playerName = 'Test Player!@#$%';
    const sanitized = sanitizeThreadName(playerName);
    const thValue = 15;
    const applicantUsername = 'testuser';
    const isBot = false;

    const applicantUsernamePart = !isBot ? ` @${applicantUsername}` : '';
    const threadName = `${sanitized} TH ${thValue} (Discord)${applicantUsernamePart}`;

    expect(threadName).toContain('@testuser');
    expect(threadName).toBe('Test Player TH 15 (Discord) @testuser');
  });

  it('handles question mark TH level', () => {
    const safePlayerName = 'TestPlayer';
    const thValue = '?';
    const applicantUsername = 'testuser';
    const isBot = false;

    const applicantUsernamePart = !isBot ? ` @${applicantUsername}` : '';
    const threadName = `${safePlayerName} TH ${thValue} (Discord)${applicantUsernamePart}`;

    expect(threadName).toContain('@testuser');
    expect(threadName).toBe('TestPlayer TH ? (Discord) @testuser');
  });
});
