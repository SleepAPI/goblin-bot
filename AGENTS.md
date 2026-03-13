# Goblin Bot - Agent Guide

**Goblin Bot** is a TypeScript Discord bot for managing recruitment and Clash of Clans (CoC) War League (CWL) operations in Discord servers.

## Quick Project Facts

- **Language**: TypeScript
- **Framework**: Discord.js v14
- **Build Tool**: Vite
- **Testing**: Vitest
- **Runtime**: Node.js 20+
- **External API**: Clash of Clans API (REST-based)

## Project Structure

```
src/
├── index.ts                    # Entry point
├── bot/                        # Bot core
│   ├── createClient.ts         # Discord client initialization
│   ├── startBot.ts             # Bot startup orchestration
│   ├── registerClientEvents.ts # Event listener setup
│   ├── state.ts                # Global command maps (in-memory)
│   └── deployCommands.ts       # Deploy slash commands to Discord
├── commands/                   # Command definitions
│   ├── types.ts                # ChatInputCommand & MessageCommand interfaces
│   ├── loadChatInputCommands.ts # Loads slash commands dynamically
│   ├── loadMessageCommands.ts  # Loads message context menu commands
│   ├── chat-input/             # Slash commands (/ping, /recruit, /settings, /cwl, etc.)
│   └── message/                # Message context menu commands
├── events/                     # Discord event handlers
│   ├── types.ts                # ClientEvent interface
│   ├── loadClientEvents.ts     # Dynamic event loading
│   ├── client/
│   │   ├── ready.ts            # Bot ready event
│   │   └── interactionCreate.ts # Handles all interactions (commands, buttons, menus)
├── recruit/                    # Recruitment system
│   ├── createRecruitThread.ts  # Creates recruitment threads
│   ├── openApplicantStore.ts   # Tracks open applicant threads (in-memory)
│   ├── dmCoordinator.ts        # Manages DM conversations with applicants
│   ├── applicantDmInteractions.ts # DM interaction handlers
│   ├── recruiterDmControls.ts  # Recruiter DM command handlers
│   ├── configStore.ts          # Persists recruitment config (guild-specific)
│   ├── handleRecruitComponentInteraction.ts # Button/menu interactions
│   └── autoCloseScheduler.ts   # Auto-closes old threads
├── cwl/                        # Clan War League system
│   ├── cwlDataCache.ts         # Caches CWL wars by month/day
│   ├── handleCwlNavigation.ts  # Pagination state for results
│   ├── handleCwlComponentInteraction.ts # Button/menu interactions
│   └── (cwl-bonus-medals.ts in commands/)
├── integrations/
│   └── clashOfClans/
│       └── client.ts           # CoC API client wrapper
├── settings/                   # Guild settings management
│   ├── permissions.ts          # Permission checks (owner, role-based)
│   ├── views.ts                # Settings UI components
│   └── handleSettingsComponentInteraction.ts # Settings interaction handler
├── config/
│   └── roles.ts                # Discord role ID constants
├── utils/
│   ├── env.ts                  # Environment variable validation (Zod)
│   ├── discordRoles.ts         # Discord role utilities
│   └── logger.ts               # Pino logger setup
└── scripts/
    └── deploy-commands.ts      # Deploy slash commands to Discord
```

## Architecture Patterns

### Command System

Commands are modular and loaded dynamically:

1. **Slash Commands** (ChatInputCommand): `/ping`, `/recruit`, `/settings`, `/cwl bonus-medals`
2. **Message Commands** (MessageCommand): Right-click context menu items on messages
3. Each command is an object with:
   - `data`: SlashCommandBuilder or ContextMenuCommandBuilder
   - `execute(interaction): Promise<void>`: Handler function
   - `autocomplete?(interaction)`: Optional autocomplete handler

Commands are discovered automatically via `loadChatInputCommands()` and `loadMessageCommands()` which scan the commands directory.

### State Management

- **In-Memory**: Command maps, open applicant threads, pagination state
- **Persistent Storage**:
  - Guild recruitment config (stored per guildId)
  - CWL war data cache (per clan, organized by month/day)

### Event System

Events are auto-loaded from `src/events/client/`:

- `ready`: Bot is ready to receive events
- `interactionCreate`: Handles all interactions (slash commands, buttons, select menus)

The `interactionCreate` event is the central dispatcher for all component interactions (buttons, menus).

## Major Features

### 1. **Recruitment System** (`src/recruit/`)

