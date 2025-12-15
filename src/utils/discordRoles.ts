import type { APIInteractionGuildMember, GuildMember } from 'discord.js';

// Normalizes role IDs from either full GuildMember or APIInteractionGuildMember (from interactions).
export function getRoleIdsFromMember(member: GuildMember | APIInteractionGuildMember | null): Set<string> {
  if (!member) return new Set();
  return Array.isArray((member as APIInteractionGuildMember).roles)
    ? new Set((member as APIInteractionGuildMember).roles)
    : new Set((member as GuildMember).roles.cache.keys());
}