- Creates threads for evaluating CoC players
- Manages applicant DM conversations
- Stores applicant info and recruiter notes
- Auto-closes threads after inactivity
- **Guild-scoped**: Each server has separate recruit config

**Key Files**:

- `createRecruitThread.ts`: Creates threads, populates with player data
- `dmCoordinator.ts`: Manages applicant DM state (in-memory store)
- `configStore.ts`: Get/set guild configuration (clans, allowed roles, etc.)
- `openApplicantStore.ts`: Tracks open threads to prevent duplicates

**How to extend**: Add new interaction handlers in `handleRecruitComponentInteraction.ts` or DM handlers in `applicantDmInteractions.ts`.

### 2. **CWL Bonus Medal Calculator** (`src/cwl/` + `src/commands/chat-input/cwl-bonus-medals.ts`)

- Calculates bonus medals earned in Clash War League
- Caches war data by month for quick re-access
- Detects violations (missed attacks, mirror rule violations)
- Displays paginated results with member inspection dropdowns

**Key Features**:

- Month-based caching: `cache/clans/{clanTag}/{YYYY-MM}/{dayNumber}.json`
- Rules: +2 pts per star, +1 bonus per star for higher TH without lower TH above
- Inspection: Click dropdown to see attack/defense details for a player
- Pagination: Navigate between multiple clans

**Key Files**:

- `cwlDataCache.ts`: Handles cache get/save logic
- `cwl-bonus-medals.ts`: Command implementation, calculation logic
- `handleCwlComponentInteraction.ts`: Dropdown/button interactions

### 3. **Settings Management** (`src/settings/`)

- Guild owners configure clans, roles, and bot permissions
- Permission checks: Owner or specific roles required
- Persists settings per guild

**Key Files**:

- `permissions.ts`: `canManageSettings(userId, member, guildId)`
- `views.ts`: UI components (EmbedBuilder, SelectMenuBuilder)
- `handleSettingsComponentInteraction.ts`: Interaction handlers

## Key Interfaces & Types

### ChatInputCommand

```typescript
interface ChatInputCommand {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}
```

### ClientEvent

```typescript
interface ClientEvent {
  name: string;
  once?: boolean;
  execute(...args: any[]): Promise<void>;
}
```

## Common Tasks

### Add a New Slash Command

1. Create `src/commands/chat-input/my-command.ts`
2. Export default object with `data` and `execute`:

```typescript
const command: ChatInputCommand = {
  data: new SlashCommandBuilder().setName('mycommand').setDescription('Does something'),
  async execute(interaction) {
    await interaction.reply('Hello!');
  }
};
export default command;
```

3. Run `npm run deploy` to register with Discord

### Add a New Interaction Handler

- Slash command options: Handle in command's `execute()` or use `autocomplete()`
- Buttons/Menus: Add handler in `src/events/client/interactionCreate.ts`
- Custom IDs follow pattern: `feature:action:identifier` (e.g., `cwl:inspect:clanTag:memberId`)

### Add Guild-Specific Configuration

1. Use `configStore.ts` as pattern
2. Store data in `cache/config/{guildId}/` or similar
3. Implement get/set functions
4. Check guild ID in commands: `interaction.guildId`

### Debug Cache Issues

- Cache location: `cache/clans/` for CWL wars, `cache/config/` for settings
- Clear cache: Delete relevant JSON files
- For CWL: Use `listAvailableMonths()` to see cached months

## Testing

**New functionality must always include tests, and build + lint must always pass.** These are hard requirements — do not mark a feature complete without all three green.

- **Build**: `npm run build` — must pass with zero TypeScript errors
- **Lint**: `npm run lint-fix` — must produce zero ESLint errors (no unused vars, correct imports)
- **Tests**: `npm test` — all tests must pass (watch mode: `npm run test:watch`)

Common pitfalls:
- Import only what you use — unused imports are lint errors
- When accessing Discord API types from `.toJSON()` (e.g. `APIButtonComponent`), cast to the concrete variant (e.g. `as APIButtonComponentWithCustomId[]`) since the union type may not have the property you need
- Test files must use only the vitest imports they actually call (`beforeEach`, `vi`, etc.)

### What to test

| Code type                                   | Test target                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Pure functions (view builders, calculators) | Unit test with direct inputs/outputs — no mocks needed                                                 |
| In-memory state modules                     | Unit test get/set/delete lifecycle                                                                     |
| Interaction handlers                        | Mock Discord interaction objects + dependent modules; test routing, permission checks, and error paths |
| Filesystem cache modules                    | Mock `node:fs` or test with a temp directory                                                           |

### Patterns

**Mock Discord interactions** as plain objects with `vi.fn()` methods, cast with `as unknown as ButtonInteraction`:

```typescript
const createMockInteraction = (overrides: Record<string, unknown> = {}) =>
  ({
    customId: 'feature:action',
    inGuild: vi.fn().mockReturnValue(true),
    guildId: 'guild123',
    user: { id: 'user123' },
    member: { roles: ['role1'] },
    replied: false,
    deferred: false,
    reply: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }) as unknown as ButtonInteraction;
```

**Mock modules** with `vi.mock()` before imports, then use `vi.mocked()` for typed access:

```typescript
vi.mock('@/poll/pollCache', () => ({ findPollById: vi.fn(), recordVote: vi.fn() }));
import { findPollById } from '@/poll/pollCache';
const mockFindPollById = vi.mocked(findPollById);
```

**Always clean up** in `beforeEach`:

```typescript
beforeEach(() => {
  vi.clearAllMocks();
});
```

**Test Examples**:

- `cwl-bonus-medals.test.ts`: Calculation logic
- `poll/buildPollResultsView.test.ts`: Results embed building from stored votes
- `poll/buildPollMessageView.test.ts`: Public message view with anonymity assertions
- `poll/handlePollVoteInteraction.test.ts`: Vote recording, duplicate prevention
- `permissions.test.ts`: Role-based permission checks

## Code Conventions

- **Type Imports**: Use `type` imports with @typescript-eslint rule
- **Logging**: Use Pino logger from `src/utils/logger.ts`
- **Validation**: Use Zod for runtime validation (e.g., env vars)
- **Discord.js Builders**: Use BotStatusBuilder, ActionRowBuilder, etc. from discord.js
- **Error Handling**: Catch and reply with user-friendly messages; log errors with context
- **Naming**:
  - Commands: kebab-case (`recruit.ts`, `cwl-bonus-medals.ts`)
  - Functions: camelCase
  - Custom IDs: `feature:action:id` pattern

## External Dependencies

- **discord.js**: Discord API wrapper
- **Clash of Clans API**: Custom client in `src/integrations/clashOfClans/client.ts`
  - Uses REST endpoint: `https://api.clashofclans.com/v1/`
  - Token via `COC_API_TOKEN` env var
- **Pino**: Logging
- **Zod**: Schema validation
- **Dotenv**: Load `.env` files

## Environment Variables

See `src/utils/env.ts` for required vars:

- `DISCORD_TOKEN`: Bot token
- `COC_API_TOKEN`: Clash of Clans API token
- `ROLE_ID_FAMILY_LEADER`: Discord role ID (optional defaults available)

## Debugging Tips

1. **Check logs**: Bot uses Pino logger; set `LOG_LEVEL` to `trace` for verbose output
2. **Inspect interaction data**: Log `interaction` object in handlers
3. **Cache debugging**:
   - View cache files in `cache/` directory
   - Clear cache files to force fresh API calls
4. **Discord.js guides**: https://discord.js.org/docs
5. **CoC API docs**: https://clash-of-clans.fandom.com/wiki/Clash_of_Clans_API

## Build & Deployment

- **Local dev**: `npm run dev` (watch mode with vite-node)
- **Build**: `npm run build` (TypeScript + Vite)
- **Start**: `npm start` (run built dist/index.js)
- **Deploy commands**: `npm run deploy`
- **Linting**: `npm run lint-fix` (ESLint + Prettier)

## Performance Considerations

- **CWL caching**: Wars cached by month to avoid repeated API calls
- **Pagination**: Large results split across Discord field limits (1024 char/field)
- **DM store**: In-memory; sessions lost on bot restart (consider persistence if needed)
- **Open thread tracking**: In-memory prevent duplicate recruit threads

## Common Gotchas

1. **Discord rank/position**: Lower position = higher ranking (position 1 is top)
2. **CWL mirror matching**: Based on sorted map position (lowest position first)
3. **Interaction defer**: Always defer long-running operations (`await interaction.deferReply()`)
4. **Guild checks**: Some commands require guild context; check `interaction.inGuild()`
5. **Component IDs**: Must be unique and <100 chars; reuse pattern: `baseId:page:index`
6. **Cache invalidation**: Wars in same month must be deduplicated by `endTime`

---

**Last Updated**: 2026-03-13
**Architecture**: Discord bot with modular command system, CoC API integration, and guild-scoped configuration
